import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Held } from "@/domain/menu";
import type {
  ListedSection,
  OwnerSection,
  SectionText,
} from "@/domain/section";
import { shaped } from "./log";

// Owner-side reads and writes on a menu's sections, through the owner's own
// client so row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migration 4). A delete marks the row
// and keeps it, with deleted_at set; reads leave marked rows out.
// Owners write name, note, sort, and deleted_at as columns and nothing
// else; what a section offered with every dish is a choice list now
// (migration 11, choices.ts). A delete goes through
// delete_with_contents(), which counts what the section holds in the
// statement that marks it, and a move to another menu goes through
// move_section(), since menu_id is not a column owners write (migration
// 5). Nothing here can publish. The only place the row shape is known;
// features see OwnerSection.

const columns = "id, name, note, sort";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  sort: z.number(),
});

function toSection(row: z.infer<typeof rowSchema>): OwnerSection {
  return {
    id: row.id,
    name: row.name,
    note: row.note ?? "",
  };
}

const columnOf: Record<SectionText, "name" | "note"> = {
  name: "name",
  note: "note",
};

// Postgres's code for a unique index refusing a row: here, sections_name_key.
const UNIQUE_VIOLATION = "23505";
// What the copy trigger says when the caller cannot read the menu.
const NO_MENU = "A section needs an existing menu.";

export type SectionWriteError =
  | { kind: "name-taken" }
  | { kind: "not-found" }
  | { kind: "mismatch" }
  // A delete would have taken more dishes than the owner was told about.
  | { kind: "grew" }
  // A move named a menu that is not one of this restaurant's live menus.
  | { kind: "menu-gone" }
  // A move named the menu the section is already in.
  | { kind: "same-menu" }
  // The database refused the row by a named rule of its own; the name is
  // the rule.
  | { kind: "refused"; rule: string }
  | { kind: "failed" };

export type SectionWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: SectionWriteError };

// Postgres's code for an error a trigger raises by name.
const RAISED = "P0001";

function refused(
  code: string | undefined,
  message = "",
): SectionWriteResult<never> {
  if (code === UNIQUE_VIOLATION)
    return { ok: false, error: { kind: "name-taken" } };
  if (code === RAISED && /^[a-z_]+$/.test(message)) {
    return { ok: false, error: { kind: "refused", rule: message } };
  }
  return { ok: false, error: { kind: "failed" } };
}

const notFound: SectionWriteResult<never> = {
  ok: false,
  error: { kind: "not-found" },
};

const failed: SectionWriteResult<never> = {
  ok: false,
  error: { kind: "failed" },
};

// The menu's sections that are not deleted, in the owner's order. sort alone
// is not a total order, since owners can write it directly, so created_at
// and id settle ties the same way every time. A read that fails throws: an
// error must never look like an empty list.
export async function listOwnerSections(
  client: SupabaseClient,
  menuId: string,
): Promise<OwnerSection[]> {
  const { data, error } = await client
    .from("sections")
    .select(columns)
    .eq("menu_id", menuId)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error("sections could not be read");
  const rows = shaped(z.array(rowSchema), data, "sections");
  if (!rows) throw new Error("sections could not be read");
  return rows.map(toSection);
}

// Every section of the restaurant that is not deleted, with the menu it is
// in, in the owner's order: what a dish's page lists as the sections it can
// move to (D-129), grouped by the caller under the live menus. A read that
// fails throws.
export type NamedSection = { id: string; name: string; menuId: string };

const namedSchema = z.object({
  id: z.string(),
  name: z.string(),
  menu_id: z.string(),
});

export async function listOwnerSectionNames(
  client: SupabaseClient,
  restaurantId: string,
): Promise<NamedSection[]> {
  const { data, error } = await client
    .from("sections")
    .select("id, name, menu_id")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error("sections could not be read");
  const rows = shaped(z.array(namedSchema), data, "sections");
  if (!rows) throw new Error("sections could not be read");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    menuId: row.menu_id,
  }));
}

// What a delete would take, as the database counts it: one row for each
// section that is not deleted, in a menu of the restaurant that is not
// deleted, with how many of its dishes are not deleted (migration 5). The
// Menus page adds them up by menu, and a menu's page reads its own rows. The
// API caps how many rows one read returns, so the read asks for the exact
// total too: a count that is not whole would make a delete refuse for ever,
// and that is an error here, never a guess. A read that fails throws.
export type SectionDishes = {
  menuId: string;
  sectionId: string;
  dishes: number;
};

const countSchema = z.object({
  menu_id: z.string(),
  section_id: z.string(),
  dishes: z.number(),
});

export async function listSectionDishes(
  client: SupabaseClient,
  restaurantId: string,
): Promise<SectionDishes[]> {
  const { data, error, count } = await client.rpc(
    "section_dish_counts",
    { p_restaurant: restaurantId },
    { count: "exact", get: true },
  );
  if (error) throw new Error("dishes could not be counted");
  const rows = shaped(z.array(countSchema), data, "rpc/section_dish_counts");
  if (!rows) throw new Error("dishes could not be counted");
  if (count !== rows.length) {
    throw new Error("dishes could not be counted: the read was cut short");
  }
  return rows.map((row) => ({
    menuId: row.menu_id,
    sectionId: row.section_id,
    dishes: row.dishes,
  }));
}

