import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AllergenLists } from "@/domain/allergens";
import {
  PRICE_KINDS,
  type OwnerDish,
  type OwnerDishDetail,
  type PriceKind,
} from "@/domain/dish";
import { nameKey } from "@/domain/menu";
import { priceInputText } from "@/domain/money";
import { parseSchedule, scheduleJson, type Schedule } from "@/domain/schedule";
import {
  ALLERGEN_IDS,
  DIETARY_TAG_IDS,
  type AllergenId,
  type DietaryTagId,
} from "@/domain/types";
import { shaped } from "./log";

// Owner-side reads and writes on dishes, through the owner's own client so
// row level security decides what is visible (D-75) and the table
// constraints and triggers decide what is valid (migrations 5 to 7). The
// table is called items; this is the only file that names it, and the only
// place the row shape is known. Features see OwnerDish on a section's page
// and OwnerDishDetail on the dish's own page. A delete marks the row and
// keeps it, so Undo can bring it back; reads leave marked rows out. Owners
// write name, description, the price choice, price_cents, note, the two
// allergen lists, the allergen check, the dietary tags, available with the
// sold-out mark, the schedule, sort, and deleted_at and nothing else:
// nothing about photos yet, and never who checked a list or when, which the
// database stamps (D-148). A move to another section goes through
// move_item(), since section_id is not a column owners write (migration 6).
// The sold-out mark is read and written here as a column and never read for
// its meaning, which domain/availability.ts decides (D-160). Nothing here
// can publish.

const columns = "id, name, sort";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  sort: z.number(),
});

function toDish(row: z.infer<typeof rowSchema>): OwnerDish {
  return { id: row.id, name: row.name };
}

// The dish as its own page reads it (D-128), with the section it is in,
// its two allergen lists, and its check: the flag, who, and when (D-148),
// its tags, its availability with the mark, and its schedule (D-159,
// D-160).
const detailColumns =
  "id, name, description, price_kind, price_cents, note, allergens, custom_allergens, allergens_reviewed, allergens_reviewed_by, allergens_reviewed_at, dietary_tags, available, sold_out_at, special_schedule, sort, section_id";

const detailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price_kind: z.enum(PRICE_KINDS),
  price_cents: z.number().nullable(),
  note: z.string().nullable(),
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  custom_allergens: z.array(z.string()),
  allergens_reviewed: z.boolean(),
  allergens_reviewed_by: z.string().nullable(),
  allergens_reviewed_at: z.string().nullable(),
  dietary_tags: z.array(z.enum(DIETARY_TAG_IDS)),
  available: z.boolean(),
  sold_out_at: z.string().nullable(),
  // The schedule's shape is the domain's to read: a value that is not a
  // schedule reads as none, as hours do (D-92).
  special_schedule: z.unknown(),
  sort: z.number(),
  section_id: z.string(),
});

type DetailRow = z.infer<typeof detailSchema>;

// viewer is the signed-in person, so the page can say a check is theirs.
function toDetail(
  row: DetailRow,
  viewer: string | null,
): OwnerDishDetail & { sectionId: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    note: row.note ?? "",
    priceKind: row.price_kind,
    price: priceInputText(row.price_cents),
    allergens: row.allergens,
    otherAllergens: row.custom_allergens,
    check:
      row.allergens_reviewed && row.allergens_reviewed_at !== null
        ? {
            at: row.allergens_reviewed_at,
            byYou:
              viewer !== null &&
              row.allergens_reviewed_by !== null &&
              row.allergens_reviewed_by === viewer,
          }
        : null,
    tags: row.dietary_tags,
    available: row.available,
    soldOutAt: row.sold_out_at,
    schedule: parseSchedule(row.special_schedule),
    sectionId: row.section_id,
  };
}

// Postgres's code for a unique index refusing a row: here, items_name_key.
const UNIQUE_VIOLATION = "23505";
// What the copy trigger says when the caller cannot read the section.
const NO_SECTION = "An item needs an existing section.";

