import { z } from "zod";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { AVAILABILITY, type Availability } from "@/domain/availability";
import { formatDayAndDate, todayIn } from "@/domain/date";
import { parseSchedule, type Schedule } from "@/domain/schedule";
import { formatTime, type TimeCopy } from "@/domain/time";
import { shiftDay, zonedDay } from "@/domain/timezones";
import { DIETARY_TAG_IDS, type DietaryTagId } from "@/domain/types";
import type { UndoOutcome } from "../editing/undo";

// The words and the Undo entries of the dish page's three showing groups
// (task 5): the dietary tags (D-66), availability (D-160), and the schedule
// (D-159). A tag entry remembers both lists and is taken back only while
// the dish still holds the list the change left; an availability entry
// remembers the exact row before and after, so Undo writes the previous
// mark back as it was and never makes a new one; a schedule entry remembers
// the whole schedule before and after, since every part is one column. The
// group's line under the availability radios is built here from what the
// server decided (domain/availability.ts), never from the mark itself.
// Pure: no React, no network.

export type TagsStrings = Copy["owner"]["dish"]["tags"];
export type AvailabilityStrings = Copy["owner"]["dish"]["availability"];
export type ScheduleStrings = Copy["owner"]["dish"]["schedule"];

export type Reversed =
  | { ok: true; sentence: string | null }
  | { ok: false; outcome: Exclude<UndoOutcome, "applied">; sentence: string };

export const SCHEDULE_PARTS = [
  "days",
  "weeks",
  "months",
  "hours",
  "from",
  "until",
  "today",
] as const;
export type SchedulePart = (typeof SCHEDULE_PARTS)[number];

const tagListSchema = z.array(z.enum(DIETARY_TAG_IDS));

export const tagsChangeSchema = z.object({
  kind: z.literal("tags"),
  id: z.string(),
  name: z.string(),
  tag: z.enum(DIETARY_TAG_IDS),
  on: z.boolean(),
  before: tagListSchema,
  after: tagListSchema,
});

export type TagsUndo = z.infer<typeof tagsChangeSchema>;

// The row as it was and the choice the page showed for it, so Undo writes
// the row back exactly and names the choice in its sentence.
const availabilityRowSchema = z.object({
  choice: z.enum(AVAILABILITY),
  available: z.boolean(),
  soldOutAt: z.string().nullable(),
});

export type AvailabilityRowUndo = z.infer<typeof availabilityRowSchema>;

export const availabilityChangeSchema = z.object({
  kind: z.literal("availability"),
  id: z.string(),
  name: z.string(),
  from: availabilityRowSchema,
  to: availabilityRowSchema,
});

export type AvailabilityUndo = z.infer<typeof availabilityChangeSchema>;

// A stored schedule or none; a value the domain cannot read is not an
// entry, so a stack from an older shape starts empty.
const scheduleValueSchema = z.custom<Schedule | null>(
  (value) => value === null || parseSchedule(value) !== null,
);

export const scheduleChangeSchema = z.object({
  kind: z.literal("schedule"),
  id: z.string(),
  name: z.string(),
  part: z.enum(SCHEDULE_PARTS),
  // The box a tick named, for the label, with whether it went on.
  box: z.string().optional(),
  on: z.boolean().optional(),
  from: scheduleValueSchema,
  to: scheduleValueSchema,
});

export type ScheduleUndo = z.infer<typeof scheduleChangeSchema>;

export type TagNames = Record<DietaryTagId, string>;

export function tagsUndoLabel(
  strings: TagsStrings,
  names: TagNames,
  entry: TagsUndo,
): string {
  return fill(entry.on ? strings.undo.ticked : strings.undo.unticked, {
    tag: names[entry.tag],
    dish: entry.name,
  });
}

export function tagsUndoneSentence(
  strings: TagsStrings,
  names: TagNames,
  entry: TagsUndo,
): string {
  return fill(entry.on ? strings.undo.tickedBack : strings.undo.untickedBack, {
    tag: names[entry.tag],
  });
}

export function availabilityUndoLabel(
  strings: AvailabilityStrings,
  entry: AvailabilityUndo,
): string {
  const template =
    entry.to.choice === "sold-out"
      ? strings.undo.markedSoldOut
      : entry.to.choice === "off"
        ? strings.undo.markedOff
        : strings.undo.markedAvailable;
  return fill(template, { dish: entry.name });
}

export function availabilityUndoneSentence(
  strings: AvailabilityStrings,
  entry: AvailabilityUndo,
): string {
  const template =
    entry.from.choice === "sold-out"
      ? strings.undo.soldOutBack
      : entry.from.choice === "off"
        ? strings.undo.offBack
        : strings.undo.availableBack;
  return fill(template, { dish: entry.name });
}

// The visible words of a day, week, or month box, for an Undo label.
export type BoxName = (part: SchedulePart, key: string) => string;

export function scheduleUndoLabel(
  strings: ScheduleStrings,
  boxName: BoxName,
  entry: ScheduleUndo,
): string {
  switch (entry.part) {
    case "days":
    case "weeks":
    case "months":
      return fill(entry.on ? strings.undo.ticked : strings.undo.unticked, {
        box: entry.box ? boxName(entry.part, entry.box) : "",
        dish: entry.name,
      });
    case "hours":
      return fill(strings.undo.hours, { dish: entry.name });
    case "today":
      return fill(strings.undo.today, { dish: entry.name });
    case "from":
      return fill(strings.undo.from, { dish: entry.name });
    case "until":
      return fill(strings.undo.until, { dish: entry.name });
  }
}

export function scheduleUndoneSentence(
  strings: ScheduleStrings,
  entry: ScheduleUndo,
): string {
  return fill(strings.undo.back, { dish: entry.name });
}

// What the server decided a dish's availability is now, as the page gets
// it: the state, and the end of a sold-out mark as an instant.
export type ShowingNow = { state: Availability; until: string | null };

// The line under the availability radios (D-160): what the choice means
// now. A sold-out dish says when it comes back, today by its time, tomorrow,
// midnight tonight, or on a named day; a dish off the menu that it is
// hidden; an available dish says nothing.
export function availabilityLine(
  strings: AvailabilityStrings,
  showing: ShowingNow,
  zone: string,
  lang: string,
  time: TimeCopy,
  now: string,
): string | undefined {
  if (showing.state === "off") return strings.hidden;
  if (showing.state !== "sold-out" || showing.until === null) return undefined;
  const end = new Date(showing.until);
  if (Number.isNaN(end.getTime())) return undefined;
  const today = todayIn(zone, new Date(now));
  const tomorrow = shiftDay(today, 1);
  const wall = zonedDay(zone, end);
  const hh = String(Math.floor(wall.minutes / 60)).padStart(2, "0");
  const mm = String(wall.minutes % 60).padStart(2, "0");
  const clock = formatTime(`${hh}:${mm}`, time);
  if (wall.minutes === 0 && wall.day === tomorrow) return strings.endsMidnight;
  if (wall.day === today) return fill(strings.endsToday, { time: clock });
  if (wall.day === tomorrow) return fill(strings.endsTomorrow, { time: clock });
  return fill(strings.endsOn, {
    date: formatDayAndDate(wall.day, today, lang),
    time: clock,
  });
}
