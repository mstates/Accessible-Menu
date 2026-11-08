import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { Availability } from "@/domain/availability";
import { formatDayAndDate, todayIn } from "@/domain/date";
import { formatTime, type TimeCopy } from "@/domain/time";
import { shiftDay, zonedDay } from "@/domain/timezones";

// The words of the dish page's three showing groups (task 5): the dietary
// tags (D-66), availability (D-160), and the schedule (D-159). The group's
// line under the availability radios is built here from what the server
// decided (domain/availability.ts), never from the mark itself. Pure: no
// React, no network.

export type TagsStrings = Copy["owner"]["dish"]["tags"];
export type AvailabilityStrings = Copy["owner"]["dish"]["availability"];
export type ScheduleStrings = Copy["owner"]["dish"]["schedule"];

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
