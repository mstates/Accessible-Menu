"use client";

import { startTransition, useOptimistic } from "react";
import { fill } from "@/copy/fill";
import type { Availability } from "@/domain/availability";
import type { OwnerDishDetail } from "@/domain/dish";
import type { TimeCopy } from "@/domain/time";
import {
  failureSentence,
  problemText,
  type TextWords,
} from "../editing/list-words";
import type { Editing } from "../editing/useEditing";
import { setDishAvailability } from "./actions";
import { DISH_PAGE_HEADING_IDS } from "./dish-pages";
import type { DishStrings } from "./dish-words";
import { availabilityLine, type ShowingNow } from "./schedule-words";

// Availability on a dish's page (D-160, task 5): three radios that save on
// change, as the price choice does (D-143), through the page's queue, with
// "Saved." once when the save lands (D-118). What the choice means now is
// the server's reading (domain/availability.ts), handed in as showing;
// the line under the radios comes from it alone, so a mark whose end has
// passed never reads as sold out.

type Props = {
  strings: DishStrings;
  code: string;
  dish: OwnerDishDetail;
  // The page's one editing state.
  editing: Editing;
  words: TextWords;
  showing: ShowingNow;
  timeZone: string;
  lang: string;
  // The server's clock at the render, as an instant.
  now: string;
  timeCopy: TimeCopy;
};

export const AVAILABILITY_ID = "dish-availability";
// The heading's id is the page's (dish-pages.ts, D-225): on the
// Availability page the h1 is the group's heading.
export const AVAILABILITY_HEADING_ID = DISH_PAGE_HEADING_IDS.availability;
const KEY = "availability";

function isChoice(value: string): value is Availability {
  return value === "available" || value === "sold-out" || value === "off";
}

export function useDishAvailability({
  strings,
  code,
  dish,
  editing,
  words,
  showing,
  timeZone,
  lang,
  now,
  timeCopy,
}: Props) {
  const copy = strings.availability;
  const [shownChoice, showChoice] = useOptimistic(
    showing.state,
    (_current: Availability, next: Availability) => next,
  );

  function setChoice(next: Availability, force = false) {
    if (next === showing.state && !force) {
      editing.reset(KEY);
      return;
    }
    editing.sending(KEY, next);
    startTransition(async () => {
      showChoice(next);
      await editing.run(async () => {
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
      });
    });
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
    tryAgain,
  };
}

export type DishAvailabilityState = ReturnType<typeof useDishAvailability>;
