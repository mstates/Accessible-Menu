import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  cleanLead,
  cleanOptionText,
  leadProblem,
  optionTextProblem,
  type ChoiceHome,
  type OptionText,
} from "@/domain/choices";
import type { EditingStrings, ListWords } from "../editing/list-words";

// Every sentence the choice lists say, built in one place from copy (D-166):
// the rows on a dish's or a section's page, and the list's own page with
// its lead and its options. Pure: no React, no network.

export type ChoiceStrings = Copy["owner"]["choices"];

// The rows on a home page: one list a row, named by its lead, with no
// field of its own. The sentences carry the lead as the row's name, in the
// {list} placeholder; which taken-lead sentence applies depends on the home.
export const CHOICE_LIST_PREFIX = "list";

export function choiceListWords(
  strings: ChoiceStrings,
  editing: EditingStrings,
  home: ChoiceHome["kind"],
): ListWords<never> {
  const { lists } = strings;
  return {
    noun: "list",
    strings: {
      ...lists,
      errors: {
        nameTaken:
          home === "dish"
            ? lists.errors.leadTakenDish
            : lists.errors.leadTakenSection,
        gone: lists.errors.gone,
        listChanged: lists.errors.listChanged,
        grew: lists.errors.grew,
      },
    },
    editing,
    rules: lists.errors,
    fields: {},
  };
}

// The lead a row is added with, cleaned, and the rule it breaks.
export const choiceListRows = {
  clean: (_field: never, value: string) => cleanLead(value),
  rule: (_field: never, value: string) => leadProblem(value),
};

// The lead over the rows: the dish's or the section's.
export function choiceListsLead(
  strings: ChoiceStrings,
  home: ChoiceHome["kind"],
): string {
  return home === "dish" ? strings.leadDish : strings.leadSection;
}

// The list's own page: its lead is the page's own text, above its options
// (D-135). The page is the list, so the label does not name it; every
// sentence names the list, in the {list} placeholder.
export const LEAD_FIELDS = ["lead"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

export function leadWords(
  strings: ChoiceStrings,
  editing: EditingStrings,
  home: ChoiceHome["kind"],
): ListWords<LeadField> {
  const { page } = strings;
  return {
    noun: "list",
    strings: {
      ...strings.options,
      errors: {
        nameTaken:
          home === "dish"
            ? page.errors.leadTakenDish
            : page.errors.leadTakenSection,
        gone: page.errors.gone,
        parentGone: page.errors.parentGone,
        listChanged: page.errors.listChanged,
      },
    },
    editing,
    rules: page.errors,
    fields: {
      lead: {
        label: page.leadLabel,
        suffix: "",
        hint: page.leadHint,
        notSaved: page.notSaved.lead,
      },
    },
  };
}

export const leadTexts = {
  clean: (_field: LeadField, value: string) => cleanLead(value),
  rule: (_field: LeadField, value: string) => leadProblem(value),
};

// The options on the list's page: three fields a row, the name first, each
// named for its option in hidden text, and the sentences in the {option}
// placeholder.
export const OPTION_PREFIX = "option";

export function optionWords(
  strings: ChoiceStrings,
  editing: EditingStrings,
): ListWords<OptionText> {
  const { options } = strings;
  return {
    noun: "option",
    strings: options,
    editing,
    rules: options.errors,
    fields: {
      name: {
        label: options.nameLabel,
        suffix: options.labelFor,
        notSaved: options.notSaved.name,
      },
      price: {
        label: options.priceLabel,
        suffix: options.labelFor,
        hint: options.priceHint,
        inputMode: "decimal",
        prefix: "$",
        notSaved: options.notSaved.price,
      },
      calories: {
        label: options.caloriesLabel,
        suffix: options.labelFor,
        hint: options.caloriesHint,
        notSaved: options.notSaved.calories,
      },
    },
  };
}

export const optionTexts = {
  clean: cleanOptionText,
  rule: optionTextProblem,
};

// Where a list is, in the same-named offer's words (D-129, D-166): "Choose
// one side for Kids burger".
export function placeIn(
  strings: ChoiceStrings,
  lead: string,
  home: string,
): string {
  return fill(strings.placeIn, { lead, home });
}
