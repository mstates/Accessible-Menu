import {
  ALLERGEN_IDS,
  type AllergenId,
  type AllergenRegion,
  type Item,
  type PrepNoteId,
  type Restaurant,
} from "./types";

// The strings this module needs. The locale's copy object satisfies it.
export type AllergenCopy = {
  names: Record<AllergenId, string>;
  contains: string;
  checkedNone: string;
  notConfirmed: string;
  noteDefault: string;
  prepNotes: Record<PrepNoteId, string>;
  confirming: {
    one: string;
    other: string;
    optionsOne: string;
    optionsOther: string;
    both: string;
    dishes: { one: string; other: string };
    options: { one: string; other: string };
  };
  confirmedAll: string;
};

// Q-4: the union is stored; the region decides which list owners see.
export const US_MAJOR_ALLERGENS = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame",
] as const satisfies readonly AllergenId[];

export type UsMajorAllergen = (typeof US_MAJOR_ALLERGENS)[number];

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

// One of the three sentences as every page reads it (D-35): its kind, and
// its text as one plain run with nothing to draw inside it (D-182).
export type AllergenSentence =
  | { kind: "contains"; text: string }
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
  return { kind: "contains", text: `${copy.contains} ${words.join(", ")}.` };
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

// What the header line counts (D-36, D-166): the dishes a diner can see
// now whose list is not checked, and the options in their lists, and in
// their sections' lists, that are not checked. Counted by the diner page's
// view model from what it shows, so the counts agree with the page.
export type ConfirmationCounts = { dishes: number; options: number };

export type ConfirmationLine = ConfirmationCounts & { text: string };

function count(n: number, words: { one: string; other: string }): string {
  return (n === 1 ? words.one : words.other).replace("{count}", String(n));
}

// The header line under the note (D-36). "Allergens confirmed for every
// dish." only when no shown dish and no shown option is unchecked, and
// nothing at all when no dish shows (D-177): zero of zero is not every
// dish, and a diner reading the line over an empty page would be told
// something no person said (rule 9).
export function confirmationLine(
  counts: ConfirmationCounts & { shown: number },
  copy: AllergenCopy,
): ConfirmationLine | null {
  const { shown, dishes, options } = counts;
  if (shown === 0) return null;
  const { confirming } = copy;
  let text: string;
  if (dishes === 0 && options === 0) {
    text = copy.confirmedAll;
  } else if (options === 0) {
    text = count(dishes, confirming);
  } else if (dishes === 0) {
    text = count(options, {
      one: confirming.optionsOne,
      other: confirming.optionsOther,
    });
  } else {
    text = confirming.both
      .replace("{dishes}", count(dishes, confirming.dishes))
      .replace("{options}", count(options, confirming.options));
  }
  return { dishes, options, text };
}

// The owner side (task 4, D-148). Owners in the US see the nine (D-94,
// Q-4); an allergen the EU names is typed as another allergen, like any
// other. Also table constraints and a trigger in the database (migration
// 7), which is the boundary. These checks exist to name the field and the
// message.
export const OTHER_ALLERGEN_LIMITS = { length: 40, count: 10 } as const;

export type OtherAllergenRule =
  "otherComma" | "otherLength" | "otherTaken" | "otherMajor";

// The commas that read as separators, since the diner sentence joins
// allergens with one (D-35): the plain comma, the fullwidth comma, and the
// ideographic comma (D-151, Q-65). A name holding one reads as two
// allergens by ear, so it is refused and never rewritten (D-7). The
// migration refuses the same three, and tests/unit keeps the two equal.
export const OTHER_ALLERGEN_COMMA_CHARS = ",\uFF0C\u3001";
const OTHER_ALLERGEN_COMMA = new RegExp(`[${OTHER_ALLERGEN_COMMA_CHARS}]`, "u");

export function hasOtherAllergenComma(name: string): boolean {
  return OTHER_ALLERGEN_COMMA.test(name);
}

// Who checked a list and when (D-89, D-148), as a page shows it: the
// stamp's time, and whether the person is the one signed in. The stamp
// itself is written by the database and never by an owner.
export type AllergenCheck = { at: string; byYou: boolean };

// A list's owner-side state, a dish's (D-148) or a section's line's
// (D-152): the major allergens ticked from the fixed list, the other
// allergens typed, and the check, which is null until a person checks the
// list and again after any change to it.
export type OwnerAllergens = {
  allergens: AllergenId[];
  otherAllergens: string[];
  check: AllergenCheck | null;
};

// The words that mean one of the nine, each pointing at its box, so a name
// typed as another allergen is sent to the box instead. "nuts" alone could
// mean either, so it points at both (Michael, at approval). The migration
// refuses the same words, and tests/unit keeps the two lists equal.
export const MAJOR_ALLERGEN_WORDS: Readonly<
  Record<string, readonly AllergenId[]>
