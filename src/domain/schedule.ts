import { z } from "zod";
import { isRealDay } from "./date";
import { DAY_KEYS, dayKeyOf, type DayKey, type TimeRange } from "./hours";
import {
  formatTime,
  formatTimeRange,
  TIME_PATTERN,
  type TimeCopy,
} from "./time";
import { instantOf, shiftDay, zonedDay, type Day } from "./timezones";

// A special's schedule (D-159): five optional parts, an absent part meaning
// any. The stored shape is checked by items_special_schedule_shape
// (migration 9); this module reads it, says whether the special shows at a
// moment and when it next shows, and builds the sentence diners read, in
// one place for the dish page, the diner page, read aloud, and translations
// (module rule 8). tests/unit/schedule.test.ts keeps the three lists equal
// to the migration's. Pure: no React, no network.

export const WEEK_KEYS = [
  "first",
  "second",
  "third",
  "fourth",
  "last",
] as const;
export type WeekKey = (typeof WEEK_KEYS)[number];

export const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;
export type MonthKey = (typeof MONTH_KEYS)[number];

export type Schedule = {
  days?: DayKey[];
  weeks?: WeekKey[];
  months?: MonthKey[];
  hours?: TimeRange;
  from?: Day;
  until?: Day;
};

export type ScheduleMessages = {
  empty: string;
  days: string;
  weeks: string;
  weeksNeedDays: string;
  months: string;
  time: string;
  sameTime: string;
  date: string;
  order: string;
};

function once<const Keys extends readonly [string, ...string[]]>(
  keys: Keys,
  message: string,
) {
  return z
    .array(z.enum(keys, { error: message }))
    .min(1, { error: message })
    .refine((list) => new Set(list).size === list.length, { error: message });
}

// The stored shape: each list non-empty and each value once; weeks only
// with days; a range that opens and closes at different times, since no
// range already means all day; real dates, the first not after the last;
// and at least one part.
export function scheduleSchema(messages: ScheduleMessages) {
  return z
    .strictObject({
      days: once(DAY_KEYS, messages.days).optional(),
      weeks: once(WEEK_KEYS, messages.weeks).optional(),
      months: once(MONTH_KEYS, messages.months).optional(),
      hours: z
        .strictObject({
          open: z.string().regex(TIME_PATTERN, { error: messages.time }),
          close: z.string().regex(TIME_PATTERN, { error: messages.time }),
        })
        .refine((range) => range.open !== range.close, {
          error: messages.sameTime,
        })
        .optional(),
      from: z.string().refine(isRealDay, { error: messages.date }).optional(),
      until: z.string().refine(isRealDay, { error: messages.date }).optional(),
    })
    .superRefine((schedule, ctx) => {
      const set = Object.values(schedule).filter((part) => part !== undefined);
      if (set.length === 0) {
        ctx.addIssue({ code: "custom", message: messages.empty });
      }
      if (schedule.weeks && !schedule.days) {
        ctx.addIssue({
          code: "custom",
          message: messages.weeksNeedDays,
          path: ["weeks"],
        });
      }
      if (schedule.from && schedule.until && schedule.from > schedule.until) {
        ctx.addIssue({
          code: "custom",
          message: messages.order,
          path: ["until"],
        });
      }
    });
}

const silent: ScheduleMessages = {
  empty: "empty",
  days: "days",
  weeks: "weeks",
  weeksNeedDays: "weeksNeedDays",
  months: "months",
  time: "time",
  sameTime: "sameTime",
  date: "date",
  order: "order",
};

// A stored value that is not a schedule reads as none.
export function parseSchedule(value: unknown): Schedule | null {
  const result = scheduleSchema(silent).safeParse(value);
  return result.success ? result.data : null;
}

// The shape every write sends: each list in its fixed order (days Monday to
// Sunday, weeks first to last, months January to December), so the stored
// value, the value the page shows, and the text a compare-and-set names
// always agree (Michael, at the plan's approval); empty parts dropped, and
// weeks dropped without days; null when nothing is left. All seven days and
// all twelve months are kept as ticked, so the boxes never clear under the
// owner's hand; the sentence reads them as every day and as no months.
export function normalizeSchedule(schedule: Schedule | null): Schedule | null {
  if (!schedule) return null;
  const out: Schedule = {};
  const days = DAY_KEYS.filter((key) => schedule.days?.includes(key));
  const weeks = WEEK_KEYS.filter((key) => schedule.weeks?.includes(key));
  const months = MONTH_KEYS.filter((key) => schedule.months?.includes(key));
  if (days.length > 0) out.days = days;
  if (days.length > 0 && weeks.length > 0) out.weeks = weeks;
  if (months.length > 0) out.months = months;
  if (schedule.hours) {
    out.hours = { open: schedule.hours.open, close: schedule.hours.close };
  }
  if (schedule.from) out.from = schedule.from;
  if (schedule.until) out.until = schedule.until;
  return Object.keys(out).length === 0 ? null : out;
}

