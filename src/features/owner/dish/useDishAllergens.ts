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
  OTHER_ALLERGEN_LIMITS,
  otherAllergenKey,
  sameListsAsStored,
  toggleAllergen,
  US_MAJOR_ALLERGENS,
  type AllergenLists,
  type UsMajorAllergen,
} from "@/domain/allergens";
import type {
  AllergenCheck,
  OwnerDishAllergens,
  OwnerDishDetail,
} from "@/domain/dish";
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
import type { TextEditor, TextState } from "../editing/texts";
import { pushUndo, type UndoOutcome } from "../editing/undo";
import {
  applyDishAllergens,
  setDishAllergenCheck,
  setDishAllergens,
  setDishOtherAllergens,
  undoDishAllergensApply,
  type AllergenProblem,
} from "./allergen-actions";
import {
  allergenNotUndone,
  allergensNotSavedSentence,
  allergenUndoneSentence,
  appliedSentence,
  blankRemovedSentence,
  checkNotSavedSentence,
  majorRuleOf,
  notAppliedSentence,
  otherAddedSentence,
  otherLabel,
  otherRemovedSentence,
  otherWords,
  type ApplyProblem,
  type SameNamedPlace,
  type StampState,
} from "./allergen-words";
import type {
  AllergenUndo,
  DishStrings,
  DishUndo,
  UndoLists,
} from "./dish-words";

// The allergen group on a dish's page (D-148): the state and the handlers
// behind the nine boxes, the other-allergen rows, the check, and the
// same-named offer (D-129). It composes the page's one editing state and
// one Undo stack, handed in by useDishPage, so the page keeps one queue,
// one status, and one Undo whatever it holds.
//
// Every write that changes or checks a list carries the lists the page
// showed and lands only if the dish still holds them (Michael, October 8,
// 2026). What it carries is the last lists the server confirmed, read at
// the moment the queue sends it, so two quick ticks in one tab never
// refuse each other; and a write that finds other lists writes nothing,
// says one sentence with no Try again, and the refreshed page shows the
// lists as they are now. A row's name does not take the shared text-commit
// path (texts.ts) for that reason: that path keeps a failure with Try again
// on every miss.
//
// A tick, a check, and a remove show at once and go back by themselves if
// the save fails. A change that clears a check says so after "Saved.".

type Props = {
  strings: DishStrings;
  editingStrings: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  editor: TextEditor<DishUndo>;
  // The dish's words, for problems said with the dish's name.
  words: TextWords;
  announce: (text: string) => void;
  // Where focus belongs after the page next changes, shared with the page.
  focusNextRef: RefObject<{ id: string; force: boolean } | null>;
  sameNamed: SameNamedPlace[];
};

export const CHECK_ID = "dish-allergen-check";
export const ADD_OTHER_ID = "dish-allergen-add";
export const allergenBoxId = (id: AllergenId) => `dish-allergen-${id}`;
export const otherFieldId = (key: number) => `dish-other-${key}-name`;
export const otherButtonId = (key: number) => `dish-other-${key}-remove`;
export const applyButtonId = (id: string) => `dish-apply-${id}`;
const allergenKey = (id: AllergenId) => `allergen:${id}`;
const otherKey = (key: number) => `other:${key}`;
const CHECK_KEY = "allergen-check";

