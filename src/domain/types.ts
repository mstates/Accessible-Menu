// Types shared by every layer. Pure: no React, no network.

export const ALLERGEN_IDS = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame",
  "celery",
  "gluten",
  "lupin",
  "molluscs",
  "mustard",
  "sulphites",
] as const;
export type AllergenId = (typeof ALLERGEN_IDS)[number];

export type AllergenRegion = "us" | "eu";

// The preparation pick-list for the restaurant allergen note (D-35).
export const PREP_NOTE_IDS = [
  "shared-fryer",
  "dedicated-fryer",
  "shared-kitchen",
] as const;
export type PrepNoteId = (typeof PREP_NOTE_IDS)[number];

// Vocabulary pending Q-15. No gluten wording until Q-15 is answered.
export type DietaryTagId = "vegan" | "vegetarian";

export type Price =
  | { kind: "exact"; cents: number }
  | { kind: "range"; minCents: number; maxCents: number }
  | { kind: "text"; text: string };

export type Item = {
  id: string;
  name: string;
  description?: string;
  price: Price;
  allergens: AllergenId[];
  customAllergens: string[];
  allergensReviewed: boolean;
  dietaryTags: DietaryTagId[];
  note?: string;
};

export type Section = {
  id: string;
  name: string;
  note?: string;
  items: Item[];
};

export type Menu = {
  id: string;
  name: string;
  sections: Section[];
};

export type City = {
  slug: string;
  name: string;
};

export type Restaurant = {
  slug: string;
  name: string;
  city: City;
  hours?: string;
  website?: string;
  allergenNote: string | null;
  prepNotes: PrepNoteId[];
  region: AllergenRegion;
  menus: Menu[];
};