// The text a compare-and-set names, keys in one order whatever order the
// database handed them back in. Postgres compares jsonb by value, so key
// order never matters there; this keeps the text the same on every page.
export function scheduleJson(schedule: Schedule): string {
  const ordered: Schedule = {};
  if (schedule.days) ordered.days = schedule.days;
  if (schedule.weeks) ordered.weeks = schedule.weeks;
  if (schedule.months) ordered.months = schedule.months;
  if (schedule.hours) {
    ordered.hours = { open: schedule.hours.open, close: schedule.hours.close };
  }
  if (schedule.from) ordered.from = schedule.from;
  if (schedule.until) ordered.until = schedule.until;
  return JSON.stringify(ordered);
}

export function sameSchedule(a: Schedule | null, b: Schedule | null): boolean {
  if (a === null || b === null) return a === b;
  return scheduleJson(a) === scheduleJson(b);
}

function monthKeyOf(day: Day): MonthKey {
  return MONTH_KEYS[Number(day.slice(5, 7)) - 1] ?? "jan";
}

function daysInMonth(day: Day): number {
  return new Date(
    Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0),
  ).getUTCDate();
}

// The weeks of the month a day counts as: first to fourth by its date, and
// last when fewer than seven days follow it. The 29th to the 31st is the
// fifth of its weekday, which has no ordinal, so it is only ever last.
const ORDINALS = ["first", "second", "third", "fourth"] as const;

export function weekKeysOf(day: Day): WeekKey[] {
  const date = Number(day.slice(8, 10));
  const keys: WeekKey[] = [];
  const nth = ORDINALS[Math.ceil(date / 7) - 1];
  if (nth) keys.push(nth);
  if (date + 7 > daysInMonth(day)) keys.push("last");
  return keys;
}

// Whether a day fits every part that is set.
export function fits(schedule: Schedule, day: Day): boolean {
  if (schedule.from && day < schedule.from) return false;
  if (schedule.until && day > schedule.until) return false;
  if (schedule.months && !schedule.months.includes(monthKeyOf(day))) {
    return false;
  }
  if (schedule.days && !schedule.days.includes(dayKeyOf(day))) return false;
  if (schedule.weeks) {
    const weeks = schedule.weeks;
    if (!weekKeysOf(day).some((key) => weeks.includes(key))) return false;
  }
  return true;
}

// When a fitting day shows (D-159): from its start until its hours end, or
// until the next day starts; a range past midnight closes on the next day.
function windowOf(schedule: Schedule, day: Day, zone: string): [Date, Date] {
  const start = instantOf(zone, day, "00:00");
  const { hours } = schedule;
  if (!hours) return [start, instantOf(zone, shiftDay(day, 1), "00:00")];
  const closeDay = hours.close < hours.open ? shiftDay(day, 1) : day;
  return [start, instantOf(zone, closeDay, hours.close)];
}

// The k-th weekday of a month comes round after 52 or 53 weeks, so 371
// days is the longest wait for any day a schedule can name.
const HORIZON_DAYS = 400;

export type Showing =
  { showing: true; until: Date | null } | { showing: false; next: Date | null };

// Windows that touch or overlap run together: a special on Fridays and
// Saturdays from 10 pm to 2 am shows from the start of Friday until 2 am
// Sunday, with no break at Saturday's start, and a special with no hours
// on Monday to Friday shows until Saturday starts. The end is the last
// window's end, or none when the run reaches past the horizon.
function chainedEnd(
  schedule: Schedule,
  day: Day,
  end: Date,
  zone: string,
): Date | null {
  let last = end;
  let current = day;
  for (let step = 0; step < HORIZON_DAYS; step += 1) {
    const next = shiftDay(current, 1);
    if (!fits(schedule, next)) return last;
    const [start, nextEnd] = windowOf(schedule, next, zone);
    if (start.getTime() > last.getTime()) return last;
    last = nextEnd;
    current = next;
  }
  return null;
}