export type DishWriteError =
  | { kind: "name-taken" }
  | { kind: "not-found" }
  | { kind: "mismatch" }
  // A move named a section that is not a live section of a live menu of
  // this restaurant.
  | { kind: "section-gone" }
  // A move named the section the dish is already in.
  | { kind: "same-section" }
  // The database refused the row by a named rule of its own, the allergen
  // trigger's (migration 7); the name is the rule.
  | { kind: "refused"; rule: string }
  | { kind: "failed" };

export type DishWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: DishWriteError };

// Postgres's code for an error a trigger raises by name.
const RAISED = "P0001";
// Postgres's code for a check constraint refusing a row; the constraint's
// name is the rule (migration 9).
const CHECK_VIOLATION = "23514";

function refused(
  code: string | undefined,
  message = "",
): DishWriteResult<never> {
  if (code === UNIQUE_VIOLATION)
    return { ok: false, error: { kind: "name-taken" } };
  if (code === RAISED && /^[a-z_]+$/.test(message)) {
    return { ok: false, error: { kind: "refused", rule: message } };
  }
  if (code === CHECK_VIOLATION) {
    const rule = /violates check constraint "([a-z_]+)"/.exec(message)?.[1];
    if (rule) return { ok: false, error: { kind: "refused", rule } };
  }
  return { ok: false, error: { kind: "failed" } };
}

const notFound: DishWriteResult<never> = {
  ok: false,
  error: { kind: "not-found" },
};

const failed: DishWriteResult<never> = { ok: false, error: { kind: "failed" } };

// The section's dishes that are not deleted, in the owner's order. sort
// alone is not a total order, since owners can write it directly, so
// created_at and id settle ties the same way every time. The API caps how
// many rows one read returns, so the read asks for the exact total too: a
// list that is cut short would refuse every reorder, and that is an error
// here. A read that fails throws: an error must never look like an empty
// list.
export async function listOwnerDishes(
  client: SupabaseClient,
  sectionId: string,
): Promise<OwnerDish[]> {
  const { data, error, count } = await client
    .from("items")
    .select(columns, { count: "exact" })
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error("dishes could not be read");
  const rows = shaped(z.array(rowSchema), data, "items");
  if (!rows) throw new Error("dishes could not be read");
  if (count !== rows.length) {
    throw new Error("dishes could not be read: the read was cut short");
  }
  return rows.map(toDish);
}

// One dish of the restaurant that is not deleted, with everything its page
// shows and the section it is in, for its own page and for every write on
// it. Row level security hides a dish that is not this owner's, so that, a
// deleted dish, and an id that matches nothing all read the same. Whether
// its section and menu are still there is the caller's next question. A
// read that failed is told apart, so a save can say which it was and a page
// can throw.
export async function findOwnerDish(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
  viewer: string | null = null,
): Promise<(OwnerDishDetail & { sectionId: string }) | "not-found" | "failed"> {
  const { data, error } = await client
    .from("items")
    .select(detailColumns)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return "failed";
  if (!data) return "not-found";
  const row = shaped(detailSchema, data, "items");
  return row ? toDetail(row, viewer) : "failed";
}

// A new dish goes last, with a name only. The trigger takes its restaurant
// from the section. Two tabs adding at once can draw the same sort; the
// read's tie-break keeps the order steady and the next reorder renumbers.
// The same read counts the live dishes, so an add can say how many there
// are once it is in, whatever waited ahead of it on the page (D-125).
export async function addOwnerDish(
  client: SupabaseClient,
  sectionId: string,
  name: string,
): Promise<DishWriteResult<{ dish: OwnerDish; total: number }>> {
  const last = await client
    .from("items")
    .select("sort", { count: "exact" })
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error || last.count === null) return failed;
  const highest = shaped(
    z.array(z.object({ sort: z.number() })),
    last.data,
    "items",
  );
  const top = highest?.[0];
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("items")
    .insert({ section_id: sectionId, name, sort })
    .select(columns)
    .single();
  if (error) {
    return error.message === NO_SECTION ? notFound : refused(error.code);
  }
  const row = shaped(rowSchema, data, "items");
  return row
    ? { ok: true, value: { dish: toDish(row), total: last.count + 1 } }
    : failed;
}

