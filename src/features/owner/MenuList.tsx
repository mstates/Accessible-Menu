"use client";

import { useMemo } from "react";
import type { Copy } from "@/copy";
import { Announcer } from "@/core/a11y/announcer";
import type { ListedMenu } from "@/domain/menu";
import { RowList } from "./editing/RowList";
import { useRowList } from "./editing/useRowList";
import { menuList } from "./lists";
import { addMenu, deleteMenu, orderMenus, renameMenu } from "./menu-actions";
import { restaurantMenuPath } from "./paths";
import { stateSentence, type PublishingStrings } from "./publishing-words";

type Props = {
  strings: Copy["owner"]["menus"];
  editing: Copy["owner"]["editing"];
  code: string;
  // The restaurant's menus that are not deleted, in order, as the server
  // holds them, each with the sections and the dishes it holds and its
  // publish state. Every save ends with a refresh, so this is always the
  // truth.
  menus: ListedMenu[];
  // The publishing words, for the line under each name (Q-115), with the
  // restaurant's time zone and the page's language for the day in it.
  publishing: PublishingStrings;
  timeZone: string;
  lang: string;
};

// The menus of one restaurant (D-111, D-128): the shared list, with one
// field a row, its name. Each row links to the menu's own page, where its
// sections are (D-122). Delete asks first on every row (D-221), and names
// the sections and dishes that go when the menu holds any (D-119).
// Under each name, one line of plain text says what the menu's own page
// says of its publish state (Q-115), from the same builder and the same
// words (D-171), tied to no control: the states are read with the menus,
// so a Publish or Unpublish on the menu's page shows here the next time
// the list is read, never live.
export function MenuList(props: Props) {
  return (
    <Announcer>
      <MenuRows {...props} />
    </Announcer>
  );
}

function MenuRows({
  strings,
  editing,
  code,
  menus,
  publishing,
  timeZone,
  lang,
}: Props) {
  const words = useMemo(
    () => menuList.words(strings, editing),
    [strings, editing],
  );
  const list = useRowList({
    words,
    idPrefix: menuList.idPrefix,
    rows: menus,
    fields: menuList.fields,
    valueOf: (menu) => menu.name,
    clean: menuList.clean,
    rule: menuList.rule,
    actions: {
      add: (name) => addMenu(code, name),
      setText: (id, _field, value) => renameMenu(code, id, value),
      remove: (id, told) => deleteMenu(code, id, told),
      order: (ids) => orderMenus(code, ids),
    },
    deleteAsksFirst: true,
    held: (menu) => ({
      sections: menu.sections,
      dishes: menu.dishes,
      options: 0,
    }),
    // A published menu leaves diners the moment it is deleted (D-82,
    // migration 12).
    describeDelete: (menu) => (menu.published ? strings.deletePublished : null),
    link: {
      label: strings.editSections,
      href: (menu) => restaurantMenuPath(code, menu.id),
    },
  });
  return (
    <RowList
      list={list}
      afterFields={(menu) => (
        <p>{stateSentence(publishing, menu, timeZone, lang)}</p>
      )}
    />
  );
}
