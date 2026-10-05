import type { Copy } from "@/copy";
import { cleanDishName, dishNameProblem } from "@/domain/dish";
import { cleanMenuName, menuNameProblem } from "@/domain/menu";
import {
  cleanSectionText,
  SECTION_TEXTS,
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

export const sectionList: ListKind<SectionText, Copy["owner"]["sections"]> = {
  idPrefix: "section",
  fields: SECTION_TEXTS,
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
      // The note takes several lines and saves only when it is left.
      note: {
        label: strings.noteLabel,
        suffix: strings.labelFor,
        hint: strings.noteHint,
        multiline: true,
        notSaved: strings.notSaved.note,
        changed: strings.undo.note,
        back: strings.undo.noteBack,
      },
      everyItem: {
        label: strings.everyItemLabel,
        suffix: strings.everyItemIn,
        hint: strings.everyItemHint,
        notSaved: strings.notSaved.everyItem,
        changed: strings.undo.everyItem,
        back: strings.undo.everyItemBack,
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