// Under row level security a dish the caller does not own matches zero rows
// without an error, so each write asks for the row back and reads an empty
// answer as not found. With expected, the rename happens only if the name
// is still that value: an Undo never writes over a newer change.
export async function renameOwnerDish(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  name: string,
  expected?: string,
): Promise<DishWriteResult<OwnerDish>> {
  let update = client
    .from("items")
    .update({ name })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null);
  if (expected !== undefined) update = update.eq("name", expected);
  const { data, error } = await update.select(columns).maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "items");
  return row ? { ok: true, value: toDish(row) } : failed;
}

// Marks a dish deleted, or brings it back. A dish holds nothing, so its
// delete counts nothing and goes at once (D-119). Bringing it back fails
// with name-taken while another dish of the section has its name.
export async function setOwnerDishDeleted(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  deleted: boolean,
): Promise<DishWriteResult<OwnerDish>> {
  const update = client
    .from("items")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("section_id", sectionId);
  const { data, error } = await (
    deleted
      ? update.is("deleted_at", null)
      : update.not("deleted_at", "is", null)
  )
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "items");
  return row ? { ok: true, value: toDish(row) } : failed;
}

// Writes one column of a dish on its own page. The write is scoped to the
// section the page read the dish in, so a page whose dish has moved since
// gets not found, never a silent write. Under row level security a dish the
// caller does not own matches zero rows without an error, so the write asks
// for the row back and reads an empty answer as not found. With expected,
// the write happens only if the value is still that one: an Undo never
// writes over a newer change.
async function writeDish(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  column: "description" | "note" | "price_cents" | "price_kind",
  value: string | number | null,
  expected: string | number | null | undefined,
): Promise<DishWriteResult<OwnerDishDetail>> {
  let update = client
    .from("items")
    .update({ [column]: value })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null);
  if (expected !== undefined) {
    update =
      expected === null ? update.is(column, null) : update.eq(column, expected);
  }
  const { data, error } = await update.select(detailColumns).maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(detailSchema, data, "items");
  return row ? { ok: true, value: toDetail(row, null) } : failed;
}

