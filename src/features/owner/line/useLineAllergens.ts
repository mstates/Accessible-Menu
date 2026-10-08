"use client";

import { useMemo, type RefObject } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { sameListsAsStored, type AllergenLists } from "@/domain/allergens";
import type { OwnerSectionPage } from "@/domain/section";
import type { AllergenStrings } from "../allergens/allergen-words";
import { groupIds, type AllergenTarget } from "../allergens/target";
import { useAllergenGroup } from "../allergens/useAllergenGroup";
import {
  failureSentence,
  problemText,
  undoOutcome,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";
import type { UndoOutcome } from "../editing/undo";
import type { Editing } from "../editing/useEditing";
import {
  restoreLine,
  setLineAllergenCheck,
  setLineAllergens,
  setLineOtherAllergens,
  setLineWords,
} from "./line-allergen-actions";
import {
  lineAllergenStrings,
  lineUndoLabel,
  readChange,
  wrapChange,
  type LineStrings,
  type LineUndo,
  type LineWordsUndo,
  type SectionStrings,
} from "./line-words";

// The allergen group of a section's line shown with every dish (D-152,
// D-153): the line as the group's target, and what is the line's alone.
// Its ids start with "line-", its sentences name the section, every write
// carries the line's words as well as the lists the page showed, and its
// Undo entries are the section page's, beside the dishes' and the move's.
// The words themselves save through the page's own-text path (D-135); when
// such a save lands, the page hands the group the line as the server now
// holds it, and the group says what there is to say.

type Props = {
  allergenStrings: AllergenStrings;
  lineStrings: LineStrings;
  sectionStrings: SectionStrings;
  editingStrings: Copy["owner"]["editing"];
  code: string;
  section: OwnerSectionPage;
  // The page's one editing state and one Undo, shared with the dishes.
  editing: Editing;
  record: (entry: LineUndo) => void;
  // The section's own words, for problems said with the section's name.
  words: TextWords;
  // The page's sentence for a section that is no longer here.
  gone: string;
  announce: (text: string) => void;
  focusNextRef: RefObject<{ id: string; force: boolean } | null>;
  // The id of the line's field, where focus goes when the group leaves the
  // page with focus inside it.
  fieldId: string;
};

type Undone =
  | { outcome: "applied"; sentence: string | null }
  | { outcome: Exclude<UndoOutcome, "applied">; sentence: string };

export function useLineAllergens({
  allergenStrings,
  lineStrings,
  sectionStrings,
  editingStrings,
  code,
  section,
  editing,
  record,
  words,
  gone,
  announce,
  focusNextRef,
  fieldId,
}: Props) {
  const strings = useMemo(
    () => lineAllergenStrings(allergenStrings, lineStrings),
    [allergenStrings, lineStrings],
  );

  const target: AllergenTarget<LineUndo> = {
    ids: groupIds("line", fieldId),
    subject: { id: section.id, noun: "section", name: section.name },
    writes: {
      allergens: (allergens, shown, carried) =>
        setLineAllergens(code, section.id, allergens, {
          words: carried ?? "",
          lists: shown,
        }),
      others: (others, shown, carried) =>
        setLineOtherAllergens(code, section.id, others, {
          words: carried ?? "",
          lists: shown,
        }),
      check: (on, shown, carried) =>
        setLineAllergenCheck(code, section.id, on, {
          words: carried ?? "",
          lists: shown,
        }),
    },
    entries: {
      make: (change, carried) => wrapChange(change, carried ?? ""),
      read: (entry) => readChange(entry),
    },
  };

  const group = useAllergenGroup({
    strings,
    editingStrings,
    editing,
    record,
    words,
    gone,
    announce,
    focusNextRef,
    state: section.line,
    stateWords: section.everyItem,
    target,
  });

  // A save of the words landed, or an Undo of one: the group learns the
  // line as the server holds it now (D-153). The words and the check are
  // taken from the answer; the lists only when they equal the lists the
  // group last confirmed, since a save of the words carries no lists and
  // its answer can hold lists another tab wrote that this page has never
  // shown. Adopted at once, a check queued behind the save would carry
  // them and land on a list the person never saw (D-149); kept, the queued
  // write misses and says the changed sentence, and the refresh shows the
  // new lists (Michael, at approval). An Undo that wrote the lists itself
  // trusts them. With say, what the save changed is said after "Saved.":
  // the check it cleared, or the lists a cleared line took with it. A line
  // that went takes its group off the page, and the group hands focus back
  // to the field if it was inside as it goes.
  function confirmLine(
    next: OwnerSectionPage,
    { say, trustLists }: { say: boolean; trustLists: boolean },
  ) {
    const before = group.peek();
    const lists: AllergenLists = {
      allergens: next.line.allergens,
      others: next.line.otherAllergens,
    };
    const adopt = trustLists || sameListsAsStored(lists, before.lists);
    const { clearedCheck } = group.confirm({
      words: next.everyItem,
      lists: adopt ? lists : before.lists,
      check: next.line.check,
    });
    if (next.everyItem === "") {
      const held =
        before.lists.allergens.length > 0 ||
        before.lists.others.length > 0 ||
        before.check !== null;
      if (say && held) announce(lineStrings.wentWithIt);
      return;
    }
    if (say && clearedCheck) announce(strings.clearedNow);
  }

  // The entry a save of the words leaves: the words before and after, and
  // the lists and the check as the group held them at the time, so the
  // Undo of a clear brings the lists back and the Undo of a change can say
  // the check is gone.
  function wordsEntry(from: string, to: string): LineWordsUndo {
    const now = group.peek();
    return {
      kind: "line-words",
      id: section.id,
      name: section.name,
      from,
      to,
      lists: {
        allergens: [...now.lists.allergens],
        others: [...now.lists.others],
      },
      reviewed: now.check !== null,
    };
  }

  function notUndone(problem: ListProblem): Undone {
    if (problem.kind === "changed") {
      return { outcome: "stale", sentence: sectionStrings.undo.textChanged };
    }
    if (
      problem.kind === "gone" ||
      problem.kind === "parent-gone" ||
      problem.kind === "mismatch"
    ) {
      return { outcome: "stale", sentence: editingStrings.stale };
    }
    return {
      outcome: undoOutcome(problem),
      sentence: failureSentence(
        editingStrings.notUndone,
        problemText(words, problem, section.name),
      ),
    };
  }

  // Undo of a change to the words. A clear comes back with its words and
  // its lists, unchecked (D-119, D-149). Words given to a blank line go
  // only while the line still holds no list and no check; otherwise it
  // stays, and the sentence says where to clear it. A change between two
  // lines puts the words back and says the check is still gone when one
  // stood.
  async function undoWords(
    entry: LineWordsUndo,
    call: Editing["call"],
  ): Promise<Undone> {
    const named = (template: string) => fill(template, { section: entry.name });
    if (entry.to === "") {
      const held =
        entry.lists.allergens.length > 0 ||
        entry.lists.others.length > 0 ||
        entry.reviewed;
      const result = await call(() =>
        restoreLine(code, section.id, entry.from, entry.lists),
      );
      if (!result.ok) return notUndone(result.problem);
      confirmLine(result.value, { say: false, trustLists: true });
      return {
        outcome: "applied",
        sentence: named(
          held
            ? lineStrings.undo.wordsRestored
            : sectionStrings.undo.everyItemBack,
        ),
      };
    }
    const fromBlank = entry.from === "";
    const result = await call(() =>
      setLineWords(code, section.id, entry.from, {
        words: entry.to,
        ...(fromBlank ? { lists: { allergens: [], others: [] } } : {}),
      }),
    );
    if (!result.ok) {
      if (result.problem.kind === "grew") {
        return {
          outcome: "stale",
          sentence: named(lineStrings.undo.wordsGrew),
        };
      }
      return notUndone(result.problem);
    }
    confirmLine(result.value, { say: false, trustLists: false });
    const cleared =
      entry.reviewed && !fromBlank ? ` ${strings.clearedNow}` : "";
    return {
      outcome: "applied",
      sentence: named(sectionStrings.undo.everyItemBack) + cleared,
    };
  }

  // Undo of one of the line's entries, in the shape the list's Undo takes.
  async function undo(entry: LineUndo, call: Editing["call"]): Promise<Undone> {
    if (entry.kind === "line-words") return undoWords(entry, call);
    const result = await group.reverse(entry);
    return result.ok
      ? { outcome: "applied", sentence: result.sentence }
      : { outcome: result.outcome, sentence: result.sentence };
  }

  return {
    group,
    strings,
    confirmLine,
    wordsEntry,
    undo,
    label: (entry: LineUndo) => lineUndoLabel(strings, sectionStrings, entry),
  };
}

export type LineAllergensState = ReturnType<typeof useLineAllergens>;
