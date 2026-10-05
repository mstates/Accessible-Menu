"use client";

import { useMemo } from "react";
import type { Copy } from "@/copy";
import { Announcer } from "@/core/a11y/announcer";
import type { ListedMenu } from "@/domain/menu";
import { RowList } from "./editing/RowList";
import { useRowList } from "./editing/useRowList";
import { menuList } from "./lists";
import {
  addMenu,
  deleteMenu,
  orderMenus,
  renameMenu,
  restoreMenu,
} from "./menu-actions";
import { restaurantMenuPath } from "./paths";

type Props = {
  strings: Copy["owner"]["menus"];
  editing: Copy["owner"]["editing"];
  code: string;
  // The restaurant's menus that are not deleted, in order, as the server
  // holds them, each with the sections and the dishes it holds. Every save
  // ends with a refresh, so this is always the truth.
  menus: ListedMenu[];
};

// The menus of one restaurant (D-111, D-128): the shared list, with one
// field a row, its name. Each row links to the menu's own page, where its
// sections are (D-122). Delete on a menu that holds sections asks first,
// and names them and their dishes; an empty menu goes at once (D-119).
export function MenuList(props: Props) {
  return (
    <Announcer>
      <MenuRows {...props} />
    </Announcer>
  );
}

function MenuRows({ strings, editing, code, menus }: Props) {
  const words = useMemo(
    () => menuList.words(strings, editing),
    [strings, editing],
  );
  const list = useRowList({
    words,
    idPrefix: menuList.idPrefix,
    undoKey: `undo:${code}:menus`,
    rows: menus,
    fields: menuList.fields,
    valueOf: (menu) => menu.name,
    clean: menuList.clean,
    rule: menuList.rule,
    actions: {
      add: (name) => addMenu(code, name),
      setText: (id, _field, value, expected) =>
        renameMenu(code, id, value, expected),
      remove: (id, told) => deleteMenu(code, id, told),
      restore: (id, order) => restoreMenu(code, id, order),
      order: (ids) => orderMenus(code, ids),
    },
    held: (menu) => ({ sections: menu.sections, dishes: menu.dishes }),
    link: {
      label: strings.editSections,
      href: (menu) => restaurantMenuPath(code, menu.id),
    },
  });
  return <RowList list={list} />;
}
