"use client";

import { useMemo } from "react";
import type { ChoiceHome, OwnerChoiceList } from "@/domain/choices";
import type { EditingStrings } from "../editing/list-words";
import {
  useSharedRowList,
  type ListRow,
  type SharedEditor,
} from "../editing/useRowList";
import { restaurantChoiceListPath } from "../paths";
import {
  addChoiceList,
  deleteChoiceList,
  orderChoiceLists,
  restoreChoiceList,
} from "./choice-actions";
import {
  CHOICE_LIST_PREFIX,
  choiceListRows,
  choiceListWords,
  choiceListsLead,
  type ChoiceStrings,
} from "./choice-words";

// The choice lists of a dish or a section, as rows on its page (D-166):
// one row a list, named by its lead, with the link to the list's own page,
// Move up, Move down, and Delete, and the add form that takes a lead. The
// rows share the page's one editing state and one Undo (D-145), so the
// page keeps one queue, one status, and one Undo whatever it holds. A list
// with options asks before it is deleted (D-119); an empty one goes at
// once, with Undo. The lead is edited on the list's own page, so a row has
// no field.

export type ChoiceListRow = ListRow & { options: number };

type Props<Entry extends { kind: string }> = {
  strings: ChoiceStrings;
  editingStrings: EditingStrings;
  code: string;
  home: ChoiceHome;
  lists: OwnerChoiceList[];
  shared: SharedEditor<Entry>;
};

export const CHOICE_LISTS_HEADING_ID = "choice-lists-heading";

export function useChoiceListRows<Entry extends { kind: string }>({
  strings,
  editingStrings,
  code,
  home,
  lists,
  shared,
}: Props<Entry>) {
  const words = useMemo(
    () => choiceListWords(strings, editingStrings, home.kind),
    [strings, editingStrings, home.kind],
  );
  const rows = useMemo<ChoiceListRow[]>(
    () =>
      lists.map((list) => ({
        id: list.id,
        name: list.lead,
        options: list.options,
      })),
    [lists],
  );
  const list = useSharedRowList<ChoiceListRow, never, Entry>(
    {
      words,
      idPrefix: CHOICE_LIST_PREFIX,
      rows,
      fields: [],
      valueOf: () => "",
      clean: choiceListRows.clean,
      rule: choiceListRows.rule,
      actions: {
        // The added list, as a row: its lead is the row's name.
        add: async (lead) => {
          const result = await addChoiceList(code, home, lead);
          if (!result.ok) return result;
          const { row, total } = result.value;
          return {
            ok: true,
            value: {
              row: { id: row.id, name: row.lead, options: row.options },
              total,
            },
          };
        },
        // A row has no field, so nothing here is ever sent.
        setText: async () => ({ ok: false, problem: { kind: "failed" } }),
        remove: (id, told) => deleteChoiceList(code, home, id, told),
        restore: (id, order) => restoreChoiceList(code, home, id, order),
        order: (ids) => orderChoiceLists(code, home, ids),
      },
      held: (row) => ({ sections: 0, dishes: 0, options: row.options }),
      link: {
        label: strings.lists.edit,
        href: (row) => restaurantChoiceListPath(code, row.id),
      },
    },
    shared,
  );
  return {
    ...list,
    heading: strings.heading,
    headingId: CHOICE_LISTS_HEADING_ID,
    lead: choiceListsLead(strings, home.kind),
  };
}

export type ChoiceListRowsState<Entry extends { kind: string }> = ReturnType<
  typeof useChoiceListRows<Entry>
>;
