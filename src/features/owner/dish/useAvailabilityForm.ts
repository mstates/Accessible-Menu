"use client";

import { useState } from "react";
import { fill } from "@/copy/fill";
import type { Availability } from "@/domain/availability";
import { formatDate, formatDayAndDate, todayIn } from "@/domain/date";
import type { OwnerDishDetail } from "@/domain/dish";
import { DAY_KEYS, type DayKey } from "@/domain/hours";
import {
  MONTH_KEYS,
  scheduleSentence,
  showingAt,
  showingSentence,
  WEEK_KEYS,
  type MonthKey,
  type Schedule,
  type ScheduleCopy,
  type WeekKey,
} from "@/domain/schedule";
import { formatTime, type TimeCopy } from "@/domain/time";
import type { FormError } from "@/ui/Form";
import {
  failureSentence,
  problemText,
  type TextWords,
} from "../editing/list-words";
import {
  validateAvailabilityForm,
  type AvailabilityFields,
} from "./availability-form";
import type { DishAvailabilityView } from "./DishAvailability";
import type { DishStrings } from "./dish-words";
import type { DishScheduleView, ScheduleFieldView } from "./DishSchedule";
import type { AvailabilityPayload } from "./form-actions";
import type { SaveRefused } from "./form-result";
import { availabilityLine, type ShowingNow } from "./schedule-words";
import {
  AVAILABILITY_HEADING_ID,
  AVAILABILITY_ID,
  SCHEDULE_IDS,
} from "./showing-ids";
import type { Prepared } from "./useDishForm";

// The Availability page's state, saving by one press (D-159, D-160, D-223,
// D-229): the three radios and the schedule's fields as typed, changed on
// the press and sent together by Save, which checks them first
// (availability-form.ts). The line under the radios says what the server
// decided the dish is now, while the chosen radio is the saved one; the
// Diners read line follows the saved schedule, with today in the
// restaurant's zone from the server's clock, never the browser's. Today
// only fills the two date fields and says so; Save keeps them.

type TextPart = "open" | "close" | "from" | "until";

type Props = {
  strings: DishStrings;
  // The dish's words, for problems said with the dish's name.
  words: TextWords;
  dish: OwnerDishDetail;
  showing: ShowingNow;
  timeZone: string;
  lang: string;
  // The server's clock at the render, as an instant.
  now: string;
  scheduleCopy: ScheduleCopy;
  timeCopy: TimeCopy;
  announce: (text: string) => void;
  errors: FormError[];
};

