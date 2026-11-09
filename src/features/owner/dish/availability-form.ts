import { parseDate } from "@/domain/date";
import { DAY_KEYS, type DayKey, type TimeRange } from "@/domain/hours";
import {
  MONTH_KEYS,
  normalizeSchedule,
  parseSchedule,
  WEEK_KEYS,
  type MonthKey,
  type Schedule,
  type WeekKey,
} from "@/domain/schedule";
import { parseTime } from "@/domain/time";
import type { Day } from "@/domain/timezones";
import type { ScheduleStrings } from "./schedule-words";
import { SCHEDULE_IDS } from "./showing-ids";

// What a Save of the availability form checks before anything is sent
// (D-229), and what the server checks again: the schedule's fields as
// typed, each problem on its field in page order, so the first is the
// first on the page. The hours are a pair: one side blank with the other
// filled wants the blank side; a time without am or pm, or in no shape the
// clock reads, says so; equal times are no range. A date in no shape the
// calendar reads says so; a last day before the first wants the last. A
// week with no day ticked wants a day, said on the first ticked week. With
// no problems, the schedule in its stored shape, or none, with the shape's
// own rules as the last word. Pure: no React, no network.

export type ScheduleRule = keyof ScheduleStrings["errors"];

export type AvailabilityFields = {
  days: readonly DayKey[];
  weeks: readonly WeekKey[];
  months: readonly MonthKey[];
  open: string;
  close: string;
  from: string;
  until: string;
};

export type AvailabilityProblem = { id: string; rule: ScheduleRule };

export type AvailabilityFormCheck = {
  problems: AvailabilityProblem[];
  // The schedule to save, or none; null too while there are problems.
  schedule: Schedule | null;
};

export function validateAvailabilityForm(
  fields: AvailabilityFields,
  today: Day,
): AvailabilityFormCheck {
  const ids = SCHEDULE_IDS;
  const problems: AvailabilityProblem[] = [];
  const days = DAY_KEYS.filter((key) => fields.days.includes(key));
  const weeks = WEEK_KEYS.filter((key) => fields.weeks.includes(key));
  const months = MONTH_KEYS.filter((key) => fields.months.includes(key));

  let hours: TimeRange | undefined;
  const open = fields.open.trim();
  const close = fields.close.trim();
  if (open !== "" || close !== "") {
    let opens: string | null = null;
    let closes: string | null = null;
    if (open === "") {
      problems.push({ id: ids.open, rule: "timePairStarts" });
    } else {
      const parsed = parseTime(open);
      if (parsed.ok) opens = parsed.time;
      else {
        problems.push({
          id: ids.open,
          rule:
            parsed.problem === "ampm" ? "timeAmPmStarts" : "timeFormatStarts",
        });
      }
    }
    if (close === "") {
      problems.push({ id: ids.close, rule: "timePairEnds" });
    } else {
      const parsed = parseTime(close);
      if (parsed.ok) closes = parsed.time;
      else {
        problems.push({
          id: ids.close,
          rule: parsed.problem === "ampm" ? "timeAmPmEnds" : "timeFormatEnds",
        });
      }
    }
    if (opens !== null && closes !== null) {
      if (opens === closes) problems.push({ id: ids.close, rule: "sameTime" });
      else hours = { open: opens, close: closes };
    }
  }

  let from: Day | undefined;
  let until: Day | undefined;
  if (fields.from.trim() !== "") {
    const parsed = parseDate(fields.from, today);
    if (parsed.ok) from = parsed.day;
    else problems.push({ id: ids.from, rule: "dateFormat" });
  }
  if (fields.until.trim() !== "") {
    const parsed = parseDate(fields.until, today);
    if (parsed.ok) until = parsed.day;
    else problems.push({ id: ids.until, rule: "dateFormat" });
  }
  if (from !== undefined && until !== undefined && from > until) {
    problems.push({ id: ids.until, rule: "dateOrder" });
  }

  const firstWeek = weeks[0];
  if (firstWeek !== undefined && days.length === 0) {
    problems.push({ id: ids.week(firstWeek), rule: "weeksNeedDay" });
  }

  if (problems.length > 0) return { problems, schedule: null };
  const schedule = normalizeSchedule({
    days,
    weeks,
    months,
    hours,
    from,
    until,
  });
  if (schedule !== null && parseSchedule(schedule) === null) {
    return {
      problems: [{ id: ids.hours, rule: "scheduleShape" }],
      schedule: null,
    };
  }
  return { problems: [], schedule };
}
