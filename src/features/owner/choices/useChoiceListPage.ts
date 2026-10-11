"use client";

import { useCallback, useMemo, useRef } from "react";
import { useAnnounce } from "@/core/a11y/announcer";
import {
  OPTION_TEXTS,
  type OptionText,
  type OwnerOption,
} from "@/domain/choices";
import type { ChoiceHome } from "@/domain/choices";
import { nameKey } from "@/domain/menu";
import type {
  AllergenStrings,
  SameNamedPlace,
} from "../allergens/allergen-words";
import type { EditingStrings } from "../editing/list-words";
import { useRowList } from "../editing/useRowList";
import {
  addChoiceOption,
  orderChoiceOptions,
  removeChoiceOption,
  restoreChoiceOption,
  setChoiceListLead,
  setOptionText,
} from "./choice-actions";
import {
  LEAD_FIELDS,
  leadTexts,
  leadWords,
  OPTION_PREFIX,
  optionTexts,
  optionWords,
  type ChoiceStrings,
  type LeadField,
} from "./choice-words";
import {
  optionAllergenStrings,
  optionAllergenUndoLabel,
  optionAllergenUndoSchema,
  type OptionAllergenUndo,
} from "./option-words";
import type { OptionAllergensState } from "./useOptionAllergens";

// A choice list's own page (D-166): the lead as the page's own text, the
// options as the shared list with three fields a row, and under each row
// the option's allergen group (D-154). The list owns the page's one
// editing state and one Undo, as a list page does; the groups' entries sit
// on the same stack and come back to the group that made them by the
// option's id. A rename that lands hands the group the option as the
// server now holds it, so the check the database cleared is said after
// "Saved." (Michael, October 10, 2026).

type Props = {
  strings: ChoiceStrings;
  dishAllergenStrings: AllergenStrings;
  editingStrings: EditingStrings;
  code: string;
  list: { id: string; lead: string; home: ChoiceHome };
  // The other lists' leads on the same home, which a lead may not repeat.
  siblings: string[];
  // The options as the server holds them, in order. Every save ends with a
  // refresh, so this is always the truth.
  options: OwnerOption[];
  // The same-named places each option's check names (D-129), by option id.
  sameNamed: Record<string, SameNamedPlace[]>;
};

export function useChoiceListPage({
  strings,
  dishAllergenStrings,
  editingStrings,
  code,
  list,
  siblings,
  options,
  sameNamed,
}: Props) {
  const announce = useAnnounce();
  const words = useMemo(
    () => optionWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const ownWords = useMemo(
    () => leadWords(strings, editingStrings, list.home.kind),
    [strings, editingStrings, list.home.kind],
  );
  const groupStrings = useMemo(
    () => optionAllergenStrings(dishAllergenStrings, strings.allergens),
    [dishAllergenStrings, strings.allergens],
  );

  // One group a row, by option id, registered by each row's component after
  // every render and read from handlers only, which run after one.
  const groups = useRef(new Map<string, OptionAllergensState>());
  const register = useCallback(
    (id: string, state: OptionAllergensState | null) => {
      if (state) groups.current.set(id, state);
      else groups.current.delete(id);
    },
    [],
  );

  const rows = useRowList<
    OwnerOption,
    OptionText,
    OptionAllergenUndo,
    LeadField
  >({
    words,
    idPrefix: OPTION_PREFIX,
    undoKey: `undo:${code}:list:${list.id}`,
    rows: options,
    fields: OPTION_TEXTS,
    valueOf: (option, field) => option[field],
    clean: optionTexts.clean,
    rule: optionTexts.rule,
    actions: {
      add: (name) => addChoiceOption(code, list.id, name),
      setText: (id, field, value, expected) =>
        setOptionText(code, list.id, id, field, value, expected),
      remove: (id) => removeChoiceOption(code, list.id, id),
      restore: (id, order) => restoreChoiceOption(code, list.id, id, order),
      order: (ids) => orderChoiceOptions(code, list.id, ids),
    },
    own: {
      row: { id: list.id, name: list.lead },
      fields: LEAD_FIELDS,
      words: ownWords,
      valueOf: () => list.lead,
      clean: leadTexts.clean,
      rule: leadTexts.rule,
      // A lead another list of the home has is refused before it is sent.
      taken: (_field, value) => {
        const key = nameKey(value);
        const taken = siblings.find((lead) => nameKey(lead) === key);
        return taken === undefined ? null : { id: "", name: taken };
      },
      setText: (_field, value, expected) =>
        setChoiceListLead(code, list.id, value, expected),
    },
    // A rename that landed, or the Undo of one: the option's group learns
    // the option as the server holds it now, and the check it cleared is
    // said after the save's "Saved." or after the Undo's own sentence.
    rowLanded: (row, field, value, how) => {
      if (field !== "name") return null;
      const option = (value as { option?: OwnerOption }).option;
      if (!option) return null;
      const said = groups.current.get(row.id)?.confirmName(option) ?? null;
      if (said && how === "saved") announce(said);
      return how === "undone" ? said : null;
    },
    tryAgain: (key, value) => {
      for (const group of groups.current.values()) {
        if (group.group.tryAgain(key, value)) return true;
      }
      return false;
    },
    other: {
      schema: optionAllergenUndoSchema,
      label: (entry) => optionAllergenUndoLabel(groupStrings, entry),
      undo: async (entry) => {
        const group = groups.current.get(entry.subject);
        return group
          ? group.undo(entry)
          : { outcome: "stale", sentence: editingStrings.stale };
      },
    },
  });

  return {
    rows,
    words,
    groupStrings,
    register,
    announce,
    sameNamedOf: (id: string) => sameNamed[id] ?? [],
  };
}

export type ChoiceListPageState = ReturnType<typeof useChoiceListPage>;
