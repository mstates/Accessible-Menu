import { describe, expect, it } from "vitest";
import type { Hours } from "../../src/domain/hours";
import { TIMEZONE_IDS } from "../../src/domain/timezones";
import {
  lifetimeSeconds,
  nextTimedChange,
  type TimedDish,
} from "../../src/domain/timed";

// When a diner page next changes on its own (D-159, D-160): the clock
// cases across the seven zones and the two daylight saving changes.

const newYork = "America/New_York";

const hours: Hours = {
  mon: [{ open: "11:00", close: "21:00" }],
  tue: [{ open: "11:00", close: "21:00" }],
  wed: [{ open: "11:00", close: "21:00" }],
  thu: [{ open: "11:00", close: "21:00" }],
  fri: [{ open: "11:00", close: "21:00" }],
  sat: [{ open: "17:00", close: "02:00" }],
  sun: [{ open: "00:00", close: "00:00" }],
};

const at = (iso: string) => new Date(iso);
const plain = (given: Partial<TimedDish> = {}): TimedDish => ({
  available: true,
  soldOutAt: null,
  schedule: null,
  ...given,
});

function next(
  now: Date,
  dishes: TimedDish[],
  zone = newYork,
  week: Hours | null = hours,
): string | null {
  const change = nextTimedChange({ now, zone, hours: week, dishes });
  return change ? change.toISOString() : null;
}

