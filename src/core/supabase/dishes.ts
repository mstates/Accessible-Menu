import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AllergenLists } from "@/domain/allergens";
import { caloriesInputText } from "@/domain/calories";
import {
  PRICE_KINDS,
  type DishGeneral,
  type OwnerDish,
  type OwnerDishDetail,
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
// keeps it, with deleted_at set; reads leave marked rows out. Owners
// write name, description, the price choice, price_cents, the two calorie
// columns, note, the two allergen lists and the allergen check, the
// dietary tags with the Cooked to order mark (D-167), the schedule with
// available and the sold-out mark, sort, and deleted_at and nothing else:
// nothing about photos yet, and never who checked a list or when, which the
// database stamps (D-148). A move to another section goes through
// move_item(), since section_id is not a column owners write (migration 6).
// The fields a dish's General page writes, its description, note, price
// choice, one price, calories, and sizes, are read and written whole,
// through item_general() and save_item_general() (migration 16, D-237).
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
// D-160), its calories and its Cooked to order mark (D-167).
const detailColumns =
  "id, name, description, price_kind, price_cents, calories_low, calories_high, cooked_to_order, note, allergens, custom_allergens, allergens_reviewed, allergens_reviewed_by, allergens_reviewed_at, dietary_tags, available, sold_out_at, special_schedule, sort, section_id";

const detailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price_kind: z.enum(PRICE_KINDS),
  price_cents: z.number().nullable(),
  calories_low: z.number().nullable(),
  calories_high: z.number().nullable(),
  cooked_to_order: z.boolean(),
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
    calories: caloriesInputText(row.calories_low, row.calories_high),
    cookedToOrder: row.cooked_to_order,
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
  // A General save found the dish holding other values than the page
  // showed (D-237).
  | { kind: "moved" }
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
// answer as not found.
export async function renameOwnerDish(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  name: string,
): Promise<DishWriteResult<OwnerDish>> {
  const { data, error } = await client
    .from("items")
    .update({ name })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "items");
  return row ? { ok: true, value: toDish(row) } : failed;
}

// Marks a dish deleted. The row stays, with deleted_at set. A dish holds
// nothing a delete counts, so this counts nothing; the page asks first all
// the same (D-221).
export async function deleteOwnerDish(
  client: SupabaseClient,
  sectionId: string,
  id: string,
): Promise<DishWriteResult<OwnerDish>> {
  const { data, error } = await client
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "items");
  return row ? { ok: true, value: toDish(row) } : failed;
}

// The document a dish's General page shows and writes (D-237), in the
// shape item_general() returns it (migration 16). Read as it arrives: a
// size from the reader always has its id.
const generalSizeSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  price_cents: z.number().nullable(),
  calories_low: z.number().nullable(),
  calories_high: z.number().nullable(),
});

export const dishGeneralSchema = z.object({
  description: z.string().nullable(),
  note: z.string().nullable(),
  price_kind: z.enum(PRICE_KINDS),
  price_cents: z.number().nullable(),
  calories_low: z.number().nullable(),
  calories_high: z.number().nullable(),
  sizes: z.array(generalSizeSchema),
});

// The raw value comes back beside the parsed one: the form reads the
// parsed document, and the Save hands the raw one back untouched, since
// the writer compares it with its own read by value and a key this reader
// does not know would otherwise be lost on the way.
export type OwnerDishGeneral = { raw: unknown; general: DishGeneral };

// What the General page shows, from item_general(): one statement, so the
// dish's fields and its sizes are of one instant. The function runs as the
// caller and only reads, so it goes as a GET (D-199), and row level
// security decides what it can read. It answers with no document for a
// dish that is missing, deleted, or not this owner's.
export async function readOwnerDishGeneral(
  client: SupabaseClient,
  id: string,
): Promise<OwnerDishGeneral | "not-found" | "failed"> {
  const { data, error } = await client.rpc(
    "item_general",
    { p_item: id },
    { get: true },
  );
  if (error) return "failed";
  if (data === null || data === undefined) return "not-found";
  const general = shaped(dishGeneralSchema, data, "rpc/item_general");
  return general ? { raw: data as unknown, general } : "failed";
}

