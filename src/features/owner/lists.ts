import type { Copy } from "@/copy";
import { cleanDishName, dishNameProblem } from "@/domain/dish";
import { cleanMenuName, menuNameProblem } from "@/domain/menu";
import {
  cleanSectionText,
  sectionTextProblem,
  type SectionText,
} from "@/domain/section";
import type { EditingStrings, ListWords } from "./editing/list-words";

// The three lists of the editor, as the shared list reads them (D-128): the
// menus of a restaurant, the sections of a menu, and the dishes of a
// section. Each gives its fields, the name first, how a typed text is
// cleaned, the rule a cleaned text breaks, and its words: its slice of copy,
// the placeholder its sentences carry, and the words of each field. Pure:
// no React, no network, so the unit tests read the same words the screens
// do.

export type ListKind<Field extends string, Strings> = {
  // The start of every element id in the list: "menu-<id>-name".
  idPrefix: string;
  fields: readonly Field[];
  clean: (field: Field, value: string) => string;
  // The name of the rule a cleaned text breaks, or null when it can be
  // saved. The name is also the key of its message.
  rule: (field: Field, value: string) => string | null;
  words: (strings: Strings, editing: EditingStrings) => ListWords<Field>;
};

const NAME_ONLY = ["name"] as const;

export const menuList: ListKind<"name", Copy["owner"]["menus"]> = {
  idPrefix: "menu",
  fields: NAME_ONLY,
  clean: (_field, value) => cleanMenuName(value),
  rule: (_field, value) => menuNameProblem(value),
  words: (strings, editing) => ({
    noun: "menu",
    strings,
    editing,
    rules: strings.errors,
    fields: {
      name: {
        label: strings.nameLabel,
        suffix: strings.labelFor,
        notSaved: strings.notSaved.name,
      },
    },
  }),
};

export const sectionList: ListKind<"name", Copy["owner"]["sections"]> = {
  idPrefix: "section",
  fields: NAME_ONLY,
  clean: cleanSectionText,
  rule: sectionTextProblem,
  words: (strings, editing) => ({
    noun: "section",
    strings,
    editing,
    rules: strings.errors,
    fields: {
      name: {
        label: strings.nameLabel,
        suffix: strings.labelFor,
        notSaved: strings.notSaved.name,
      },
    },
  }),
};

// The texts of a section besides its name.
export const SECTION_OWN_TEXTS = [
  "note",
  "everyItem",
] as const satisfies readonly SectionText[];
export type SectionOwnText = (typeof SECTION_OWN_TEXTS)[number];

// A section's own texts, at the top of its own page, above its dishes
// (D-120, D-135): the note, which takes several lines and saves only when
// it is left, and the line shown with every dish. The page is the section,
// so a label does not name it, while every sentence the log says still
// does, since a sentence is heard on its own. The sentences, the rules, and
// their messages are the section's, from its slice of copy; the labels and
// hints are the page's. A section that is gone, or whose menu is, is the
// page's own parent gone, so it is said in the page's words.
export const sectionTexts = {
  fields: SECTION_OWN_TEXTS,
  clean: cleanSectionText,
  rule: sectionTextProblem,
  words: (
    sections: Copy["owner"]["sections"],
    dishes: Copy["owner"]["dishes"],
    editing: EditingStrings,
  ): ListWords<SectionOwnText> => ({
    noun: "section",
    strings: {
      ...sections,
      errors: { ...sections.errors, parentGone: dishes.errors.parentGone },
    },
    editing,
    rules: sections.errors,
    fields: {
      note: {
        label: dishes.section.noteLabel,
        suffix: "",
        hint: dishes.section.noteHint,
        multiline: true,
        notSaved: sections.notSaved.note,
        changed: sections.undo.note,
        back: sections.undo.noteBack,
      },
      everyItem: {
        label: dishes.section.everyItemLabel,
        suffix: "",
        hint: dishes.section.everyItemHint,
        notSaved: sections.notSaved.everyItem,
        changed: sections.undo.everyItem,
        back: sections.undo.everyItemBack,
      },
    },
  }),
};

export const dishList: ListKind<"name", Copy["owner"]["dishes"]> = {
  idPrefix: "dish",
  fields: NAME_ONLY,
  clean: (_field, value) => cleanDishName(value),
  rule: (_field, value) => dishNameProblem(value),
  words: (strings, editing) => ({
    noun: "dish",
    strings,
    editing,
    rules: strings.errors,
    fields: {
      name: {
        label: strings.nameLabel,
        suffix: strings.labelFor,
        notSaved: strings.notSaved.name,
      },
    },
  }),
};
