"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Copy } from "@/copy";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { OwnerDish } from "@/domain/dish";
import type { OwnerMenu } from "@/domain/menu";
import {
  addDish,
  deleteDish,
  moveSectionBack,
  orderDishes,
  renameDish,
  restoreDish,
} from "./dish-actions";
import { RowList } from "./editing/RowList";
import { useRowList } from "./editing/useRowList";
import { dishList } from "./lists";
import { MoveSection } from "./MoveSection";
import {
  moveNotUndone,
  moveUndoLabel,
  moveUndoneSentence,
  sectionMoveSchema,
  type SectionMove,
} from "./section-move";

type Props = {
  strings: Copy["owner"]["dishes"];
  editing: Copy["owner"]["editing"];
  code: string;
  section: { id: string; name: string };
  // The menu the section is in, and the restaurant's other menus.
  menu: OwnerMenu;
  otherMenus: OwnerMenu[];
  // The section's dishes that are not deleted, in order, as the server
  // holds them. Every save ends with a refresh, so this is always the truth.
  dishes: OwnerDish[];
};

// The dishes of one section (D-111, D-128): the shared list, with one field
// a row, its name. A dish holds nothing, so its delete asks nothing and
// Undo brings it back (D-119). A dish has no page of its own yet, so its
// row has no link. Under the list sits the section's move to another menu
// (D-129), which shares the list's saved status, its queue, and its Undo:
// one of each a screen (D-111).
export function DishList(props: Props) {
  return (
    <Announcer>
      <DishRows {...props} />
    </Announcer>
  );
}

function DishRows({
  strings,
  editing,
  code,
  section,
  menu,
  otherMenus,
  dishes,
}: Props) {
  const words = useMemo(
    () => dishList.words(strings, editing),
    [strings, editing],
  );
  const sectionGone = strings.errors.parentGone;

  // A move changes the page's title, since the title names the menu, and
  // Next's route announcer reads a changed title at once and assertively.
  // Measured against the local stand-in, it did so 4 ms after the move's own
  // polite sentence, which a screen reader would cut off. So a move, and
  // the Undo of one, owe their sentence until the page shows the section in
  // its new menu, and say it a frame after that: the title is then already
  // being read, and a polite sentence waits its turn behind it.
  const announce = useAnnounce();
  const owed = useRef<{ menuId: string; sentence: string } | null>(null);
  useEffect(() => {
    const due = owed.current;
    if (!due || due.menuId !== menu.id) return;
    const frame = window.requestAnimationFrame(() => {
      if (owed.current !== due) return;
      owed.current = null;
      announce(due.sentence);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menu.id, announce]);
  function sayOnceIn(menuId: string, sentence: string) {
    owed.current = { menuId, sentence };
  }

  const list = useRowList<OwnerDish, "name", SectionMove>({
    words,
    idPrefix: dishList.idPrefix,
    // Kept by the section, not by its menu: the page and its Undo stay with
    // the section when it moves.
    undoKey: `undo:${code}:section:${section.id}`,
    rows: dishes,
    fields: dishList.fields,
    valueOf: (dish) => dish.name,
    clean: dishList.clean,
    rule: dishList.rule,
    actions: {
      add: (name) => addDish(code, section.id, name),
      setText: (id, _field, value, expected) =>
        renameDish(code, section.id, id, value, expected),
      remove: (id) => deleteDish(code, section.id, id),
      restore: (id, order) => restoreDish(code, section.id, id, order),
      order: (ids) => orderDishes(code, section.id, ids),
    },
    other: {
      schema: sectionMoveSchema,
      label: (entry) => moveUndoLabel(strings.move, entry),
      // Undo of a move: back to the menu it came from, in the place it had.
      undo: async (entry, call) => {
        const result = await call(() =>
          moveSectionBack(code, entry.id, entry.from.id, entry.from.order),
        );
        if (!result.ok) {
          return moveNotUndone(
            strings.move,
            editing,
            sectionGone,
            entry,
            result.problem,
          );
        }
        sayOnceIn(
          entry.from.id,
          moveUndoneSentence(
            strings.move,
            entry,
            result.value.position || entry.from.order.indexOf(entry.id) + 1,
            result.value.total || entry.from.order.length,
          ),
        );
        return { outcome: "applied", sentence: null };
      },
    },
  });

  return (
    <RowList list={list}>
      <MoveSection
        strings={strings.move}
        editing={editing}
        sectionGone={sectionGone}
        code={code}
        section={section}
        menu={menu}
        otherMenus={otherMenus}
        saves={list.editing}
        record={list.record}
        sayOnceIn={sayOnceIn}
      />
    </RowList>
  );
}
