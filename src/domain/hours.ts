import { z } from "zod";

// Opening hours (D-92). One object keyed by day, each day a list of up to two
// time ranges in the restaurant's time zone (D-21). An empty list means
// closed that day; a null column means the owner gave no hours. A close
// earlier than its open means closing after midnight. Open equal to close
// means open around the clock, and is then the day's only range. Seven keys,
// two ranges, five-character times keep the JSON far below the database's
// 4000-octet cap. Pure: no React, no network.

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

export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const MAX_RANGES_PER_DAY = 2;

export type HoursMessages = {
  time: string;
  timePair: string;
  ranges: string;
  overlap: string;
  allDay: string;
};

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

function daySchema(messages: HoursMessages) {
  return z
    .array(timeRangeSchema(messages))
    .max(MAX_RANGES_PER_DAY, { error: messages.ranges })
    .superRefine((ranges, ctx) => {
      const valid = ranges.every(
        (range) =>
          TIME_PATTERN.test(range.open) && TIME_PATTERN.test(range.close),
      );
      if (!valid || ranges.length < 2) return;
      if (ranges.some(isAllDay)) {
        ctx.addIssue({ code: "custom", message: messages.allDay });
        return;
      }
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

export function hoursSchema(messages: HoursMessages) {
  const day = daySchema(messages);
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
