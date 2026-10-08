"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { z } from "zod";
import type { Copy } from "@/copy";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { AllergenCopy } from "@/domain/allergens";
import type { OwnerDish } from "@/domain/dish";
import type { OwnerMenu } from "@/domain/menu";
import type { OwnerSectionPage } from "@/domain/section";
import { AllergenGroup } from "./allergens/AllergenGroup";
import {
  addDish,
  deleteDish,
  moveSectionBack,
  orderDishes,
  renameDish,
  restoreDish,
  setOwnSectionText,
} from "./dish-actions";
import { RowList } from "./editing/RowList";
import { useRowList } from "./editing/useRowList";
import { setLineWords } from "./line/line-allergen-actions";
import {
  lineAllergenStrings,
  lineLead,
  lineUndoLabel,
  lineUndoSchema,
  type LineUndo,
} from "./line/line-words";
import {
  useLineAllergens,
  type LineAllergensState,
} from "./line/useLineAllergens";
import { dishList, sectionTexts, type SectionOwnText } from "./lists";
import { MoveSection } from "./MoveSection";
import { restaurantDishPath } from "./paths";
import {
  moveNotUndone,
  moveUndoLabel,
  moveUndoneSentence,
  sectionMoveSchema,
  type SectionMove,
} from "./section-move";

type Props = {
  strings: Copy["owner"]["dishes"];
  // The section's own words: what the log says about its note and its
  // every-dish line, and their rules.
  sectionStrings: Copy["owner"]["sections"];
  // The dish page's allergen words, which the line's group speaks with,
  // its own in place of every sentence that names a dish (line-words.ts).
  allergenStrings: Copy["owner"]["dish"]["allergens"];
  editing: Copy["owner"]["editing"];
  code: string;
  // The section, with its note, its every-dish line, and the line's own
  // allergens and their check as the server holds them (D-152).
  section: OwnerSectionPage;
  // The menu the section is in, and the restaurant's other menus.
  menu: OwnerMenu;
  otherMenus: OwnerMenu[];
  // The section's dishes that are not deleted, in order, as the server
  // holds them. Every save ends with a refresh, so this is always the truth.
  dishes: OwnerDish[];
  // The diner-facing allergen words, for the sentence diners will read.
  allergenCopy: AllergenCopy;
  // The other allergens the restaurant's dishes and lines already name,
  // most used first.
  otherNames: string[];
  // The restaurant's time zone, which a check's date is read in, and the
  // page's language.
  timeZone: string;
  lang: string;
};

// How long after the page shows a section's new menu its move is said: long
// enough that Next's reading of the new title has begun, too short to
// notice.
const AFTER_THE_TITLE_MS = 100;

// Everything the section page's one Undo can take back besides the list's
// own: the section's move to another menu, and the line's changes.
type PageUndo = SectionMove | LineUndo;
const pageUndoSchema = z.union([sectionMoveSchema, lineUndoSchema]);

