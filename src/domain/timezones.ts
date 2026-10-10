// The seven US time zones a restaurant can be in (D-94). The list is closed:
// a zone outside it would make Intl throw when a diner page renders hours or
// specials (D-21). The database holds the same list in the
// restaurants_timezone_known check, and tests/unit/timezones.test.ts keeps
// the two equal. Pure: no React, no network.

export const TIMEZONE_IDS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;
export type TimezoneId = (typeof TIMEZONE_IDS)[number];

export const DEFAULT_TIMEZONE: TimezoneId = "America/New_York";

export function isTimezoneId(value: string): value is TimezoneId {
  return (TIMEZONE_IDS as readonly string[]).includes(value);
}

// UTC offset in minutes for a zone at an instant, or null for a zone Intl
// does not know.
export function offsetMinutes(zone: string, at: Date): number | null {
  let name = "";
  try {
    name =
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "longOffset",
      })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return null;
  }
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name);
  if (!match) return null;
  if (!match[1]) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

// The listed zone that matches a browser's zone: the zone itself when it is
// listed, else the first listed zone with the same January and July offsets,
// so America/Detroit lands on Eastern and America/Boise on Mountain. Null
// when nothing matches or the zone is unknown.
export function matchTimezone(
  browserZone: string,
  now: Date = new Date(),
): TimezoneId | null {
  if (isTimezoneId(browserZone)) return browserZone;
  const year = now.getUTCFullYear();
  const january = new Date(Date.UTC(year, 0, 1, 12));
  const july = new Date(Date.UTC(year, 6, 1, 12));
  const winter = offsetMinutes(browserZone, january);
  const summer = offsetMinutes(browserZone, july);
  if (winter === null || summer === null) return null;
  return (
    TIMEZONE_IDS.find(
      (id) =>
        offsetMinutes(id, january) === winter &&
        offsetMinutes(id, july) === summer,
    ) ?? null
  );
}

// A calendar day as YYYY-MM-DD, the shape a schedule's first and last day
// take (D-159). Day arithmetic runs on UTC midnights, which never shift.
export type Day = string;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function utcMidnight(day: Day): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function shiftDay(day: Day, by: number): Day {
  return new Date(utcMidnight(day) + by * DAY_MS).toISOString().slice(0, 10);
}

// The wall clock in a zone at an instant: the day and the minutes since
// its midnight. h23 keeps midnight at 00, never 24. The zone list is
// closed (D-94), so Intl knows every zone this is asked about.
export type WallClock = { day: Day; minutes: number };

export function zonedDay(zone: string, at: Date): WallClock {
  const parts: Record<string, string> = {};
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const part of format.formatToParts(at)) parts[part.type] = part.value;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// The first instant at which a zone's wall clock reads the given day and
// time (HH:MM) or later. Two candidates come from the offsets a day before
// and a day after the target, which straddle any transition near it. The
// earliest candidate that reads back as the target wins, so a time that
// happens twice (the fall back) is its first pass. A time that never
// happens (the spring forward gap) has no candidate that reads back, and
// the answer is the transition itself: the first minute between the two
// candidates whose wall clock has reached the target.
export function instantOf(zone: string, day: Day, time: string): Date {
  const [hh = "0", mm = "0"] = time.split(":");
  const target = utcMidnight(day) + (Number(hh) * 60 + Number(mm)) * MINUTE_MS;
  const reads = (at: number): number => {
    const wall = zonedDay(zone, new Date(at));
    return utcMidnight(wall.day) + wall.minutes * MINUTE_MS;
  };
  const candidates = [
    ...new Set(
      [-DAY_MS, DAY_MS].map(
        (shift) =>
          target -
          (offsetMinutes(zone, new Date(target + shift)) ?? 0) * MINUTE_MS,
      ),
    ),
  ].sort((a, b) => a - b);
  const exact = candidates.find((at) => reads(at) === target);
  if (exact !== undefined) return new Date(exact);
  let low = candidates[0] ?? target;
  let high = candidates[candidates.length - 1] ?? target;
  while (high - low > MINUTE_MS) {
    const middle = low + Math.floor((high - low) / (2 * MINUTE_MS)) * MINUTE_MS;
    if (reads(middle) >= target) high = middle;
    else low = middle;
  }
  return new Date(high);
}
