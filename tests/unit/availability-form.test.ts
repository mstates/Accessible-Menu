import { describe, expect, it } from "vitest";
import { validateAvailabilityForm } from "../../src/features/owner/dish/availability-form";
import { SCHEDULE_IDS } from "../../src/features/owner/dish/showing-ids";

// What a Save of the availability form checks (D-229): each rule on its
// field, in page order, and the schedule in its stored shape when all is
// well.

const today = "2026-11-09";
const clean = {
  days: [],
  weeks: [],
  months: [],
  open: "",
  close: "",
  from: "",
  until: "",
} as const;

describe("validateAvailabilityForm", () => {
  it("reads nothing as no schedule", () => {
    expect(validateAvailabilityForm(clean, today)).toEqual({
      problems: [],
      schedule: null,
    });
  });

  it("stores the hours as a pair of clock times, dates as days, and the lists in fixed order", () => {
    expect(
      validateAvailabilityForm(
        {
          days: ["fri", "mon"],
          weeks: ["last", "first"],
          months: ["mar", "jan"],
          open: "4 pm",
          close: "9:30 pm",
          from: "10/31/2099",
          until: "November 2, 2099",
        },
        today,
      ),
    ).toEqual({
      problems: [],
      schedule: {
        days: ["mon", "fri"],
        weeks: ["first", "last"],
        months: ["jan", "mar"],
        hours: { open: "16:00", close: "21:30" },
        from: "2099-10-31",
        until: "2099-11-02",
      },
    });
  });

  it("wants the blank side of a half-filled pair", () => {
    expect(
      validateAvailabilityForm({ ...clean, close: "9 pm" }, today).problems,
    ).toEqual([{ id: SCHEDULE_IDS.open, rule: "timePairStarts" }]);
    expect(
      validateAvailabilityForm({ ...clean, open: "4 pm" }, today).problems,
    ).toEqual([{ id: SCHEDULE_IDS.close, rule: "timePairEnds" }]);
  });

  it("tells a time without am or pm from one in no shape, on its own side", () => {
    expect(
      validateAvailabilityForm({ ...clean, open: "4", close: "soon" }, today)
        .problems,
    ).toEqual([
      { id: SCHEDULE_IDS.open, rule: "timeAmPmStarts" },
      { id: SCHEDULE_IDS.close, rule: "timeFormatEnds" },
    ]);
  });

  it("refuses equal times on Ends", () => {
    expect(
      validateAvailabilityForm(
        { ...clean, open: "4 pm", close: "16:00" },
        today,
      ).problems,
    ).toEqual([{ id: SCHEDULE_IDS.close, rule: "sameTime" }]);
  });

  it("refuses a date in no shape on its field, and a last day before the first on the last", () => {
    expect(
      validateAvailabilityForm(
        { ...clean, from: "soon", until: "later" },
        today,
      ).problems,
    ).toEqual([
      { id: SCHEDULE_IDS.from, rule: "dateFormat" },
      { id: SCHEDULE_IDS.until, rule: "dateFormat" },
    ]);
    expect(
      validateAvailabilityForm(
        { ...clean, from: "10/31/2099", until: "Oct 30, 2099" },
        today,
      ).problems,
    ).toEqual([{ id: SCHEDULE_IDS.until, rule: "dateOrder" }]);
  });

  it("wants a day for a week, said on the first ticked week", () => {
    expect(
      validateAvailabilityForm({ ...clean, weeks: ["third", "second"] }, today)
        .problems,
    ).toEqual([{ id: SCHEDULE_IDS.week("second"), rule: "weeksNeedDay" }]);
    expect(
      validateAvailabilityForm(
        { ...clean, days: ["mon"], weeks: ["first"] },
        today,
      ),
    ).toEqual({
      problems: [],
      schedule: { days: ["mon"], weeks: ["first"] },
    });
  });

  it("lists the problems in page order: Starts, Ends, First day, Last day, the week", () => {
    expect(
      validateAvailabilityForm(
        {
          ...clean,
          weeks: ["first"],
          open: "4",
          from: "soon",
          until: "later",
        },
        today,
      ).problems.map((problem) => problem.rule),
    ).toEqual([
      "timeAmPmStarts",
      "timePairEnds",
      "dateFormat",
      "dateFormat",
      "weeksNeedDay",
    ]);
  });
});
