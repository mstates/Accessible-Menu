import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OwnerMenu } from "@/domain/menu";

// Owner-side reads and writes on menus, through the owner's own client so
// row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migration 3). A delete marks the row and
// keeps it, so Undo can bring it back; reads leave marked rows out. Owners
// write name, sort, and deleted_at and nothing else, so nothing here can
// publish. The only place the row shape is known; features see OwnerMenu.

const columns = "id, name, sort";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  sort: z.number(),
});

function toMenu(row: z.infer<typeof rowSchema>): OwnerMenu {
  return { id: row.id, name: row.name };
}

// Postgres's code for a unique index refusing a row: here, menus_name_key.
const UNIQUE_VIOLATION = "23505";

export type MenuWriteError =
  | { kind: "name-taken" }
  | { kind: "not-found" }
  | { kind: "mismatch" }
  | { kind: "failed" };

export type MenuWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: MenuWriteError };

function refused(code: string | undefined): MenuWriteResult<never> {
  return {
    ok: false,
    error: { kind: code === UNIQUE_VIOLATION ? "name-taken" : "failed" },
  };
}

const notFound: MenuWriteResult<never> = {
  ok: false,
  error: { kind: "not-found" },
};

const failed: MenuWriteResult<never> = { ok: false, error: { kind: "failed" } };

// The restaurant's menus that are not deleted, in the owner's order. sort
// alone is not a total order, since owners can write it directly, so
// created_at and id settle ties the same way every time. A read that fails
// throws: an error must never look like an empty list.
export async function listOwnerMenus(
  client: SupabaseClient,
  restaurantId: string,
): Promise<OwnerMenu[]> {
  const { data, error } = await client
    .from("menus")
    .select(columns)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error(`menus could not be read: ${error.message}`);
  return z.array(rowSchema).parse(data).map(toMenu);
}

// A new menu goes last. Two tabs adding at once can draw the same sort; the
// read's tie-break keeps the order steady and the next reorder renumbers.
export async function addOwnerMenu(
  client: SupabaseClient,
  restaurantId: string,
  name: string,
): Promise<MenuWriteResult<OwnerMenu>> {
  const last = await client
    .from("menus")
    .select("sort")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) return failed;
  const highest = z.object({ sort: z.number() }).safeParse(last.data);
  const sort = (highest.success ? highest.data.sort : 0) + 1;

  const { data, error } = await client
    .from("menus")
    .insert({ restaurant_id: restaurantId, name, sort })
    .select(columns)
    .single();
  if (error) return refused(error.code);
  const row = rowSchema.safeParse(data);
  return row.success ? { ok: true, value: toMenu(row.data) } : failed;
}

// Under row level security a menu the caller does not own matches zero rows
// without an error, so each write asks for the row back and reads an empty
// answer as not found. With expected, the rename happens only if the name is
// still that value: an Undo never writes over a newer change.
export async function renameOwnerMenu(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
  name: string,
  expected?: string,
): Promise<MenuWriteResult<OwnerMenu>> {
  let update = client
    .from("menus")
    .update({ name })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null);
  if (expected !== undefined) update = update.eq("name", expected);
  const { data, error } = await update.select(columns).maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = rowSchema.safeParse(data);
  return row.success ? { ok: true, value: toMenu(row.data) } : failed;
}

// Marks a menu deleted, or brings it back. Bringing it back fails with
// name-taken while another menu has its name.
export async function setOwnerMenuDeleted(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
  deleted: boolean,
): Promise<MenuWriteResult<OwnerMenu>> {
  const update = client
    .from("menus")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);
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
  return row.success ? { ok: true, value: toMenu(row.data) } : failed;
}

// set_menu_order() takes the whole list or nothing: a list that is not
// exactly the restaurant's live menus comes back as a mismatch, which is how
// a page that is out of date finds out.
export async function setOwnerMenuOrder(
  client: SupabaseClient,
  restaurantId: string,
  ids: readonly string[],
): Promise<MenuWriteResult<null>> {
  const { error } = await client.rpc("set_menu_order", {
    p_restaurant: restaurantId,
    p_ids: ids,
  });
  if (!error) return { ok: true, value: null };
  return {
    ok: false,
    error: { kind: error.message === "order_mismatch" ? "mismatch" : "failed" },
  };
}
