import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDayAndDate,
  isRealDay,
  parseDate,
  todayIn,
} from "../../src/domain/date";

// D-159: the owner types a first or last day, the parser reads it into
// YYYY-MM-DD and never guesses, and a saved date comes back with its year.

const today = "2026-10-09";

function read(text: string): string {
  const result = parseDate(text, today);
  return result.ok ? result.day : `error: ${result.problem}`;
}

describe("reading a typed date (D-159)", () => {
  it.each([
    ["October 31", "2026-10-31"],
    ["october 31", "2026-10-31"],
    ["Oct 31", "2026-10-31"],
    ["oct. 31", "2026-10-31"],
    ["Sept 5", "2027-09-05"],
    ["October 31, 2026", "2026-10-31"],
    ["October 31 2026", "2026-10-31"],
    ["31 October", "2026-10-31"],
    ["31 October 2026", "2026-10-31"],
    ["10/31", "2026-10-31"],
    ["10/31/2026", "2026-10-31"],
    ["1/5/2027", "2027-01-05"],
    ["2026-10-31", "2026-10-31"],
    ["2026-1-5", "2026-01-05"],
    ["  October   31  ", "2026-10-31"],
  ])("reads %s as %s", (text, expected) => {
    expect(read(text)).toBe(expected);
  });

  it.each([
    ["February 10", "2027-02-10"],
    ["2/10", "2027-02-10"],
    ["October 9", "2026-10-09"],
    ["October 8", "2027-10-08"],
    ["Feb 29", "2028-02-29"],
  ])(
    "a date with no year, %s, is the next such date on or after today, %s",
    (text, expected) => {
      expect(read(text)).toBe(expected);
    },
  );

  it.each([
    "31/10",
    "31/10/2026",
    "10/31/26",
    "13/1",
    "2027-02-30",
    "February 30",
    "Octember 3",
    "Oct",
    "10-31",
    "31",
    "",
    "October 31, 26",
    "10/31/2026/1",
  ])("refuses %s rather than guess", (text) => {
    expect(read(text)).toBe("error: format");
  });

  it("knows a real day from one that reads as another", () => {
    expect(isRealDay("2027-02-28")).toBe(true);
    expect(isRealDay("2027-02-29")).toBe(false);
    expect(isRealDay("2028-02-29")).toBe(true);
    expect(isRealDay("2026-13-01")).toBe(false);
    expect(isRealDay("2026-1-5")).toBe(false);
  });

  it("shows a saved date with its year, and a bad one as it is", () => {
    expect(formatDate("2026-10-31", "en")).toBe("October 31, 2026");
    expect(formatDate("2027-02-10", "en")).toBe("February 10, 2027");
    expect(formatDate("not a date", "en")).toBe("not a date");
  });

  it("names a day with its weekday, and its year when it is not today's", () => {
    expect(formatDayAndDate("2026-10-13", today, "en")).toBe(
      "Tuesday, October 13",
    );
    expect(formatDayAndDate("2027-02-12", today, "en")).toBe(
      "Friday, February 12, 2027",
    );
    expect(formatDayAndDate("nope", today, "en")).toBe("nope");
  });

  it("reads today in the restaurant's zone", () => {
    expect(todayIn("America/New_York", new Date("2026-10-10T03:00:00Z"))).toBe(
      "2026-10-09",
    );
    expect(todayIn("Pacific/Honolulu", new Date("2026-10-10T09:30:00Z"))).toBe(
      "2026-10-09",
    );
    expect(todayIn("America/New_York", new Date("2026-10-10T04:00:00Z"))).toBe(
      "2026-10-10",
    );
  });
});