// A menu's sections as its page reads them: each with how many dishes it
// holds, which decides whether its delete asks first and what the question
// says (D-119). A section the count does not know yet, added in the instant
// between the two reads, holds none.
export async function listOwnerSectionsWithDishes(
  client: SupabaseClient,
  restaurantId: string,
  menuId: string,
): Promise<ListedSection[]> {
  const [sections, counts] = await Promise.all([
    listOwnerSections(client, menuId),
    listSectionDishes(client, restaurantId),
  ]);
  const dishes = new Map(counts.map((row) => [row.sectionId, row.dishes]));
  return sections.map((section) => ({
    ...section,
    dishes: dishes.get(section.id) ?? 0,
  }));
}

// One section of the restaurant that is not deleted, with the menu it is
// in, for its own page and for every write on its dishes. Row level
// security hides a section that is not this owner's, so that, a deleted
// section, and an id that matches nothing all read the same. Whether its
// menu is still there is the caller's next question. A read that failed is
// told apart, so a save can say which it was and a page can throw.
export async function findOwnerSection(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
): Promise<(OwnerSection & { menuId: string }) | "not-found" | "failed"> {
  const { data, error } = await client
    .from("sections")
    .select(`${columns}, menu_id`)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return "failed";
  if (!data) return "not-found";
  const row = shaped(
    rowSchema.extend({ menu_id: z.string() }),
    data,
    "sections",
  );
  return row ? { ...toSection(row), menuId: row.menu_id } : "failed";
}

// A new section goes last, with a name only. The trigger takes its
// restaurant from the menu. Two tabs adding at once can draw the same sort;
// the read's tie-break keeps the order steady and the next reorder
// renumbers. The same read counts the live sections, so an add can say how
// many there are once it is in, whatever waited ahead of it on the page
// (D-125).
export async function addOwnerSection(
  client: SupabaseClient,
  menuId: string,
  name: string,
): Promise<SectionWriteResult<{ section: OwnerSection; total: number }>> {
  const last = await client
    .from("sections")
    .select("sort", { count: "exact" })
    .eq("menu_id", menuId)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error || last.count === null) return failed;
  const highest = shaped(
    z.array(z.object({ sort: z.number() })),
    last.data,
    "sections",
  );
  const top = highest?.[0];
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("sections")
    .insert({ menu_id: menuId, name, sort })
    .select(columns)
    .single();
  if (error) return error.message === NO_MENU ? notFound : refused(error.code);
  const row = shaped(rowSchema, data, "sections");
  return row
    ? { ok: true, value: { section: toSection(row), total: last.count + 1 } }
    : failed;
}

// Writes one of a section's texts. Under row level security a section the
// caller does not own matches zero rows without an error, so the write asks
// for the row back and reads an empty answer as not found. A blank note is
// stored as null.
export async function setOwnerSectionText(
  client: SupabaseClient,
  menuId: string,
  id: string,
  field: SectionText,
  value: string,
): Promise<SectionWriteResult<OwnerSection>> {
  const column = columnOf[field];
  const { data, error } = await client
    .from("sections")
    .update({ [column]: value === "" ? null : value })
    .eq("id", id)
    .eq("menu_id", menuId)
    .is("deleted_at", null)
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = shaped(rowSchema, data, "sections");
  return row ? { ok: true, value: toSection(row) } : failed;
}

// Marks a section deleted, through delete_with_contents(): the database
// counts the section's dishes in the statement that marks it, and refuses
// when it holds more than the owner was told about (D-119). A section that
// is not in this menu, is already deleted, or is not this owner's is not
// found.
export async function deleteOwnerSection(
  client: SupabaseClient,
  menuId: string,
  id: string,
  told: Held,
): Promise<SectionWriteResult<null>> {
  const { error } = await client.rpc("delete_with_contents", {
    p_kind: "section",
    p_parent: menuId,
    p_id: id,
    p_sections: 0,
    p_dishes: told.dishes,
    p_options: 0,
  });
  if (!error) return { ok: true, value: null };
  if (error.message === "delete_grew") {
    return { ok: false, error: { kind: "grew" } };
  }
  return error.message === "delete_not_found" ? notFound : failed;
}

// Moves a section to another menu of its restaurant, last, with its dishes
// (D-129), through move_section(). The database checks that the caller is a
// member of the section's restaurant and that the menu belongs to it.
export async function moveOwnerSection(
  client: SupabaseClient,
  id: string,
  menuId: string,
): Promise<SectionWriteResult<null>> {
  const { error } = await client.rpc("move_section", {
    p_section: id,
    p_menu: menuId,
  });
  if (!error) return { ok: true, value: null };
  switch (error.message) {
    case "move_name_taken":
      return { ok: false, error: { kind: "name-taken" } };
    case "move_menu_gone":
      return { ok: false, error: { kind: "menu-gone" } };
    case "move_same_menu":
      return { ok: false, error: { kind: "same-menu" } };
    case "move_not_found":
      return notFound;
    default:
      return failed;
  }
}

// set_section_order() takes the whole list or nothing: a list that is not
// exactly the menu's live sections comes back as a mismatch, which is how a
// page that is out of date finds out.
export async function setOwnerSectionOrder(
  client: SupabaseClient,
  menuId: string,
  ids: readonly string[],
): Promise<SectionWriteResult<null>> {
  const { error } = await client.rpc("set_section_order", {
    p_menu: menuId,
    p_ids: ids,
  });
  if (!error) return { ok: true, value: null };
  return {
    ok: false,
    error: { kind: error.message === "order_mismatch" ? "mismatch" : "failed" },
  };
}
