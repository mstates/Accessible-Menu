"use client";

import {
  startTransition,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  cleanOtherAllergen,
  hasOtherAllergenComma,
  OTHER_ALLERGEN_LIMITS,
  otherAllergenKey,
  sameListsAsStored,
  toggleAllergen,
  US_MAJOR_ALLERGENS,
  type AllergenCheck,
  type AllergenLists,
  type OwnerAllergens,
  type UsMajorAllergen,
} from "@/domain/allergens";
import type { AllergenId } from "@/domain/types";
import { fill } from "@/copy/fill";
import { commitOf } from "../editing/commit";
import {
  failureSentence,
  notSavedSentence,
  problemText,
  type EditingStrings,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";
import type { TextState } from "../editing/texts";
import type { Editing } from "../editing/useEditing";
import {
  allergensNotSavedSentence,
  appliedSentence,
  blankRemovedSentence,
  checkNotSavedSentence,
  majorRuleOf,
  notAppliedSentence,
  otherAddedSentence,
  otherLabel,
  otherRemovedSentence,
  otherWords,
  type AllergenStrings,
  type SameNamedPlace,
  type StampState,
} from "./allergen-words";
import type { AllergenTarget, GroupState } from "./target";

// The allergen group (D-148, D-166): the state and the handlers behind the
// nine boxes, the other-allergen rows, the check, and the same-named offer
// (D-129). It composes the page's one editing state, handed in by the
// page, so the page keeps one queue and one status whatever it holds. What
// it writes to is its target: a dish, or an option of a choice list.
//
// Every write that changes or checks a list carries the lists the page
// showed, and an option's carries the option's name too, and lands only if
// the target still holds them (Michael, October 8, 2026; D-153). What it
// carries is the last state the server confirmed, read at the moment the
// queue sends it, so two quick ticks in one tab never refuse each other;
// and a write that finds other lists or other words writes nothing, says
// one sentence with no Try again, and the refreshed page shows the target
// as it is now. A row's name does not take the shared text-commit path
// (texts.ts) for that reason: that path keeps a failure with Try again on
// every miss.
//
// A tick, a check, and a remove show at once and go back by themselves if
// the save fails. A change that clears a check says so after "Saved.".

type Props = {
  strings: AllergenStrings;
  editingStrings: EditingStrings;
  editing: Editing;
  // The subject's words, for problems said with its name.
  words: TextWords;
  // The page's sentence for a subject that is no longer here.
  gone: string;
  announce: (text: string) => void;
  // Where focus belongs after the page next changes, shared with the page.
  focusNextRef: RefObject<{ id: string; force: boolean } | null>;
  // The lists and the check as the server holds them, and, for an option,
  // its name. Every save ends with a refresh, so these are always the
  // truth.
  state: OwnerAllergens;
  stateWords?: string | null;
  target: AllergenTarget;
};

// The last lists, check, and words the server confirmed: every save ends
// with a refresh, whose state replaces them, and the page may hand the
// group a landed save of the words (D-153).
type Confirmed = {
  words: string | null;
  lists: AllergenLists;
  check: AllergenCheck | null;
};

// One other-allergen row on the page: a key of its own, since a row has no
// id of its own in the table, and the name the server holds for it, blank
// for a row added and not yet named.
type Row = { key: number; saved: string };
type Rows = { from: string[]; list: Row[]; next: number };

// What the group shows ahead of the server's answer: the boxes, the check,
// the rows on their way out, and whether a change on its way clears a check
// that stands.
type View = {
  allergens: readonly AllergenId[];
  reviewed: boolean;
  removed: readonly number[];
  cleared: boolean;
};

function isMajor(id: string): id is UsMajorAllergen {
  return (US_MAJOR_ALLERGENS as readonly string[]).includes(id);
}

function listsOf(value: OwnerAllergens): AllergenLists {
  return { allergens: [...value.allergens], others: [...value.otherAllergens] };
}

// The rows after the server's list arrived: each server name keeps the key
// of the row that held it, by name and then by place, so a rename keeps its
// row and focus; rows added and not yet named stay after them.
function reconcile(rows: Rows, server: string[]): Rows {
  const saved = rows.list.filter((row) => row.saved !== "");
  const used = new Set<number>();
  let next = rows.next;
  const list = server.map((name, index) => {
    let row = saved.find(
      (candidate) => !used.has(candidate.key) && candidate.saved === name,
    );
    if (!row) {
      const same = saved[index];
      if (same && !used.has(same.key)) row = same;
    }
    if (row) {
      used.add(row.key);
      return { key: row.key, saved: name };
    }
    next += 1;
    return { key: next - 1, saved: name };
  });
  const blank = rows.list.filter((row) => row.saved === "");
  return { from: server, list: [...list, ...blank], next };
}

function firstRows(server: string[]): Rows {
  return {
    from: server,
    list: server.map((name, index) => ({ key: index + 1, saved: name })),
    next: server.length + 1,
  };
}

export function useAllergenGroup({
  strings: copy,
  editingStrings,
  editing,
  words,
  gone,
  announce,
  focusNextRef,
  state,
  stateWords = null,
  target,
}: Props) {
  const { ids, subject } = target;
  const allergenKey = ids.keys.allergen;
  const otherKey = ids.keys.other;
  const CHECK_KEY = ids.keys.check;
  const otherTextWords = useMemo(
    () => otherWords(copy, editingStrings, gone),
    [copy, editingStrings, gone],
  );

  const confirmed = useRef<Confirmed>({
    words: stateWords,
    lists: { allergens: state.allergens, others: state.otherAllergens },
    check: state.check,
  });
  // In this visit a change cleared a check: the stamp line says so while
  // the subject stays unchecked, and a check from anywhere ends it.
  const [cleared, setCleared] = useState(false);
  useLayoutEffect(() => {
    confirmed.current = {
      words: stateWords,
      lists: { allergens: state.allergens, others: state.otherAllergens },
      check: state.check,
    };
  }, [state, stateWords]);

  const base: View = {
    allergens: state.allergens,
    reviewed: state.check !== null,
    removed: [],
    cleared: false,
  };
  const [shown, show] = useOptimistic(
    base,
    (current: View, patch: (view: View) => Partial<View>) => ({
      ...current,
      ...patch(current),
    }),
  );

  const [rows, setRows] = useState<Rows>(() => firstRows(state.otherAllergens));
  if (rows.from !== state.otherAllergens) {
    setRows(reconcile(rows, state.otherAllergens));
  }
  // The rows and the same-named places as of the last commit, for handlers
  // that run after a render.
  const places = target.sameNamed?.places ?? [];
  const rowsRef = useRef(rows);
  const placesRef = useRef(places);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    placesRef.current = places;
  });

  function positionOf(row: Row): number {
    return rowsRef.current.list.findIndex((each) => each.key === row.key) + 1;
  }

  // A row's place among the names the server holds, in the page's order.
  function savedIndexOf(row: Row): number {
    return rowsRef.current.list
      .filter((each) => each.saved !== "")
      .findIndex((each) => each.key === row.key);
  }

  function withRow(
    others: readonly string[],
    row: Row,
    value: string,
  ): string[] {
    const next = [...others];
    const at = savedIndexOf(row);
    if (at >= 0 && at < next.length) next[at] = value;
    else next.push(value);
    return next;
  }

  function withoutRow(others: readonly string[], row: Row): string[] {
    const at = savedIndexOf(row);
    return at >= 0 ? others.filter((_, index) => index !== at) : [...others];
  }

  // A write landed: the lists, the check, and the words it answered with
  // are what the next write carries. A check cleared by the change is
  // said, after the "Saved." the field's landing said. The check's own
  // write is no such change: a deliberate uncheck says "Saved." alone, and
  // the stamp reads as a reload shows it (Q-66).
  function landed(next: GroupState, before: Confirmed, own = false) {
    confirmed.current = {
      words: next.words === undefined ? confirmed.current.words : next.words,
      lists: listsOf(next),
      check: next.check,
    };
    if (next.check || own) setCleared(false);
    else if (before.check) {
      setCleared(true);
      announce(copy.clearedNow);
    }
  }

  // A write found the target holding other lists, or other words, than the
  // page showed: nothing was written, the field's draft and any failure go,
  // the sentence is said once with no Try again, and the refreshed page
  // shows the target as it is now.
  function listsMoved(key: string, sentence: string) {
    editing.dropField(key);
    editing.failChange(sentence);
  }

  function setAllergen(id: UsMajorAllergen, on: boolean, force = false) {
    const key = allergenKey(id);
    editing.sending(key, on ? "on" : "off");
    startTransition(async () => {
      show((view) => ({
        allergens: toggleAllergen(view.allergens, id, on),
        reviewed: false,
        cleared: view.cleared || view.reviewed,
      }));
      await editing.run(async () => {
        const before = confirmed.current;
        const after: AllergenLists = {
          allergens: toggleAllergen(before.lists.allergens, id, on),
          others: before.lists.others,
        };
        if (!force && sameListsAsStored(after, before.lists)) {
          editing.answered(key);
          return;
        }
        const result = await editing.call(() =>
          target.writes.allergens(
            after.allergens.filter(isMajor),
            before.lists,
            before.words,
          ),
        );
        editing.answered(key);
        if (!result.ok) {
          if (result.problem.kind === "lists-changed") {
            listsMoved(key, copy.listsMoved);
            return;
          }
          editing.failField(key, {
            fieldId: ids.box(id),
            problem: problemText(words, result.problem, subject.name),
            sentence: allergensNotSavedSentence(
              copy,
              words,
              subject,
              result.problem,
            ),
            value: on ? "on" : "off",
          });
          return;
        }
        editing.landedField(key, null);
        landed(result.value, before);
      });
    });
  }

  function setCheck(on: boolean, force = false) {
    const key = CHECK_KEY;
    editing.sending(key, on ? "on" : "off");
    startTransition(async () => {
      show(() => ({ reviewed: on }));
      await editing.run(async () => {
        const before = confirmed.current;
        if (!force && (before.check !== null) === on) {
          editing.answered(key);
          return;
        }
        const result = await editing.call(() =>
          target.writes.check(on, before.lists, before.words),
        );
        editing.answered(key);
        if (!result.ok) {
          if (result.problem.kind === "lists-changed") {
            listsMoved(key, on ? copy.listsChanged : copy.checkChanged);
            return;
          }
          editing.failField(key, {
            fieldId: ids.check,
            problem: problemText(words, result.problem, subject.name),
            sentence: checkNotSavedSentence(
              copy,
              words,
              subject,
              result.problem,
            ),
            value: on ? "on" : "off",
          });
          return;
        }
        editing.landedField(key, null);
        landed(result.value, before, true);
      });
    });
  }

  function failOther(
    row: Row,
    problem: ListProblem,
    name: string,
    value: string,
  ) {
    const label = otherLabel(copy, row.saved, positionOf(row));
    const text = problemText(otherTextWords, problem, name);
    editing.failField(otherKey(row.key), {
      fieldId: ids.otherField(row.key),
      problem: text,
      sentence: failureSentence(
        notSavedSentence(otherTextWords, "name", label),
        text,
      ),
      value,
    });
  }

  // A row's name was committed. Nothing is sent unless it changed; the
  // page's rules are checked first, then the whole list is sent with the
  // lists the page showed. Try again passes force. A comma is refused here
  // and never sent: it reads as two allergens to a diner (D-151).
  function commitOther(row: Row, force = false) {
    const key = otherKey(row.key);
    const now = editing.peek();
    const typed = now.drafts[key] ?? null;
    const decision = commitOf(
      {
        saved: row.saved,
        draft: typed,
        inFlight: now.sent[key] ?? null,
        failed: force ? null : (now.failures[key]?.value ?? null),
      },
      cleanOtherAllergen,
    );
    if (decision.kind === "nothing") return;
    if (decision.kind === "reset") {
      editing.reset(key);
      return;
    }
    const value = decision.value;
    const label = otherLabel(copy, row.saved, positionOf(row));
    const rule =
      value === ""
        ? "otherRequired"
        : hasOtherAllergenComma(value)
          ? "otherComma"
          : (majorRuleOf(value) ??
            (value.length > OTHER_ALLERGEN_LIMITS.length
              ? "otherLength"
              : null));
    if (rule) {
      failOther(row, { kind: "invalid", rule }, label, value);
      return;
    }
    const taken = rowsRef.current.list.find(
      (other) =>
        other.key !== row.key &&
        other.saved !== "" &&
        otherAllergenKey(other.saved) === otherAllergenKey(value),
    );
    if (taken) {
      failOther(row, { kind: "name-taken" }, taken.saved, value);
      return;
    }
    editing.sending(key, value);
    startTransition(async () => {
      await editing.run(async () => {
        const before = confirmed.current;
        const others = withRow(before.lists.others, row, value);
        const result = await editing.call(() =>
          target.writes.others(others, before.lists, before.words),
        );
        editing.answered(key);
        if (!result.ok) {
          if (result.problem.kind === "lists-changed") {
            listsMoved(key, copy.listsMoved);
            return;
          }
          failOther(row, result.problem, label, value);
          return;
        }
        editing.landedField(key, typed);
        // The row holds its name from now on, so the refreshed list finds
        // it by name and the row keeps its key, its place, and focus; a
        // row left blank here would have stayed blank while a new row took
        // the name.
        setRows((current) => ({
          ...current,
          list: current.list.map((each) =>
            each.key === row.key ? { ...each, saved: value } : each,
          ),
        }));
        landed(result.value, before);
      });
    });
  }

  const savedCount = rows.list.filter((row) => row.saved !== "").length;

  // A blank row, in the page only: nothing is sent until it is named. Its
  // field takes focus once it is on the page.
  function addOther() {
    if (savedCount >= OTHER_ALLERGEN_LIMITS.count) {
      announce(copy.othersFull);
      return;
    }
    const key = rows.next;
    const position = rows.list.length + 1;
    setRows((current) => ({
      ...current,
      list: [...current.list, { key, saved: "" }],
      next: current.next + 1,
    }));
    focusNextRef.current = { id: ids.otherField(key), force: true };
    announce(otherAddedSentence(copy, position));
  }

  // A named row goes at once, on the press: it is a part of the form, and
  // is typed again in a moment (D-221). A blank one is only taken off the
  // page. Focus goes to the next row's field, or to Add another allergen
  // when none is left; a remove that fails puts it back on the button.
  function removeOther(rowKey: number) {
    const index = rowsRef.current.list.findIndex((each) => each.key === rowKey);
    const row = rowsRef.current.list[index];
    if (!row) return;
    const position = index + 1;
    const neighbor =
      rowsRef.current.list[index + 1] ?? rowsRef.current.list[index - 1];
    focusNextRef.current = {
      id: neighbor ? ids.otherField(neighbor.key) : ids.addOther,
      force: true,
    };
    const key = otherKey(row.key);
    if (row.saved === "") {
      editing.dropField(key);
      setRows((current) => ({
        ...current,
        list: current.list.filter((each) => each.key !== row.key),
      }));
      announce(blankRemovedSentence(copy, position));
      return;
    }
    const label = otherLabel(copy, row.saved, position);
    announce(otherRemovedSentence(copy, label));
    startTransition(async () => {
      show((view) => ({
        removed: [...view.removed, row.key],
        reviewed: false,
        cleared: view.cleared || view.reviewed,
      }));
      await editing.run(async () => {
        const before = confirmed.current;
        const others = withoutRow(before.lists.others, row);
        const result = await editing.call(() =>
          target.writes.others(others, before.lists, before.words),
        );
        if (!result.ok) {
          focusNextRef.current = { id: ids.otherButton(row.key), force: true };
          if (result.problem.kind === "lists-changed") {
            listsMoved(key, copy.listsMoved);
            return;
          }
          editing.failChange(
            failureSentence(
              fill(copy.notRemoved, { other: label }),
              problemText(otherTextWords, result.problem, label),
            ),
          );
          return;
        }
        editing.dropField(key);
        editing.landed();
        landed(result.value, before);
      });
    });
  }

  // D-129: the other dish or option gets this subject's lists and the
  // check, stamped with this person and now. Once its line goes, focus
  // moves to the next Apply button, or to the check box when it was the
  // last (Michael, at approval). Nothing is said as a failure with Try
  // again: the button is still there to press.
  function apply(place: SameNamedPlace) {
    const offer = target.sameNamed;
    if (!offer) return;
    startTransition(async () => {
      await editing.run(async () => {
        const before = confirmed.current;
        const result = await editing.call(() =>
          offer.apply(place, before.lists),
        );
        if (!result.ok) {
          editing.failChange(
            notAppliedSentence(
              copy,
              editingStrings,
              gone,
              result.problem,
              place,
            ),
          );
          return;
        }
        const known = placesRef.current;
        const at = known.findIndex((each) => each.id === place.id);
        const next = known[at + 1];
        focusNextRef.current = {
          id: next ? ids.apply(next.id) : ids.check,
          force: true,
        };
        editing.landed();
        announce(appliedSentence(copy, place));
      });
    });
  }

  // The page hands the group a state the server confirmed outside the
  // group's own writes: a landed save of an option's name (D-153). What
  // the next write carries is replaced; whether a check stood and went is
  // answered, so the page can say so.
  function confirm(next: {
    words?: string | null;
    lists?: AllergenLists;
    check: AllergenCheck | null;
  }): { clearedCheck: boolean } {
    const before = confirmed.current;
    confirmed.current = {
      words: next.words === undefined ? before.words : next.words,
      lists: next.lists ?? before.lists,
      check: next.check,
    };
    const clearedCheck = before.check !== null && next.check === null;
    if (clearedCheck) setCleared(true);
    if (next.check) setCleared(false);
    return { clearedCheck };
  }

  // Sends a failed save of the group's again, with the value that failed.
  // The keys start with this group's prefix, so a page with a group per row
  // asks each in turn and only the owner answers (D-166).
  function tryAgain(key: string, failedValue: string): boolean {
    if (key === CHECK_KEY) {
      setCheck(failedValue === "on", true);
      return true;
    }
    const allergenPrefix = `${ids.prefix}:allergen:`;
    if (key.startsWith(allergenPrefix)) {
      const id = key.slice(allergenPrefix.length);
      if (isMajor(id)) setAllergen(id, failedValue === "on", true);
      return true;
    }
    if (key.startsWith(`${ids.prefix}:other:`)) {
      const row = rowsRef.current.list.find(
        (each) => otherKey(each.key) === key,
      );
      if (row) commitOther(row, true);
      return true;
    }
    return false;
  }

  const shownRows = rows.list
    .filter((row) => !shown.removed.includes(row.key))
    .map((row, index) => {
      const key = otherKey(row.key);
      const field: TextState = {
        id: ids.otherField(row.key),
        value: editing.drafts[key] ?? row.saved,
        error: editing.failures[key]?.problem ?? null,
        onChange: (value: string) => editing.type(key, value),
        onCommit: () => commitOther(row),
      };
      return {
        key: row.key,
        saved: row.saved,
        position: index + 1,
        label: otherLabel(copy, row.saved, index + 1),
        field,
      };
    });

  // The lists as the page shows them, for the sentence diners will read.
  const lists: AllergenLists = {
    allergens: shown.allergens,
    others: shownRows.map((row) => row.saved).filter((name) => name !== ""),
  };

  const stamp: StampState = {
    check: shown.reviewed ? state.check : null,
    pending: shown.reviewed && state.check === null,
    cleared: shown.cleared || (cleared && state.check === null),
  };

  return {
    ids,
    allergens: {
      shown: shown.allergens,
      set: setAllergen,
      errorOf: (id: AllergenId): string | null =>
        editing.failures[allergenKey(id)]?.problem ?? null,
    },
    others: {
      rows: shownRows,
      add: addOther,
      remove: removeOther,
      full: savedCount >= OTHER_ALLERGEN_LIMITS.count,
    },
    check: {
      shown: shown.reviewed,
      set: setCheck,
      error: editing.failures[CHECK_KEY]?.problem ?? null,
      stamp,
    },
    lists,
    sameNamed: { places: shown.reviewed ? places : [], apply },
    tryAgain,
    confirm,
    // The state the next write carries, for a handler that runs after a
    // render.
    peek: (): Confirmed => confirmed.current,
  };
}

export type AllergenGroupState = ReturnType<typeof useAllergenGroup>;

// What the component draws: the group's whole state.
export type AllergenGroupView = AllergenGroupState;
