import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  PRICE_KINDS,
  type OwnerDish,
  type OwnerDishDetail,
  type PriceKind,
} from "@/domain/dish";
import { priceInputText } from "@/domain/money";

// Owner-side reads and writes on dishes, through the owner's own client so
// row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migrations 5 and 6). The table is
// called items; this is the only file that names it, and the only place the
// row shape is known. Features see OwnerDish on a section's page and
// OwnerDishDetail on the dish's own page. A delete marks the row and keeps
// it, so Undo can bring it back; reads leave marked rows out. Owners write
// name, description, the price choice, price_cents, note, sort, and
// deleted_at and nothing else: nothing about allergens or photos yet. A
// move to another section goes through move_item(), since section_id is not
// a column owners write (migration 6). Nothing here can publish.

const columns = "id, name, sort";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  sort: z.number(),
});

function toDish(row: z.infer<typeof rowSchema>): OwnerDish {
  return { id: row.id, name: row.name };
}

// The dish as its own page reads it (D-128), with the section it is in.
const detailColumns =
  "id, name, description, price_kind, price_cents, note, sort, section_id";

const detailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price_kind: z.enum(PRICE_KINDS),
  price_cents: z.number().nullable(),
  note: z.string().nullable(),
  sort: z.number(),
  section_id: z.string(),
});

type DetailRow = z.infer<typeof detailSchema>;

function toDetail(row: DetailRow): OwnerDishDetail & { sectionId: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    note: row.note ?? "",
    priceKind: row.price_kind,
    price: priceInputText(row.price_cents),
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
  | { kind: "failed" };

export type DishWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: DishWriteError };

function refused(code: string | undefined): DishWriteResult<never> {
  return {
    ok: false,
    error: { kind: code === UNIQUE_VIOLATION ? "name-taken" : "failed" },
  };
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
  if (error) throw new Error(`dishes could not be read: ${error.message}`);
  const rows = z.array(rowSchema).parse(data);
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
  const row = detailSchema.safeParse(data);
  return row.success ? toDetail(row.data) : "failed";
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
  const highest = z.array(z.object({ sort: z.number() })).safeParse(last.data);
  const top = highest.success ? highest.data[0] : undefined;
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("items")
    .insert({ section_id: sectionId, name, sort })
    .select(columns)
    .single();
  if (error) {
    return error.message === NO_SECTION ? notFound : refused(error.code);
  }
  const row = rowSchema.safeParse(data);
  return row.success
    ? { ok: true, value: { dish: toDish(row.data), total: last.count + 1 } }
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
  const row = rowSchema.safeParse(data);
  return row.success ? { ok: true, value: toDish(row.data) } : failed;
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
  const row = rowSchema.safeParse(data);
  return row.success ? { ok: true, value: toDish(row.data) } : failed;
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
  const row = detailSchema.safeParse(data);
  return row.success ? { ok: true, value: toDetail(row.data) } : failed;
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