// The last lists and check the server confirmed, and the dish they came
// with: every save ends with a refresh, whose dish replaces them.
type Confirmed = {
  from: OwnerDishDetail;
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

export type Reversed =
  | { ok: true; sentence: string | null }
  | { ok: false; outcome: Exclude<UndoOutcome, "applied">; sentence: string };

// Why one of the group's writes did not land: the server's reasons, a list
// that moved under the page, or a call the browser never got an answer to.
type GroupProblem =
  AllergenProblem | { kind: "unreachable" } | { kind: "out-of-date" };

function isMajor(id: string): id is UsMajorAllergen {
  return (US_MAJOR_ALLERGENS as readonly string[]).includes(id);
}

function plain(lists: AllergenLists): UndoLists {
  return { allergens: [...lists.allergens], others: [...lists.others] };
}

function listsOf(value: OwnerDishAllergens): UndoLists {
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

export function useDishAllergens({
  strings,
  editingStrings,
  code,
  dish,
  editor,
  words,
  announce,
  focusNextRef,
  sameNamed,
}: Props) {
  const { editing, undo } = editor;
  const copy = strings.allergens;
  const otherTextWords = useMemo(
    () => otherWords(copy, editingStrings, strings.errors.parentGone),
    [copy, editingStrings, strings.errors.parentGone],
  );

  const confirmed = useRef<Confirmed>({
    from: dish,
    lists: { allergens: dish.allergens, others: dish.otherAllergens },
    check: dish.check,
  });
  // In this visit a change to a list cleared a check: the stamp line says
  // so while the dish stays unchecked, and a check from anywhere ends it.
  const [cleared, setCleared] = useState(false);
  useLayoutEffect(() => {
    confirmed.current = {
      from: dish,
      lists: { allergens: dish.allergens, others: dish.otherAllergens },
      check: dish.check,
    };
  }, [dish]);

  const base: View = {
    allergens: dish.allergens,
    reviewed: dish.check !== null,
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

  const [rows, setRows] = useState<Rows>(() => firstRows(dish.otherAllergens));
  if (rows.from !== dish.otherAllergens) {
    setRows(reconcile(rows, dish.otherAllergens));
  }
  // The rows and the same-named places as of the last commit, for handlers
  // that run after a render.
  const rowsRef = useRef(rows);
  const placesRef = useRef(sameNamed);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    placesRef.current = sameNamed;
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

  // A write landed: the lists and the check it answered with are what the
  // next write carries. A check cleared by the change is said, after the
  // "Saved." the field's landing said.
  function landed(next: OwnerDishAllergens, before: Confirmed): UndoLists {
    const lists = listsOf(next);
    confirmed.current = {
      from: confirmed.current.from,
      lists,
      check: next.check,
    };
    if (before.check && !next.check) {
      setCleared(true);
      announce(copy.clearedNow);
    }
    if (next.check) setCleared(false);
    return lists;
  }

  // A write found the dish holding other lists than the page showed: nothing
  // was written, the field's draft and any failure go, the sentence is said
  // once with no Try again, and the refreshed page shows the lists as they
  // are now.
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
          setDishAllergens(code, dish.id, after.allergens, plain(before.lists)),
        );
        editing.answered(key);
        if (!result.ok) {
          if (result.problem.kind === "lists-changed") {
            listsMoved(key, copy.listsMoved);
            return;
          }
          editing.failField(key, {
            fieldId: allergenBoxId(id),
            problem: problemText(words, result.problem, dish.name),
            sentence: allergensNotSavedSentence(
              copy,
              words,
              dish.name,
              result.problem,
            ),
            value: on ? "on" : "off",
          });
          return;
        }
        editing.landedField(key, null);
        const lists = landed(result.value, before);
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "allergen",
            id: dish.id,
            name: dish.name,
            allergen: id,
            on,
            before: plain(before.lists),
            after: lists,
          }),
        );
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
          setDishAllergenCheck(code, dish.id, on, plain(before.lists)),
        );
        editing.answered(key);
        if (!result.ok) {
          if (result.problem.kind === "lists-changed") {
            listsMoved(key, on ? copy.listsChanged : copy.checkChanged);
            return;
          }
          editing.failField(key, {
            fieldId: CHECK_ID,
            problem: problemText(words, result.problem, dish.name),
            sentence: checkNotSavedSentence(
              copy,
              words,
              dish.name,
              result.problem,
            ),
            value: on ? "on" : "off",
          });
          return;
        }
        editing.landedField(key, null);
        landed(result.value, before);
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "check",
            id: dish.id,
            name: dish.name,
            on,
            lists: plain(before.lists),
          }),
        );
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
      fieldId: otherFieldId(row.key),
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
  // lists the page showed. Try again passes force.
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
        : (majorRuleOf(value) ??
          (value.length > OTHER_ALLERGEN_LIMITS.length ? "otherLength" : null));
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
          setDishOtherAllergens(code, dish.id, others, plain(before.lists)),
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
        const lists = landed(result.value, before);
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "others",
            id: dish.id,
            name: dish.name,
            before: plain(before.lists),
            after: lists,
          }),
        );
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
    focusNextRef.current = { id: otherFieldId(key), force: true };
    announce(otherAddedSentence(copy, position));
  }

  // A named row goes at once, with Undo; a blank one is only taken off the
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
      id: neighbor ? otherFieldId(neighbor.key) : ADD_OTHER_ID,
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
          setDishOtherAllergens(code, dish.id, others, plain(before.lists)),
        );
        if (!result.ok) {
          focusNextRef.current = { id: otherButtonId(row.key), force: true };
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
        const lists = landed(result.value, before);
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "others",
            id: dish.id,
            name: dish.name,
            before: plain(before.lists),
            after: lists,
          }),
        );
      });
    });
  }

  // D-129: the other dish gets this dish's lists and the check, stamped
  // with this person and now. Once its line goes, focus moves to the next
  // Apply button, or to the check box when it was the last (Michael, at
  // approval). Nothing is said as a failure with Try again: the button is
  // still there to press.
  function apply(place: SameNamedPlace) {
    startTransition(async () => {
      await editing.run(async () => {
        const before = confirmed.current;
        const result = await editing.call(() =>
          applyDishAllergens(code, dish.id, place.id, {
            source: plain(before.lists),
            target: plain(place.lists),
          }),
        );
        if (!result.ok) {
          editing.failChange(
            notAppliedSentence(
              copy,
              editingStrings,
              strings.errors.parentGone,
              result.problem,
              place,
            ),
          );
          return;
        }
        const places = placesRef.current;
        const at = places.findIndex((each) => each.id === place.id);
        const next = places[at + 1];
        focusNextRef.current = {
          id: next ? applyButtonId(next.id) : CHECK_ID,
          force: true,
        };
        editing.landed();
        announce(appliedSentence(copy, place));
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "apply",
            id: place.id,
            dish: place.name,
            section: place.section,
            menu: place.menu,
            before: { ...plain(place.lists), reviewed: place.reviewed },
            after: listsOf(result.value),
            at: result.value.check?.at ?? "",
          }),
        );
      });
    });
  }

  // What the apply's Undo got back, as the group's problems.
  function fromApply(problem: ApplyProblem): GroupProblem {
    switch (problem.kind) {
      case "target-changed":
        return { kind: "lists-changed" };
      case "target-gone":
      case "source-changed":
      case "source-unchecked":
        return { kind: "gone" };
      default:
        return problem;
    }
  }

  function notReversed(entry: AllergenUndo, problem: GroupProblem): Reversed {
    return {
      ok: false,
      ...allergenNotUndone(copy, editingStrings, words, entry, problem),
    };
  }

  // The inverse of one of the group's changes. A list is put back only
  // while the dish still holds the lists the change left; a check is put
  // back only on the lists it covered. The sentence says when the change
  // cleared a check that stood.
  async function reverse(entry: AllergenUndo): Promise<Reversed> {
    const before = confirmed.current;
    switch (entry.kind) {
      case "allergen": {
        const result = await editing.call(() =>
          setDishAllergens(
            code,
            dish.id,
            entry.before.allergens.filter(isMajor),
            entry.after,
          ),
        );
        if (!result.ok) return notReversed(entry, result.problem);
        const clearedCheck =
          before.check !== null && result.value.check === null;
        landedQuiet(result.value, before);
        return {
          ok: true,
          sentence: allergenUndoneSentence(copy, entry, clearedCheck),
        };
      }
      case "others": {
        const result = await editing.call(() =>
          setDishOtherAllergens(
            code,
            dish.id,
            entry.before.others,
            entry.after,
          ),
        );
        if (!result.ok) return notReversed(entry, result.problem);
        const clearedCheck =
          before.check !== null && result.value.check === null;
        landedQuiet(result.value, before);
        return {
          ok: true,
          sentence: allergenUndoneSentence(copy, entry, clearedCheck),
        };
      }
      case "check": {
        const result = await editing.call(() =>
          setDishAllergenCheck(code, dish.id, !entry.on, entry.lists),
        );
        if (!result.ok) return notReversed(entry, result.problem);
        landedQuiet(result.value, before);
        return {
          ok: true,
          sentence: allergenUndoneSentence(copy, entry, false),
        };
      }
      case "apply": {
        const result = await editing.call(() =>
          undoDishAllergensApply(
            code,
            dish.id,
            entry.id,
            entry.before,
            entry.at,
          ),
        );
        if (!result.ok) return notReversed(entry, fromApply(result.problem));
        return {
          ok: true,
          sentence: allergenUndoneSentence(copy, entry, false),
        };
      }
    }
  }

  // After an Undo: the lists and the check as the server now holds them,
  // with the Undo's own sentence carrying what there is to say.
  function landedQuiet(next: OwnerDishAllergens, before: Confirmed) {
    confirmed.current = {
      from: confirmed.current.from,
      lists: listsOf(next),
      check: next.check,
    };
    if (next.check) setCleared(false);
    else if (before.check) setCleared(true);
  }

  // Sends a failed save of the group's again, with the value that failed.
  function tryAgain(key: string, failedValue: string): boolean {
    if (key === CHECK_KEY) {
      setCheck(failedValue === "on", true);
      return true;
    }
    if (key.startsWith("allergen:")) {
      const id = key.slice("allergen:".length);
      if (isMajor(id)) setAllergen(id, failedValue === "on", true);
      return true;
    }
    if (key.startsWith("other:")) {
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
        id: otherFieldId(row.key),
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
    check: shown.reviewed ? dish.check : null,
    pending: shown.reviewed && dish.check === null,
    cleared: shown.cleared || (cleared && dish.check === null),
  };

  return {
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
    sameNamed: { places: shown.reviewed ? sameNamed : [], apply },
    reverse,
    tryAgain,
  };
}

export type AllergenGroupState = ReturnType<typeof useDishAllergens>;
