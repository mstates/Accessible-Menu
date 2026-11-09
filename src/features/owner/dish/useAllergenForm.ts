"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { fill } from "@/copy/fill";
import {
  cleanOtherAllergen,
  OTHER_ALLERGEN_LIMITS,
  sameListsAsStored,
  toggleAllergen,
  type AllergenCheck,
  type AllergenLists,
} from "@/domain/allergens";
import type { OwnerDishDetail } from "@/domain/dish";
import type { AllergenId } from "@/domain/types";
import type { FormError } from "@/ui/Form";
import type { AllergenGroupView } from "../allergens/AllergenGroup";
import {
  appliedSentence,
  blankRemovedSentence,
  checkNotSavedSentence,
  notAppliedSentence,
  otherAddedSentence,
  otherLabel,
  otherRemovedSentence,
  otherWords,
  type AllergenStrings,
  type ApplyProblem,
  type SameNamedPlace,
} from "../allergens/allergen-words";
import type { GroupApplyResult, GroupIds } from "../allergens/target";
import {
  failureSentence,
  problemText,
  type EditingStrings,
  type TextWords,
} from "../editing/list-words";
import type { FocusWanted } from "../editing/useFocusNext";
import { validateAllergenForm } from "./allergens-form";
import type { AllergensPayload } from "./form-actions";
import type { AllergenSaveDetail, SaveRefused } from "./form-result";
import type { Prepared } from "./useDishForm";

// The allergen group on a dish's Allergens page, saving by one press
// (D-148, D-223, D-229): the nine boxes, the other-allergen rows, and the
// check are the form's state, changed on the press and sent together by
// Save. The Diners read line and the stamp follow the saved values, not
// the form, so what diners read is never ahead of what is saved. Blank
// rows are dropped without a word on Save; the other rules are problems
// under their rows, in row order (allergens-form.ts). The same-named
// Apply (D-129) works from the saved lists: while the form holds unsaved
// changes it says to save first and sends nothing; clean, it writes the
// other dish and says so, and its last outcome stays under the list.

type Row = { key: number; value: string };

type Adopted = {
  lists: AllergenLists;
  checked: boolean;
  check: AllergenCheck | null;
};

type Props = {
  strings: AllergenStrings;
  editingStrings: EditingStrings;
  // The sentence for a dish that is no longer there.
  gone: string;
  // The dish's words, for problems said with the dish's name.
  words: TextWords;
  announce: (text: string) => void;
  focusNextRef: RefObject<FocusWanted | null>;
  ids: GroupIds;
  dish: OwnerDishDetail;
  // The same-named dishes and options the check names (D-129).
  places: readonly SameNamedPlace[];
  // Gives one of them this dish's saved lists and the check.
  apply: (
    place: SameNamedPlace,
    source: AllergenLists,
  ) => Promise<GroupApplyResult>;
  errors: FormError[];
  setErrors: Dispatch<SetStateAction<FormError[]>>;
};

