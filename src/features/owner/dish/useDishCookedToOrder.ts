"use client";

import { startTransition, useOptimistic } from "react";
import { fill } from "@/copy/fill";
import type { OwnerDishDetail } from "@/domain/dish";
import { useConfirmed } from "../editing/confirmed";
import {
  failureSentence,
  problemText,
  type TextWords,
} from "../editing/list-words";
import type { Editing } from "../editing/useEditing";
import { setDishCookedToOrder } from "./actions";
import type { DishStrings } from "./dish-words";

// The Cooked to order box on a dish's page (D-167, task 7): one box that
// saves at once through the page's queue, "Saved." once when it lands
// (D-118), and goes back by itself when the save fails, with one sentence
// and Try again. The last write wins, as Availability's does.

type Props = {
  strings: DishStrings;
  code: string;
  dish: OwnerDishDetail;
  // The page's one editing state.
  editing: Editing;
  // The dish's words, for problems said with the dish's name.
  words: TextWords;
};

export const COOKED_TO_ORDER_ID = "dish-cooked-to-order";
export const COOKED_TO_ORDER_HEADING_ID = "dish-cooked-to-order-heading";
const KEY = "cooked-to-order";

export function useDishCookedToOrder({
  strings,
  code,
  dish,
  editing,
  words,
}: Props) {
  const copy = strings.cookedToOrder;
  const confirmedRef = useConfirmed(dish.cookedToOrder);
  const [shown, show] = useOptimistic(
    dish.cookedToOrder,
    (_current: boolean, next: boolean) => next,
  );

  function set(on: boolean, force = false) {
    editing.sending(KEY, on ? "on" : "off");
    startTransition(async () => {
      show(on);
      await editing.run(async () => {
        if (!force && confirmedRef.current === on) {
          editing.answered(KEY);
          return;
        }
        const result = await editing.call(() =>
          setDishCookedToOrder(code, dish.id, on),
        );
        editing.answered(KEY);
        if (!result.ok) {
          const text = problemText(words, result.problem, dish.name);
          editing.failField(KEY, {
            fieldId: COOKED_TO_ORDER_ID,
            problem: text,
            sentence: failureSentence(
              fill(copy.notSaved, { dish: dish.name }),
              text,
            ),
            value: on ? "on" : "off",
          });
          return;
        }
        editing.landedField(KEY, null);
        confirmedRef.current = result.value.cookedToOrder;
      });
    });
  }

  // Sends a failed tick again, with the value that failed.
  function tryAgain(key: string, failedValue: string): boolean {
    if (key !== KEY) return false;
    set(failedValue === "on", true);
    return true;
  }

  return {
    id: COOKED_TO_ORDER_ID,
    headingId: COOKED_TO_ORDER_HEADING_ID,
    shown,
    set,
    error: editing.failures[KEY]?.problem ?? null,
    tryAgain,
  };
}

export type DishCookedToOrderState = ReturnType<typeof useDishCookedToOrder>;
