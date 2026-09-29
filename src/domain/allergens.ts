import type {
  AllergenId,
  AllergenRegion,
  Item,
  PrepNoteId,
  Restaurant,
} from "./types";

// The strings this module needs. The locale's copy object satisfies it.
export type AllergenCopy = {
  names: Record<AllergenId, string>;
  contains: string;
  checkedNone: string;
  notConfirmed: string;
  noteDefault: string;
  prepNotes: Record<PrepNoteId, string>;
  confirming: { one: string; other: string };
  confirmedAll: string;
};

// Q-4: the union is stored; the region decides which list owners see.
export const US_MAJOR_ALLERGENS: readonly AllergenId[] = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame",
];

export const EU_ALLERGENS: readonly AllergenId[] = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "soy",
  "sesame",
  "celery",
  "gluten",
  "lupin",
  "molluscs",
  "mustard",
  "sulphites",
];

export function allergensForRegion(
  region: AllergenRegion,
): readonly AllergenId[] {
  return region === "eu" ? EU_ALLERGENS : US_MAJOR_ALLERGENS;
}

export type AllergenSentence =
  | { kind: "contains"; lead: string; words: string[]; text: string }
  | { kind: "checked-none"; text: string }
  | { kind: "not-confirmed"; text: string };

type ItemAllergens = Pick<
  Item,
  "allergens" | "customAllergens" | "allergensReviewed"
>;

// One of three sentences per item (D-35). Nothing reads as allergen-free
// unless a person said so, so an unreviewed item never reaches the other two.
export function allergenSentence(
  item: ItemAllergens,
  copy: AllergenCopy,
): AllergenSentence {
  if (!item.allergensReviewed) {
    return { kind: "not-confirmed", text: copy.notConfirmed };
  }
  const words = [
    ...item.allergens.map((id) => copy.names[id]),
    ...item.customAllergens,
  ];
  if (words.length === 0) {
    return { kind: "checked-none", text: copy.checkedNone };
  }
  return {
    kind: "contains",
    lead: copy.contains,
    words,
    text: `${copy.contains} ${words.join(", ")}.`,
  };
}

// The restaurant note, once, near the top. The default renders when the
// owner left it blank, followed by the preparation sentences they picked (D-35).
export function restaurantAllergenNote(
  restaurant: Pick<Restaurant, "allergenNote" | "prepNotes">,
  copy: AllergenCopy,
): string[] {
  const note = restaurant.allergenNote?.trim() || copy.noteDefault;
  return [note, ...restaurant.prepNotes.map((id) => copy.prepNotes[id])];
}

export type ConfirmationLine = { unconfirmed: number; text: string };

// The header line under the note (D-36).
type ReviewState = {
  sections: { items: Pick<Item, "allergensReviewed">[] }[];
};

export function confirmationLine(
  menu: ReviewState,
  copy: AllergenCopy,
): ConfirmationLine {
  const unconfirmed = menu.sections
    .flatMap((section) => section.items)
    .filter((item) => !item.allergensReviewed).length;
  if (unconfirmed === 0) {
    return { unconfirmed, text: copy.confirmedAll };
  }
  const template =
    unconfirmed === 1 ? copy.confirming.one : copy.confirming.other;
  return {
    unconfirmed,
    text: template.replace("{count}", String(unconfirmed)),
  };
}
