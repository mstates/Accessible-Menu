import { z } from "zod";

// The owner-side menu: the row an owner reads on the menus list and the one
// field an owner writes there. The diner-side Menu in types.ts is the
// published view model and stays separate until the diner page reads real
// data (D-78). Pure: no React, no network.

export type OwnerMenu = { id: string; name: string };

// A menu as the menus list reads it: with how many of its sections are not
// deleted, which is what a delete would take with it (D-119).
export type ListedMenu = OwnerMenu & { sections: number };

// A delete that takes content with it asks first (D-119): a menu with
// sections opens the confirmation, an empty one goes at once.
export function deleteAsksFirst(sections: number): boolean {
  return sections > 0;
}

// Every delete says how many sections the owner was told about: none for a
// delete at once and for an Undo, the confirmation's number otherwise. The
// server refuses one that would take more, so a page that is out of date
// never deletes sections nobody was asked about.
export function deleteTakesMore(live: number, told: number): boolean {
  return live > told;
}

// Also a table constraint in the database (migration 3), which is the
// boundary. These checks exist to name the field and the message.
export const MENU_LIMITS = { name: 60 } as const;

export type MenuNameMessages = {
  nameRequired: string;
  nameLength: string;
};

// A name is one line. A control character inside a pasted name, a tab or a
// line break, becomes a space, so the name the owner sees is the name saved.
const CONTROL_CHARACTERS = /\p{Cc}+/gu;

export function cleanMenuName(value: string): string {
  return value.replace(CONTROL_CHARACTERS, " ").trim();
}

export function menuNameSchema(messages: MenuNameMessages) {
  return z
    .string()
    .transform(cleanMenuName)
    .pipe(
      z
        .string()
        .min(1, { error: messages.nameRequired })
        .max(MENU_LIMITS.name, { error: messages.nameLength }),
    );
}

// Names are compared the way the unique index compares them (migration 3):
// case and outer spaces do not count.
function nameKey(name: string): string {
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

// The order to put back after a restore: the remembered order, kept to the
// menus that are live now, with any menu it never knew after them in the
// order they have today.
export function mergeOrder(
  remembered: readonly string[],
  live: readonly string[],
): string[] {
  const known = remembered.filter((id) => live.includes(id));
  return [...known, ...live.filter((id) => !known.includes(id))];
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
