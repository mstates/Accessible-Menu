import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  matchTimezone,
  offsetMinutes,
  TIMEZONE_IDS,
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
