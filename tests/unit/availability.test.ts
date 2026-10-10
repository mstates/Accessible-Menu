import { describe, expect, it } from "vitest";
import {
  availabilityAt,
  isAvailability,
  soldOutEnd,
} from "../../src/domain/availability";
import { emptyHours, type Hours } from "../../src/domain/hours";

// D-160: a dish sold out today comes back on its own at the end of the
// restaurant's day, worked out when read from its hours and zone.

const newYork = "America/New_York";

function hours(days: Partial<Hours>): Hours {
  return { ...emptyHours(), ...days };
}

const at = (iso: string) => new Date(iso);

function ends(markedAt: string, open: Hours | null, zone = newYork): string {
  return soldOutEnd(at(markedAt), open, zone).toISOString();
}

describe("when a sold-out dish comes back (D-160)", () => {
  it("ends at the day's last close, past midnight when the range runs past it", () => {
    const friday = hours({ fri: [{ open: "17:00", close: "02:00" }] });
    // Marked at 1 am Saturday, inside Friday's service.
    expect(ends("2026-10-10T05:00:00Z", friday)).toBe(
      "2026-10-10T06:00:00.000Z",
    );
    // Marked at 7 pm Friday.
    expect(ends("2026-10-09T23:00:00Z", friday)).toBe(
      "2026-10-10T06:00:00.000Z",
    );
    const split = hours({
      tue: [
        { open: "11:00", close: "14:00" },
        { open: "17:00", close: "22:00" },
      ],
    });
    // Marked at 1 pm Tuesday, during lunch: back after dinner, not lunch.
    expect(ends("2026-10-13T17:00:00Z", split)).toBe(
      "2026-10-14T02:00:00.000Z",
    );
  });

  it("belongs to the next day with service when marked after closing or on a closed day", () => {
    const daily: Hours = {
      mon: [{ open: "11:00", close: "22:00" }],
      tue: [{ open: "11:00", close: "22:00" }],
      wed: [{ open: "11:00", close: "22:00" }],
      thu: [{ open: "11:00", close: "22:00" }],
      fri: [{ open: "11:00", close: "22:00" }],
      sat: [{ open: "11:00", close: "22:00" }],
      sun: [{ open: "11:00", close: "22:00" }],
    };
    // Marked at 10:30 pm Tuesday: back at Wednesday's close.
    expect(ends("2026-10-14T02:30:00Z", daily)).toBe(
      "2026-10-15T02:00:00.000Z",
    );
    // Marked exactly at the close: the close is not after the mark.
    expect(ends("2026-10-14T02:00:00Z", daily)).toBe(
      "2026-10-15T02:00:00.000Z",
    );
    const closedMonday = hours({ tue: [{ open: "11:00", close: "22:00" }] });
    // Marked at 3 pm Monday, closed: back at Tuesday's close.
    expect(ends("2026-10-12T19:00:00Z", closedMonday)).toBe(
      "2026-10-14T02:00:00.000Z",
    );
    // Marked at 11 pm Tuesday with only Tuesday open: next Tuesday's close.
    expect(ends("2026-10-14T03:00:00Z", closedMonday)).toBe(
      "2026-10-21T02:00:00.000Z",
    );
  });

  it("ends at the next midnight with no hours, every day closed, or around the clock", () => {
    expect(ends("2026-10-13T17:00:00Z", null)).toBe("2026-10-14T04:00:00.000Z");
    expect(ends("2026-10-13T17:00:00Z", emptyHours())).toBe(
      "2026-10-14T04:00:00.000Z",
    );
    expect(ends("2026-10-14T03:59:00Z", null)).toBe("2026-10-14T04:00:00.000Z");
    expect(ends("2026-10-14T04:00:00Z", null)).toBe("2026-10-15T04:00:00.000Z");
    const always = hours({
      mon: [{ open: "00:00", close: "00:00" }],
      tue: [{ open: "00:00", close: "00:00" }],
      wed: [{ open: "09:00", close: "09:00" }],
    });
    expect(ends("2026-10-13T17:00:00Z", always)).toBe(
      "2026-10-14T04:00:00.000Z",
    );
    expect(ends("2026-10-13T17:00:00Z", null, "Pacific/Honolulu")).toBe(
      "2026-10-14T10:00:00.000Z",
    );
  });

  it("follows the wall clock through the spring forward and the fall back", () => {
    const saturday = hours({ sat: [{ open: "17:00", close: "02:30" }] });
    // Marked at 1:30 am EST on March 8: the 2:30 close never happens, so
    // the mark ends at the transition.
    expect(ends("2026-03-08T06:30:00Z", saturday)).toBe(
      "2026-03-08T07:00:00.000Z",
    );
    const late = hours({ sat: [{ open: "17:00", close: "02:00" }] });
    // Marked at 1:30 am EDT and again at 1:30 am EST on November 1: both
    // end at the one 2 am.
    expect(ends("2026-11-01T05:30:00Z", late)).toBe("2026-11-01T07:00:00.000Z");
    expect(ends("2026-11-01T06:30:00Z", late)).toBe("2026-11-01T07:00:00.000Z");
  });

  it("reads the three states, a stale or bad mark as available, and a live mark with its end", () => {
    const now = at("2026-10-13T17:00:00Z");
    expect(
      availabilityAt({ available: false, soldOutAt: null }, now, null, newYork),
    ).toEqual({
      state: "off",
    });
    expect(
      availabilityAt(
        { available: false, soldOutAt: "2026-10-13T16:00:00Z" },
        now,
        null,
        newYork,
      ),
    ).toEqual({
      state: "off",
    });
    expect(
      availabilityAt({ available: true, soldOutAt: null }, now, null, newYork),
    ).toEqual({
      state: "available",
    });
    expect(
      availabilityAt(
        { available: true, soldOutAt: "2026-10-12T16:00:00Z" },
        now,
        null,
        newYork,
      ),
    ).toEqual({
      state: "available",
    });
    expect(
      availabilityAt(
        { available: true, soldOutAt: "not a date" },
        now,
        null,
        newYork,
      ),
    ).toEqual({
      state: "available",
    });
    expect(
      availabilityAt(
        { available: true, soldOutAt: "2026-10-13T16:00:00Z" },
        now,
        null,
        newYork,
      ),
    ).toEqual({
      state: "sold-out",
      until: at("2026-10-14T04:00:00Z"),
    });
    expect(
      availabilityAt(
        { available: true, soldOutAt: "2026-10-13T16:00:00Z" },
        at("2026-10-14T04:00:00Z"),
        null,
        newYork,
      ),
    ).toEqual({ state: "available" });
  });

  it("knows the three states and nothing else", () => {
    expect(isAvailability("sold-out")).toBe(true);
    expect(isAvailability("off")).toBe(true);
    expect(isAvailability("available")).toBe(true);
    expect(isAvailability("sold_out")).toBe(false);
  });
});