> = {
  milk: ["milk"],
  dairy: ["milk"],
  egg: ["eggs"],
  eggs: ["eggs"],
  fish: ["fish"],
  shellfish: ["shellfish"],
  crustaceans: ["shellfish"],
  "tree nut": ["tree-nuts"],
  "tree nuts": ["tree-nuts"],
  "tree-nuts": ["tree-nuts"],
  nuts: ["peanuts", "tree-nuts"],
  peanut: ["peanuts"],
  peanuts: ["peanuts"],
  wheat: ["wheat"],
  soy: ["soy"],
  soya: ["soy"],
  soybean: ["soy"],
  soybeans: ["soy"],
  sesame: ["sesame"],
};

// Another allergen's name is one line, cleaned the way a menu's name is: a
// pasted tab or line break becomes a space, and the outer space goes.
export function cleanOtherAllergen(value: string): string {
  return value.replace(/\p{Cc}+/gu, " ").trim();
}

// Names are compared the way the trigger compares them (migration 7): case
// and outer spaces do not count.
export function otherAllergenKey(name: string): string {
  return name.trim().toLowerCase();
}

// The boxes a typed name belongs to, or none.
export function majorAllergensOf(name: string): readonly AllergenId[] {
  return MAJOR_ALLERGEN_WORDS[otherAllergenKey(name)] ?? [];
}

// The rule a cleaned name breaks, or null when it can be saved. index is the
// row's own place among others, or null for a new row, so a name never
// collides with itself.
export function otherAllergenProblem(
  value: string,
  others: readonly string[],
  index: number | null,
): OtherAllergenRule | null {
  if (hasOtherAllergenComma(value)) return "otherComma";
  if (value.length > OTHER_ALLERGEN_LIMITS.length) return "otherLength";
  if (majorAllergensOf(value).length > 0) return "otherMajor";
  const key = otherAllergenKey(value);
  const taken = others.some(
    (other, at) => at !== index && otherAllergenKey(other) === key,
  );
  return taken ? "otherTaken" : null;
}

// The two lists a dish holds, as the page shows them and as a write carries
// them (D-148): every write that changes or checks a list lands only if the
// dish still holds the lists the page showed.
export type AllergenLists = {
  allergens: readonly AllergenId[];
  others: readonly string[];
};

// The list with one major allergen ticked or unticked, in the fixed order
// the boxes show, which is the order the enum declares.
export function toggleAllergen(
  list: readonly AllergenId[],
  id: AllergenId,
  on: boolean,
): AllergenId[] {
  const set = new Set(list);
  if (on) set.add(id);
  else set.delete(id);
  return ALLERGEN_IDS.filter((candidate) => set.has(candidate));
}

// Whether two dishes read the same to a diner: the same major allergens,
// whatever their order, and the same other names, whatever their case or
// order. The same-named offer shows only when they differ (D-129).
export function sameAllergenLists(a: AllergenLists, b: AllergenLists): boolean {
  const majors = (lists: AllergenLists) =>
    [...new Set(lists.allergens)].sort().join(",");
  const others = (lists: AllergenLists) =>
    [...new Set(lists.others.map(otherAllergenKey))].sort().join("\n");
  return majors(a) === majors(b) && others(a) === others(b);
}

// Whether two lists are the same as stored, element for element: what the
// apply compares before it writes, so its check never refuses itself over
// the order of other allergens (Michael, at approval).
export function sameListsAsStored(a: AllergenLists, b: AllergenLists): boolean {
  return (
    a.allergens.length === b.allergens.length &&
    a.allergens.every((id, index) => b.allergens[index] === id) &&
    a.others.length === b.others.length &&
    a.others.every((name, index) => b.others[index] === name)
  );
}

// The other allergens a restaurant's dishes and lines already name, most
// used first and then by name, each once whatever its case, for the field
// to suggest before the starter list (D-149), the way size names are
// suggested (D-139). raw holds every name as stored, repeats included.
export function rankOtherAllergenNames(raw: readonly string[]): string[] {
  const counts = new Map<string, { name: string; uses: number }>();
  for (const value of raw) {
    const other = value.trim();
    if (other === "") continue;
    const key = other.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.uses += 1;
    else counts.set(key, { name: other, uses: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

// The date a check was made, as the stamp line shows it, in the
// restaurant's time zone: "October 8, 2026". A stamp that is not a date
// reads as nothing, so a bad value never breaks the page.
export function checkedOnDate(
  at: string,
  timeZone: string,
  lang: string,
): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(lang, {
      dateStyle: "long",
      timeZone,
    }).format(when);
  } catch {
    return new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(when);
  }
}
