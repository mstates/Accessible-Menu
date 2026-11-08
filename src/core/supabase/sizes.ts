import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { caloriesInputText, type Calories } from "@/domain/calories";
import type { OwnerSize } from "@/domain/dish";
import { priceInputText } from "@/domain/money";
import { shaped } from "./log";

// Owner-side reads and writes on a dish's sizes (D-139), through the
// owner's own client so row level security decides what is visible (D-75)
// and the table constraints decide what is valid (migration 6). The table
// is called item_sizes; this is the only file that names it, and the only
// place the row shape is known. Features see OwnerSize. A blank name or
// price is null in the table and "" to a feature. Sizes are read in price
// order, a size with no price last, then the order added. A delete marks
// the row and keeps it, with deleted_at set; reads leave marked rows out.
// Owners write name, price_cents, the two calorie columns (D-167),
// and deleted_at and nothing else. Nothing here can publish.

const columns = "id, name, price_cents, calories_low, calories_high";

const rowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  price_cents: z.number().nullable(),
  calories_low: z.number().nullable(),
  calories_high: z.number().nullable(),
});

function toSize(row: z.infer<typeof rowSchema>): OwnerSize {
  return {
    id: row.id,
    name: row.name ?? "",
    price: priceInputText(row.price_cents),
    calories: caloriesInputText(row.calories_low, row.calories_high),
  };
}

// Postgres's code for a unique index refusing a row: here, item_sizes_name_key.
const UNIQUE_VIOLATION = "23505";
// What the copy trigger says when the caller cannot read the dish.
const NO_DISH = "A size needs an existing dish.";

export type SizeWriteError =
  { kind: "name-taken" } | { kind: "not-found" } | { kind: "failed" };

export type SizeWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: SizeWriteError };

function refused(code: string | undefined): SizeWriteResult<never> {
  return {
    ok: false,
    error: { kind: code === UNIQUE_VIOLATION ? "name-taken" : "failed" },
  };
}

const notFound: SizeWriteResult<never> = {
  ok: false,
  error: { kind: "not-found" },
};

const failed: SizeWriteResult<never> = { ok: false, error: { kind: "failed" } };

// The dish's sizes that are not deleted, in price order, a size with no
// price last, then the order added. The API caps how many rows one read
// returns, so the read asks for the exact total too; a read cut short is an
// error here. A read that fails throws: an error must never look like an
// empty list.
export async function listOwnerSizes(
  client: SupabaseClient,
  itemId: string,
): Promise<OwnerSize[]> {
  const { data, error, count } = await client
    .from("item_sizes")
    .select(columns, { count: "exact" })
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .order("price_cents", { ascending: true, nullsFirst: false })
    .order("created_at")
    .order("id");
  if (error) throw new Error("sizes could not be read");
  const rows = shaped(z.array(rowSchema), data, "item_sizes");
  if (!rows) throw new Error("sizes could not be read");
  if (count !== rows.length) {
    throw new Error("sizes could not be read: the read was cut short");
  }
  return rows.map(toSize);
}

// The names the restaurant's dishes already use for their sizes, most used
// first and then by name, for the size name field to suggest before the
// starter list (D-139). A read that fails throws.
export async function listOwnerSizeNames(
  client: SupabaseClient,
  restaurantId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("item_sizes")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .not("name", "is", null);
  if (error) throw new Error("size names could not be read");
  const rows = shaped(
    z.array(z.object({ name: z.string() })),
    data,
    "item_sizes",
  );
  if (!rows) throw new Error("size names could not be read");
  const counts = new Map<string, { name: string; uses: number }>();
  for (const row of rows) {
    const name = row.name.trim();
    const key = name.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.uses += 1;
    else counts.set(key, { name, uses: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

// A new size is blank: the owner types its name next, in the field that
// takes focus (D-139). The trigger takes its restaurant from the dish, which
// the caller must be able to read. The same read counts the live sizes, so
// the add can say how many there are once it is in.
export async function addOwnerSize(
  client: SupabaseClient,
  itemId: string,
): Promise<SizeWriteResult<{ size: OwnerSize; total: number }>> {
  const live = await client
    .from("item_sizes")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .is("deleted_at", null);
  if (live.error || live.count === null) return failed;
  const { data, error } = await client
    .from("item_sizes")
    .insert({ item_id: itemId })
    .select(columns)
    .single();
  if (error) return error.message === NO_DISH ? notFound : refused(error.code);
  const row = shaped(rowSchema, data, "item_sizes");
  return row
    ? { ok: true, value: { size: toSize(row), total: live.count + 1 } }
    : failed;
}

// Under row level security a size the caller does not own matches zero rows
// without an error, so each write asks for the row back and reads an empty
// answer as not found. A blank name or price is stored as null.
async function writeSize(
  client: SupabaseClient,
  itemId: string,
  id: string,
  column: "name" | "price_cents",
  value: string | number | null,
): Promise<SizeWriteResult<OwnerSize>> {
  return writeSizeColumns(client, itemId, id, { [column]: value });
}

// The same, for a write of more than one column at once: a pair of
// calories (D-167).
async function writeSizeColumns(
  client: SupabaseClient,
  itemId: string,
  id: string,
  values: Record<string, unknown>,
): Promise<SizeWriteResult<OwnerSize>> {
  const { data, error } = await client
    .from("item_sizes")
    .update(values)
    .eq("id", id)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "item_sizes");
  return row ? { ok: true, value: toSize(row) } : failed;
}

export function setOwnerSizeName(
  client: SupabaseClient,
  itemId: string,
  id: string,
  name: string | null,
): Promise<SizeWriteResult<OwnerSize>> {
  return writeSize(client, itemId, id, "name", name);
}

export function setOwnerSizePrice(
  client: SupabaseClient,
  itemId: string,
  id: string,
  cents: number | null,
): Promise<SizeWriteResult<OwnerSize>> {
  return writeSize(client, itemId, id, "price_cents", cents);
}

// A size's calories, both columns in one statement, or none (D-167).
export function setOwnerSizeCalories(
  client: SupabaseClient,
  itemId: string,
  id: string,
  calories: Calories | null,
): Promise<SizeWriteResult<OwnerSize>> {
  return writeSizeColumns(client, itemId, id, {
    calories_low: calories?.low ?? null,
    calories_high: calories?.high ?? null,
  });
}

// Marks a size removed. The row stays, with deleted_at set and its name,
// its price, and its calories as they were.
export async function removeOwnerSize(
  client: SupabaseClient,
  itemId: string,
  id: string,
): Promise<SizeWriteResult<OwnerSize>> {
  const { data, error } = await client
    .from("item_sizes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("item_id", itemId)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "item_sizes");
  return row ? { ok: true, value: toSize(row) } : failed;
}