// A Postgres array literal, for comparing an array column against the value
// the page showed: {"milk","wheat"}. Every element is quoted, with its
// quotes and backslashes escaped, so any name travels whole.
function arrayLiteral(values: readonly string[]): string {
  const quoted = values.map(
    (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${quoted.join(",")}}`;
}

// What a write on a dish's allergens may set: one or both lists, or the
// check (D-148). Who and when are never written here: the database stamps
// them.
export type AllergenPatch = {
  allergens?: readonly AllergenId[];
  custom_allergens?: readonly string[];
  allergens_reviewed?: boolean;
};

// What the dish must still hold for the write to land: the lists the page
// showed, for every write that changes or checks a list; the flag, for an
// uncheck; the stamp's time, for the Undo of an apply. A miss comes back as
// not found, which the caller reads as the lists having moved.
export type AllergenExpected = {
  lists?: AllergenLists;
  allergens_reviewed?: boolean;
  allergens_reviewed_at?: string;
};

// Writes a dish's allergen lists or its check, scoped to the section the
// page read the dish in, and lands only if the dish still holds what the
// page showed (Michael, October 8, 2026). The database clears the check on
// any change to a list and stamps who and when on a check, in the same
// statement, and answers with the row as it is now. A rule the trigger
// refuses by name comes back as refused with that name.
export async function writeOwnerDishAllergens(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  viewer: string | null,
  patch: AllergenPatch,
  expected: AllergenExpected,
): Promise<DishWriteResult<OwnerDishDetail>> {
  const values: Record<string, unknown> = {};
  if (patch.allergens !== undefined) values.allergens = [...patch.allergens];
  if (patch.custom_allergens !== undefined) {
    values.custom_allergens = [...patch.custom_allergens];
  }
  if (patch.allergens_reviewed !== undefined) {
    values.allergens_reviewed = patch.allergens_reviewed;
  }
  let update = client
    .from("items")
    .update(values)
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null);
  if (expected.lists) {
    update = update
      .eq("allergens", arrayLiteral(expected.lists.allergens))
      .eq("custom_allergens", arrayLiteral(expected.lists.others));
  }
  if (expected.allergens_reviewed !== undefined) {
    update = update.eq("allergens_reviewed", expected.allergens_reviewed);
  }
  if (expected.allergens_reviewed_at !== undefined) {
    update = update.eq("allergens_reviewed_at", expected.allergens_reviewed_at);
  }
  const { data, error } = await update.select(detailColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(detailSchema, data, "items");
  return row ? { ok: true, value: toDetail(row, viewer) } : failed;
}

// Writes a dish's dietary tags, scoped to the section the page read the
// dish in, and lands only if the dish still holds the tags the page showed
// (D-149's rule, widened to tags at task 5's plan): a stale tab's tick
// would otherwise put back a tag another tab removed. Both lists are in
// the enum's order, the way every write leaves them.
export async function writeOwnerDishTags(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  viewer: string | null,
  tags: readonly DietaryTagId[],
  shown: readonly DietaryTagId[],
): Promise<DishWriteResult<OwnerDishDetail>> {
  const { data, error } = await client
    .from("items")
    .update({ dietary_tags: [...tags] })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .eq("dietary_tags", arrayLiteral(shown))
    .select(detailColumns)
    .maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(detailSchema, data, "items");
  return row ? { ok: true, value: toDetail(row, viewer) } : failed;
}

// What a write on a dish's availability sets (D-160): the flag and the
// mark together, so the three states are the three rows the database
// allows. With expected, the write lands only while the dish still holds
// that pair: an Undo never writes over a newer choice.
export type AvailabilityPatch = {
  available: boolean;
  sold_out_at: string | null;
};

export async function writeOwnerDishAvailability(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  viewer: string | null,
  patch: AvailabilityPatch,
  expected?: AvailabilityPatch,
): Promise<DishWriteResult<OwnerDishDetail>> {
  let update = client
    .from("items")
    .update({ available: patch.available, sold_out_at: patch.sold_out_at })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null);
  if (expected) {
    update = update.eq("available", expected.available);
    update =
      expected.sold_out_at === null
        ? update.is("sold_out_at", null)
        : update.eq("sold_out_at", expected.sold_out_at);
  }
  const { data, error } = await update.select(detailColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(detailSchema, data, "items");
  return row ? { ok: true, value: toDetail(row, viewer) } : failed;
}

// Writes a dish's whole schedule, or none, scoped to the section the page
// read the dish in, and lands only if the dish still holds the schedule the
// page showed (D-149's rule, widened to the schedule at task 5's plan),
// since each part is its own control but the column is one value. jsonb
// compares by value, so the text's key order never matters.
export async function writeOwnerDishSchedule(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  viewer: string | null,
  schedule: Schedule | null,
  shown: Schedule | null,
): Promise<DishWriteResult<OwnerDishDetail>> {
  let update = client
    .from("items")
    .update({ special_schedule: schedule })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null);
  update =
    shown === null
      ? update.is("special_schedule", null)
      : update.eq("special_schedule", scheduleJson(shown));
  const { data, error } = await update.select(detailColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(detailSchema, data, "items");
  return row ? { ok: true, value: toDetail(row, viewer) } : failed;
}

// A live dish elsewhere in the restaurant with the same name as this one,
// as the same-named offer reads it (D-129): its lists and its check, and
// the section it is in, which the caller reads against the live sections
// and menus. Names match the way the unique index reads them, whatever the
// case or outer spaces.
export type SameNamedDish = {
  id: string;
  name: string;
  sectionId: string;
  allergens: AllergenId[];
  otherAllergens: string[];
  reviewed: boolean;
};

const sameNamedSchema = z.object({
  id: z.string(),
  name: z.string(),
  section_id: z.string(),
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  custom_allergens: z.array(z.string()),
  allergens_reviewed: z.boolean(),
});

// The restaurant's live dishes whose name is this one, other than the dish
// itself. The read is narrowed with a pattern first, so a long menu is not
// read whole: the name's backslashes, percent signs, and underscores are
// escaped, so a name holding one neither breaks the read nor hides a match
// (Michael, at approval), and the exact match is made here. A read that
// fails throws.
export async function listOwnerSameNamedDishes(
  client: SupabaseClient,
  restaurantId: string,
  dishId: string,
  name: string,
): Promise<SameNamedDish[]> {
  const pattern = `%${name.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await client
    .from("items")
    .select(
      "id, name, section_id, allergens, custom_allergens, allergens_reviewed",
    )
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .ilike("name", pattern);
  if (error) throw new Error("dishes could not be read");
  const rows = shaped(z.array(sameNamedSchema), data, "items");
  if (!rows) throw new Error("dishes could not be read");
  const key = nameKey(name);
  return rows
    .filter((row) => row.id !== dishId && nameKey(row.name) === key)
    .map((row) => ({
      id: row.id,
      name: row.name,
      sectionId: row.section_id,
      allergens: row.allergens,
      otherAllergens: row.custom_allergens,
      reviewed: row.allergens_reviewed,
    }));
}

// The other allergens the restaurant's live dishes already name, as stored,
// repeats included; the domain ranks them with the lines' names, most used
// first and then by name, for the other-allergen field to suggest before
// the starter list (D-148, D-152), the way size names are suggested
// (D-139). A read that fails throws.
export async function listOwnerOtherAllergenNames(
  client: SupabaseClient,
  restaurantId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("items")
    .select("custom_allergens")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null);
  if (error) throw new Error("other allergens could not be read");
  const rows = shaped(
    z.array(z.object({ custom_allergens: z.array(z.string()) })),
    data,
    "items",
  );
  if (!rows) throw new Error("other allergens could not be read");
  return rows.flatMap((row) => row.custom_allergens);
}

// A dish's description or note, stored as null when blank.
export function setOwnerDishText(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  field: "description" | "note",
  value: string | null,
  expected?: string | null,
): Promise<DishWriteResult<OwnerDishDetail>> {
  return writeDish(client, sectionId, id, field, value, expected);
}

// A dish's one price, in cents, or null for none (D-139).
export function setOwnerDishPrice(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  cents: number | null,
  expected?: number | null,
): Promise<DishWriteResult<OwnerDishDetail>> {
  return writeDish(client, sectionId, id, "price_cents", cents, expected);
}

// How a dish is priced (D-139). The other choices' values stay stored and
// come back when the owner switches back (Michael, October 7, 2026).
export function setOwnerDishPriceKind(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  kind: PriceKind,
  expected?: PriceKind,
): Promise<DishWriteResult<OwnerDishDetail>> {
  return writeDish(client, sectionId, id, "price_kind", kind, expected);
}

// Moves a dish to another section of its restaurant, last, with its sizes
// (D-129), through move_item(). The database checks that the caller is a
// member of the dish's restaurant and that the section is a live section
// of a live menu of it.
export async function moveOwnerDish(
  client: SupabaseClient,
  id: string,
  sectionId: string,
): Promise<DishWriteResult<null>> {
  const { error } = await client.rpc("move_item", {
    p_item: id,
    p_section: sectionId,
  });
  if (!error) return { ok: true, value: null };
  switch (error.message) {
    case "move_name_taken":
      return { ok: false, error: { kind: "name-taken" } };
    case "move_section_gone":
      return { ok: false, error: { kind: "section-gone" } };
    case "move_same_section":
      return { ok: false, error: { kind: "same-section" } };
    case "move_not_found":
      return notFound;
    default:
      return failed;
  }
}

// set_item_order() takes the whole list or nothing: a list that is not
// exactly the section's live dishes comes back as a mismatch, which is how
// a page that is out of date finds out.
export async function setOwnerDishOrder(
  client: SupabaseClient,
  sectionId: string,
  ids: readonly string[],
): Promise<DishWriteResult<null>> {
  const { error } = await client.rpc("set_item_order", {
    p_section: sectionId,
    p_ids: ids,
  });
  if (!error) return { ok: true, value: null };
  return {
    ok: false,
    error: { kind: error.message === "order_mismatch" ? "mismatch" : "failed" },
  };
}
