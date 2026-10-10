import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { DAY_KEYS } from "../../src/domain/hours";
import {
  fits,
  MONTH_KEYS,
  normalizeSchedule,
  parseSchedule,
  sameSchedule,
  scheduleJson,
  scheduleSchema,
  scheduleSentence,
  showingAt,
  showingSentence,
  WEEK_KEYS,
  weekKeysOf,
  type Schedule,
  type ScheduleCopy,
  type ShowingCopy,
} from "../../src/domain/schedule";
import { TIME_PATTERN } from "../../src/domain/time";

// D-159: a special's schedule in five optional parts, whether it shows at
// a moment and when it next shows, and the one sentence diners read.

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(root, "supabase/migrations");
const migration = readFileSync(
  join(dir, "20261009000001_schedule_availability.sql"),
  "utf8",
);

const newYork = "America/New_York";
const today = "2026-10-09";
const words: ScheduleCopy = { ...en.schedule, day: en.owner.restaurants.days };

const example: Schedule = {
  days: ["tue", "fri"],
  weeks: ["first", "last"],
  months: ["sep", "oct", "nov", "dec", "jan", "feb", "mar", "apr"],
  hours: { open: "16:00", close: "21:00" },
  from: "2027-02-10",
  until: "2027-03-26",
};

const season: Schedule = {
  months: ["sep", "oct", "nov", "dec", "jan", "feb", "mar", "apr"],
};

const lent: Schedule = {
  days: ["fri"],
  from: "2027-02-10",
  until: "2027-03-26",
};

// The literals the boundary script refuses, each a check violation there.
const badShapes = [
  "null",
  "[]",
  '"tuesdays"',
  "{}",
  '{"holiday":true}',
  '{"days":"tue"}',
  '{"days":[]}',
  '{"days":null}',
  '{"days":["tuesday"]}',
  '{"days":["tue","tue"]}',
  '{"days":["tue",1]}',
  '{"weeks":["first"]}',
  '{"days":["fri"],"weeks":["first","first"]}',
  '{"days":["fri"],"weeks":["fifth"]}',
  '{"months":["may","may"]}',
  '{"months":["sept"]}',
  '{"months":[]}',
  '{"hours":{"open":"16:00"}}',
  '{"hours":{"open":"4 pm","close":"21:00"}}',
  '{"hours":{"open":"16:00","close":"16:00"}}',
  '{"hours":{"open":"16:00","close":"21:00","note":"x"}}',
  '{"hours":{"open":null,"close":"21:00"}}',
  '{"hours":"16:00-21:00"}',
  '{"from":"2027-2-10"}',
  '{"from":"2027-02-30"}',
  '{"from":null}',
  '{"until":20261031}',
  '{"from":"2027-03-26","until":"2027-02-10"}',
];

function at(iso: string): Date {
  return new Date(iso);
}