export function useAllergenForm({
  strings: copy,
  editingStrings,
  gone,
  words,
  announce,
  focusNextRef,
  ids,
  dish,
  places,
  apply,
  errors,
  setErrors,
}: Props) {
  const otherTextWords = useMemo(
    () => otherWords(copy, editingStrings, gone),
    [copy, editingStrings, gone],
  );
  const [majors, setMajors] = useState<AllergenId[]>(() => [...dish.allergens]);
  const [rows, setRows] = useState<Row[]>(() =>
    dish.otherAllergens.map((value, index) => ({ key: index + 1, value })),
  );
  const [nextKey, setNextKey] = useState(dish.otherAllergens.length + 1);
  const [checked, setChecked] = useState(dish.check !== null);
  // What the dish holds after a save whose first statement landed and
  // whose second did not: the new lists, unchecked (D-148).
  const [adopted, setAdopted] = useState<Adopted | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const applying = useRef(false);

  const saved: Adopted = adopted ?? {
    lists: { allergens: dish.allergens, others: dish.otherAllergens },
    checked: dish.check !== null,
    check: dish.check,
  };
  const typed = rows.map((row) => row.value);
  const check = validateAllergenForm(typed);
  const dirty =
    !sameListsAsStored(
      { allergens: majors, others: check.others },
      saved.lists,
    ) || checked !== saved.checked;
  const full = rows.length >= OTHER_ALLERGEN_LIMITS.count;

  function errorOf(id: string): string | null {
    return errors.find((error) => error.id === id)?.message ?? null;
  }

  function setRowValue(key: number, value: string) {
    setRows((list) =>
      list.map((row) => (row.key === key ? { ...row, value } : row)),
    );
  }

  // Leaving a row cleans its text, the way a save would.
  function cleanRow(key: number) {
    setRows((list) =>
      list.map((row) =>
        row.key === key
          ? { ...row, value: cleanOtherAllergen(row.value) }
          : row,
      ),
    );
  }

  function addOther() {
    if (full) {
      announce(copy.othersFull);
      return;
    }
    const key = nextKey;
    const position = rows.length + 1;
    setNextKey(key + 1);
    setRows((list) => [...list, { key, value: "" }]);
    focusNextRef.current = { id: ids.otherField(key), force: true };
    announce(otherAddedSentence(copy, position));
  }

  // A row goes on the press (D-221), with any problem it carried. Focus
  // goes to the next row's field, or to Add another allergen when none is
  // left.
  function removeOther(key: number) {
    const index = rows.findIndex((row) => row.key === key);
    const row = rows[index];
    if (!row) return;
    const position = index + 1;
    const neighbor = rows[index + 1] ?? rows[index - 1];
    focusNextRef.current = {
      id: neighbor ? ids.otherField(neighbor.key) : ids.addOther,
      force: true,
    };
    const fieldId = ids.otherField(key);
    setErrors((list) => list.filter((error) => error.id !== fieldId));
    setRows((list) => list.filter((each) => each.key !== key));
    const value = cleanOtherAllergen(row.value);
    announce(
      value === ""
        ? blankRemovedSentence(copy, position)
        : otherRemovedSentence(copy, otherLabel(copy, value, position)),
    );
  }

  // D-129, from the saved lists. Once its line goes, focus moves to the
  // next Apply button, or to the check box when it was the last.
  function applyTo(place: SameNamedPlace) {
    if (dirty) {
      announce(copy.sameNamed.saveFirst);
      return;
    }
    if (applying.current) return;
    applying.current = true;
    const source = saved.lists;
    void (async () => {
      let result:
        | GroupApplyResult
        | {
            ok: false;
            problem: Extract<
              ApplyProblem,
              { kind: "unreachable" | "out-of-date" }
            >;
          };
      try {
        result = await apply(place, source);
      } catch (error) {
        const stale = unstable_isUnrecognizedActionError(error);
        result = {
          ok: false,
          problem: { kind: stale ? "out-of-date" : "unreachable" },
        };
      }
      applying.current = false;
      if (!result.ok) {
        const text = notAppliedSentence(
          copy,
          editingStrings,
          gone,
          result.problem,
          place,
        );
        setApplied(text);
        announce(text);
        return;
      }
      const at = places.findIndex((each) => each.id === place.id);
      const next = places[at + 1];
      focusNextRef.current = {
        id: next ? ids.apply(next.id) : ids.check,
        force: true,
      };
      const text = appliedSentence(copy, place);
      setApplied(text);
      announce(text);
    })();
  }

  // What Save sends, or the problems that stop it, one per row.
  function prepare(): Prepared<AllergensPayload> {
    if (check.problems.length > 0) {
      return {
        problems: check.problems.flatMap((problem) => {
          const row = rows[problem.index];
          if (!row) return [];
          const message =
            problem.rule === "otherTaken"
              ? fill(copy.errors.otherTaken, { other: problem.other ?? "" })
              : (otherTextWords.rules[problem.rule] ??
                editingStrings.problems.failed);
          return [{ id: ids.otherField(row.key), message }];
        }),
      };
    }
    return {
      payload: {
        allergens: majors,
        others: typed,
        checked,
        shown: {
          lists: {
            allergens: [...saved.lists.allergens],
            others: [...saved.lists.others],
          },
          checked: saved.checked,
        },
      },
    };
  }

  function failureOf(result: SaveRefused<AllergenSaveDetail>): string {
    if (result.status === "moved") return copy.listsMoved;
    if (result.detail?.part === "check") {
      return checkNotSavedSentence(copy, words, dish.name, result.problem);
    }
    return failureSentence(
      fill(copy.notSaved.allergens, { dish: dish.name }),
      problemText(words, result.problem, dish.name),
    );
  }

  function onFailed(result: SaveRefused<AllergenSaveDetail>) {
    if (result.status === "failed" && result.detail?.part === "check") {
      setAdopted({
        lists: result.detail.shown.lists,
        checked: false,
        check: null,
      });
    }
  }

  const group: AllergenGroupView = {
    ids,
    allergens: {
      shown: majors,
      set: (id, on) => setMajors((list) => toggleAllergen(list, id, on)),
      errorOf: () => null,
    },
    others: {
      rows: rows.map((row, index) => {
        const id = ids.otherField(row.key);
        return {
          key: row.key,
          position: index + 1,
          label: otherLabel(copy, cleanOtherAllergen(row.value), index + 1),
          field: {
            id,
            value: row.value,
            error: errorOf(id),
            onChange: (value: string) => setRowValue(row.key, value),
            onCommit: () => cleanRow(row.key),
          },
        };
      }),
      add: addOther,
      remove: removeOther,
      full,
    },
    check: { shown: checked, set: setChecked, error: null },
    reads: {
      lists: saved.lists,
      checked: saved.checked,
      stamp: { check: saved.check, pending: false, cleared: false },
    },
    sameNamed: {
      places: saved.checked ? places : [],
      apply: applyTo,
      dirty,
      result: applied,
    },
  };

  return { group, dirty, prepare, failureOf, onFailed };
}
