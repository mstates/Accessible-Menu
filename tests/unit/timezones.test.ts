import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  instantOf,
  matchTimezone,
  offsetMinutes,
  shiftDay,
  TIMEZONE_IDS,
  zonedDay,
} from "../../src/domain/timezones";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(root, "supabase/migrations");
const sql = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(dir, name), "utf8"))
  .join("\n");

// Noon UTC on the first of the month: well inside standard time in January
// and daylight time in July for every US zone that observes it.
const january = new Date(Date.UTC(2026, 0, 1, 12));
const july = new Date(Date.UTC(2026, 6, 1, 12));

describe("the time zone list (D-94)", () => {
  it("is the list the database checks", () => {
    const match = sql.match(
      /restaurants_timezone_known check \(timezone in \(([\s\S]*?)\)\)/,
    );
    expect(match).not.toBeNull();
    const inSql = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
      (found) => found[1],
    );
    expect(inSql).toEqual([...TIMEZONE_IDS]);
  });

  it("names zones Intl knows", () => {
    for (const id of TIMEZONE_IDS) {
      expect(offsetMinutes(id, january)).not.toBeNull();
    }
    expect(offsetMinutes("America/New_York", january)).toBe(-300);
    expect(offsetMinutes("America/New_York", july)).toBe(-240);
    expect(offsetMinutes("America/Phoenix", july)).toBe(-420);
    expect(offsetMinutes("Mars/Olympus_Mons", january)).toBeNull();
  });
});

describe("matching a browser's zone (D-95)", () => {
  it("keeps a listed zone", () => {
    expect(matchTimezone("America/Chicago", january)).toBe("America/Chicago");
    expect(matchTimezone("Pacific/Honolulu", january)).toBe("Pacific/Honolulu");
  });

  it.each([
    ["America/Detroit", "America/New_York"],
    ["America/Indiana/Indianapolis", "America/New_York"],
    ["America/Boise", "America/Denver"],
    ["America/Phoenix", "America/Phoenix"],
    ["America/Juneau", "America/Anchorage"],
  ])("maps %s to %s by its January and July offsets", (zone, expected) => {
    expect(matchTimezone(zone, january)).toBe(expected);
  });

  it("returns null for a zone that matches nothing, or is unknown", () => {
    expect(matchTimezone("Europe/London", january)).toBeNull();
    expect(matchTimezone("Mars/Olympus_Mons", january)).toBeNull();
    expect(matchTimezone("", january)).toBeNull();
  });
});

describe("zone math for a schedule and a sold-out mark (D-159, D-160)", () => {
  const newYork = "America/New_York";

  // The spring forward on March 8, 2026 (2:00 becomes 3:00) and the fall
  // back on November 1, 2026 (2:00 becomes 1:00) in New York.
  it.each([
    [newYork, "2026-03-08", "01:30", "2026-03-08T06:30:00.000Z"],
    [newYork, "2026-03-08", "02:30", "2026-03-08T07:00:00.000Z"],
    [newYork, "2026-03-08", "03:00", "2026-03-08T07:00:00.000Z"],
    [newYork, "2026-03-08", "00:00", "2026-03-08T05:00:00.000Z"],
    [newYork, "2026-03-09", "00:00", "2026-03-09T04:00:00.000Z"],
    [newYork, "2026-11-01", "01:30", "2026-11-01T05:30:00.000Z"],
    [newYork, "2026-11-01", "02:00", "2026-11-01T07:00:00.000Z"],
    [newYork, "2026-11-01", "00:00", "2026-11-01T04:00:00.000Z"],
    [newYork, "2026-11-02", "00:00", "2026-11-02T05:00:00.000Z"],
    [newYork, "2026-10-09", "16:00", "2026-10-09T20:00:00.000Z"],
    ["America/Phoenix", "2026-03-08", "02:30", "2026-03-08T09:30:00.000Z"],
    ["Pacific/Honolulu", "2026-07-01", "12:00", "2026-07-01T22:00:00.000Z"],
  ])(
    "instantOf in %s on %s at %s is the first instant the wall clock reads it, %s",
    (zone, day, time, expected) => {
      expect(instantOf(zone, day, time).toISOString()).toBe(expected);
    },
  );

  it("reads the wall clock in a zone, midnight as 00", () => {
    expect(zonedDay(newYork, new Date("2026-11-01T06:30:00Z"))).toEqual({
      day: "2026-11-01",
      minutes: 90,
    });
    expect(zonedDay(newYork, new Date("2026-03-08T07:00:00Z"))).toEqual({
      day: "2026-03-08",
      minutes: 180,
    });
    expect(zonedDay(newYork, new Date("2026-10-10T04:00:00Z"))).toEqual({
      day: "2026-10-10",
      minutes: 0,
    });
    expect(
      zonedDay("Pacific/Honolulu", new Date("2026-10-10T04:00:00Z")),
    ).toEqual({ day: "2026-10-09", minutes: 18 * 60 });
  });

  it("shifts a day across a month, a year, and a leap day", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2027-03-01", -1)).toBe("2027-02-28");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDay("2026-10-09", 7)).toBe("2026-10-16");
  });
});
