import type { AllergenCheck, OwnerAllergens } from "./allergens";
import { parseCalories, type CalorieRule } from "./calories";
import { cleanMenuName } from "./menu";
import { parsePrice, type PriceRule } from "./money";
import type { Schedule } from "./schedule";
import { cleanNote } from "./section";
import type { DietaryTagId } from "./types";

// The owner-side dish: the row an owner reads on a section's page, with its
// name, and the dish as its own page reads it (D-128), with everything an
// owner writes there: the description, the price choice, the one price, the
// note, and the sizes (task 3b), its allergens with their check (task 4,
// D-148), its tags, its availability with the moment of a sold-out mark,
// and its schedule (task 5, D-159, D-160), and its calories and Cooked to
// order mark (task 7, D-167). Dish photos are parked (D-165).
// The diner-side Item in types.ts is the published view model and stays
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

// A dish as its pages' frame reads it. price is the one price as its field
// shows it, two decimals or blank for none, and calories as their field
// shows them, a number or a range (D-167). The General page reads its own
// fields, with the sizes, as one document instead (DishGeneral). The mark is
// the row's as stored: what it means now is decided by
// domain/availability.ts and nowhere else (D-160).
export type OwnerDishDetail = OwnerDish &
  OwnerDishAllergens & {
    description: string;
    note: string;
    priceKind: PriceKind;
    price: string;
    calories: string;
    cookedToOrder: boolean;
    tags: DietaryTagId[];
    available: boolean;
    soldOutAt: string | null;
    schedule: Schedule | null;
  };

// What a dish's General page shows and writes (D-237), as one document: the
// dish's description, note, price choice, one price, and calories, and its
// sizes that are not deleted, in price order, a size with no price last,
// then the order added. The database's reader returns it and its writer
// takes it back in the same shape (migration 16), so the keys are the
// columns' own. A size the page added and nothing holds yet has a null id.
export type DishGeneralSize = {
  id: string | null;
  name: string | null;
  price_cents: number | null;
  calories_low: number | null;
  calories_high: number | null;
};

export type DishGeneral = {
  description: string | null;
  note: string | null;
  price_kind: PriceKind;
  price_cents: number | null;
  calories_low: number | null;
  calories_high: number | null;
  sizes: DishGeneralSize[];
};

// The texts of a dish an owner writes on its page, in the page's order.
export const DISH_TEXTS = ["description", "price", "calories", "note"] as const;
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
  | PriceRule
  | CalorieRule;

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
// note is; a note is one line, cleaned the way a name is; a typed price or
// typed calories lose only their outer space, so what the owner typed is
// what is read.
export function cleanDishText(field: DishText, value: string): string {
  switch (field) {
    case "description":
      return cleanNote(value);
    case "note":
      return cleanMenuName(value);
    case "price":
    case "calories":
      return value.trim();
  }
}

// The rule a cleaned text breaks, or null when it can be saved. A
// description and a note may be blank, which means none; a blank price
// means no price shown (D-139); blank calories mean none shown (D-167).
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
    case "calories": {
      const calories = parseCalories(value);
      return calories.ok ? null : calories.rule;
    }
  }
}

// The texts of a size of a dish (D-139): a name and a price, and its
// calories (D-167), each blank for none. The table holds null for each. A
// Save of the General page needs a name and a price for every size
// (D-237); an older draft may still hold a size without one, and Publish
// refuses it (D-82).
export const SIZE_TEXTS = ["name", "price", "calories"] as const;
export type SizeText = (typeof SIZE_TEXTS)[number];

// Also a table constraint (migration 6). A size name is short: Cup, Bowl,
// Half, 6 wings.
export const SIZE_LIMITS = { name: 40 } as const;

export type SizeRule = "sizeNameLength" | PriceRule | CalorieRule;

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
  if (field === "calories") {
    const calories = parseCalories(value);
    return calories.ok ? null : calories.rule;
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