describe("the next timed change", () => {
  it("is nothing when no dish is timed", () => {
    expect(next(at("2026-10-13T20:00:00Z"), [plain(), plain()])).toBeNull();
    expect(lifetimeSeconds(at("2026-10-13T20:00:00Z"), null)).toBeNull();
  });

  it("ends a special at its hours' end, and starts it again at the next midnight", () => {
    const special = plain({
      schedule: { hours: { open: "16:00", close: "21:00" } },
    });
    // 5 pm New York, October 13 (EDT): until 9 pm.
    expect(next(at("2026-10-13T21:00:00Z"), [special])).toBe(
      "2026-10-14T01:00:00.000Z",
    );
    // 10 pm New York: the next day starts at midnight.
    expect(next(at("2026-10-14T02:00:00Z"), [special])).toBe(
      "2026-10-14T04:00:00.000Z",
    );
  });

  it("changes at the restaurant's midnight while any dish has a schedule", () => {
    // A special on Tuesdays with no hours, at 3 pm on a Tuesday: it shows
    // until Wednesday starts.
    const tuesdays = plain({ schedule: { days: ["tue"] } });
    expect(next(at("2026-10-13T19:00:00Z"), [tuesdays])).toBe(
      "2026-10-14T04:00:00.000Z",
    );
    // On a Monday, it next shows Tuesday at midnight.
    expect(next(at("2026-10-12T19:00:00Z"), [tuesdays])).toBe(
      "2026-10-13T04:00:00.000Z",
    );
  });

  it("brings a sold-out dish back at the end of the restaurant's day", () => {
    // Marked at 2 pm Tuesday: back at 9 pm Tuesday.
    const soldOut = plain({ soldOutAt: "2026-10-13T18:00:00Z" });
    expect(next(at("2026-10-13T18:30:00Z"), [soldOut])).toBe(
      "2026-10-14T01:00:00.000Z",
    );
    // With no hours, at the next midnight.
    expect(next(at("2026-10-13T18:30:00Z"), [soldOut], newYork, null)).toBe(
      "2026-10-14T04:00:00.000Z",
    );
  });

  it("takes the earliest of several, and skips a moment already past", () => {
    const soldOut = plain({ soldOutAt: "2026-10-13T18:00:00Z" });
    const special = plain({
      schedule: { hours: { open: "16:00", close: "19:00" } },
    });
    // 5 pm: the special ends at 7 pm, the sold-out dish returns at 9 pm.
    expect(next(at("2026-10-13T21:00:00Z"), [soldOut, special])).toBe(
      "2026-10-13T23:00:00.000Z",
    );
    // A mark whose end has passed reads as available and adds nothing.
    const old = plain({ soldOutAt: "2026-10-06T18:00:00Z" });
    expect(next(at("2026-10-13T21:00:00Z"), [old])).toBeNull();
  });

  it("names the instant the state flips, and never the moment just passed: at the change second and one second after", () => {
    const special = plain({
      schedule: { hours: { open: "16:00", close: "21:00" } },
    });
    const soldOut = plain({ soldOutAt: "2026-10-13T18:00:00Z" });
    // 9 pm New York, Tuesday October 13: the special's hours end and the
    // day's service ends, so the sold-out dish is back.
    const end = at("2026-10-14T01:00:00Z");
    expect(next(new Date(end.getTime() - 1000), [special, soldOut])).toBe(
      "2026-10-14T01:00:00.000Z",
    );
    expect(lifetimeSeconds(new Date(end.getTime() - 1000), end)).toBe(1);
    // At 9 pm and a second after: the special next shows when the next day
    // starts, and the sold-out dish, back, adds nothing.
    for (const now of [end, new Date(end.getTime() + 1000)]) {
      expect(next(now, [special, soldOut])).toBe("2026-10-14T04:00:00.000Z");
      expect(next(now, [soldOut])).toBeNull();
    }
  });

  it("ignores a dish off the menu, which returns by a write", () => {
    const off = plain({
      available: false,
      schedule: { hours: { open: "16:00", close: "21:00" } },
    });
    expect(next(at("2026-10-13T21:00:00Z"), [off])).toBeNull();
  });

  it("re-reads a special past midnight at midnight and ends it when it closes, and keeps a sold-out dish until the overnight close", () => {
    // Saturday 10 pm to 2 am: at 11 pm Saturday it shows until 2 am Sunday,
    // and the page re-reads at midnight, since a schedule's words are read
    // against today; at 1 am Sunday the next change is the 2 am close.
    const late = plain({
      schedule: { days: ["sat"], hours: { open: "22:00", close: "02:00" } },
    });
    expect(next(at("2026-10-18T03:00:00Z"), [late])).toBe(
      "2026-10-18T04:00:00.000Z",
    );
    expect(next(at("2026-10-18T05:00:00Z"), [late])).toBe(
      "2026-10-18T06:00:00.000Z",
    );
    // Sold out at 11 pm Saturday: back at 2 am Sunday, the day's close.
    const soldOut = plain({ soldOutAt: "2026-10-18T03:00:00Z" });
    expect(next(at("2026-10-18T03:30:00Z"), [soldOut])).toBe(
      "2026-10-18T06:00:00.000Z",
    );
  });

  it("follows the clocks falling back on November 1, 2026 in New York", () => {
    // Saturday October 31, 11 pm EDT: the clocks fall back at 2 am EDT
    // (06:00Z) to 1 am EST, so 1:30 am happens twice and the Saturday
    // close at 2 am happens once, in EST, 07:00Z, three hours after the
    // mark; midnight November 1 was 04:00Z.
    const soldOut = plain({ soldOutAt: "2026-11-01T03:00:00Z" });
    expect(next(at("2026-11-01T03:30:00Z"), [soldOut])).toBe(
      "2026-11-01T07:00:00.000Z",
    );
    // Marked at 1:30 am, the first pass (05:30Z): the same close.
    const late = plain({ soldOutAt: "2026-11-01T05:30:00Z" });
    expect(next(at("2026-11-01T05:45:00Z"), [late])).toBe(
      "2026-11-01T07:00:00.000Z",
    );
    // A Sunday special with no hours, read at 1:30 am EST on November 1
    // (06:30Z, after the fall back): it shows until Monday starts, which is
    // 25 hours after Sunday started, 05:00Z on November 2.
    const sundays = plain({ schedule: { days: ["sun"] } });
    expect(next(at("2026-11-01T06:30:00Z"), [sundays])).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });

  it("follows the clocks springing forward on March 14, 2027 in New York", () => {
    // A special on Saturdays closing at 2:30 am: at 1 am Sunday March 14
    // (06:00Z), 2:30 never happens, so the close is the transition, 3 am
    // EDT, 07:00Z.
    const late = plain({
      schedule: { days: ["sat"], hours: { open: "22:00", close: "02:30" } },
    });
    expect(next(at("2027-03-14T06:00:00Z"), [late])).toBe(
      "2027-03-14T07:00:00.000Z",
    );
    // Sunday March 14 is 23 hours long: from its start (05:00Z) to Monday's
    // (04:00Z).
    const sundays = plain({ schedule: { days: ["sun"] } });
    expect(next(at("2027-03-14T12:00:00Z"), [sundays])).toBe(
      "2027-03-15T04:00:00.000Z",
    );
  });

  it.each(TIMEZONE_IDS)("works out midnight in %s", (zone) => {
    const special = plain({ schedule: { days: ["mon"] } });
    // Noon UTC on Monday October 12, 2026 is Monday everywhere in the US.
    const change = nextTimedChange({
      now: at("2026-10-12T12:00:00Z"),
      zone,
      hours,
      dishes: [special],
    });
    expect(change).not.toBeNull();
    // The next midnight in that zone, as a wall clock of 00:00.
    const wall = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(change ?? new Date());
    expect(wall.find((part) => part.type === "hour")?.value).toBe("00");
    expect(wall.find((part) => part.type === "minute")?.value).toBe("00");
    expect(wall.find((part) => part.type === "weekday")?.value).toBe("Tue");
  });

  it("gives a whole number of seconds, at least one", () => {
    const now = at("2026-10-13T20:00:00.400Z");
    expect(lifetimeSeconds(now, at("2026-10-13T20:00:01Z"))).toBe(1);
    expect(lifetimeSeconds(now, at("2026-10-13T20:00:00.500Z"))).toBe(1);
    expect(lifetimeSeconds(now, at("2026-10-13T21:00:00Z"))).toBe(3600);
  });
});
