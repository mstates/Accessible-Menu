import { z } from "zod";
import { parseTime, TIME_PATTERN } from "./time";
import type { Day } from "./timezones";

// Opening hours (D-92). One object keyed by day, each day a list of up to two
// time ranges in the restaurant's time zone (D-21). An empty list means
// closed that day; a null column means the owner gave no hours. A close
// earlier than its open means closing after midnight. Open equal to close
// means open around the clock, and is then the day's only range. Seven keys,
// two ranges, five-character times keep the JSON far below the database's
// 4000-octet cap. Two schemas share the day rules: hoursSchema reads the
// stored shape, and hoursInputSchema reads times as the owner typed them
// (D-105), and the days whose Open 24 hours box is checked (D-124), into
// that shape. Pure: no React, no network.

export const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export function isDayKey(value: string): value is DayKey {
  return (DAY_KEYS as readonly string[]).includes(value);
}

export type TimeRange = { open: string; close: string };
export type Hours = Record<DayKey, TimeRange[]>;

export const MAX_RANGES_PER_DAY = 2;

// How a day open around the clock is stored, whatever box or time said so.
export const ALL_DAY_RANGE: TimeRange = { open: "00:00", close: "00:00" };

type DayMessages = {
  ranges: string;
  overlap: string;
};

// A stored range that opens and closes at the same time is the day's only
// range (allDay).
export type HoursMessages = DayMessages & {
  time: string;
  timePair: string;
  allDay: string;
};

// Typed times name their field: timeAmPm and timeFormat carry {field}. A
// typed range that opens and closes at the same time is refused (sameTime),
// since the Open 24 hours box is how an owner says it (D-124).
export type HoursInputMessages = DayMessages & {
  timePair: string;
  timeAmPm: string;
  timeFormat: string;
  sameTime: string;
};

// What the hours grid posts, read by the form: each day's times as typed,
// and the days whose Open 24 hours box is checked. A checked day's times are
// never read, so its list is empty.
export type TypedHours = Record<DayKey, TimeRange[]> & { allDay: DayKey[] };

const MINUTES_IN_DAY = 24 * 60;

function minutes(time: string): number {
  const [hours = "0", mins = "0"] = time.split(":");
  return Number(hours) * 60 + Number(mins);
}

// A range as minutes from the start of its day, open end exclusive. An
// overnight range runs past 1440; an all-day range covers the whole day.
function span(range: TimeRange): [number, number] {
  const open = minutes(range.open);
  const close = minutes(range.close);
  if (close > open) return [open, close];
  return [open, close + MINUTES_IN_DAY];
}

export function isAllDay(range: TimeRange): boolean {
  return range.open === range.close;
}

// A stored day open around the clock: its one range opens and closes at the
// same time, whatever the time (D-92). Its Open 24 hours box loads checked.
export function isOpenAllDay(ranges: readonly TimeRange[]): boolean {
  const [only] = ranges;
  return ranges.length === 1 && only !== undefined && isAllDay(only);
}

export function emptyHours(): Hours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

function timeRangeSchema(messages: HoursMessages) {
  return z
    .object({ open: z.string(), close: z.string() })
    .superRefine((range, ctx) => {
      const sides = ["open", "close"] as const;
      const filled = sides.filter((side) => range[side] !== "");
      if (filled.length === 1) {
        const empty = sides.find((side) => range[side] === "") ?? "close";
        ctx.addIssue({
          code: "custom",
          message: messages.timePair,
          path: [empty],
        });
        return;
      }
      for (const side of sides) {
        if (!TIME_PATTERN.test(range[side])) {
          ctx.addIssue({
            code: "custom",
            message: messages.time,
            path: [side],
          });
        }
      }
    });
}

// The owner's text for each side. A blank side beside a filled one is named
// as the missing half, and the filled side is still read, so one submit
// reports both. Each filled side goes through parseTime; a side it cannot
// read gets the am or pm message or the format message.
function typedRangeSchema(messages: HoursInputMessages) {
  return z
    .object({ open: z.string(), close: z.string() })
    .transform((typed, ctx): TimeRange => {
      const range: TimeRange = { open: "", close: "" };
      for (const side of ["open", "close"] as const) {
        const text = typed[side].trim();
        if (text === "") {
          ctx.addIssue({
            code: "custom",
            message: messages.timePair,
            path: [side],
          });
          continue;
        }
        const parsed = parseTime(text);
        if (parsed.ok) {
          range[side] = parsed.time;
          continue;
        }
        ctx.addIssue({
          code: "custom",
          message:
            parsed.problem === "ampm" ? messages.timeAmPm : messages.timeFormat,
          path: [side],
        });
      }
      return range;
    });
}

