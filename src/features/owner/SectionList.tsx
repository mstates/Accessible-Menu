"use client";

import { useMemo } from "react";
import type { Copy } from "@/copy";
import { Announcer } from "@/core/a11y/announcer";
import type { ListedSection } from "@/domain/section";
import { RowList } from "./editing/RowList";
import { useRowList } from "./editing/useRowList";
import { sectionList } from "./lists";
import { restaurantSectionPath } from "./paths";
import {
  addSection,
  deleteSection,
  orderSections,
  renameSection,
  restoreSection,
} from "./section-actions";

type Props = {
  strings: Copy["owner"]["sections"];
  editing: Copy["owner"]["editing"];
  code: string;
  menuId: string;
  // The menu's sections that are not deleted, in order, as the server holds
  // them, each with the dishes it holds. Every save ends with a refresh, so
  // this is always the truth.
  sections: ListedSection[];
};

// The sections of one menu (D-111, D-128): the shared list, with one field
// a row, its name, so a section's row is the row every list has. Each row
// links to the section's own page, where its dishes are, and its note and
// its every-dish line (D-135). Delete on a section that holds dishes asks
// first, and names them; an empty section goes at once (D-119).
export function SectionList(props: Props) {
  return (
    <Announcer>
      <SectionRows {...props} />
    </Announcer>
  );
}

function SectionRows({ strings, editing, code, menuId, sections }: Props) {
  const words = useMemo(
    () => sectionList.words(strings, editing),
    [strings, editing],
  );
  const list = useRowList({
    words,
    idPrefix: sectionList.idPrefix,
    undoKey: `undo:${code}:menu:${menuId}`,
    rows: sections,
    fields: sectionList.fields,
    valueOf: (section) => section.name,
    clean: sectionList.clean,
    rule: sectionList.rule,
    actions: {
      add: (name) => addSection(code, menuId, name),
      setText: (id, _field, value, expected) =>
        renameSection(code, menuId, id, value, expected),
      remove: (id, told) => deleteSection(code, menuId, id, told),
      restore: (id, order) => restoreSection(code, menuId, id, order),
      order: (ids) => orderSections(code, menuId, ids),
    },
    held: (section) => ({ sections: 0, dishes: section.dishes }),
    link: {
      label: strings.editDishes,
      href: (section) => restaurantSectionPath(code, section.id),
    },
  });
  return <RowList list={list} />;
}
