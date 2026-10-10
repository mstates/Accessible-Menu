"use client";

import { startTransition, useOptimistic } from "react";
import { fill } from "@/copy/fill";
import { soldOutEnd, type Availability } from "@/domain/availability";
import type { OwnerDishDetail } from "@/domain/dish";
import type { Hours } from "@/domain/hours";
import type { TimeCopy } from "@/domain/time";
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
import { setDishAvailability } from "./actions";
import type { DishStrings, DishUndo } from "./dish-words";
import {
  availabilityLine,
  availabilityUndoneSentence,
  type AvailabilityUndo,
  type Reversed,
  type ShowingNow,
} from "./schedule-words";

// Availability on a dish's page (D-160, task 5): three radios that save on
// change, as the price choice does (D-143), through the page's queue, with
// "Saved." once when the save lands (D-118). What the choice means now is
// the server's reading (domain/availability.ts), handed in as showing;
// the line under the radios comes from it alone, so a mark whose end has
// passed never reads as sold out. Undo writes the previous row back
// exactly, while the dish still holds the row the change left, and is
// stale once a restored mark would already have ended.

type Props = {
  strings: DishStrings;
  editingStrings: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  editor: TextEditor<DishUndo>;
  words: TextWords;
  showing: ShowingNow;
  hours: Hours | null;
  timeZone: string;
  lang: string;
  // The server's clock at the render, as an instant.
  now: string;
  timeCopy: TimeCopy;
};

export const AVAILABILITY_ID = "dish-availability";
export const AVAILABILITY_HEADING_ID = "dish-availability-heading";
const KEY = "availability";

function isChoice(value: string): value is Availability {
  return value === "available" || value === "sold-out" || value === "off";
}

export function useDishAvailability({
  strings,
  editingStrings,
  code,
  dish,
  editor,
  words,
  showing,
  hours,
  timeZone,
  lang,
  now,
  timeCopy,
}: Props) {
  const { editing } = editor;
  const copy = strings.availability;
  // The row as the server holds it and the choice it read from it, read
  // when the queue sends, so an Undo entry remembers the row that stood.
  const confirmedRef = useConfirmed({
    choice: showing.state,
    available: dish.available,
    soldOutAt: dish.soldOutAt,
  });
  const [shownChoice, showChoice] = useOptimistic(
    showing.state,
    (_current: Availability, next: Availability) => next,
  );

  function record(entry: DishUndo) {
    editor.undo.replace(pushUndo(editor.undo.peek(), entry));
  }

  function setChoice(next: Availability, force = false) {
    if (next === showing.state && !force) {
      editing.reset(KEY);
      return;
    }
    editing.sending(KEY, next);
    startTransition(async () => {
      showChoice(next);
      await editing.run(async () => {
        const before = confirmedRef.current;
        const result = await editing.call(() =>
          setDishAvailability(code, dish.id, next),
        );
        editing.answered(KEY);
        if (!result.ok) {
          const text = problemText(words, result.problem, dish.name);
          editing.failField(KEY, {
            fieldId: AVAILABILITY_ID,
            problem: text,
            sentence: failureSentence(
              fill(copy.notSaved, { dish: dish.name }),
              text,
            ),
            value: next,
          });
          return;
        }
        editing.landedField(KEY, null);
        record({
          kind: "availability",
          id: dish.id,
          name: dish.name,
          from: before,
          to: {
            choice: next,
            available: result.value.available,
            soldOutAt: result.value.soldOutAt,
          },
        });
      });
    });
  }

  // The inverse of a choice: the row as it was, while the dish still holds
  // the row the choice left. A sold-out mark that has ended on its own is
  // not put back: the dish already reads as available.
  async function reverse(entry: AvailabilityUndo): Promise<Reversed> {
    if (entry.from.soldOutAt !== null) {
      const ends = soldOutEnd(new Date(entry.from.soldOutAt), hours, timeZone);
      if (ends.getTime() <= Date.now()) {
        return {
          ok: false,
          outcome: "stale",
          sentence: copy.undo.soldOutEnded,
        };
      }
    }
    const result = await editing.call(() =>
      setDishAvailability(
        code,
        dish.id,
        entry.from.choice,
        { available: entry.from.available, soldOutAt: entry.from.soldOutAt },
        { available: entry.to.available, soldOutAt: entry.to.soldOutAt },
      ),
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
    return { ok: true, sentence: availabilityUndoneSentence(copy, entry) };
  }

  function tryAgain(key: string, failedValue: string): boolean {
    if (key !== KEY) return false;
    if (isChoice(failedValue)) setChoice(failedValue, true);
    return true;
  }

  return {
    id: AVAILABILITY_ID,
    headingId: AVAILABILITY_HEADING_ID,
    value: shownChoice,
    set: setChoice,
    error: editing.failures[KEY]?.problem ?? null,
    // The line says what the server decided; while a choice is on its way
    // it says nothing, and the refreshed page brings the new line.
    description:
      shownChoice === showing.state
        ? availabilityLine(copy, showing, timeZone, lang, timeCopy, now)
        : undefined,
    reverse,
    tryAgain,
  };
}

export type DishAvailabilityState = ReturnType<typeof useDishAvailability>;
