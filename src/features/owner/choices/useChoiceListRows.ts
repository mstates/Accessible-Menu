"use client";

import { useMemo } from "react";
import type { ChoiceHome, OwnerChoiceList } from "@/domain/choices";
import type { EditingStrings } from "../editing/list-words";
import type { Editing } from "../editing/useEditing";
import { useSharedRowList, type ListRow } from "../editing/useRowList";
import { restaurantChoiceListPath } from "../paths";
import {
  addChoiceList,
  deleteChoiceList,
  orderChoiceLists,
} from "./choice-actions";
import {
  CHOICE_LIST_PREFIX,
  CHOICE_LISTS_HEADING_ID,
  choiceListRows,
  choiceListWords,
  choiceListsLead,
  type ChoiceStrings,
} from "./choice-words";

export { CHOICE_LISTS_HEADING_ID };

// The choice lists of a dish or a section, as rows on its page (D-166):
// one row a list, named by its lead, with the link to the list's own page,
// Move up, Move down, and Delete, and the add form that takes a lead. The
// rows share the page's one editing state (D-145), so the page keeps one
// queue and one status whatever it holds. Delete asks first on every row
// (D-221), naming the options when the list holds any (D-119). The lead is
// edited on the list's own page, so a row has no field.

export type ChoiceListRow = ListRow & { options: number };

type Props = {
  strings: ChoiceStrings;
  editingStrings: EditingStrings;
  code: string;
  home: ChoiceHome;
  lists: OwnerChoiceList[];
  // The page's one editing state.
  shared: Editing;
};

export function useChoiceListRows({
  strings,
  editingStrings,
  code,
  home,
  lists,
  shared,
}: Props) {
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
  const list = useSharedRowList<ChoiceListRow, never>(
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
        order: (ids) => orderChoiceLists(code, home, ids),
      },
      deleteAsksFirst: true,
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

export type ChoiceListRowsState = ReturnType<typeof useChoiceListRows>;
