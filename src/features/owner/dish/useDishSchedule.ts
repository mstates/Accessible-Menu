"use client";

import { startTransition, useOptimistic } from "react";
import { fill } from "@/copy/fill";
import {
  formatDate,
  formatDayAndDate,
  parseDate,
  todayIn,
} from "@/domain/date";
import type { OwnerDishDetail } from "@/domain/dish";
import {
  DAY_KEYS,
  isDayKey,
  type DayKey,
  type TimeRange,
} from "@/domain/hours";
import {
  MONTH_KEYS,
  monthName,
  normalizeSchedule,
  sameSchedule,
  scheduleSentence,
  showingAt,
  showingSentence,
  WEEK_KEYS,
  type MonthKey,
  type Schedule,
  type ScheduleCopy,
  type WeekKey,
} from "@/domain/schedule";
import { formatTime, parseTime, type TimeCopy } from "@/domain/time";
import { useConfirmed } from "../editing/confirmed";
import {
  failureSentence,
  problemText,
  undoOutcome,
  type EditingStrings,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";
import type { TextEditor } from "../editing/texts";
import { pushUndo } from "../editing/undo";
import type { DishStrings, DishUndo } from "./dish-words";
import { setDishSchedule } from "./schedule-actions";
import {
  scheduleUndoneSentence,
  type BoxName,
  type Reversed,
  type SchedulePart,
  type ScheduleUndo,
} from "./schedule-words";

// The schedule on a dish's page (D-159, task 5): five optional parts under
// one heading, each its own control, all one column. Every write sends the
// whole schedule, in its fixed shape, and carries the schedule the page
// last showed, read when the queue sends it; it lands only if the dish
// still holds that one (D-149's rule, widened to the schedule at the
// plan), else a miss writes nothing, the refreshed page shows the schedule
// as it is now, and one sentence says so, with no Try again. A box saves
// at once; the two time fields are one commit unit under one key, since
// "Saved." is said per key (D-118); a date field saves when it is left;
// Today only is a press with its own sentence, as an add is. Rules the
// page can read are refused unsent, under the field, and the hours pair
// on both sides at once when both are wrong, said once together, Starts
// first (D-164). Unticking the last day takes the weeks with it and says
// so. Under the group, the sentence diners read and when the special next
// shows, from the one builder (module rule 8), with today in the
// restaurant's zone from the server's clock, never the browser's.

type Props = {
  strings: DishStrings;
  editingStrings: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  editor: TextEditor<DishUndo>;
  words: TextWords;
  announce: (text: string) => void;
  timeZone: string;
  lang: string;
  // The server's clock at the render, as an instant.
  now: string;
  scheduleCopy: ScheduleCopy;
  timeCopy: TimeCopy;
};

export const SCHEDULE_IDS = {
  heading: "dish-schedule-heading",
  sentence: "dish-schedule-sentence",
  hours: "dish-schedule-hours",
  hoursHint: "dish-schedule-hours-hint",
  open: "dish-schedule-hours-open",
  close: "dish-schedule-hours-close",
  today: "dish-schedule-today",
  from: "dish-schedule-from",
  until: "dish-schedule-until",
  day: (key: DayKey) => `dish-schedule-day-${key}`,
  week: (key: WeekKey) => `dish-schedule-week-${key}`,
  month: (key: MonthKey) => `dish-schedule-month-${key}`,
} as const;

const HOURS_KEY = "schedule:hours";
const FROM_KEY = "schedule:from";
const UNTIL_KEY = "schedule:until";
const TODAY_KEY = "schedule:today";
const dayKey = (key: DayKey) => `schedule:day:${key}`;
const weekKey = (key: WeekKey) => `schedule:week:${key}`;
const monthKey = (key: MonthKey) => `schedule:month:${key}`;

type BoxPart = "days" | "weeks" | "months";

// One side of the hours pair that cannot be sent, and why.
type PairProblem = {
  fieldId: string;
  rule: keyof DishStrings["schedule"]["errors"];
};

function isWeekKey(value: string): value is WeekKey {
  return (WEEK_KEYS as readonly string[]).includes(value);
}

function isMonthKey(value: string): value is MonthKey {
  return (MONTH_KEYS as readonly string[]).includes(value);
}

// The two typed times travel as one draft, open then close.
function splitPair(draft: string): [string, string] {
  const at = draft.indexOf("\n");
  return at === -1 ? [draft, ""] : [draft.slice(0, at), draft.slice(at + 1)];
}

function joinPair(open: string, close: string): string {
  return `${open}\n${close}`;
}

// A list with one key on or off.
function withKey<Key extends string>(
  list: readonly Key[] | undefined,
  key: Key,
  on: boolean,
): Key[] {
  const set = new Set(list ?? []);
  if (on) set.add(key);
  else set.delete(key);
  return [...set];
}

export function useDishSchedule({
  strings,
  editingStrings,
  code,
  dish,
  editor,
  words,
  announce,
  timeZone,
  lang,
  now,
  scheduleCopy,
  timeCopy,
}: Props) {
  const { editing } = editor;
  const copy = strings.schedule;
  const ids = SCHEDULE_IDS;
  const at = new Date(now);
  const today = todayIn(timeZone, at);
  const confirmedRef = useConfirmed(dish.schedule);
  const [shown, show] = useOptimistic(
    dish.schedule,
    (
      current: Schedule | null,
      patch: (s: Schedule | null) => Schedule | null,
    ) => patch(current),
  );

  const boxName: BoxName = (part, key) => {
    if (part === "days" && isDayKey(key)) return scheduleCopy.day[key];
    if (part === "weeks" && isWeekKey(key)) return copy.weeks[key];
    if (part === "months" && isMonthKey(key)) return monthName(key, lang);
    return key;
  };

  function record(entry: DishUndo) {
    editor.undo.replace(pushUndo(editor.undo.peek(), entry));
  }

  // What went wrong, in words: the schedule's own rules first.
  function problemOf(problem: ListProblem): string {
    if (problem.kind === "invalid") {
      const rules: Readonly<Record<string, string>> = copy.errors;
      const rule = rules[problem.rule];
      if (rule) return rule;
    }
    return problemText(words, problem, dish.name);
  }

  // Refuses a change before it is sent, under its control, said once.
  function refuseUnsent(
    key: string,
    part: SchedulePart,
    fieldId: string,
    rule: keyof typeof copy.errors,
    value: string,
  ) {
    editing.failField(key, {
      fieldId,
      problem: copy.errors[rule],
      sentence: failureSentence(
        fill(copy.notSaved[part], { dish: dish.name }),
        copy.errors[rule],
      ),
      value,
    });
  }

  // Refuses the hours pair before it is sent, with every problem at once,
  // each under its own field, said once together, Starts first (D-164).
  function refusePair(problems: readonly PairProblem[], value: string) {
    const [first, ...rest] = problems;
    if (!first) return;
    editing.failField(HOURS_KEY, {
      fieldId: first.fieldId,
      problem: copy.errors[first.rule],
      ...(rest.length > 0
        ? {
            others: rest.map((problem) => ({
              fieldId: problem.fieldId,
              problem: copy.errors[problem.rule],
            })),
          }
        : {}),
      sentence: failureSentence(
        fill(copy.notSaved.hours, { dish: dish.name }),
        problems.map((problem) => copy.errors[problem.rule]).join(" "),
      ),
      value,
    });
  }

  // The one send path. Runs inside the queue. Answers whether it landed.
  async function send(
    key: string,
    part: SchedulePart,
    next: Schedule | null,
    before: Schedule | null,
    failure: { fieldId: string; typed: string | null },
    extra: { box?: string; on?: boolean; cleared?: boolean } = {},
  ): Promise<boolean> {
    const result = await editing.call(() =>
      setDishSchedule(code, dish.id, next, before),
    );
    editing.answered(key);
    if (!result.ok) {
      if (result.problem.kind === "schedule-changed") {
        editing.dropField(key);
        editing.failChange(copy.scheduleMoved);
        return false;
      }
      const text = problemOf(result.problem);
      const sentence = failureSentence(
        fill(copy.notSaved[part], { dish: dish.name }),
        text,
      );
      if (part === "today") editing.failChange(sentence);
      else {
        editing.failField(key, {
          fieldId: failure.fieldId,
          problem: text,
          sentence,
          value: failure.typed ?? (extra.on ? "on" : "off"),
        });
      }
      return false;
    }
    if (part === "today") {
      // The press fills the two date fields: what was typed in them goes,
      // and the press says its own sentence, as an add does (D-118).
      editing.dropField(FROM_KEY);
      editing.dropField(UNTIL_KEY);
      editing.landed();
      announce(
        fill(copy.todayOnlySet, {
          date: formatDayAndDate(today, today, lang),
        }),
      );
    } else {
      editing.landedField(key, failure.typed);
    }
    confirmedRef.current = result.value.schedule;
    record({
      kind: "schedule",
      id: dish.id,
      name: dish.name,
      part,
      ...(extra.box !== undefined ? { box: extra.box, on: extra.on } : {}),
      from: before,
      to: result.value.schedule,
    });
    if (extra.cleared) announce(copy.weeksCleared);
    return true;
  }

  // A day, week, or month box. A week with no day is refused unsent; the
  // last day unticked takes the weeks with it.
  function setBox(part: BoxPart, key: string, on: boolean, force = false) {
    const stateKey =
      part === "days" && isDayKey(key)
        ? dayKey(key)
        : part === "weeks" && isWeekKey(key)
          ? weekKey(key)
          : part === "months" && isMonthKey(key)
            ? monthKey(key)
            : null;
    const fieldId =
      part === "days" && isDayKey(key)
        ? ids.day(key)
        : part === "weeks" && isWeekKey(key)
          ? ids.week(key)
          : part === "months" && isMonthKey(key)
            ? ids.month(key)
            : null;
    if (stateKey === null || fieldId === null) return;
    const patch = (current: Schedule | null): Schedule | null =>
      normalizeSchedule({
        ...(current ?? {}),
        [part]: withKey(current?.[part] ?? [], key, on),
      } as Schedule);
    if (part === "weeks" && on && !(shown?.days?.length ?? 0)) {
      refuseUnsent(stateKey, part, fieldId, "weeksNeedDay", "on");
      return;
    }
    editing.sending(stateKey, on ? "on" : "off");
    startTransition(async () => {
      show(patch);
      await editing.run(async () => {
        const before = confirmedRef.current;
        if (part === "weeks" && on && !(before?.days?.length ?? 0)) {
          editing.answered(stateKey);
          refuseUnsent(stateKey, part, fieldId, "weeksNeedDay", "on");
          return;
        }
        const next = patch(before);
        if (!force && sameSchedule(next, before)) {
          editing.answered(stateKey);
          return;
        }
        const cleared =
          part === "days" &&
          !on &&
          (before?.weeks?.length ?? 0) > 0 &&
          !(next?.weeks?.length ?? 0);
        await send(
          stateKey,
          part,
          next,
          before,
          { fieldId, typed: null },
          { box: key, on, cleared },
        );
      });
    });
  }

  // The saved times as the fields show them, open then close.
  function savedPair(): [string, string] {
    const hours = dish.schedule?.hours;
    return hours
      ? [formatTime(hours.open, timeCopy), formatTime(hours.close, timeCopy)]
      : ["", ""];
  }

  function withHours(
    schedule: Schedule | null,
    hours: TimeRange | undefined,
  ): Schedule | null {
    const rest: Schedule = { ...(schedule ?? {}) };
    delete rest.hours;
    return normalizeSchedule(hours ? { ...rest, hours } : rest);
  }

  // The pair was committed: both blank means all day; else every problem
  // the page can read is refused unsent at once, each under its own field,
  // said once together, Starts first (D-164): a blank side, a time that
  // does not read, or, with both read, the same time twice. Nothing is
  // sent until both are fixed; then the whole schedule is sent with the
  // range.
  function commitHours(force = false) {
    const live = editing.peek();
    const draft = live.drafts[HOURS_KEY];
    if (draft === undefined && !force) return;
    const failed = live.failures[HOURS_KEY];
    if (!force && failed && failed.value === draft) return;
    const [openText, closeText] = splitPair(draft ?? joinPair(...savedPair()));
    const open = openText.trim();
    const close = closeText.trim();
    const value = draft ?? "";
    let hours: TimeRange | undefined;
    if (open !== "" || close !== "") {
      const problems: PairProblem[] = [];
      const opens = open === "" ? null : parseTime(open);
      const closes = close === "" ? null : parseTime(close);
      if (opens === null) {
        problems.push({ fieldId: ids.open, rule: "timePairStarts" });
      } else if (!opens.ok) {
        problems.push({
          fieldId: ids.open,
          rule:
            opens.problem === "ampm" ? "timeAmPmStarts" : "timeFormatStarts",
        });
      }
      if (closes === null) {
        problems.push({ fieldId: ids.close, rule: "timePairEnds" });
      } else if (!closes.ok) {
        problems.push({
          fieldId: ids.close,
          rule: closes.problem === "ampm" ? "timeAmPmEnds" : "timeFormatEnds",
        });
      }
      if (opens?.ok && closes?.ok && opens.time === closes.time) {
        problems.push({ fieldId: ids.close, rule: "sameTime" });
      }
      if (problems.length > 0) return refusePair(problems, value);
      if (opens?.ok && closes?.ok) {
        hours = { open: opens.time, close: closes.time };
      }
    }
    const range = hours;
    // The server's last answer is what the page shows; the ref is read
    // only once the queue sends, inside the transition.
    if (
      !force &&
      sameSchedule(withHours(dish.schedule, range), dish.schedule)
    ) {
      editing.reset(HOURS_KEY);
      return;
    }
    editing.sending(HOURS_KEY, value);
    startTransition(async () => {
      show((current) => withHours(current, range));
      await editing.run(async () => {
        const before = confirmedRef.current;
        await send(HOURS_KEY, "hours", withHours(before, range), before, {
          fieldId: ids.open,
          typed: draft ?? null,
        });
      });
    });
  }

  function withDay(
    schedule: Schedule | null,
    part: "from" | "until",
    day: string | undefined,
  ): Schedule | null {
    const rest: Schedule = { ...(schedule ?? {}) };
    delete rest[part];
    return normalizeSchedule(day ? { ...rest, [part]: day } : rest);
  }

  // A date field was committed: blank means open at that end; a date that
  // does not read, or a last day before the first, is refused unsent.
  function commitDate(part: "from" | "until", force = false) {
    const key = part === "from" ? FROM_KEY : UNTIL_KEY;
    const fieldId = part === "from" ? ids.from : ids.until;
    const live = editing.peek();
    const draft = live.drafts[key];
    if (draft === undefined && !force) return;
    const failed = live.failures[key];
    if (!force && failed && failed.value === draft) return;
    const saved = dish.schedule?.[part];
    const text = (draft ?? (saved ? formatDate(saved, lang) : "")).trim();
    let day: string | undefined;
    if (text !== "") {
      const parsed = parseDate(text, today);
      if (!parsed.ok) {
        return refuseUnsent(key, part, fieldId, "dateFormat", draft ?? "");
      }
      day = parsed.day;
    }
    const next = withDay(dish.schedule, part, day);
    if (next?.from && next.until && next.from > next.until) {
      return refuseUnsent(key, part, fieldId, "dateOrder", draft ?? "");
    }
    if (!force && sameSchedule(next, dish.schedule)) {
      editing.reset(key);
      return;
    }
    editing.sending(key, draft ?? "");
    startTransition(async () => {
      show((current) => withDay(current, part, day));
      await editing.run(async () => {
        const before = confirmedRef.current;
        await send(key, part, withDay(before, part, day), before, {
          fieldId,
          typed: draft ?? null,
        });
      });
    });
  }

  // One press: the first and last day become today in the restaurant's
  // zone, and the press says so.
  function setToday() {
    const patch = (current: Schedule | null): Schedule | null =>
      normalizeSchedule({ ...(current ?? {}), from: today, until: today });
    startTransition(async () => {
      show(patch);
      await editing.run(async () => {
        const before = confirmedRef.current;
        const next = patch(before);
        if (sameSchedule(next, before)) {
          editing.dropField(FROM_KEY);
          editing.dropField(UNTIL_KEY);
          announce(
            fill(copy.todayOnlySet, {
              date: formatDayAndDate(today, today, lang),
            }),
          );
          return;
        }
        await send(TODAY_KEY, "today", next, before, {
          fieldId: ids.today,
          typed: null,
        });
      });
    });
  }

  // The inverse of a change: the schedule as it was, while the dish still
  // holds the schedule the change left.
  async function reverse(entry: ScheduleUndo): Promise<Reversed> {
    const result = await editing.call(() =>
      setDishSchedule(code, dish.id, entry.from, entry.to),
    );
    if (!result.ok) {
      if (result.problem.kind === "schedule-changed") {
        return {
          ok: false,
          outcome: "stale",
          sentence: copy.undo.scheduleChanged,
        };
      }
      return {
        ok: false,
        outcome: undoOutcome(result.problem),
        sentence: failureSentence(
          editingStrings.notUndone,
          problemOf(result.problem),
        ),
      };
    }
    confirmedRef.current = result.value.schedule;
    return { ok: true, sentence: scheduleUndoneSentence(copy, entry) };
  }

  // Sends a failed save of the group's again, with the value that failed.
  function tryAgain(key: string, failedValue: string): boolean {
    for (const [part, prefix] of [
      ["days", "schedule:day:"],
      ["weeks", "schedule:week:"],
      ["months", "schedule:month:"],
    ] as const) {
      if (key.startsWith(prefix)) {
        setBox(part, key.slice(prefix.length), failedValue === "on", true);
        return true;
      }
    }
    if (key === HOURS_KEY) {
      commitHours(true);
      return true;
    }
    if (key === FROM_KEY || key === UNTIL_KEY) {
      commitDate(key === FROM_KEY ? "from" : "until", true);
      return true;
    }
    return false;
  }

  const hoursDraft = editing.drafts[HOURS_KEY];
  const [openShown, closeShown] =
    hoursDraft !== undefined ? splitPair(hoursDraft) : savedPair();
  const hoursFailure = editing.failures[HOURS_KEY];

  // The problem under one of the pair's fields, if it has one (D-164).
  function hoursProblemAt(fieldId: string): string | null {
    if (!hoursFailure) return null;
    if (hoursFailure.fieldId === fieldId) return hoursFailure.problem;
    return (
      hoursFailure.others?.find((other) => other.fieldId === fieldId)
        ?.problem ?? null
    );
  }

  const showing = shown ? showingAt(shown, at, timeZone) : null;

  return {
    ids,
    shown,
    boxName,
    days: {
      keys: DAY_KEYS,
      shown: shown?.days ?? [],
      set: (key: DayKey, on: boolean) => setBox("days", key, on),
      errorOf: (key: DayKey) => editing.failures[dayKey(key)]?.problem ?? null,
    },
    weeks: {
      keys: WEEK_KEYS,
      shown: shown?.weeks ?? [],
      set: (key: WeekKey, on: boolean) => setBox("weeks", key, on),
      errorOf: (key: WeekKey) =>
        editing.failures[weekKey(key)]?.problem ?? null,
    },
    months: {
      keys: MONTH_KEYS,
      shown: shown?.months ?? [],
      set: (key: MonthKey, on: boolean) => setBox("months", key, on),
      errorOf: (key: MonthKey) =>
        editing.failures[monthKey(key)]?.problem ?? null,
    },
    hours: {
      open: {
        id: ids.open,
        value: openShown,
        error: hoursProblemAt(ids.open),
        onChange: (value: string) =>
          editing.type(HOURS_KEY, joinPair(value, closeShown)),
        onCommit: () => commitHours(),
      },
      close: {
        id: ids.close,
        value: closeShown,
        error: hoursProblemAt(ids.close),
        onChange: (value: string) =>
          editing.type(HOURS_KEY, joinPair(openShown, value)),
        onCommit: () => commitHours(),
      },
    },
    from: {
      id: ids.from,
      value:
        editing.drafts[FROM_KEY] ??
        (dish.schedule?.from ? formatDate(dish.schedule.from, lang) : ""),
      error: editing.failures[FROM_KEY]?.problem ?? null,
      onChange: (value: string) => editing.type(FROM_KEY, value),
      onCommit: () => commitDate("from"),
    },
    until: {
      id: ids.until,
      value:
        editing.drafts[UNTIL_KEY] ??
        (dish.schedule?.until ? formatDate(dish.schedule.until, lang) : ""),
      error: editing.failures[UNTIL_KEY]?.problem ?? null,
      onChange: (value: string) => editing.type(UNTIL_KEY, value),
      onCommit: () => commitDate("until"),
    },
    today: { id: ids.today, set: setToday },
    sentence: shown
      ? scheduleSentence(shown, today, lang, scheduleCopy, timeCopy)
      : null,
    showing:
      shown && showing
        ? showingSentence(showing, shown, at, timeZone, lang, copy, timeCopy)
        : null,
    reverse,
    tryAgain,
  };
}

export type DishScheduleState = ReturnType<typeof useDishSchedule>;
