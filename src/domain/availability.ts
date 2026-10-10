import { dayEnd, dayKeyOf, type Hours } from "./hours";
import { instantOf, shiftDay, zonedDay } from "./timezones";

// How a dish stands (D-160): on the menu, sold out until the restaurant's
// day ends, or off the menu for now. The row holds a flag and the moment of
// the mark; the end is worked out when read, from the hours and the zone as
// they are then, since hours can change under a mark and a mark lives under
// a day. This is the one place that decides availability from a mark:
// tests/unit/availability-guard.test.ts holds every other file that may
// name the column to the reasons listed there. Pure: no React, no network.

export const AVAILABILITY = ["available", "sold-out", "off"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export function isAvailability(value: string): value is Availability {
  return (AVAILABILITY as readonly string[]).includes(value);
}

export type AvailabilityRow = { available: boolean; soldOutAt: string | null };

export type AvailabilityNow =
  { state: "available" | "off" } | { state: "sold-out"; until: Date };

// The instant a mark made at markedAt stops: the first service end after
// it. The day before the mark is looked at first, for a close that ran past
// midnight; then the mark's day and the seven after it, so a mark made
// after closing belongs to the next day with service, down to the same
// weekday a week on when it is the only day open. With no hours, or no day
// with service, the mark ends at the next midnight.
export function soldOutEnd(
  markedAt: Date,
  hours: Hours | null,
  zone: string,
): Date {
  const { day } = zonedDay(zone, markedAt);
  if (hours) {
    for (let step = -1; step <= 7; step += 1) {
      const candidate = shiftDay(day, step);
      const end = dayEnd(hours[dayKeyOf(candidate)]);
      if (!end) continue;
      const at = instantOf(zone, shiftDay(candidate, end.daysOn), end.time);
      if (at.getTime() > markedAt.getTime()) return at;
    }
  }
  return instantOf(zone, shiftDay(day, 1), "00:00");
}

// A mark that is not an instant reads as no mark, so a bad value never
// hides a dish; a mark whose end has passed reads as available.
export function availabilityAt(
  row: AvailabilityRow,
  at: Date,
  hours: Hours | null,
  zone: string,
): AvailabilityNow {
  if (!row.available) return { state: "off" };
  if (row.soldOutAt === null) return { state: "available" };
  const marked = new Date(row.soldOutAt);
  if (Number.isNaN(marked.getTime())) return { state: "available" };
  const until = soldOutEnd(marked, hours, zone);
  return at.getTime() < until.getTime()
    ? { state: "sold-out", until }
    : { state: "available" };
}
