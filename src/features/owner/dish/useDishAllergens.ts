"use client";

import type { RefObject } from "react";
import type { OwnerDishDetail } from "@/domain/dish";
import type { SameNamedPlace } from "../allergens/allergen-words";
import { groupIds, type AllergenTarget } from "../allergens/target";
import { useAllergenGroup } from "../allergens/useAllergenGroup";
import type { EditingStrings, TextWords } from "../editing/list-words";
import type { Editing } from "../editing/useEditing";
import {
  applyDishAllergens,
  setDishAllergenCheck,
  setDishAllergens,
  setDishOtherAllergens,
} from "./allergen-actions";
import type { DishStrings } from "./dish-words";

// The allergen group on a dish's page (D-148, D-149): the dish as the
// group's target. Its ids start with "dish-", its sentences name the dish,
// every write carries the lists the page showed and no words, since a
// dish's check covers its lists alone (D-148), and its same-named offer
// reaches dishes and options (D-129, D-166). The group itself, its state
// and its handlers, is useAllergenGroup, which an option shares (D-154).

type Props = {
  strings: DishStrings;
  editingStrings: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  // The page's one editing state.
  editing: Editing;
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
  editing,
  words,
  announce,
  focusNextRef,
  sameNamed,
}: Props) {
  const target: AllergenTarget = {
    ids: groupIds("dish"),
    subject: { id: dish.id, noun: "dish", name: dish.name },
    writes: {
      allergens: (allergens, shown) =>
        setDishAllergens(code, dish.id, allergens, shown),
      others: (others, shown) =>
        setDishOtherAllergens(code, dish.id, others, shown),
      check: (on, shown) => setDishAllergenCheck(code, dish.id, on, shown),
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
    },
  };
  return useAllergenGroup({
    strings: strings.allergens,
    editingStrings,
    editing,
    words,
    gone: strings.errors.parentGone,
    announce,
    focusNextRef,
    state: dish,
    target,
  });
}
