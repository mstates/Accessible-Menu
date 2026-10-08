import type { AllergenCheck, OwnerAllergens } from "./allergens";
import { cleanMenuName } from "./menu";
import { parsePrice, type PriceRule } from "./money";
import { cleanNote } from "./section";

// The owner-side dish: the row an owner reads on a section's page, with its
// name, and the dish as its own page reads it (D-128), with everything an
// owner writes there: the description, the price choice, the one price, the
// note, and the sizes (task 3b), and its allergens with their check (task
// 4, D-148). Tags, availability, and the photo join in tasks 5 and 6. The
// diner-side Item in types.ts is the published view model and stays
// separate until the diner page reads real data (D-78). The table is called
// items; everything above it says dish. Pure: no React, no network.

export type OwnerDish = { id: string; name: string };

// How a dish is priced (D-139): one price, prices by size, or market price,
// never a range.
export const PRICE_KINDS = ["one", "sizes", "market"] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

// A dish's allergens as the owner's page reads and writes them (D-148): the
// shape every allergen group shares (allergens.ts), a section's line's
// included (D-152), with who checked the list and when.
export type { AllergenCheck };
export type OwnerDishAllergens = OwnerAllergens;

// A dish on its own page. price is the one price as its field shows it, two
// decimals or blank for none; the sizes are read beside it.
export type OwnerDishDetail = OwnerDish &
  OwnerDishAllergens & {
    description: string;
    note: string;
    priceKind: PriceKind;
    price: string;
  };

// The texts of a dish an owner writes on its page, in the page's order.
export const DISH_TEXTS = ["description", "price", "note"] as const;
export type DishText = (typeof DISH_TEXTS)[number];

// Also table constraints in the database (migrations 5 and 6), which is the
// boundary. These checks exist to name the field and the message. A dish
// name runs longer than a section name: many are printed with their sides.
export const DISH_LIMITS = { name: 120, description: 500, note: 120 } as const;

// The rules a dish's texts can break, which are also the keys of their
// messages.
export type DishRule =
  | "nameRequired"
  | "nameLength"
  | "descriptionLength"
  | "noteLength"
  | PriceRule;

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

// A description may run over several lines, cleaned the way a section's
// note is; a note is one line, cleaned the way a name is; a typed price
// loses only its outer space, so what the owner typed is what is read.
export function cleanDishText(field: DishText, value: string): string {
  switch (field) {
    case "description":
      return cleanNote(value);
    case "note":
      return cleanMenuName(value);
    case "price":
      return value.trim();
  }
}

// The rule a cleaned text breaks, or null when it can be saved. A
// description and a note may be blank, which means none; a blank price
// means no price shown (D-139).
export function dishTextProblem(
  field: DishText,
  value: string,
): DishRule | null {
  switch (field) {
    case "description":
      return value.length > DISH_LIMITS.description
        ? "descriptionLength"
        : null;
    case "note":
      return value.length > DISH_LIMITS.note ? "noteLength" : null;
    case "price": {
      const price = parsePrice(value);
      return price.ok ? null : price.rule;
    }
  }
}

// A size of a dish (D-139): a name and a price, each blank while the owner
// has not typed one. The table holds null for either; a draft may, and
// Publish refuses one (D-82).
export type OwnerSize = { id: string; name: string; price: string };

export const SIZE_TEXTS = ["name", "price"] as const;
export type SizeText = (typeof SIZE_TEXTS)[number];

// Also a table constraint (migration 6). A size name is short: Cup, Bowl,
// Half, 6 wings.
export const SIZE_LIMITS = { name: 40 } as const;

export type SizeRule = "sizeNameLength" | PriceRule;

export function cleanSizeText(field: SizeText, value: string): string {
  return field === "name" ? cleanMenuName(value) : value.trim();
}

export function sizeTextProblem(
  field: SizeText,
  value: string,
): SizeRule | null {
  if (field === "name") {
    return value.length > SIZE_LIMITS.name ? "sizeNameLength" : null;
  }
  const price = parsePrice(value);
  return price.ok ? null : price.rule;
}

// The dish after this one in its section, for the link that makes typing a
// section one pass (D-128), or null at the last.
export function nextDish(
  dishes: readonly OwnerDish[],
  id: string,
): OwnerDish | null {
  const index = dishes.findIndex((dish) => dish.id === id);
  return index === -1 ? null : (dishes[index + 1] ?? null);
}

// The order the dish page shows its sizes in (Michael, October 7, 2026):
// price order on arrival, kept while the page is open, so a row never moves
// while the owner is inside it. held is the order the page shows and fresh
// what the server holds now, in price order: sizes the page shows keep
// their places, ones that are gone leave, and new ones go last.
export function holdSizeOrder(
  held: readonly string[],
  fresh: readonly { id: string }[],
): string[] {
  const now = new Set(fresh.map((size) => size.id));
  const kept = held.filter((id) => now.has(id));
  const known = new Set(kept);
  return [
    ...kept,
    ...fresh.map((size) => size.id).filter((id) => !known.has(id)),
  ];
}
