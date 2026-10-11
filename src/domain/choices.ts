import {
  allergenSentence,
  type AllergenCopy,
  type AllergenSentence,
  type OwnerAllergens,
} from "./allergens";
import {
  caloriesWords,
  type Calories,
  type CaloriesCopy,
  type CalorieRule,
  parseCalories,
} from "./calories";
import { cleanMenuName } from "./menu";
import {
  addedPrice,
  type MoneyCopy,
  parsePrice,
  type PriceRule,
} from "./money";
import type { AllergenId } from "./types";

// Choice lists (D-166): what a diner picks or adds with a dish, a side, a
// dressing, a tea flavor, an add-on. A list belongs to one dish or one
// section, has a lead the owner types ("Choose one side", "Add on"), and
// holds options in the owner's order; each option has a name, an optional
// added price, optional calories (D-167), and its own allergen list and
// check in a dish's shape (D-148). Options never point at a dish. The
// tables are choice_lists and choice_options (migration 11); everything
// above them says list and option. Pure: no React, no network.

// Where a list lives: one dish or one section, never both.
export type ChoiceHome = { kind: "dish" | "section"; id: string };

// A list as a row on its home's page (D-128): its lead, and how many of its
// options are not deleted, which is what a delete would take with it
// (D-119).
export type OwnerChoiceList = { id: string; lead: string; options: number };

// An option as its list's page reads and writes it: price and calories as
// their fields show them, blank for none.
export type OwnerOption = OwnerAllergens & {
  id: string;
  name: string;
  price: string;
  calories: string;
};

// The texts of an option an owner writes in its row, in the row's order.
export const OPTION_TEXTS = ["name", "price", "calories"] as const;
export type OptionText = (typeof OPTION_TEXTS)[number];

// Also table constraints in the database (migration 11), which is the
// boundary. These checks exist to name the field and the message. A lead
// has the every-dish line's cap it replaces; an option's name a section
// name's.
export const CHOICE_LIMITS = { lead: 120, name: 60 } as const;

// The rules a lead can break, which are also the keys of their messages.
export type LeadRule = "leadRequired" | "leadLength";

// The rules an option's texts can break.
export type OptionRule =
  "nameRequired" | "nameLength" | PriceRule | CalorieRule;

// A lead and a name are one line each, cleaned the way a menu's name is: a
// pasted tab or line break becomes a space, and the outer space goes.
export function cleanLead(value: string): string {
  return cleanMenuName(value);
}

// The rule a cleaned lead breaks, or null when it can be saved.
export function leadProblem(value: string): LeadRule | null {
  if (value === "") return "leadRequired";
  return value.length > CHOICE_LIMITS.lead ? "leadLength" : null;
}

export function cleanOptionText(field: OptionText, value: string): string {
  return field === "name" ? cleanMenuName(value) : value.trim();
}

// The rule a cleaned text breaks, or null when it can be saved. A name is
// something to read; a blank price means no added price, and blank
// calories mean none shown.
export function optionTextProblem(
  field: OptionText,
  value: string,
): OptionRule | null {
  switch (field) {
    case "name":
      if (value === "") return "nameRequired";
      return value.length > CHOICE_LIMITS.name ? "nameLength" : null;
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

// What the option sentence reads: the row as the diner page holds it.
export type OptionReading = {
  name: string;
  addedPriceCents: number | null;
  calories: Calories | null;
  allergens: AllergenId[];
  customAllergens: string[];
  allergensReviewed: boolean;
};

export type OptionCopy = {
  money: MoneyCopy;
  calories: CaloriesCopy;
  allergens: AllergenCopy;
};

// What diners read for one option (D-166, module rule 8): its name, its
// added price in words when it has one, its calories in words when it has
// them, and its own allergen sentence, built like a dish's and read where
// the option is, never behind a disclosure (D-40). Visible numerals and
// spoken words differ only where a price's do (Q-6).
export type OptionSentence = {
  display: string;
  spoken: string;
  allergen: AllergenSentence;
};

export function optionSentence(
  option: OptionReading,
  copy: OptionCopy,
  lang: string,
): OptionSentence {
  const allergen = allergenSentence(option, copy.allergens);
  const price =
    option.addedPriceCents === null
      ? null
      : addedPrice(option.addedPriceCents, copy.money);
  const calories =
    option.calories === null
      ? null
      : caloriesWords(option.calories, copy.calories, lang);
  const line = (priceWords: string | null) =>
    [option.name, priceWords, calories]
      .filter((part) => part !== null)
      .join(", ");
  return {
    display: `${line(price?.display ?? null)}. ${allergen.text}`,
    spoken: `${line(price?.spoken ?? null)}. ${allergen.text}`,
    allergen,
  };
}
