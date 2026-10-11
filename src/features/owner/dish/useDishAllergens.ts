"use client";

import type { RefObject } from "react";
import type { OwnerDishDetail } from "@/domain/dish";
import type { SameNamedPlace } from "../allergens/allergen-words";
import { groupIds, type AllergenTarget } from "../allergens/target";
import { useAllergenGroup } from "../allergens/useAllergenGroup";
import type { EditingStrings, TextWords } from "../editing/list-words";
import type { TextEditor } from "../editing/texts";
import { pushUndo } from "../editing/undo";
import {
  applyDishAllergens,
  setDishAllergenCheck,
  setDishAllergens,
  setDishOtherAllergens,
  undoDishAllergensApply,
} from "./allergen-actions";
import type { DishStrings, DishUndo } from "./dish-words";

// The allergen group on a dish's page (D-148, D-149): the dish as the
// group's target. Its ids start with "dish-", its sentences name the dish,
// every write carries the lists the page showed and no words, since a
// dish's check covers its lists alone (D-148), its Undo entries are the
// page's own, and its same-named offer reaches dishes and options (D-129,
// D-166). The group itself, its state and its handlers, is
// useAllergenGroup, which an option shares (D-154).

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
  const target: AllergenTarget<DishUndo> = {
    ids: groupIds("dish"),
    subject: { id: dish.id, noun: "dish", name: dish.name },
    writes: {
      allergens: (allergens, shown) =>
        setDishAllergens(code, dish.id, allergens, shown),
      others: (others, shown) =>
        setDishOtherAllergens(code, dish.id, others, shown),
      check: (on, shown) => setDishAllergenCheck(code, dish.id, on, shown),
    },
    entries: {
      make: (change) => change,
      read: (entry) =>
        entry.kind === "allergen" ||
        entry.kind === "others" ||
        entry.kind === "check" ||
        entry.kind === "apply"
          ? { change: entry, words: null }
          : null,
    },
    sameNamed: {
      places: sameNamed,
      apply: (place, shown) =>
        applyDishAllergens(
          code,
          dish.id,
          { kind: place.kind, id: place.id },
          {
            source: shown,
            target: {
              allergens: [...place.lists.allergens],
              others: [...place.lists.others],
            },
          },
        ),
      undoApply: (entry) =>
        undoDishAllergensApply(
          code,
          dish.id,
          { kind: entry.target ?? "dish", id: entry.id },
          entry.before,
          entry.at,
        ),
    },
  };
  return useAllergenGroup({
    strings: strings.allergens,
    editingStrings,
    editing: editor.editing,
    record: (entry) => editor.undo.replace(pushUndo(editor.undo.peek(), entry)),
    words,
    gone: strings.errors.parentGone,
    announce,
    focusNextRef,
    state: dish,
    target,
  });
}
