import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  Held,
  ListedMenu,
  MenuPublishState,
  OwnerMenu,
  PublishBlocker,
} from "@/domain/menu";
import { shaped } from "./log";
import { listSectionDishes } from "./sections";

// Owner-side reads and writes on menus, through the owner's own client so
// row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migration 3). A delete marks the row and
// keeps it, so Undo can bring it back; reads leave marked rows out. Owners
// write name, sort, and deleted_at as columns and nothing else: publishing
// goes through publish_menu() and unpublish_menu() alone, definers that
// check the caller and write the flag, the time, and the snapshot together
// (migration 12, D-82). A delete goes through delete_with_contents(), which
// counts what the menu holds in the statement that marks it (migration 5).
// The only place the row shape is known; features see OwnerMenu, and the
// list sees it with the sections and the dishes each menu holds (D-119)
// and its publish state, which its delete question and the line under its
// name read (Q-115).

const columns = "id, name, sort, published";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  sort: z.number(),
  published: z.boolean(),
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
// (migration 5), one row a section, and the rows are added up here. Each
// menu also comes with its publish state from menu_publish_states()
// (migration 12), read with the menus, for the line under its name on the
// list (Q-115): the list shows the states as they were read, and a Publish
// or Unpublish on the menu's own page reaches it the next time it is read.
export async function listOwnerMenus(
  client: SupabaseClient,
  restaurantId: string,
): Promise<ListedMenu[]> {
  const [menus, counts, publishStates] = await Promise.all([
    client
      .from("menus")
      .select(columns)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("sort")
      .order("created_at")
      .order("id"),
    listSectionDishes(client, restaurantId),
    listOwnerMenuPublishStates(client, restaurantId),
  ]);
  if (menus.error) throw new Error("menus could not be read");
  const rows = shaped(z.array(rowSchema), menus.data, "menus");
  if (!rows) throw new Error("menus could not be read");
  const held = new Map<string, Held>();
  for (const { menuId, dishes } of counts) {
    const soFar = held.get(menuId) ?? { sections: 0, dishes: 0, options: 0 };
    held.set(menuId, {
      sections: soFar.sections + 1,
      dishes: soFar.dishes + dishes,
      options: 0,
    });
  }
  const states = new Map(publishStates.map((state) => [state.id, state]));
  return rows.map((row) => {
    const state = states.get(row.id);
    return {
      ...toMenu(row),
      ...(held.get(row.id) ?? { sections: 0, dishes: 0, options: 0 }),
      // The function's row is the one reading of a menu's state (D-170). A
      // menu it does not report, added between the two reads, keeps the
      // column's flag, with no day and nothing compared.
      published: state ? state.published : row.published,
      publishedAt: state?.publishedAt ?? null,
      changed: state?.changed ?? null,
    };
  });
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
    p_options: 0,
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

// Each live menu's publish state, from menu_publish_states() (migration 12):
// whether it is published, since when, and whether the draft differs from
// what was published. The function runs as the caller, so row level
// security decides which menus it reports. A read that fails throws: an
// error must never look like no menus.
const stateSchema = z.object({
  menu: z.string(),
  menu_name: z.string(),
  published: z.boolean(),
  published_at: z.string().nullable(),
  changed: z.boolean().nullable(),
});

export async function listOwnerMenuPublishStates(
  client: SupabaseClient,
  restaurantId: string,
): Promise<MenuPublishState[]> {
  const { data, error } = await client.rpc("menu_publish_states", {
    p_restaurant: restaurantId,
  });
  if (error) throw new Error("the publish states could not be read");
  const rows = shaped(z.array(stateSchema), data, "menu_publish_states");
  if (!rows) throw new Error("the publish states could not be read");
  return rows.map((row) => ({
    id: row.menu,
    name: row.menu_name,
    published: row.published,
    publishedAt: row.published_at,
    changed: row.changed,
  }));
}

// What would block Publish on one menu, from publish_problems() (migrations
// 12 and 14): each live size with no name or no price under a live dish by
// size, named by the dish and its section, in page order; or the menu
// itself, with nothing named, while it has no live dish in any live
// section (D-177). A read that fails throws.
const sizeBlockerSchema = z.object({
  problem: z.enum(["size_unnamed", "size_unpriced"]),
  dish: z.string(),
  dish_name: z.string(),
  section_name: z.string(),
  size: z.string(),
});

const menuBlockerSchema = z.object({
  problem: z.literal("no_dishes"),
  dish: z.null(),
  dish_name: z.null(),
  section_name: z.null(),
  size: z.null(),
});

const blockerSchema = z.union([sizeBlockerSchema, menuBlockerSchema]);

export async function listPublishBlockers(
  client: SupabaseClient,
  menuId: string,
): Promise<PublishBlocker[]> {
  const { data, error } = await client.rpc("publish_problems", {
    p_menu: menuId,
  });
  if (error) throw new Error("the publish problems could not be read");
  const rows = shaped(z.array(blockerSchema), data, "publish_problems");
  if (!rows) throw new Error("the publish problems could not be read");
  return rows.map((row): PublishBlocker => {
    if (row.problem === "no_dishes") return { kind: "no-dishes" };
    return {
      kind: row.problem === "size_unnamed" ? "size-unnamed" : "size-unpriced",
      dish: row.dish_name,
      section: row.section_name,
    };
  });
}

export type PublishError =
  // A size with no name or no price, or a menu with no dishes, blocks it;
  // the database wrote nothing.
  { kind: "blocked" } | { kind: "not-found" } | { kind: "failed" };

export type PublishResult = { ok: true } | { ok: false; error: PublishError };

// Publishes the menu through publish_menu() (migration 12): the database
// checks the caller, refuses by name while a size is incomplete or the menu
// has no dishes (migration 14), and writes the flag, the time, and the
// snapshot in one statement. A menu that is not this owner's, is deleted,
// or matches nothing is not found.
export async function publishOwnerMenu(
  client: SupabaseClient,
  menuId: string,
): Promise<PublishResult> {
  const { error } = await client.rpc("publish_menu", { p_menu: menuId });
  if (!error) return { ok: true };
  if (error.message === "publish_blocked") {
    return { ok: false, error: { kind: "blocked" } };
  }
  return {
    ok: false,
    error: {
      kind: error.message === "publish_not_found" ? "not-found" : "failed",
    },
  };
}

// Unpublishes the menu through unpublish_menu(): the flag, the time, and
// the snapshot go together, and a menu already unpublished is left as it
// is, with no error.
export async function unpublishOwnerMenu(
  client: SupabaseClient,
  menuId: string,
): Promise<PublishResult> {
  const { error } = await client.rpc("unpublish_menu", { p_menu: menuId });
  if (!error) return { ok: true };
  return {
    ok: false,
    error: {
      kind: error.message === "unpublish_not_found" ? "not-found" : "failed",
    },
  };
}