// Whether the special shows at a moment, and until when, or else when it
// next shows. Today is looked at before yesterday, so a special that fits
// both reports tonight's end and not the spill's.
export function showingAt(schedule: Schedule, at: Date, zone: string): Showing {
  const today = zonedDay(zone, at).day;
  for (const day of [today, shiftDay(today, -1)]) {
    if (!fits(schedule, day)) continue;
    const [start, end] = windowOf(schedule, day, zone);
    if (start.getTime() <= at.getTime() && at.getTime() < end.getTime()) {
      return { showing: true, until: chainedEnd(schedule, day, end, zone) };
    }
  }
  const tomorrow = shiftDay(today, 1);
  const first =
    schedule.from && schedule.from > tomorrow ? schedule.from : tomorrow;
  for (let step = 0; step < HORIZON_DAYS; step += 1) {
    const day = shiftDay(first, step);
    if (schedule.until && day > schedule.until) break;
    if (fits(schedule, day)) {
      return { showing: false, next: instantOf(zone, day, "00:00") };
    }
  }
  return { showing: false, next: null };
}

// The words the sentence needs. Day names come in two forms, since a
// plural is a word and not a suffix; month names, dates, and the list
// joiner come from Intl. Every phrase starts lowercase; the sentence
// capitalizes its first letter and ends with a period.
export type ScheduleCopy = {
  day: Record<DayKey, string>;
  days: Record<DayKey, string>;
  week: Record<WeekKey, string>;
  everyDay: string;
  weeksOfEachMonth: string;
  weeksInMonth: string;
  monthRun: string;
  hours: string;
  between: string;
  from: string;
  until: string;
  todayOnly: string;
  dayOnly: string;
};

function put(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(\w+)\}/g,
    (match, key: string) => values[key] ?? match,
  );
}

function list(items: string[], lang: string): string {
  return new Intl.ListFormat(lang, { type: "conjunction" }).format(items);
}

function utc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

// A month's name alone, for the boxes that choose months and for the
// sentence.
export function monthName(key: MonthKey, lang: string): string {
  const at = new Date(Date.UTC(2026, MONTH_KEYS.indexOf(key), 1));
  return new Intl.DateTimeFormat(lang, {
    month: "long",
    timeZone: "UTC",
  }).format(at);
}

// A date as "February 10", with its year only when asked and not today's.
function dateText(day: Day, today: Day, lang: string, year: boolean): string {
  const showYear = year && day.slice(0, 4) !== today.slice(0, 4);
  return new Intl.DateTimeFormat(lang, {
    month: "long",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(utc(day));
}

// The day of the month alone, "31".
function dayText(day: Day, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    timeZone: "UTC",
  }).format(utc(day));
}

// One run round the year of three months or more reads as a span
// ("September to April"); anything else is a list in calendar order.
function monthRun(
  months: readonly MonthKey[],
): { first: MonthKey; last: MonthKey } | null {
  if (months.length < 3 || months.length === MONTH_KEYS.length) return null;
  const has = MONTH_KEYS.map((key) => months.includes(key));
  const start = has.findIndex((on, index) => on && !has[(index + 11) % 12]);
  if (start < 0) return null;
  for (let step = 1; step < months.length; step += 1) {
    if (!has[(start + step) % 12]) return null;
  }
  const first = MONTH_KEYS[start];
  const last = MONTH_KEYS[(start + months.length - 1) % 12];
  return first && last ? { first, last } : null;
}

function monthsPhrase(
  months: readonly MonthKey[],
  words: ScheduleCopy,
  lang: string,
): string | null {
  if (months.length === MONTH_KEYS.length) return null;
  const run = monthRun(months);
  if (run) {
    return put(words.monthRun, {
      first: monthName(run.first, lang),
      last: monthName(run.last, lang),
    });
  }
  return list(
    MONTH_KEYS.filter((key) => months.includes(key)).map((key) =>
      monthName(key, lang),
    ),
    lang,
  );
}

// "4 to 9 pm", through the range builder time.ts shares with the
// restaurant's hours.
function hoursPhrase(
  range: TimeRange,
  words: ScheduleCopy,
  time: TimeCopy,
): string {
  return formatTimeRange(range.open, range.close, words.hours, time);
}

