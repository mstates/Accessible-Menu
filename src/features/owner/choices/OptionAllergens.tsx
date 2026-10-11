"use client";

import { useLayoutEffect } from "react";
import type { AllergenCopy } from "@/domain/allergens";
import type { OwnerOption } from "@/domain/choices";
import { AllergenGroup } from "../allergens/AllergenGroup";
import type {
  AllergenStrings,
  SameNamedPlace,
} from "../allergens/allergen-words";
import type { EditingStrings, TextWords } from "../editing/list-words";
import type { Editing } from "../editing/useEditing";
import { optionAllergenHeading } from "./option-words";
import type { OptionAllergenUndo } from "./option-words";
import {
  useOptionAllergens,
  type OptionAllergensState,
} from "./useOptionAllergens";

type Props = {
  strings: AllergenStrings;
  editingStrings: EditingStrings;
  allergenCopy: AllergenCopy;
  code: string;
  listId: string;
  option: OwnerOption;
  editing: Editing;
  record: (entry: OptionAllergenUndo) => void;
  words: TextWords;
  gone: string;
  announce: (text: string) => void;
  sameNamed: SameNamedPlace[];
  // The other allergens to suggest, the restaurant's own first.
  suggestions: readonly string[];
  timeZone: string;
  lang: string;
  // The page keeps one group a row, by option id, for its Undo and Try
  // again to reach; set after every render and read from handlers only.
  register: (id: string, state: OptionAllergensState | null) => void;
};

// One option's allergen group, under its row (D-154, D-166): the shared
// component with the option's words, headed by an h3 under the row's h2.
// Each row's group is its own hook, so each option is its own component.
export function OptionAllergens({
  strings,
  editingStrings,
  allergenCopy,
  code,
  listId,
  option,
  editing,
  record,
  words,
  gone,
  announce,
  sameNamed,
  suggestions,
  timeZone,
  lang,
  register,
}: Props) {
  const state = useOptionAllergens({
    strings,
    editingStrings,
    code,
    listId,
    option,
    editing,
    record,
    words,
    gone,
    announce,
    sameNamed,
  });
  useLayoutEffect(() => {
    register(option.id, state);
  });
  useLayoutEffect(() => () => register(option.id, null), [option.id, register]);
  return (
    <AllergenGroup
      strings={strings}
      allergenCopy={allergenCopy}
      group={state.group}
      heading={optionAllergenHeading(strings, option.name)}
      headingLevel={3}
      lead={strings.groupHint}
      suggestions={suggestions}
      timeZone={timeZone}
      lang={lang}
    />
  );
}
