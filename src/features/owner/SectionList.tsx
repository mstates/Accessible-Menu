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
  // The page's lead about its sections, drawn above the saved status.
  lead: string;
};

// The sections of one menu (D-111, D-128), on the menu's Sections page
// (D-224): the shared list, with one field a row, its name, so a section's
// row is the row every list has. Each row links to the section's own page,
// where its dishes are, and its note (D-135). Delete asks first on every
// row (D-221), and names the dishes that go when the section holds any
// (D-119). The lead comes first, then the saved status and the rows.
// Publish and Unpublish are on the menu's Publishing page.
export function SectionList(props: Props) {
  return (
    <Announcer>
      <SectionRows {...props} />
    </Announcer>
  );
}

function SectionRows({
  strings,
  editing,
  code,
  menuId,
  sections,
  lead,
}: Props) {
  const words = useMemo(
    () => sectionList.words(strings, editing),
    [strings, editing],
  );
  const list = useRowList({
    words,
    idPrefix: sectionList.idPrefix,
    rows: sections,
    fields: sectionList.fields,
    valueOf: (section) => section.name,
    clean: sectionList.clean,
    rule: sectionList.rule,
    actions: {
      add: (name) => addSection(code, menuId, name),
      setText: (id, _field, value) => renameSection(code, menuId, id, value),
      remove: (id, told) => deleteSection(code, menuId, id, told),
      order: (ids) => orderSections(code, menuId, ids),
    },
    deleteAsksFirst: true,
    held: (section) => ({ sections: 0, dishes: section.dishes, options: 0 }),
    link: {
      label: strings.editDishes,
      href: (section) => restaurantSectionPath(code, section.id),
    },
  });
  return (
    <RowList
      list={list}
      afterOwn={<p className="mt-6 text-foreground-muted">{lead}</p>}
    />
  );
}