// The General page's one write (D-237), through save_item_general(): the
// dish's fields and its sizes in one transaction, whole or not at all,
// landing only if the dish still holds the document the page showed. The
// database locks the dish, reads the document again through the same
// reader, and compares the two by value. shown goes back as the object it
// arrived as, and all three arguments are always sent: a missing one names
// a function that does not exist. A refusal by name is told apart by its
// message; a table rule comes back by its code, as the names index
// (name-taken) or as the constraint's name (refused).
export async function saveOwnerDishGeneral(
  client: SupabaseClient,
  id: string,
  shown: Record<string, unknown>,
  next: DishGeneral,
): Promise<DishWriteResult<null>> {
  const { error } = await client.rpc("save_item_general", {
    p_item: id,
    p_shown: shown,
    p_next: next,
  });
  if (!error) return { ok: true, value: null };
  switch (error.message) {
    case "general_moved":
      return { ok: false, error: { kind: "moved" } };
    case "general_not_found":
      return notFound;
    case "general_malformed":
      return failed;
    default:
      return refused(error.code, error.message);
  }
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
// uncheck. A miss comes back as not found, which the caller reads as the
// lists having moved.
export type AllergenExpected = {
  lists?: AllergenLists;
  allergens_reviewed?: boolean;
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
  const { data, error } = await update.select(detailColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(detailSchema, data, "items");
  return row ? { ok: true, value: toDetail(row, viewer) } : failed;
}

// What the Dietary tags page writes in one statement (D-223, D-229): the
// tags and the Cooked to order mark (D-66, D-167).
export type TagsPagePatch = {
  dietary_tags: readonly DietaryTagId[];
  cooked_to_order: boolean;
};

// Writes a dish's dietary tags and its Cooked to order mark together,
// scoped to the section the page read the dish in, and lands only if the
// dish still holds the tags the page showed (D-149's rule, widened to tags
// at task 5's plan): a stale tab's save would otherwise put back a tag
// another tab removed. The tags are in the enum's order, the way every
// write leaves them.
export async function writeOwnerDishTagsPage(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  viewer: string | null,
  patch: TagsPagePatch,
  shown: readonly DietaryTagId[],
): Promise<DishWriteResult<OwnerDishDetail>> {
  const { data, error } = await client
    .from("items")
    .update({
      dietary_tags: [...patch.dietary_tags],
      cooked_to_order: patch.cooked_to_order,
    })
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

// What the Availability page writes in one statement (D-223, D-229): the
// whole schedule, or none (D-159), and, when the choice changed, the flag
// and the mark together, so the three states are the three rows the
// database allows (D-160). A save that changes only the schedule leaves a
// sold-out mark's time as it was.
export type ShowingPatch = {
  available?: boolean;
  sold_out_at?: string | null;
  special_schedule: Schedule | null;
};

// Writes a dish's schedule and, when it changed, its availability, scoped
// to the section the page read the dish in, and lands only if the dish
// still holds the schedule the page showed (D-149's rule, widened to the
// schedule at task 5's plan). jsonb compares by value, so the text's key
// order never matters.
export async function writeOwnerDishShowing(
  client: SupabaseClient,
  sectionId: string,
  id: string,
  viewer: string | null,
  patch: ShowingPatch,
  shownSchedule: Schedule | null,
): Promise<DishWriteResult<OwnerDishDetail>> {
  const values: Record<string, unknown> = {
    special_schedule: patch.special_schedule,
  };
  if (patch.available !== undefined) {
    values.available = patch.available;
    values.sold_out_at = patch.sold_out_at ?? null;
  }
  let update = client
    .from("items")
    .update(values)
    .eq("id", id)
    .eq("section_id", sectionId)
    .is("deleted_at", null);
  update =
    shownSchedule === null
      ? update.is("special_schedule", null)
      : update.eq("special_schedule", scheduleJson(shownSchedule));
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

// The live dishes among the given ids, by name and section: where a choice
// list under a dish is, for the same-named offer's place words (D-166). A
// read that fails throws.
export type NamedDish = { id: string; name: string; sectionId: string };

const namedSchema = z.object({
  id: z.string(),
  name: z.string(),
  section_id: z.string(),
});

export async function listOwnerDishNames(
  client: SupabaseClient,
  restaurantId: string,
  ids: readonly string[],
): Promise<NamedDish[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("items")
    .select("id, name, section_id")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .in("id", [...ids]);
  if (error) throw new Error("dishes could not be read");
  const rows = shaped(z.array(namedSchema), data, "items");
  if (!rows) throw new Error("dishes could not be read");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sectionId: row.section_id,
  }));
}

// The other allergens the restaurant's live dishes already name, as stored,
// repeats included; the domain ranks them with the options' names, most
// used first and then by name, for the other-allergen field to suggest
// before the starter list (D-148, D-166), the way size names are suggested
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
