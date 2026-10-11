import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  CALORIE_LIMITS,
  caloriesInputText,
  caloriesOf,
  caloriesWords,
  parseCalories,
} from "../../src/domain/calories";

// Calories (D-167, task 7): one field reads a whole number or a range into
// the two columns (Michael, at the plan's tabs, October 10, 2026), the
// field shows them back, and one builder says them to diners.

const copy = en.calories;

describe("reading typed calories", () => {
  it.each([
    ["760", { low: 760, high: null }],
    [" 760 ", { low: 760, high: null }],
    ["0", { low: 0, high: null }],
    ["1,200", { low: 1200, high: null }],
    ["99,999", { low: 99999, high: null }],
  ])("reads %j as one number", (typed, calories) => {
    expect(parseCalories(typed)).toEqual({ ok: true, calories });
  });

  it.each([
    ["760 to 860", { low: 760, high: 860 }],
    ["760-860", { low: 760, high: 860 }],
    ["760 - 860", { low: 760, high: 860 }],
    ["760 – 860", { low: 760, high: 860 }],
    ["760–860", { low: 760, high: 860 }],
    ["1,200 to 1,500", { low: 1200, high: 1500 }],
  ])(
    "reads %j as a range, joined by to, a hyphen, or an en dash (Michael, at approval)",
    (typed, calories) => {
      expect(parseCalories(typed)).toEqual({ ok: true, calories });
    },
  );

  it("reads blank as none, which shows nothing", () => {
    expect(parseCalories("")).toEqual({ ok: true, calories: null });
    expect(parseCalories("   ")).toEqual({ ok: true, calories: null });
  });

  it("stores an equal pair as one number", () => {
    expect(parseCalories("760 to 760")).toEqual({
      ok: true,
      calories: { low: 760, high: null },
    });
  });

  it.each([
    "seven hundred",
    "760 cal",
    "760.5",
    "-760",
    "760 to",
    "to 860",
    "760 to 860 to 960",
    "7,60",
    "1e3",
  ])("refuses %j by its shape and never guesses", (typed) => {
    expect(parseCalories(typed)).toEqual({
      ok: false,
      rule: "caloriesFormat",
    });
  });

  it("refuses a number over the cap by name, and takes the cap itself", () => {
    expect(parseCalories("100000")).toEqual({
      ok: false,
      rule: "caloriesRange",
    });
    expect(parseCalories("760 to 100,000")).toEqual({
      ok: false,
      rule: "caloriesRange",
    });
    expect(parseCalories(String(CALORIE_LIMITS.max))).toEqual({
      ok: true,
      calories: { low: 99999, high: null },
    });
    expect(CALORIE_LIMITS.max).toBe(99_999);
  });

  it("refuses a range whose high number comes first", () => {
    expect(parseCalories("860 to 760")).toEqual({
      ok: false,
      rule: "caloriesOrder",
    });
  });

  it("has a message for each rule, and the cap's names the cap", () => {
    const errors = en.owner.dish.errors;
    expect(errors.caloriesFormat).not.toBe("");
    expect(errors.caloriesRange).toContain("100,000");
    expect(errors.caloriesOrder).not.toBe("");
    const options = en.owner.choices.options.errors;
    expect(options.caloriesFormat).toBe(errors.caloriesFormat);
    expect(options.caloriesRange).toBe(errors.caloriesRange);
    expect(options.caloriesOrder).toBe(errors.caloriesOrder);
  });
});

describe("saved calories as the field shows them", () => {
  it.each([
    [760, null, "760"],
    [760, 860, "760 to 860"],
    [760, 760, "760"],
    [0, null, "0"],
    [null, null, ""],
  ])("%s and %s show as %j", (low, high, text) => {
    expect(caloriesInputText(low, high)).toBe(text);
  });

  it("reads back what it shows", () => {
    for (const [low, high] of [
      [760, null],
      [760, 860],
      [0, null],
      [99999, null],
    ] as const) {
      expect(parseCalories(caloriesInputText(low, high))).toEqual({
        ok: true,
        calories: { low, high },
      });
    }
    expect(parseCalories(caloriesInputText(null, null))).toEqual({
      ok: true,
      calories: null,
    });
  });

  it("reads a row's two columns", () => {
    expect(caloriesOf(760, 860)).toEqual({ low: 760, high: 860 });
    expect(caloriesOf(760, null)).toEqual({ low: 760, high: null });
    expect(caloriesOf(760, 760)).toEqual({ low: 760, high: null });
    expect(caloriesOf(null, null)).toBeNull();
  });
});

describe("calories in words (module rule 8)", () => {
  it("says a number, with the digits in the page's language", () => {
    expect(caloriesWords({ low: 760, high: null }, copy, "en")).toBe(
      "760 calories",
    );
    expect(caloriesWords({ low: 1200, high: null }, copy, "en")).toBe(
      "1,200 calories",
    );
    expect(caloriesWords({ low: 1200, high: null }, copy, "de")).toBe(
      "1.200 calories",
    );
  });

  it("says one calorie in the singular, and zero in the plural", () => {
    expect(caloriesWords({ low: 1, high: null }, copy, "en")).toBe("1 calorie");
    expect(caloriesWords({ low: 0, high: null }, copy, "en")).toBe(
      "0 calories",
    );
  });

  it("says a range once", () => {
    expect(caloriesWords({ low: 760, high: 860 }, copy, "en")).toBe(
      "760 to 860 calories",
    );
    expect(caloriesWords({ low: 760, high: 760 }, copy, "en")).toBe(
      "760 calories",
    );
  });
});
