"use client";

import { startTransition, useOptimistic } from "react";
import { fill } from "@/copy/fill";
import type { OwnerDishDetail } from "@/domain/dish";
import { useConfirmed } from "../editing/confirmed";
import {
  failureSentence,
  problemText,
  undoOutcome,
  type EditingStrings,
  type TextWords,
} from "../editing/list-words";
import type { TextEditor } from "../editing/texts";
import { pushUndo } from "../editing/undo";
import { setDishCookedToOrder } from "./actions";
import {
  cookedToOrderUndoneSentence,
  type CookedToOrderUndo,
  type DishStrings,
  type DishUndo,
} from "./dish-words";
import type { Reversed } from "./schedule-words";

// The Cooked to order box on a dish's page (D-167, task 7): one box that
// saves at once through the page's queue, "Saved." once when it lands
// (D-118), and goes back by itself when the save fails, with one sentence
// and Try again. The last write wins, as Availability's does. Undo puts the
// mark back only while the dish still holds the mark the change left.

type Props = {
  strings: DishStrings;
  editingStrings: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  editor: TextEditor<DishUndo>;
  // The dish's words, for problems said with the dish's name.
  words: TextWords;
};

export const COOKED_TO_ORDER_ID = "dish-cooked-to-order";
export const COOKED_TO_ORDER_HEADING_ID = "dish-cooked-to-order-heading";
const KEY = "cooked-to-order";

export function useDishCookedToOrder({
  strings,
  editingStrings,
  code,
  dish,
  editor,
  words,
}: Props) {
  const { editing } = editor;
  const copy = strings.cookedToOrder;
  const confirmedRef = useConfirmed(dish.cookedToOrder);
  const [shown, show] = useOptimistic(
    dish.cookedToOrder,
    (_current: boolean, next: boolean) => next,
  );

  function record(entry: DishUndo) {
    editor.undo.replace(pushUndo(editor.undo.peek(), entry));
  }

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
        record({
          kind: "cooked-to-order",
          id: dish.id,
          name: dish.name,
          on: result.value.cookedToOrder,
        });
      });
    });
  }

  // The inverse of a tick: the mark as it was, while the dish still holds
  // the mark the tick left.
  async function reverse(entry: CookedToOrderUndo): Promise<Reversed> {
    const result = await editing.call(() =>
      setDishCookedToOrder(code, dish.id, !entry.on, entry.on),
    );
    if (!result.ok) {
      if (result.problem.kind === "changed") {
        return { ok: false, outcome: "stale", sentence: editingStrings.stale };
      }
      return {
        ok: false,
        outcome: undoOutcome(result.problem),
        sentence: failureSentence(
          editingStrings.notUndone,
          problemText(words, result.problem, dish.name),
        ),
      };
    }
    confirmedRef.current = result.value.cookedToOrder;
    return { ok: true, sentence: cookedToOrderUndoneSentence(strings, entry) };
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
    reverse,
    tryAgain,
  };
}

export type DishCookedToOrderState = ReturnType<typeof useDishCookedToOrder>;
