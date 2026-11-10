"use client";

import { fill } from "@/copy/fill";
import type { DayKey } from "@/domain/hours";
import { monthName, type MonthKey, type WeekKey } from "@/domain/schedule";
import { Button } from "@/ui/Button";
import { Checkbox, CheckboxGroup } from "@/ui/CheckboxGroup";
import { TextField } from "@/ui/TextField";
import { handToBox } from "../editing/hand-to-box";
import type { DishStrings } from "./dish-words";
import type { SCHEDULE_IDS } from "./showing-ids";

// One typed field of the schedule, as the form holds it (D-229): its id,
// its text as typed, and the problem Save found with it, if any.
export type ScheduleFieldView = {
  id: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
};

type ListView<Key extends string> = {
  keys: readonly Key[];
  shown: readonly Key[];
  set: (key: Key, on: boolean) => void;
  errorOf: (key: Key) => string | null;
};

// What the component draws: the schedule's lists, its typed fields, Today
// only, and the two lines under the group, the sentence diners read from
// the saved schedule and when the special next shows.
export type DishScheduleView = {
  ids: typeof SCHEDULE_IDS;
  days: ListView<DayKey>;
  weeks: ListView<WeekKey>;
  months: ListView<MonthKey>;
  hours: { open: ScheduleFieldView; close: ScheduleFieldView };
  from: ScheduleFieldView;
  until: ScheduleFieldView;
  today: { id: string; set: () => void };
  sentence: string | null;
  showing: string | null;
};

type Props = {
  strings: DishStrings["schedule"];
  // The singular day names, the hours grid's.
  dayNames: Readonly<Record<string, string>>;
  lang: string;
  schedule: DishScheduleView;
};

type BoxesProps<Key extends string> = {
  label: string;
  nameOf: (key: Key) => string;
  idOf: (key: Key) => string;
  list: ListView<Key>;
};

// A group of boxes for one list of the schedule: each box in a wrapper
// that takes a problem's focus and hands it to the box, with its problem
// under it while one stands.
function Boxes<Key extends string>({
  label,
  nameOf,
  idOf,
  list,
}: BoxesProps<Key>) {
  const ticked = new Set<string>(list.shown);
  return (
    <CheckboxGroup
      label={label}
      value={[...list.shown]}
      onChange={(values) => {
        const next = new Set(values);
        for (const key of list.keys) {
          if (ticked.has(key) !== next.has(key)) list.set(key, next.has(key));
        }
      }}
    >
      {list.keys.map((key) => {
        const error = list.errorOf(key);
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
// share one hint by id, the hours grid's pattern (D-105), and each date
// field has its own the same way; while a problem stands the field is
// described by its problem alone, the hint still shown (D-230). The Hours
// group itself is not described by the hint: its fields are, and the hint
// is read inside it. A group's hint is a lead before it, since a
// description on the group would be read with every box. Everything saves
// by the page's one Save (D-223, D-229).
export function DishSchedule({ strings, dayNames, lang, schedule }: Props) {
  const { ids } = schedule;
  const line = schedule.sentence
    ? `${fill(strings.dinersRead, { sentence: `"${schedule.sentence}"` })}${
        schedule.showing ? ` ${schedule.showing}` : ""
      }`
    : strings.none;
  const time = (field: ScheduleFieldView, label: string) => (
    <TextField
      id={field.id}
      label={label}
      value={field.value}
      onChange={field.onChange}
      autoComplete="off"
      hintId={ids.hoursHint}
      isInvalid={field.error ? true : undefined}
      errorMessage={field.error ?? undefined}
    />
  );
  // A date field's hint sits under it, tied by id as the hours' is, and
  // not read while a problem stands (D-230).
  const date = (field: ScheduleFieldView, label: string) => (
    <div className="flex flex-col gap-1">
      <TextField
        id={field.id}
        label={label}
        value={field.value}
        onChange={field.onChange}
        autoComplete="off"
        hintId={`${field.id}-hint`}
        isInvalid={field.error ? true : undefined}
        errorMessage={field.error ?? undefined}
      />
      <p id={`${field.id}-hint`} className="text-sm text-foreground-muted">
        {strings.dateHint}
      </p>
    </div>
  );
  return (
    <div className="mt-8 flex flex-col gap-6">
      <h2 id={ids.heading} className="text-xl font-bold">
        {strings.heading}
      </h2>
      <p className="text-foreground-muted">{strings.lead}</p>

      <Boxes
        label={strings.daysLabel}
        nameOf={(key) => dayNames[key] ?? key}
        idOf={ids.day}
        list={schedule.days}
      />

      <fieldset id={ids.hours} className="flex flex-col gap-4">
        <legend className="font-semibold">{strings.hoursLabel}</legend>
        <p id={ids.hoursHint} className="text-sm text-foreground-muted">
          {strings.hoursHint}
        </p>
        {time(schedule.hours.open, strings.starts)}
        {time(schedule.hours.close, strings.ends)}
      </fieldset>

      <div>
        <Button id={ids.today} onPress={schedule.today.set}>
          {strings.todayOnly}
        </Button>
      </div>

      {date(schedule.from, strings.firstDay)}
      {date(schedule.until, strings.lastDay)}

      <p className="text-foreground-muted">{strings.weeksLead}</p>
      <Boxes
        label={strings.weeksLabel}
        nameOf={(key) => strings.weeks[key]}
        idOf={ids.week}
        list={schedule.weeks}
      />

      <p className="text-foreground-muted">{strings.monthsLead}</p>
      <Boxes
        label={strings.monthsLabel}
        nameOf={(key) => monthName(key, lang)}
        idOf={ids.month}
        list={schedule.months}
      />

      <p id={ids.sentence}>{line}</p>
    </div>
  );
}
