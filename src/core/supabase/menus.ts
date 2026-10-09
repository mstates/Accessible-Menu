import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Held, ListedMenu, OwnerMenu } from "@/domain/menu";
import { shaped } from "./log";
import { listSectionDishes } from "./sections";

// Owner-side reads and writes on menus, through the owner's own client so
// row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migration 3). A delete marks the row and
// keeps it, so Undo can bring it back; reads leave marked rows out. Owners
// write name, sort, and deleted_at as columns and nothing else, so nothing
// here can publish. A delete goes through delete_with_contents(), which
// counts what the menu holds in the statement that marks it (migration 5).
// The only place the row shape is known; features see OwnerMenu, and the
// list sees it with the sections and the dishes each menu holds (D-119).

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
  // A delete would have taken more than the owner was told about.
  | { kind: "grew" }
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
//
// Each menu comes with what it holds: its sections that are not deleted and
// their dishes that are not deleted, which decides whether a delete asks
// first and what the question says (D-119). The database counts the dishes
// (migration 5), one row a section, and the rows are added up here.
export async function listOwnerMenus(
  client: SupabaseClient,
  restaurantId: string,
): Promise<ListedMenu[]> {
  const [menus, counts] = await Promise.all([
    client
      .from("menus")
      .select(columns)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("sort")
      .order("created_at")
      .order("id"),
    listSectionDishes(client, restaurantId),
  ]);
  if (menus.error) throw new Error("menus could not be read");
  const rows = shaped(z.array(rowSchema), menus.data, "menus");
  if (!rows) throw new Error("menus could not be read");
  const held = new Map<string, Held>();
  for (const { menuId, dishes } of counts) {
    const soFar = held.get(menuId) ?? { sections: 0, dishes: 0 };
    held.set(menuId, {
      sections: soFar.sections + 1,
      dishes: soFar.dishes + dishes,
    });
  }
  return rows.map((row) => ({
    ...toMenu(row),
    ...(held.get(row.id) ?? { sections: 0, dishes: 0 }),
  }));
}

// The restaurant's menus that are not deleted, in the owner's order, with
// nothing counted: what a section's page lists as the menus it can move to
// (D-129). A read that fails throws.
export async function listOwnerMenuNames(
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
  if (error) throw new Error("menus could not be read");
  const rows = shaped(z.array(rowSchema), data, "menus");
  if (!rows) throw new Error("menus could not be read");
  return rows.map(toMenu);
}

// One menu of the restaurant that is not deleted, for its own page and for
// every write on its sections. Row level security hides a menu that is not
// this owner's, so that, a deleted menu, and an id that matches nothing all
// read the same. A read that failed is told apart, so a save can say which
// it was and a page can throw.
export async function findOwnerMenu(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
): Promise<OwnerMenu | "not-found" | "failed"> {
  const { data, error } = await client
    .from("menus")
    .select(columns)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return "failed";
  if (!data) return "not-found";
  const row = shaped(rowSchema, data, "menus");
  return row ? toMenu(row) : "failed";
}

// A new menu goes last. Two tabs adding at once can draw the same sort; the
// read's tie-break keeps the order steady and the next reorder renumbers.
// The same read counts the live menus, so an add can say how many there are
// once it is in, whatever waited ahead of it on the page (D-125).
export async function addOwnerMenu(
  client: SupabaseClient,
  restaurantId: string,
  name: string,
): Promise<MenuWriteResult<{ menu: OwnerMenu; total: number }>> {
  const last = await client
    .from("menus")
    .select("sort", { count: "exact" })
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error || last.count === null) return failed;
  const highest = shaped(
    z.array(z.object({ sort: z.number() })),
    last.data,
    "menus",
  );
  const top = highest?.[0];
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("menus")
    .insert({ restaurant_id: restaurantId, name, sort })
    .select(columns)
    .single();
  if (error) return refused(error.code);
  const row = shaped(rowSchema, data, "menus");
  return row
    ? { ok: true, value: { menu: toMenu(row), total: last.count + 1 } }
    : failed;
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
  const row = shaped(rowSchema, data, "menus");
  return row ? { ok: true, value: toMenu(row) } : failed;
}

// Marks a menu deleted, through delete_with_contents(): the database counts
// the menu's sections and their dishes in the statement that marks it, and
// refuses when it holds more of either than the owner was told about
// (D-119). A menu that is not in this restaurant, is already deleted, or is
// not this owner's is not found.
export async function deleteOwnerMenu(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
  told: Held,
): Promise<MenuWriteResult<null>> {
  const { error } = await client.rpc("delete_with_contents", {
    p_kind: "menu",
    p_parent: restaurantId,
    p_id: id,
    p_sections: told.sections,
    p_dishes: told.dishes,
  });
  if (!error) return { ok: true, value: null };
  if (error.message === "delete_grew") {
    return { ok: false, error: { kind: "grew" } };
  }
  return error.message === "delete_not_found" ? notFound : failed;
}

// Brings a deleted menu back. It fails with name-taken while another menu
// has its name.
export async function restoreOwnerMenu(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
): Promise<MenuWriteResult<OwnerMenu>> {
  const { data, error } = await client
    .from("menus")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .not("deleted_at", "is", null)
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "menus");
  return row ? { ok: true, value: toMenu(row) } : failed;
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