// The fields as the saved schedule fills them: times and dates in the
// words the page shows them in.
function fieldsOf(
  schedule: Schedule | null,
  lang: string,
  timeCopy: TimeCopy,
): AvailabilityFields {
  return {
    days: schedule?.days ?? [],
    weeks: schedule?.weeks ?? [],
    months: schedule?.months ?? [],
    open: schedule?.hours ? formatTime(schedule.hours.open, timeCopy) : "",
    close: schedule?.hours ? formatTime(schedule.hours.close, timeCopy) : "",
    from: schedule?.from ? formatDate(schedule.from, lang) : "",
    until: schedule?.until ? formatDate(schedule.until, lang) : "",
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameFields(a: AvailabilityFields, b: AvailabilityFields): boolean {
  return (
    sameList(a.days, b.days) &&
    sameList(a.weeks, b.weeks) &&
    sameList(a.months, b.months) &&
    a.open === b.open &&
    a.close === b.close &&
    a.from === b.from &&
    a.until === b.until
  );
}

export function useAvailabilityForm({
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
}: Props) {
  const copy = strings.schedule;
  const ids = SCHEDULE_IDS;
  const at = new Date(now);
  const today = todayIn(timeZone, at);
  const saved = fieldsOf(dish.schedule, lang, timeCopy);
  const [choice, setChoice] = useState<Availability>(showing.state);
  const [fields, setFields] = useState<AvailabilityFields>(() =>
    fieldsOf(dish.schedule, lang, timeCopy),
  );
  const dirty = choice !== showing.state || !sameFields(fields, saved);

  function errorOf(id: string): string | null {
    return errors.find((error) => error.id === id)?.message ?? null;
  }

  function setDay(key: DayKey, on: boolean) {
    setFields((current) => ({
      ...current,
      days: DAY_KEYS.filter((each) =>
        each === key ? on : current.days.includes(each),
      ),
    }));
  }

  function setWeek(key: WeekKey, on: boolean) {
    setFields((current) => ({
      ...current,
      weeks: WEEK_KEYS.filter((each) =>
        each === key ? on : current.weeks.includes(each),
      ),
    }));
  }

  function setMonth(key: MonthKey, on: boolean) {
    setFields((current) => ({
      ...current,
      months: MONTH_KEYS.filter((each) =>
        each === key ? on : current.months.includes(each),
      ),
    }));
  }

  function setText(part: TextPart, value: string) {
    setFields((current) => {
      const next = { ...current };
      next[part] = value;
      return next;
    });
  }

  // Today only (D-159): both date fields take today, and the page says so;
  // Save keeps it. Focus stays on the button.
  function setToday() {
    const date = formatDate(today, lang);
    setFields((current) => ({ ...current, from: date, until: date }));
    announce(
      fill(copy.todayOnlyFilled, {
        date: formatDayAndDate(today, today, lang),
      }),
    );
  }

  function text(id: string, part: TextPart): ScheduleFieldView {
    return {
      id,
      value: fields[part],
      error: errorOf(id),
      onChange: (value: string) => setText(part, value),
    };
  }

  const availability: DishAvailabilityView = {
    id: AVAILABILITY_ID,
    headingId: AVAILABILITY_HEADING_ID,
    value: choice,
    set: setChoice,
    // The line says what the server decided; while another choice is
    // ticked it says nothing, and the page that follows the save brings
    // the new line.
    description:
      choice === showing.state
        ? availabilityLine(
            strings.availability,
            showing,
            timeZone,
            lang,
            timeCopy,
            now,
          )
        : undefined,
    error: null,
  };

  const schedule: DishScheduleView = {
    ids,
    days: {
      keys: DAY_KEYS,
      shown: fields.days,
      set: setDay,
      errorOf: () => null,
    },
    weeks: {
      keys: WEEK_KEYS,
      shown: fields.weeks,
      set: setWeek,
      errorOf: (key) => errorOf(ids.week(key)),
    },
    months: {
      keys: MONTH_KEYS,
      shown: fields.months,
      set: setMonth,
      errorOf: () => null,
    },
    hours: { open: text(ids.open, "open"), close: text(ids.close, "close") },
    from: text(ids.from, "from"),
    until: text(ids.until, "until"),
    today: { id: ids.today, set: setToday },
    sentence: dish.schedule
      ? scheduleSentence(dish.schedule, today, lang, scheduleCopy, timeCopy)
      : null,
    showing: dish.schedule
      ? showingSentence(
          showingAt(dish.schedule, at, timeZone),
          dish.schedule,
          at,
          timeZone,
          lang,
          copy,
          timeCopy,
        )
      : null,
  };

  // What Save sends, or the problems that stop it, in page order.
  function prepare(): Prepared<AvailabilityPayload> {
    const check = validateAvailabilityForm(fields, today);
    if (check.problems.length > 0) {
      return {
        problems: check.problems.map((problem) => ({
          id: problem.id,
          message: copy.errors[problem.rule],
        })),
      };
    }
    return {
      payload: {
        choice,
        shownState: showing.state,
        fields: {
          days: [...fields.days],
          weeks: [...fields.weeks],
          months: [...fields.months],
          open: fields.open,
          close: fields.close,
          from: fields.from,
          until: fields.until,
        },
        today,
        shownSchedule: dish.schedule,
      },
    };
  }

  function failureOf(result: SaveRefused): string {
    if (result.status === "moved") return copy.scheduleMoved;
    return failureSentence(
      fill(strings.availability.notSaved, { dish: dish.name }),
      problemText(words, result.problem, dish.name),
    );
  }

  return { availability, schedule, dirty, prepare, failureOf };
}
