import { cleanMenuName } from "./menu";

// The owner-side section: the row an owner reads on a menu's page and the
// two texts an owner writes, its name there and its note on its own page
// (D-135). What a section offered with every dish is a choice list now
// (D-166, choices.ts). The diner-side Section in types.ts is the published
// view model and stays separate until the diner page reads real data
// (D-78). Pure: no React, no network.

export type OwnerSection = {
  id: string;
  name: string;
  // Shown once, under the section's heading. Empty when there is none; the
  // table holds null.
  note: string;
};

// A section as its menu's page reads it: with how many of its dishes are not
// deleted, which is what a delete would take with it (D-119).
export type ListedSection = OwnerSection & { dishes: number };

// The two texts of a section an owner writes.
export const SECTION_TEXTS = ["name", "note"] as const;
export type SectionText = (typeof SECTION_TEXTS)[number];

// Also table constraints in the database (migration 4), which is the
// boundary. These checks exist to name the field and the message.
export const SECTION_LIMITS = { name: 60, note: 500 } as const;

// The rules a text can break, which are also the keys of their messages.
export type SectionRule = "nameRequired" | "nameLength" | "noteLength";

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

// A section's name is one line, cleaned the way a menu's name is: a pasted
// tab or line break becomes a space.
export function cleanSectionText(field: SectionText, value: string): string {
  return field === "note" ? cleanNote(value) : cleanMenuName(value);
}

// The rule a cleaned text breaks, or null when it can be saved. A name is
// something to read. A note may be blank, which means none.
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
  }
}
