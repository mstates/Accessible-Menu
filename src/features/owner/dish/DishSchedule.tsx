"use client";

import { useRef } from "react";
import { fill } from "@/copy/fill";
import { monthName } from "@/domain/schedule";
import { Button } from "@/ui/Button";
import { Checkbox, CheckboxGroup } from "@/ui/CheckboxGroup";
import { AutosaveTextField } from "../editing/AutosaveTextField";
import { handToBox } from "../editing/hand-to-box";
import type { DishStrings } from "./dish-words";
import type { DishScheduleState } from "./useDishSchedule";

type Props = {
  strings: DishStrings["schedule"];
  // The singular day names, the hours grid's.
  dayNames: Readonly<Record<string, string>>;
  lang: string;
  schedule: DishScheduleState;
};

type BoxesProps<Key extends string> = {
  label: string;
  keys: readonly Key[];
  nameOf: (key: Key) => string;
  idOf: (key: Key) => string;
  shown: readonly Key[];
  set: (key: Key, on: boolean) => void;
  errorOf: (key: Key) => string | null;
};

// A group of boxes for one list of the schedule: each box in a wrapper
// that takes a failed save's focus and hands it to the box, with its error
// under it while one stands.
function Boxes<Key extends string>({
  label,
  keys,
  nameOf,
  idOf,
  shown,
  set,
  errorOf,
}: BoxesProps<Key>) {
  const ticked = new Set<string>(shown);
  return (
    <CheckboxGroup
      label={label}
      value={[...shown]}
      onChange={(values) => {
        const next = new Set(values);
        for (const key of keys) {
          if (ticked.has(key) !== next.has(key)) set(key, next.has(key));
        }
      }}
    >
      {keys.map((key) => {
        const error = errorOf(key);
        const errorId = `${idOf(key)}-error`;
        return (
          <div
            key={key}
            id={idOf(key)}
            role="presentation"
            tabIndex={-1}
            className="flex flex-col outline-none"
            onFocus={handToBox}
          >
            <Checkbox
              value={key}
              aria-describedby={error ? errorId : undefined}
              validationBehavior="aria"
              isInvalid={error ? true : undefined}
            >
              {nameOf(key)}
            </Checkbox>
            {error ? (
              <span id={errorId} className="pl-9 text-sm font-semibold">
                {error}
              </span>
            ) : null}
          </div>
        );
      })}
    </CheckboxGroup>
  );
}

// The schedule (D-159, task 5), under its own heading (D-128): the lead,
// then days, hours, and Today only first (Michael), then the first and
// last day, the weeks of the month with their lead, and the months of the
// year with theirs; under the group, the sentence diners read and when the
// special next shows, or that there is no schedule. The two time fields
// share one hint by id, the hours grid's pattern (D-105), and commit
// together: Tab from one to the other sends nothing. A group's hint is a
// lead before it, since a description on the group would be read with
// every box.
export function DishSchedule({ strings, dayNames, lang, schedule }: Props) {
  const { ids } = schedule;
  const hoursRef = useRef<HTMLFieldSetElement>(null);
  const line = schedule.sentence
    ? `${fill(strings.dinersRead, { sentence: `"${schedule.sentence}"` })}${
        schedule.showing ? ` ${schedule.showing}` : ""
      }`
    : strings.none;
  return (
    <div className="mt-8 flex flex-col gap-6">
      <h2 id={ids.heading} className="text-xl font-bold">
        {strings.heading}
      </h2>
      <p className="text-foreground-muted">{strings.lead}</p>

      <Boxes
        label={strings.daysLabel}
        keys={schedule.days.keys}
        nameOf={(key) => dayNames[key] ?? key}
        idOf={ids.day}
        shown={schedule.days.shown}
        set={schedule.days.set}
        errorOf={schedule.days.errorOf}
      />

      <fieldset
        id={ids.hours}
        ref={hoursRef}
        aria-describedby={ids.hoursHint}
        className="flex flex-col gap-4"
      >
        <legend className="font-semibold">{strings.hoursLabel}</legend>
        <p id={ids.hoursHint} className="text-sm text-foreground-muted">
          {strings.hoursHint}
        </p>
        <AutosaveTextField
          {...schedule.hours.open}
          label={strings.starts}
          aria-describedby={ids.hoursHint}
          commitWithin={hoursRef}
        />
        <AutosaveTextField
          {...schedule.hours.close}
          label={strings.ends}
          aria-describedby={ids.hoursHint}
          commitWithin={hoursRef}
        />
      </fieldset>

      <div>
        <Button id={ids.today} onPress={schedule.today.set}>
          {strings.todayOnly}
        </Button>
      </div>

      <AutosaveTextField
        {...schedule.from}
        label={strings.firstDay}
        description={strings.dateHint}
      />
      <AutosaveTextField
        {...schedule.until}
        label={strings.lastDay}
        description={strings.dateHint}
      />

      <p className="text-foreground-muted">{strings.weeksLead}</p>
      <Boxes
        label={strings.weeksLabel}
        keys={schedule.weeks.keys}
        nameOf={(key) => strings.weeks[key]}
        idOf={ids.week}
        shown={schedule.weeks.shown}
        set={schedule.weeks.set}
        errorOf={schedule.weeks.errorOf}
      />

      <p className="text-foreground-muted">{strings.monthsLead}</p>
      <Boxes
        label={strings.monthsLabel}
        keys={schedule.months.keys}
        nameOf={(key) => monthName(key, lang)}
        idOf={ids.month}
        shown={schedule.months.shown}
        set={schedule.months.set}
        errorOf={schedule.months.errorOf}
      />

      <p id={ids.sentence}>{line}</p>
    </div>
  );
}
