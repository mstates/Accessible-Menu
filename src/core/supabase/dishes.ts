import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OwnerDish } from "@/domain/dish";

// Owner-side reads and writes on a section's dishes, through the owner's own
// client so row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migration 5). The table is called
// items; this is the only file that names it, and the only place the row
// shape is known. Features see OwnerDish. A delete marks the row and keeps
// it, so Undo can bring it back; reads leave marked rows out. Owners write
// name, sort, and deleted_at and nothing else: no price, no description,
// nothing about allergens, and a dish never moves to another section here.
// Nothing here can publish.

const columns = "id, name, sort";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  sort: z.number(),
});

function toDish(row: z.infer<typeof rowSchema>): OwnerDish {
  return { id: row.id, name: row.name };
}

// Postgres's code for a unique index refusing a row: here, items_name_key.
const UNIQUE_VIOLATION = "23505";
// What the copy trigger says when the caller cannot read the section.
const NO_SECTION = "An item needs an existing section.";

export type DishWriteError =
  | { kind: "name-taken" }
  | { kind: "not-found" }
  | { kind: "mismatch" }
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
