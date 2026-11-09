"use client";

import { useMemo } from "react";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { OwnerDishDetail } from "@/domain/dish";
import type { ScheduleCopy } from "@/domain/schedule";
import type { TimeCopy } from "@/domain/time";
import type { EditingStrings } from "../editing/list-words";
import { PageSavedStatus } from "../editing/SavedStatus";
import { useEditing } from "../editing/useEditing";
import { dishWords, type DishStrings } from "./dish-words";
import { DishAvailability } from "./DishAvailability";
import { DishSchedule } from "./DishSchedule";
import type { ShowingNow } from "./schedule-words";
import { tryAgainWith } from "./try-again";
import { useDishAvailability } from "./useDishAvailability";
import { useDishSchedule } from "./useDishSchedule";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  // What the server decided the dish's availability is at this render
  // (D-160), the restaurant's zone it decided it in, and its clock, which
  // every time-dependent line on the page reads.
  showing: ShowingNow;
  timeZone: string;
  lang: string;
  now: string;
  // The diner-facing schedule words, with the singular day names.
  scheduleCopy: ScheduleCopy;
  timeCopy: TimeCopy;
};

// A dish's Availability page (D-159, D-160, D-222): the three radios
// directly under the h1 that names them, the schedule under its own
// heading, then the saved status. Everything on it shares one queue and
// one status (D-111).
export function DishAvailabilityPage(props: Props) {
  return (
    <Announcer>
      <AvailabilityEditor {...props} />
    </Announcer>
  );
}

function AvailabilityEditor({
  strings,
  editing: editingStrings,
  code,
  dish,
  showing,
  timeZone,
  lang,
  now,
  scheduleCopy,
  timeCopy,
}: Props) {
  const announce = useAnnounce();
  const editing = useEditing(editingStrings);
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const availability = useDishAvailability({
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
  });
  const schedule = useDishSchedule({
    strings,
    code,
    dish,
    editing,
    words,
    announce,
    timeZone,
    lang,
    now,
    scheduleCopy,
    timeCopy,
  });

  return (
    <>
      <DishAvailability
        strings={strings.availability}
        availability={availability}
        underPageHeading
      />
      <DishSchedule
        strings={strings.schedule}
        dayNames={scheduleCopy.day}
        lang={lang}
        schedule={schedule}
      />
      <PageSavedStatus
        strings={editingStrings}
        editing={editing}
        onRetry={() =>
          tryAgainWith(editing, [availability.tryAgain, schedule.tryAgain])
        }
      />
    </>
  );
}