describe("the stored shape (D-159)", () => {
  it("accepts a schedule with every part, and each part alone", () => {
    expect(parseSchedule(example)).toEqual(example);
    expect(parseSchedule({ until: "2026-10-31" })).toEqual({
      until: "2026-10-31",
    });
    expect(parseSchedule({ hours: { open: "22:00", close: "02:00" } })).toEqual(
      {
        hours: { open: "22:00", close: "02:00" },
      },
    );
    expect(parseSchedule({ from: "2027-02-10", until: "2027-02-10" })).toEqual({
      from: "2027-02-10",
      until: "2027-02-10",
    });
  });

  it.each(badShapes)("reads %s as no schedule", (literal) => {
    expect(parseSchedule(JSON.parse(literal))).toBeNull();
  });

  it("names the part a bad value is in", () => {
    const schema = scheduleSchema({
      empty: "empty",
      days: "days",
      weeks: "weeks",
      weeksNeedDays: "weeksNeedDays",
      months: "months",
      time: "time",
      sameTime: "sameTime",
      date: "date",
      order: "order",
    });
    const issues = (value: unknown) => {
      const result = schema.safeParse(value);
      return result.success
        ? []
        : result.error.issues.map(
            (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
          );
    };
    expect(issues({})).toEqual([": empty"]);
    expect(issues({ weeks: ["first"] })).toEqual(["weeks: weeksNeedDays"]);
    expect(issues({ from: "2027-03-26", until: "2027-02-10" })).toEqual([
      "until: order",
    ]);
    expect(issues({ hours: { open: "16:00", close: "16:00" } })).toEqual([
      "hours: sameTime",
    ]);
    expect(issues({ from: "2027-02-30" })).toEqual(["from: date"]);
  });

  it("holds the migration's three lists and its time pattern equal to the domain's", () => {
    const lists = [...migration.matchAll(/<@ '\[([^\]]+)\]'/g)].map((match) =>
      [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map((found) => found[1]),
    );
    expect(lists).toEqual([[...DAY_KEYS], [...WEEK_KEYS], [...MONTH_KEYS]]);
    expect(migration.split(`~ '${TIME_PATTERN.source}'`)).toHaveLength(3);
  });

  it("writes each list in its fixed order, drops what excludes nothing, and reads nothing as null", () => {
    expect(
      normalizeSchedule({
        days: ["fri", "mon"],
        weeks: ["last", "first"],
        months: ["apr", "sep"],
      }),
    ).toEqual({
      days: ["mon", "fri"],
      weeks: ["first", "last"],
      months: ["apr", "sep"],
    });
    expect(normalizeSchedule({ days: [...DAY_KEYS] })).toEqual({
      days: [...DAY_KEYS],
    });
    expect(
      normalizeSchedule({ days: [...DAY_KEYS], weeks: ["first"] }),
    ).toEqual({
      days: [...DAY_KEYS],
      weeks: ["first"],
    });
    expect(normalizeSchedule({ months: [...MONTH_KEYS] })).toEqual({
      months: [...MONTH_KEYS],
    });
    expect(
      normalizeSchedule({ months: [...MONTH_KEYS], days: ["tue"] }),
    ).toEqual({ days: ["tue"], months: [...MONTH_KEYS] });
    expect(normalizeSchedule({ weeks: ["first"] })).toBeNull();
    expect(
      normalizeSchedule({ days: [], hours: { open: "16:00", close: "21:00" } }),
    ).toEqual({
      hours: { open: "16:00", close: "21:00" },
    });
    expect(normalizeSchedule(null)).toBeNull();
  });

  it("names the same text whatever order the keys came back in", () => {
    const shuffled: Schedule = {
      until: "2027-03-26",
      hours: { close: "21:00", open: "16:00" },
      from: "2027-02-10",
      months: example.months,
      weeks: example.weeks,
      days: example.days,
    };
    expect(scheduleJson(shuffled)).toBe(scheduleJson(example));
    expect(scheduleJson(example)).toBe(
      '{"days":["tue","fri"],"weeks":["first","last"],"months":["sep","oct","nov","dec","jan","feb","mar","apr"],"hours":{"open":"16:00","close":"21:00"},"from":"2027-02-10","until":"2027-03-26"}',
    );
    expect(sameSchedule(example, shuffled)).toBe(true);
    expect(sameSchedule(example, { days: ["tue"] })).toBe(false);
    expect(sameSchedule(null, null)).toBe(true);
    expect(sameSchedule(null, example)).toBe(false);
  });
});

describe("which days fit (D-159)", () => {
  it("counts the weeks of the month a day is in, the fifth of its weekday as last only", () => {
    expect(weekKeysOf("2026-10-01")).toEqual(["first"]);
    expect(weekKeysOf("2026-10-07")).toEqual(["first"]);
    expect(weekKeysOf("2026-10-08")).toEqual(["second"]);
    expect(weekKeysOf("2026-10-23")).toEqual(["fourth"]);
    expect(weekKeysOf("2026-10-25")).toEqual(["fourth", "last"]);
    expect(weekKeysOf("2026-10-29")).toEqual(["last"]);
    expect(weekKeysOf("2026-10-30")).toEqual(["last"]);
    expect(weekKeysOf("2026-11-27")).toEqual(["fourth", "last"]);
    expect(weekKeysOf("2027-02-22")).toEqual(["fourth", "last"]);
  });

  it("finds the last and the fourth Friday in a month with five", () => {
    // October 2026 has Fridays on the 2nd, 9th, 16th, 23rd, and 30th.
    const last: Schedule = { days: ["fri"], weeks: ["last"] };
    const fourth: Schedule = { days: ["fri"], weeks: ["fourth"] };
    expect(fits(last, "2026-10-30")).toBe(true);
    expect(fits(last, "2026-10-23")).toBe(false);
    expect(fits(fourth, "2026-10-23")).toBe(true);
    expect(fits(fourth, "2026-10-30")).toBe(false);
    expect(fits(fourth, "2026-11-27")).toBe(true);
    expect(fits(last, "2026-11-27")).toBe(true);
    expect(fits(last, "2026-10-29")).toBe(false);
  });

  it("keeps a run to its first and last day, both inside", () => {
    expect(fits(lent, "2027-02-10")).toBe(false);
    expect(fits(lent, "2027-02-12")).toBe(true);
    expect(fits(lent, "2027-03-26")).toBe(true);
    expect(fits(lent, "2027-04-02")).toBe(false);
    expect(
      fits({ from: "2027-02-10", until: "2027-03-26" }, "2027-02-10"),
    ).toBe(true);
    expect(
      fits({ from: "2027-02-10", until: "2027-03-26" }, "2027-02-09"),
    ).toBe(false);
    expect(
      fits({ from: "2027-02-10", until: "2027-03-26" }, "2027-03-27"),
    ).toBe(false);
  });

  it("wraps a season past December", () => {
    expect(fits(season, "2026-12-15")).toBe(true);
    expect(fits(season, "2027-01-15")).toBe(true);
    expect(fits(season, "2027-04-30")).toBe(true);
    expect(fits(season, "2026-06-15")).toBe(false);
    expect(fits(season, "2027-05-01")).toBe(false);
  });

  it("fits every part that is set", () => {
    expect(fits(example, "2027-02-12")).toBe(false);
    expect(fits(example, "2027-03-05")).toBe(true);
    expect(fits(example, "2027-03-26")).toBe(true);
    expect(fits(example, "2027-03-02")).toBe(true);
    expect(fits(example, "2027-03-09")).toBe(false);
  });
});

describe("when a special shows (D-159)", () => {
  const showing = (schedule: Schedule, iso: string, zone = newYork) =>
    showingAt(schedule, at(iso), zone);

  it("shows from the start of a fitting day until its hours end, a range past midnight until it closes", () => {
    const tuesday: Schedule = {
      days: ["tue"],
      hours: { open: "16:00", close: "21:00" },
    };
    expect(showing(tuesday, "2026-10-13T04:00:00Z")).toEqual({
      showing: true,
      until: at("2026-10-14T01:00:00Z"),
    });
    expect(showing(tuesday, "2026-10-14T00:59:00Z").showing).toBe(true);
    expect(showing(tuesday, "2026-10-14T01:00:00Z")).toEqual({
      showing: false,
      next: at("2026-10-20T04:00:00Z"),
    });
    const late: Schedule = {
      ...lent,
      hours: { open: "22:00", close: "02:00" },
    };
    expect(showing(late, "2027-03-27T05:30:00Z")).toEqual({
      showing: true,
      until: at("2027-03-27T06:00:00Z"),
    });
    expect(showing(late, "2027-03-27T06:00:00Z")).toEqual({
      showing: false,
      next: null,
    });
  });

  it("holds the first and last day, including the last day's whole evening", () => {
    expect(showing(lent, "2027-02-12T05:00:00Z").showing).toBe(true);
    expect(showing(lent, "2027-02-10T15:00:00Z")).toEqual({
      showing: false,
      next: at("2027-02-12T05:00:00Z"),
    });
    expect(showing(lent, "2027-03-27T03:59:00Z").showing).toBe(true);
    expect(showing(lent, "2027-03-27T04:00:00Z")).toEqual({
      showing: false,
      next: null,
    });
  });

  it("chains windows that touch or overlap, so Friday and Saturday nights run to 2 am Sunday", () => {
    const weekend: Schedule = {
      days: ["fri", "sat"],
      hours: { open: "22:00", close: "02:00" },
    };
    expect(showing(weekend, "2026-10-10T03:00:00Z")).toEqual({
      showing: true,
      until: at("2026-10-11T06:00:00Z"),
    });
    expect(showing(weekend, "2026-10-11T05:59:00Z")).toEqual({
      showing: true,
      until: at("2026-10-11T06:00:00Z"),
    });
    expect(showing(weekend, "2026-10-11T06:00:00Z")).toEqual({
      showing: false,
      next: at("2026-10-16T04:00:00Z"),
    });
    const weekdays: Schedule = { days: ["mon", "tue", "wed", "thu", "fri"] };
    expect(showing(weekdays, "2026-10-13T17:00:00Z")).toEqual({
      showing: true,
      until: at("2026-10-17T04:00:00Z"),
    });
    const always: Schedule = { hours: { open: "22:00", close: "02:00" } };
    expect(showing(always, "2026-10-13T17:00:00Z")).toEqual({
      showing: true,
      until: null,
    });
  });

  it("follows the wall clock through the spring forward and the fall back", () => {
    const small: Schedule = {
      days: ["sun"],
      hours: { open: "01:30", close: "02:30" },
    };
    expect(showing(small, "2026-03-08T05:30:00Z").showing).toBe(true);
    expect(showing(small, "2026-03-08T06:30:00Z").showing).toBe(true);
    expect(showing(small, "2026-03-08T07:00:00Z").showing).toBe(false);
    expect(showing(small, "2026-11-01T05:30:00Z").showing).toBe(true);
    expect(showing(small, "2026-11-01T06:30:00Z").showing).toBe(true);
    expect(showing(small, "2026-11-01T07:30:00Z").showing).toBe(false);
    expect(
      showing(small, "2026-03-08T08:30:00Z", "America/Phoenix").showing,
    ).toBe(true);
    expect(
      showing(small, "2026-03-08T09:30:00Z", "America/Phoenix").showing,
    ).toBe(false);
    const sunday: Schedule = { days: ["sun"] };
    expect(showing(sunday, "2026-03-07T17:00:00Z")).toEqual({
      showing: false,
      next: at("2026-03-08T05:00:00Z"),
    });
    expect(showing(sunday, "2026-10-31T17:00:00Z")).toEqual({
      showing: false,
      next: at("2026-11-01T04:00:00Z"),
    });
    expect(showing(sunday, "2026-11-01T12:00:00Z")).toEqual({
      showing: true,
      until: at("2026-11-02T05:00:00Z"),
    });
    expect(showing(sunday, "2026-11-02T12:00:00Z")).toEqual({
      showing: false,
      next: at("2026-11-08T05:00:00Z"),
    });
  });

  it("finds the next day of a season, a month of the year, and the first day of a run", () => {
    expect(showing(season, "2026-06-15T16:00:00Z")).toEqual({
      showing: false,
      next: at("2026-09-01T04:00:00Z"),
    });
    expect(showing(season, "2026-12-15T16:00:00Z").showing).toBe(true);
    expect(showing(lent, "2026-10-09T16:00:00Z")).toEqual({
      showing: false,
      next: at("2027-02-12T05:00:00Z"),
    });
    const may: Schedule = { days: ["sun"], weeks: ["second"], months: ["may"] };
    expect(showing(may, "2026-10-09T16:00:00Z")).toEqual({
      showing: false,
      next: at("2027-05-09T04:00:00Z"),
    });
    const fourth: Schedule = { days: ["fri"], weeks: ["fourth"] };
    expect(showing(fourth, "2026-10-24T04:00:00Z")).toEqual({
      showing: false,
      next: at("2026-11-27T05:00:00Z"),
    });
  });

  it("shows a single day on that day alone", () => {
    const only: Schedule = { from: today, until: today };
    expect(showing(only, "2026-10-09T04:00:00Z")).toEqual({
      showing: true,
      until: at("2026-10-10T04:00:00Z"),
    });
    expect(showing(only, "2026-10-10T04:00:00Z")).toEqual({
      showing: false,
      next: null,
    });
    expect(showing(only, "2026-10-08T12:00:00Z")).toEqual({
      showing: false,
      next: at("2026-10-09T04:00:00Z"),
    });
  });
});

describe("the sentence diners read (D-159)", () => {
  const read = (schedule: Schedule, day = today) =>
    scheduleSentence(schedule, day, "en", words, en.time);

  it.each([
    [{ from: today, until: today }, "Today only."],
    [
      { days: ["tue"], hours: { open: "16:00", close: "21:00" } },
      "Tuesdays, 4 to 9 pm.",
    ],
    [
      {
        days: ["sun"],
        weeks: ["second"],
        months: ["may"],
        hours: { open: "10:00", close: "14:00" },
      },
      "The second Sunday in May, 10 am to 2 pm.",
    ],
    [{ until: "2026-10-31" }, "Until October 31."],
    [{ days: [...DAY_KEYS] }, "Every day."],
    [{ days: ["tue"], months: [...MONTH_KEYS] }, "Tuesdays."],
    [
      {
        days: [...DAY_KEYS],
        months: [...MONTH_KEYS],
        hours: { open: "16:00", close: "21:00" },
      },
      "Every day, 4 to 9 pm.",
    ],
    [{ days: ["fri", "mon"] }, "Mondays and Fridays."],
    [{ days: ["mon", "wed", "fri"] }, "Mondays, Wednesdays, and Fridays."],
    [
      { days: ["fri"], weeks: ["first", "third"] },
      "The first and third Friday of each month.",
    ],
    [
      { days: ["sat", "sun"], weeks: ["last"] },
      "The last Saturday and Sunday of each month.",
    ],
    [
      { days: ["sun"], weeks: ["second"], months: ["may"] },
      "The second Sunday in May.",
    ],
    [
      { days: ["sat"], weeks: ["first"], months: ["sep", "oct", "nov"] },
      "The first Saturday of each month, September to November.",
    ],
    [
      { days: ["sat"], weeks: ["first"], months: ["may", "oct"] },
      "The first Saturday of each month, May and October.",
    ],
    [season, "September to April."],
    [{ months: ["may", "oct"] }, "May and October."],
    [{ months: ["may"] }, "May."],
    [{ months: ["jan", "mar", "may"] }, "January, March, and May."],
    [{ months: ["nov", "dec", "jan"] }, "November to January."],
    [
      { months: ["jan", "feb", "jun", "jul", "aug"] },
      "January, February, June, July, and August.",
    ],
    [{ days: ["fri"], ...season }, "Fridays, September to April."],
    [{ hours: { open: "16:00", close: "21:00" } }, "Every day, 4 to 9 pm."],
    [{ hours: { open: "10:00", close: "14:00" } }, "Every day, 10 am to 2 pm."],
    [{ hours: { open: "12:00", close: "15:00" } }, "Every day, noon to 3 pm."],
    [{ hours: { open: "22:00", close: "02:00" } }, "Every day, 10 pm to 2 am."],
    [{ hours: { open: "17:30", close: "21:00" } }, "Every day, 5:30 to 9 pm."],
    [
      { hours: { open: "00:00", close: "02:00" } },
      "Every day, midnight to 2 am.",
    ],
    [
      { hours: { open: "11:30", close: "12:00" } },
      "Every day, 11:30 am to noon.",
    ],
    [{ from: "2027-02-10" }, "From February 10, 2027."],
    [{ from: "2026-10-16", until: "2026-10-16" }, "October 16 only."],
    [
      { from: "2027-02-10", until: "2027-03-26" },
      "February 10 to March 26, 2027.",
    ],
    [
      { from: "2026-12-20", until: "2027-01-05" },
      "December 20 to January 5, 2027.",
    ],
    [{ from: "2026-10-16", until: "2026-10-31" }, "October 16 to 31."],
    [
      {
        days: ["tue"],
        hours: { open: "16:00", close: "21:00" },
        until: "2026-10-31",
      },
      "Tuesdays, 4 to 9 pm, until October 31.",
    ],
    [
      {
        days: ["tue"],
        months: ["sep", "oct"],
        hours: { open: "16:00", close: "21:00" },
        from: "2026-10-16",
        until: "2026-10-31",
      },
      "Tuesdays, September and October, 4 to 9 pm, October 16 to 31.",
    ],
  ] as [Schedule, string][])("reads %j as %s", (schedule, expected) => {
    expect(read(schedule)).toBe(expected);
  });

  it("drops a year that is today's, and says it once at the end when both days share it", () => {
    expect(read(lent, "2027-02-01")).toBe("Fridays, February 10 to March 26.");
    expect(read(lent, "2026-10-09")).toBe(
      "Fridays, February 10 to March 26, 2027.",
    );
    expect(
      read({ from: "2026-10-16", until: "2026-10-16" }, "2026-10-16"),
    ).toBe("Today only.");
    expect(read({ from: "2027-10-16", until: "2027-10-16" })).toBe(
      "October 16, 2027 only.",
    );
    expect(read({ from: "2027-10-16", until: "2027-10-31" })).toBe(
      "October 16 to October 31, 2027.",
    );
  });
});

describe("the dish page's line under the sentence (D-159)", () => {
  const showing: ShowingCopy = {
    showsNow: "Shows now, until {time}.",
    showsNowOn: "Shows now, until {time} {day}.",
    showsNowAllDay: "Shows now, all day.",
    nextShows: "Next shows {date}.",
    never: "No day ahead fits this schedule, so diners do not see it.",
  };
  const line = (schedule: Schedule, iso: string) =>
    showingSentence(
      showingAt(schedule, at(iso), newYork),
      schedule,
      at(iso),
      newYork,
      "en",
      showing,
      en.time,
    );

  it("says until when today, names the day when the end is not today, and all day with no hours", () => {
    const tuesday: Schedule = {
      days: ["tue"],
      hours: { open: "16:00", close: "21:00" },
    };
    expect(line(tuesday, "2026-10-13T20:00:00Z")).toBe(
      "Shows now, until 9 pm.",
    );
    const weekend: Schedule = {
      days: ["fri", "sat"],
      hours: { open: "22:00", close: "02:00" },
    };
    expect(line(weekend, "2026-10-10T03:00:00Z")).toBe(
      "Shows now, until 2 am Sunday.",
    );
    expect(line({ days: ["fri"] }, "2026-10-10T03:00:00Z")).toBe(
      "Shows now, all day.",
    );
    expect(
      line(
        { hours: { open: "22:00", close: "02:00" } },
        "2026-10-10T03:00:00Z",
      ),
    ).toBe("Shows now, all day.");
  });

  it("says when it next shows, with the year when it is another, and when no day ahead fits", () => {
    expect(line({ days: ["tue"] }, "2026-10-09T16:00:00Z")).toBe(
      "Next shows Tuesday, October 13.",
    );
    expect(line(lent, "2026-10-09T16:00:00Z")).toBe(
      "Next shows Friday, February 12, 2027.",
    );
    expect(line({ until: "2026-10-01" }, "2026-10-09T16:00:00Z")).toBe(
      "No day ahead fits this schedule, so diners do not see it.",
    );
    expect(
      line(
        { days: ["mon"], from: "2026-10-13", until: "2026-10-18" },
        "2026-10-09T16:00:00Z",
      ),
    ).toBe("No day ahead fits this schedule, so diners do not see it.");
  });
});

describe("the migration folder", () => {
  it("holds migration nine by its name", () => {
    expect(readdirSync(dir)).toContain(
      "20261009000001_schedule_availability.sql",
    );
  });
});
