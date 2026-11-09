"use client";

import { useMemo, useState } from "react";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { OwnerDishDetail } from "@/domain/dish";
import type { ScheduleCopy } from "@/domain/schedule";
import type { TimeCopy } from "@/domain/time";
import type { FormError } from "@/ui/Form";
import type { EditingStrings } from "../editing/list-words";
import { dishPagePath } from "./dish-pages";
import { dishWords, type DishStrings } from "./dish-words";
import { DishAvailability } from "./DishAvailability";
import { DishForm } from "./DishForm";
import { DishSchedule } from "./DishSchedule";
import type { AvailabilityPayload } from "./form-actions";
import type { SaveResult } from "./form-result";
import type { ShowingNow } from "./schedule-words";
import { AVAILABILITY_HEADING_ID } from "./showing-ids";
import { useAvailabilityForm } from "./useAvailabilityForm";
import { useDishForm } from "./useDishForm";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  // The hold's words (D-209).
  pendingLabel: string;
  code: string;
  dish: OwnerDishDetail;
  showing: ShowingNow;
  timeZone: string;
  lang: string;
  // The server's clock at the render, as an instant.
  now: string;
  scheduleCopy: ScheduleCopy;
  timeCopy: TimeCopy;
  // Save, bound to the restaurant and the dish.
  action: (payload: unknown) => Promise<SaveResult>;
};

// A dish's Availability page (D-159, D-160, D-222, D-229): one form, the
// three radios directly under the h1 that names them, the schedule under
// its own heading, and Save availability at the foot. Today only speaks
// through the page's log.
export function DishAvailabilityForm(props: Props) {
  return (
    <Announcer>
      <AvailabilityForm {...props} />
    </Announcer>
  );
}

function AvailabilityForm({
  strings,
  editing: editingStrings,
  pendingLabel,
  code,
  dish,
  showing,
  timeZone,
  lang,
  now,
  scheduleCopy,
  timeCopy,
  action,
}: Props) {
  const announce = useAnnounce();
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const page = useAvailabilityForm({
    strings,
    words,
    dish,
    showing,
    timeZone,
    lang,
    now,
    scheduleCopy,
    timeCopy,
    announce,
    errors,
  });
  const form = useDishForm<AvailabilityPayload>({
    action,
    notice: "availability-saved",
    path: dishPagePath(code, dish.id, "availability"),
    headingId: AVAILABILITY_HEADING_ID,
    dirty: page.dirty,
    errors,
    setErrors,
    failureOf: page.failureOf,
  });

  return (
    <DishForm
      strings={strings}
      pendingLabel={pendingLabel}
      submit={strings.availability.submit}
      form={form}
      onSubmit={() => form.submit(page.prepare())}
    >
      <DishAvailability
        strings={strings.availability}
        availability={page.availability}
        underPageHeading
      />
      <DishSchedule
        strings={strings.schedule}
        dayNames={scheduleCopy.day}
        lang={lang}
        schedule={page.schedule}
      />
    </DishForm>
  );
}