// A section's own page (D-111, D-128, D-135): the section's note and its
// every-dish line first, with the line's allergen group under it while the
// line has words (D-152), then the dishes, the shared list with one field a
// row, its name, and the link to the dish's own page, where the rest of it
// is edited. A dish holds nothing, so its delete asks nothing and Undo
// brings it back (D-119). Under the list sits the section's move to another
// menu (D-129).
// The section's texts, its line's group, and its move share the list's
// saved status, its queue, and its Undo: one of each a screen (D-111).
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
  allergenStrings,
  editing,
  code,
  section,
  menu,
  otherMenus,
  dishes,
  allergenCopy,
  otherNames,
  timeZone,
  lang,
}: Props) {
  const words = useMemo(
    () => dishList.words(strings, editing),
    [strings, editing],
  );
  const ownWords = useMemo(
    () => sectionTexts.words(sectionStrings, strings, editing),
    [sectionStrings, strings, editing],
  );
  const groupStrings = useMemo(
    () => lineAllergenStrings(allergenStrings, strings.line),
    [allergenStrings, strings.line],
  );
  const sectionGone = strings.errors.parentGone;

  // A move changes the page's title, since the title names the menu, and
  // Next's route announcer reads a changed title at once and assertively.
  // Measured against the local stand-in, it did so 4 ms after the move's own
  // polite sentence, which a screen reader would cut off. So a move, and
  // the Undo of one, owe their sentence until the page shows the section in
  // its new menu, and say it a moment after that: the title is then already
  // being read, and a polite sentence waits its turn behind it. The moment
  // is a timer, not an animation frame: a tab that is not showing gets no
  // frames, and the sentence would wait there unsaid.
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

  // The line's group is made after the list, since it shares the list's
  // editing state and Undo; the list's callbacks reach it through a ref,
  // set after every render and read only from handlers, which run after
  // one. The line's field is where focus goes when the group leaves the
  // page with focus inside it.
  const lineRef = useRef<LineAllergensState | null>(null);
  const fieldId = `${dishList.idPrefix}-own-everyItem`;

  const list = useRowList<OwnerDish, "name", PageUndo, SectionOwnText>({
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
    link: {
      label: strings.editDish,
      href: (dish) => restaurantDishPath(code, dish.id),
    },
    actions: {
      add: (name) => addDish(code, section.id, name),
      setText: (id, _field, value, expected) =>
        renameDish(code, section.id, id, value, expected),
      remove: (id) => deleteDish(code, section.id, id),
      restore: (id, order) => restoreDish(code, section.id, id, order),
      order: (ids) => orderDishes(code, section.id, ids),
    },
    own: {
      row: { id: section.id, name: section.name },
      fields: sectionTexts.fields,
      words: ownWords,
      valueOf: (field) => section[field],
      clean: sectionTexts.clean,
      rule: sectionTexts.rule,
      // The line's words save through the line's own action, which answers
      // with the line as the server holds it now (D-153); the note through
      // the section's.
      setText: (field, value, expected) =>
        field === "everyItem"
          ? setLineWords(
              code,
              section.id,
              value,
              expected === undefined ? undefined : { words: expected },
            )
          : setOwnSectionText(code, section.id, field, value, expected),
      // A change to the line remembers its lists and its check, so the
      // Undo of a clear brings the lists back (D-152).
      entry: (field, from, to) =>
        field === "everyItem"
          ? lineRef.current?.wordsEntry(from, to)
          : undefined,
      // A landed save of the line's words hands the group the line as the
      // server holds it now, and says what the save changed.
      landed: (field, value) => {
        if (field !== "everyItem") return;
        const page = value as Partial<OwnerSectionPage>;
        if (page.line && typeof page.everyItem === "string") {
          lineRef.current?.confirmLine(page as OwnerSectionPage, {
            say: true,
            trustLists: false,
          });
        }
      },
    },
    tryAgain: (key, value) =>
      lineRef.current?.group.tryAgain(key, value) ?? false,
    other: {
      schema: pageUndoSchema,
      label: (entry) =>
        entry.kind === "relocate"
          ? moveUndoLabel(strings.move, entry)
          : lineUndoLabel(groupStrings, sectionStrings, entry),
      undo: async (entry, call) => {
        if (entry.kind !== "relocate") {
          const line = lineRef.current;
          return line
            ? line.undo(entry, call)
            : { outcome: "stale", sentence: editing.stale };
        }
        // Undo of a move: back to the menu it came from, in the place it
        // had.
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

  const line = useLineAllergens({
    allergenStrings,
    lineStrings: strings.line,
    sectionStrings,
    editingStrings: editing,
    code,
    section,
    editing: list.editing,
    record: list.record,
    words: ownWords,
    gone: sectionGone,
    announce,
    focusNextRef: list.focusNextRef,
    fieldId,
  });
  useLayoutEffect(() => {
    lineRef.current = line;
  });

  // The restaurant's own other allergens first, then the starter list,
  // each once (D-148), as the dish page suggests them.
  const otherSuggestions = useMemo(() => {
    const seen = new Set(otherNames.map((name) => name.toLowerCase()));
    return [
      ...otherNames,
      ...allergenStrings.suggestions.filter(
        (name) => !seen.has(name.toLowerCase()),
      ),
    ];
  }, [otherNames, allergenStrings.suggestions]);

  return (
    <RowList
      list={list}
      intro={strings.lead}
      afterOwn={
        // The group shows while the server's line has words, never while a
        // draft does (D-152).
        section.everyItem !== "" ? (
          <AllergenGroup
            strings={line.strings}
            allergenCopy={allergenCopy}
            group={line.group}
            heading={line.strings.heading}
            lead={lineLead(strings.line, section.everyItem)}
            suggestions={otherSuggestions}
            timeZone={timeZone}
            lang={lang}
          />
        ) : null
      }
    >
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
