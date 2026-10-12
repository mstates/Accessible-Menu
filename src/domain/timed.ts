import { availabilityAt, type AvailabilityRow } from "./availability";
import type { Hours } from "./hours";
import { showingAt, type Schedule } from "./schedule";
import { instantOf, shiftDay, zonedDay } from "./timezones";

// When a diner page next changes with nobody pressing anything (D-159,
// D-160): a special's hours ending, the midnight that starts the next day
// it shows, a sold-out dish coming back at the end of the restaurant's
// day, and, while any dish has a schedule, the restaurant's next midnight,
// since a schedule's words and which day fits are read against today. The
// page's lifetime at the edge ends then (core/cache). One pure function,
// so the tests can run it across zones and daylight saving changes.

export type TimedDish = AvailabilityRow & { schedule: Schedule | null };

export type TimedInputs = {
  now: Date;
  zone: string;
  hours: Hours | null;
  dishes: readonly TimedDish[];
};

// The earliest moment after now at which what a diner sees can change, or
// null when nothing timed is on the menu, so the page lives until a write.
// A dish off the menu adds nothing: it returns by a write, never by the
// clock.
export function nextTimedChange(inputs: TimedInputs): Date | null {
  const { now, zone, hours, dishes } = inputs;
  const candidates: Date[] = [];
  let scheduled = false;
  for (const dish of dishes) {
    if (!dish.available) continue;
    const availability = availabilityAt(dish, now, hours, zone);
    if (availability.state === "sold-out") candidates.push(availability.until);
    if (dish.schedule) {
      scheduled = true;
      const showing = showingAt(dish.schedule, now, zone);
      if (showing.showing) {
        if (showing.until) candidates.push(showing.until);
      } else if (showing.next) {
        candidates.push(showing.next);
      }
    }
  }
  if (scheduled) {
    const today = zonedDay(zone, now).day;
    candidates.push(instantOf(zone, shiftDay(today, 1), "00:00"));
  }
  const ahead = candidates
    .map((at) => at.getTime())
    .filter((at) => at > now.getTime());
  if (ahead.length === 0) return null;
  return new Date(Math.min(...ahead));
}

// The seconds a page may live before that moment: a whole number of at
// least one, since the cache refuses less; null when nothing is timed.
export function lifetimeSeconds(now: Date, next: Date | null): number | null {
  if (next === null) return null;
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}
