import { cleanMenuName } from "./menu";

// The owner-side dish: the row an owner reads on a section's page and the
// one text an owner writes there in task 3a, its name. The rest of a dish,
// its description, price, and note, arrives with the dish's own page
// (D-128). The diner-side Item in types.ts is the published view model and
// stays separate until the diner page reads real data (D-78). The table is
// called items; everything above it says dish. Pure: no React, no network.

export type OwnerDish = { id: string; name: string };

// Also a table constraint in the database (migration 5), which is the
// boundary. These checks exist to name the field and the message. A dish
// name runs longer than a section name: many are printed with their sides.
export const DISH_LIMITS = { name: 120 } as const;

// The rules a name can break, which are also the keys of their messages.
export type DishRule = "nameRequired" | "nameLength";

// A name is one line, cleaned the way a menu's name is: a pasted tab or line
// break becomes a space, and the outer space goes.
export function cleanDishName(value: string): string {
  return cleanMenuName(value);
}

// The rule a cleaned name breaks, or null when it can be saved.
export function dishNameProblem(value: string): DishRule | null {
  if (value === "") return "nameRequired";
  return value.length > DISH_LIMITS.name ? "nameLength" : null;
}
