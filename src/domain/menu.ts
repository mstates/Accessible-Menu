// The owner-side menu: the row an owner reads on the menus list and the one
// field an owner writes there. The diner-side Menu in types.ts is the
// published view model and stays separate until the diner page reads real
// data (D-78). Pure: no React, no network.

export type OwnerMenu = { id: string; name: string };

// What a row holds that a delete would take with it (D-119): for a menu, its
// sections that are not deleted and their dishes that are not deleted; for a
// section, its dishes, with no sections; for a choice list, its options
// (D-166). It is also what a delete says the owner was told about: the
// confirmation's numbers, zeros for a row that holds nothing (D-221). The
// database counts again in the statement that marks the row and refuses a
// delete that would take more (migrations 5 and 11), so a page that is out
// of date never deletes anything nobody was asked about.
export type Held = { sections: number; dishes: number; options: number };

export const HOLDS_NOTHING: Held = { sections: 0, dishes: 0, options: 0 };

// A menu as the menus list reads it, with what it holds and its publish
// state as menu_publish_states() reports it (migration 12): whether it is
// published, which its delete question names, and since when and whether
// the draft differs from what was published, which the line under its name
// says (Q-115). The state fields are MenuPublishState's, so the list builds
// that line with the menu page's own sentence builder.
export type ListedMenu = OwnerMenu &
  Held &
  Pick<MenuPublishState, "published" | "publishedAt" | "changed">;

// A menu's publish state, as menu_publish_states() reports it (migration 12,
// D-82): whether it is published, since when, and whether the draft differs
// from what was published, which is null while it is unpublished. Changed
// is a value comparison of the snapshot the draft would make against the
// one that was published, never a clock.
export type MenuPublishState = {
  id: string;
  name: string;
  published: boolean;
  publishedAt: string | null;
  changed: boolean | null;
};

// What would block Publish, as publish_problems() reports it: a size with
// no name or no price under a live dish by size (D-139, D-144), named by
// the dish and its section, in the order the pages show them; or the menu
// itself, with no live dish in any of its sections (D-177, migration 14),
// which the page names since it knows its menu.
export type PublishBlocker =
  | { kind: "size-unnamed" | "size-unpriced"; dish: string; section: string }
  | { kind: "no-dishes" };

// Also a table constraint in the database (migration 3), which is the
// boundary. These checks exist to name the field and the message.
export const MENU_LIMITS = { name: 60 } as const;

// The rules a name can break, which are also the keys of their messages.
export type MenuRule = "nameRequired" | "nameLength";

// A name is one line. A control character inside a pasted name, a tab or a
// line break, becomes a space, so the name the owner sees is the name saved.
const CONTROL_CHARACTERS = /\p{Cc}+/gu;

export function cleanMenuName(value: string): string {
  return value.replace(CONTROL_CHARACTERS, " ").trim();
}

// The rule a cleaned name breaks, or null when it can be saved.
export function menuNameProblem(value: string): MenuRule | null {
  if (value === "") return "nameRequired";
  return value.length > MENU_LIMITS.name ? "nameLength" : null;
}

// Names are compared the way the unique indexes compare them (migrations 3
// to 6): case and outer spaces do not count. The same-named offer on a
// dish's page reads dish names across the restaurant this way (D-129).
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

// The other menu that already has this name, or null. Pass the id of the
// menu being renamed so it never collides with itself; null when adding.
// It reads an id and a name and nothing else, so a menu's sections, whose
// names differ within their menu the same way (migration 4), use it too.
export function nameTaken<Row extends OwnerMenu>(
  menus: readonly Row[],
  id: string | null,
  name: string,
): Row | null {
  const key = nameKey(name);
  return (
    menus.find((menu) => menu.id !== id && nameKey(menu.name) === key) ?? null
  );
}

// The order after one step up or down, or null at the edge.
export function moveInOrder(
  ids: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  const moved = ids[from];
  const other = ids[to];
  if (from === -1 || moved === undefined || other === undefined) return null;
  const next = [...ids];
  next[from] = other;
  next[to] = moved;
  return next;
}

// The menus in the order the ids give. A menu the ids do not name keeps its
// place after the ones they do, so a list that is a step behind never drops
// a row. Any row with an id, so sections use it as it is.
export function inOrder<Row extends { id: string }>(
  menus: readonly Row[],
  ids: readonly string[],
): Row[] {
  const named = ids.flatMap((id) => {
    const menu = menus.find((candidate) => candidate.id === id);
    return menu ? [menu] : [];
  });
  return [...named, ...menus.filter((menu) => !ids.includes(menu.id))];
}
