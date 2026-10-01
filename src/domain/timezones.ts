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
