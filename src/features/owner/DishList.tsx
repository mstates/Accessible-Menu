"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Copy } from "@/copy";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { OwnerChoiceList } from "@/domain/choices";
import type { OwnerDish } from "@/domain/dish";
import type { OwnerMenu } from "@/domain/menu";
import type { OwnerSection } from "@/domain/section";
import { ChoiceListRows } from "./choices/ChoiceListRows";
import {
  useChoiceListRows,
  type ChoiceListRowsState,
} from "./choices/useChoiceListRows";
import {
  addDish,
  deleteDish,
  orderDishes,
  renameDish,
  setOwnSectionText,
} from "./dish-actions";
import { RowList } from "./editing/RowList";
import { useRowList } from "./editing/useRowList";
import { dishList, sectionTexts, type SectionOwnText } from "./lists";
import { MoveSection } from "./MoveSection";
import { restaurantDishPath } from "./paths";

type Props = {
  strings: Copy["owner"]["dishes"];
  // The section's own words: what the log says about its note and its
  // rules.
  sectionStrings: Copy["owner"]["sections"];
  choiceStrings: Copy["owner"]["choices"];
  editing: Copy["owner"]["editing"];
  code: string;
  // The section, with its note.
  section: OwnerSection;
  // The menu the section is in, and the restaurant's other menus.
  menu: OwnerMenu;
  otherMenus: OwnerMenu[];
  // The section's dishes that are not deleted, in order, as the server
  // holds them. Every save ends with a refresh, so this is always the truth.
  dishes: OwnerDish[];
  // The section's choice lists, in order, with how many options each holds
  // (D-166).
  lists: OwnerChoiceList[];
};

// How long after the page shows a section's new menu its move is said: long
// enough that Next's reading of the new title has begun, too short to
// notice.
const AFTER_THE_TITLE_MS = 100;

// A section's own page (D-111, D-128, D-135): the section's note first,
// then its choice lists under their heading (D-166), then the dishes, the
// shared list with one field a row, its name, and the link to the dish's
// own page, where the rest of it is edited. A dish holds nothing a delete
// counts, so its question is its name alone (D-221). Under the list sits
// the section's move to another menu (D-129). The section's note, its
// choice lists, and its move share the list's saved status and its queue:
// one of each a screen (D-111, D-145).
export function DishList(props: Props) {
  return (
    <Announcer>
      <DishRows {...props} />
    </Announcer>
  );
}

function DishRows({
  strings,
  sectionStrings,
  choiceStrings,
  editing,
  code,
  section,
  menu,
  otherMenus,
  dishes,
  lists,
}: Props) {
  const words = useMemo(
    () => dishList.words(strings, editing),
    [strings, editing],
  );
  const ownWords = useMemo(
    () => sectionTexts.words(sectionStrings, strings, editing),
    [sectionStrings, strings, editing],
  );
  const sectionGone = strings.errors.parentGone;

  // A move changes the page's title, since the title names the menu, and
  // Next's route announcer reads a changed title at once and assertively.
  // Measured against the local stand-in, it did so 4 ms after the move's own
  // polite sentence, which a screen reader would cut off. So a move owes
  // its sentence until the page shows the section in its new menu, and says
  // it a moment after that: the title is then already being read, and a
  // polite sentence waits its turn behind it. The moment is a timer, not an
  // animation frame: a tab that is not showing gets no frames, and the
  // sentence would wait there unsaid.
  const announce = useAnnounce();
  const owed = useRef<{ menuId: string; sentence: string } | null>(null);
  useEffect(() => {
    const due = owed.current;
    if (!due || due.menuId !== menu.id) return;
    const timer = window.setTimeout(() => {
      if (owed.current !== due) return;
      owed.current = null;
      announce(due.sentence);
    }, AFTER_THE_TITLE_MS);
    return () => window.clearTimeout(timer);
  }, [menu.id, announce]);
  function sayOnceIn(menuId: string, sentence: string) {
    owed.current = { menuId, sentence };
  }

  // The choice lists are made after the dishes' list, since they share its
  // editing state; the list's callbacks reach them through a ref, set after
  // every render and read only from handlers, which run after one.
  const choiceRef = useRef<ChoiceListRowsState | null>(null);

  const list = useRowList<OwnerDish, "name", SectionOwnText>({
    words,
    idPrefix: dishList.idPrefix,
    rows: dishes,
    fields: dishList.fields,
    valueOf: (dish) => dish.name,
    clean: dishList.clean,
    rule: dishList.rule,
    link: {
      label: strings.editDish,
      href: (dish) => restaurantDishPath(code, dish.id),
    },
    actions: {
      add: (name) => addDish(code, section.id, name),
      setText: (id, _field, value) => renameDish(code, section.id, id, value),
      remove: (id) => deleteDish(code, section.id, id),
      order: (ids) => orderDishes(code, section.id, ids),
    },
    deleteAsksFirst: true,
    own: {
      row: { id: section.id, name: section.name },
      fields: sectionTexts.fields,
      words: ownWords,
      valueOf: (field) => section[field],
      clean: sectionTexts.clean,
      rule: sectionTexts.rule,
      setText: (field, value) =>
        setOwnSectionText(code, section.id, field, value),
    },
    tryAgain: (key, value) =>
      choiceRef.current?.tryAgainKey(key, value) ?? false,
  });

  const choices = useChoiceListRows({
    strings: choiceStrings,
    editingStrings: editing,
    code,
    home: { kind: "section", id: section.id },
    lists,
    shared: list.editing,
  });
  useLayoutEffect(() => {
    choiceRef.current = choices;
  });

  return (
    <RowList
      list={list}
      intro={strings.lead}
      afterOwn={<ChoiceListRows rows={choices} />}
    >
      <MoveSection
        strings={strings.move}
        editing={editing}
        sectionGone={sectionGone}
        code={code}
        section={section}
        otherMenus={otherMenus}
        saves={list.editing}
        sayOnceIn={sayOnceIn}
      />
    </RowList>
  );
}