// What a day does with a range that opens and closes at the same time.
// Stored, it means around the clock and must be the day's only range.
// Typed, it is refused, and the message points to the box.
type SameTimeRule = { refused: boolean; message: string };

// The day rules, shared by both schemas. They look only at ranges whose
// times all read; a day with a bad time reports that time and nothing more.
function daySchema(
  range: z.ZodType<TimeRange>,
  messages: DayMessages,
  sameTime: SameTimeRule,
) {
  return z
    .array(range)
    .max(MAX_RANGES_PER_DAY, { error: messages.ranges })
    .superRefine((ranges, ctx) => {
      const valid = ranges.every(
        (range) =>
          TIME_PATTERN.test(range.open) && TIME_PATTERN.test(range.close),
      );
      if (!valid) return;
      if (ranges.some(isAllDay) && (sameTime.refused || ranges.length > 1)) {
        ctx.addIssue({ code: "custom", message: sameTime.message });
        return;
      }
      if (ranges.length < 2) return;
      const spans = ranges.map(span).sort((a, b) => a[0] - b[0]);
      for (let index = 1; index < spans.length; index += 1) {
        const previous = spans[index - 1];
        const current = spans[index];
        if (previous && current && current[0] < previous[1]) {
          ctx.addIssue({ code: "custom", message: messages.overlap });
          return;
        }
      }
    });
}

function week<Day extends z.ZodType>(day: Day) {
  return z.strictObject({
    mon: day,
    tue: day,
    wed: day,
    thu: day,
    fri: day,
    sat: day,
    sun: day,
  });
}

export function hoursSchema(messages: HoursMessages) {
  return week(
    daySchema(timeRangeSchema(messages), messages, {
      refused: false,
      message: messages.allDay,
    }),
  );
}

// The hours as the owner typed them, read into the stored shape. A checked
// day is stored as the one all-day range. The output holds the seven days
// and nothing else: it is written to the column as it is, and a stray key
// would make every reader take the whole column for no hours.
export function hoursInputSchema(messages: HoursInputMessages) {
  const day = daySchema(typedRangeSchema(messages), messages, {
    refused: true,
    message: messages.sameTime,
  });
  return week(day)
    .extend({ allDay: z.array(z.enum(DAY_KEYS)) })
    .transform(({ allDay, ...days }): Hours => {
      const hours: Hours = { ...days };
      for (const key of allDay) hours[key] = [{ ...ALL_DAY_RANGE }];
      return hours;
    });
}

// Readers that only need to know whether a stored value is hours at all
// (the row mapping in core/supabase) use this; a bad value reads as no hours.
const silent: HoursMessages = {
  time: "time",
  timePair: "timePair",
  ranges: "ranges",
  overlap: "overlap",
  allDay: "allDay",
};

export function parseHours(value: unknown): Hours | null {
  const result = hoursSchema(silent).safeParse(value);
  return result.success ? result.data : null;
}

// The day of the week a calendar day falls on. getUTCDay counts from
// Sunday; DAY_KEYS from Monday.
export function dayKeyOf(day: Day): DayKey {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return DAY_KEYS[(weekday + 6) % 7] ?? "mon";
}

// When a day's service ends, for a sold-out mark (D-160): the latest close
// among its ranges, as the day it falls on (this one or the next) and the
// time. A range past midnight closes the next day; a day open around the
// clock ends at the next midnight whatever time it stores; a closed day
// has no end.
export type DayEnd = { daysOn: 0 | 1; time: string };

export function dayEnd(ranges: readonly TimeRange[]): DayEnd | null {
  if (ranges.length === 0) return null;
  if (isOpenAllDay(ranges)) return { daysOn: 1, time: "00:00" };
  const end = Math.max(...ranges.map((range) => span(range)[1]));
  const onDay = end % MINUTES_IN_DAY;
  const hh = String(Math.floor(onDay / 60)).padStart(2, "0");
  const mm = String(onDay % 60).padStart(2, "0");
  return { daysOn: end >= MINUTES_IN_DAY ? 1 : 0, time: `${hh}:${mm}` };
}