// The first and last day: "February 10 to March 26", or "October 16 to 31"
// inside one month this year, with the year once at the end when both share
// one that is not today's, and on each when they differ; "from" or "until"
// alone; a single day as "today only" on that day and "October 16 only"
// otherwise.
function datesPhrase(
  schedule: Schedule,
  words: ScheduleCopy,
  lang: string,
  today: Day,
): string | null {
  const { from, until } = schedule;
  if (from && until) {
    if (from === until) {
      return from === today
        ? words.todayOnly
        : put(words.dayOnly, { date: dateText(from, today, lang, true) });
    }
    const sameYear = from.slice(0, 4) === until.slice(0, 4);
    const thisYear = until.slice(0, 4) === today.slice(0, 4);
    const sameMonth = from.slice(0, 7) === until.slice(0, 7);
    return put(words.between, {
      from: dateText(from, today, lang, !sameYear),
      until:
        sameMonth && thisYear
          ? dayText(until, lang)
          : dateText(until, today, lang, true),
    });
  }
  if (from) return put(words.from, { date: dateText(from, today, lang, true) });
  if (until) {
    return put(words.until, { date: dateText(until, today, lang, true) });
  }
  return null;
}

// Who and when: the days, or the weeks of the month with their day, which
// takes a single month into itself ("the second Sunday in May").
function leadPhrase(
  schedule: Schedule,
  words: ScheduleCopy,
  lang: string,
): string | null {
  const { days, weeks, months } = schedule;
  if (!days) return null;
  const inOrder = DAY_KEYS.filter((key) => days.includes(key));
  if (weeks) {
    const ordinals = list(
      WEEK_KEYS.filter((key) => weeks.includes(key)).map(
        (key) => words.week[key],
      ),
      lang,
    );
    const day = list(
      inOrder.map((key) => words.day[key]),
      lang,
    );
    const [only] = months ?? [];
    if (months?.length === 1 && only) {
      return put(words.weeksInMonth, {
        weeks: ordinals,
        day,
        month: monthName(only, lang),
      });
    }
    return put(words.weeksOfEachMonth, { weeks: ordinals, day });
  }
  if (inOrder.length === DAY_KEYS.length) return words.everyDay;
  return list(
    inOrder.map((key) => words.days[key]),
    lang,
  );
}

function sentence(text: string, lang: string): string {
  return `${text.charAt(0).toLocaleUpperCase(lang)}${text.slice(1)}.`;
}

// The sentence diners read (D-159), parts in one order: who and when,
// months, hours, dates. Hours with nothing before them get "every day".
// today is the restaurant's day, worked out by the caller from the zone.
export function scheduleSentence(
  schedule: Schedule,
  today: Day,
  lang: string,
  words: ScheduleCopy,
  time: TimeCopy,
): string {
  const parts: string[] = [];
  const lead = leadPhrase(schedule, words, lang);
  const monthsTaken =
    schedule.weeks !== undefined &&
    schedule.days !== undefined &&
    schedule.months?.length === 1;
  const months =
    schedule.months && !monthsTaken
      ? monthsPhrase(schedule.months, words, lang)
      : null;
  const hours = schedule.hours
    ? hoursPhrase(schedule.hours, words, time)
    : null;
  const dates = datesPhrase(schedule, words, lang, today);
  if (lead) parts.push(lead);
  if (months) parts.push(months);
  if (!lead && !months && hours) parts.push(words.everyDay);
  if (hours) parts.push(hours);
  if (dates) parts.push(dates);
  return sentence(parts.join(", "), lang);
}

// The dish page's line under the sentence: that the special shows now and
// until when, naming the day when the end is not today; when it next
// shows; or that no day ahead fits.
export type ShowingCopy = {
  showsNow: string;
  showsNowOn: string;
  showsNowAllDay: string;
  nextShows: string;
  never: string;
};

export function showingSentence(
  showing: Showing,
  schedule: Schedule,
  at: Date,
  zone: string,
  lang: string,
  words: ShowingCopy,
  time: TimeCopy,
): string {
  const today = zonedDay(zone, at).day;
  if (showing.showing) {
    if (!schedule.hours || showing.until === null) return words.showsNowAllDay;
    const end = zonedDay(zone, showing.until);
    const hh = String(Math.floor(end.minutes / 60)).padStart(2, "0");
    const mm = String(end.minutes % 60).padStart(2, "0");
    const clock = formatTime(`${hh}:${mm}`, time);
    if (end.day === today) return put(words.showsNow, { time: clock });
    const weekday = new Intl.DateTimeFormat(lang, {
      weekday: "long",
      timeZone: "UTC",
    }).format(utc(end.day));
    return put(words.showsNowOn, { time: clock, day: weekday });
  }
  if (showing.next) {
    const day = zonedDay(zone, showing.next).day;
    const date = new Intl.DateTimeFormat(lang, {
      weekday: "long",
      month: "long",
      day: "numeric",
      ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(utc(day));
    return put(words.nextShows, { date });
  }
  return words.never;
}
