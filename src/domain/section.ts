import type { OwnerAllergens } from "./allergens";
import { cleanMenuName } from "./menu";

// The owner-side section: the row an owner reads on a menu's page and the
// three texts an owner writes there. The diner-side Section in types.ts is
// the published view model and stays separate until the diner page reads
// real data (D-78). Pure: no React, no network.

export type OwnerSection = {
  id: string;
  name: string;
  // Shown once, under the section's heading. Empty when there is none; the
  // table holds null.
  note: string;
  // Shown with every dish of the section, for an option or side that goes
  // with each one (D-120). Empty when there is none.
  everyItem: string;
};

// A section as its own page reads it (D-135): with its line's own allergens
// and their check (D-152), which the group under the line shows while the
// line has words. The lists are empty and the check null while it is blank;
// the database keeps that so (migration 8).
export type OwnerSectionPage = OwnerSection & { line: OwnerAllergens };

// A section as its menu's page reads it: with how many of its dishes are not
// deleted, which is what a delete would take with it (D-119).
export type ListedSection = OwnerSection & { dishes: number };

// The three texts of a section an owner writes.
export const SECTION_TEXTS = ["name", "note", "everyItem"] as const;
export type SectionText = (typeof SECTION_TEXTS)[number];

// Also table constraints in the database (migration 4), which is the
// boundary. These checks exist to name the field and the message.
export const SECTION_LIMITS = { name: 60, note: 500, everyItem: 120 } as const;

// The rules a text can break, which are also the keys of their messages.
export type SectionRule =
  "nameRequired" | "nameLength" | "noteLength" | "everyItemLength";

// A note may run over several lines. A Windows or old Mac line break becomes
// a plain one, any other control character becomes a space, and the outer
// space goes, so the note the owner sees is the note saved. A dish's
// description is cleaned the same way (dish.ts).
const LINE_BREAK = /\r\n?/g;
const CONTROL_BUT_LINE_BREAK = /[^\P{Cc}\n]/gu;

export function cleanNote(value: string): string {
  return value
    .replace(LINE_BREAK, "\n")
    .replace(CONTROL_BUT_LINE_BREAK, " ")
    .trim();
}

// A section's name and its every-dish line are one line each, cleaned the
// way a menu's name is: a pasted tab or line break becomes a space.
export function cleanSectionText(field: SectionText, value: string): string {
  return field === "note" ? cleanNote(value) : cleanMenuName(value);
}

// The rule a cleaned text breaks, or null when it can be saved. A name is
// something to read. A note and an every-dish line may be blank, which
// means none.
export function sectionTextProblem(
  field: SectionText,
  value: string,
): SectionRule | null {
  switch (field) {
    case "name":
      if (value === "") return "nameRequired";
      return value.length > SECTION_LIMITS.name ? "nameLength" : null;
    case "note":
      return value.length > SECTION_LIMITS.note ? "noteLength" : null;
    case "everyItem":
      return value.length > SECTION_LIMITS.everyItem ? "everyItemLength" : null;
  }
}
