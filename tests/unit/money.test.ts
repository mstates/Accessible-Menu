import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  addedPrice,
  formatPrice,
  numberToWords,
  parsePrice,
  PRICE_LIMITS,
  priceInputText,
} from "../../src/domain/money";

const copy = en.money;

describe("prices in numerals and in words (Q-6, D-20)", () => {
  it.each([
    [1250, "$12.50", "twelve dollars and fifty cents"],
    [1200, "$12", "twelve dollars"],
    [100, "$1", "one dollar"],
    [99, "$0.99", "ninety-nine cents"],
    [101, "$1.01", "one dollar and one cent"],
    [0, "$0", "zero dollars"],
    [2405, "$24.05", "twenty-four dollars and five cents"],
  ])("%i cents shows %s and says %s", (cents, display, spoken) => {
    expect(formatPrice({ kind: "exact", cents }, copy)).toEqual({
      display,
      spoken,
    });
  });

  it("says a whole-dollar range once", () => {
    expect(
      formatPrice({ kind: "range", minCents: 1200, maxCents: 1500 }, copy),
    ).toEqual({
      display: "$12 to $15",
      spoken: "twelve to fifteen dollars",
    });
  });

  it("spells out both ends of a range with cents", () => {
    expect(
      formatPrice({ kind: "range", minCents: 1250, maxCents: 1575 }, copy),
    ).toEqual({
      display: "$12.50 to $15.75",
      spoken:
        "twelve dollars and fifty cents to fifteen dollars and seventy-five cents",
    });
  });

  it("passes price text through unchanged", () => {
    expect(formatPrice({ kind: "text", text: "Market price" }, copy)).toEqual({
      display: "Market price",
      spoken: "Market price",
    });
  });

  // D-166: an option's added price.
  it.each([
    [200, "+$2", "plus two dollars"],
    [150, "+$1.50", "plus one dollar and fifty cents"],
    [50, "+$0.50", "plus fifty cents"],
  ])("%i cents added shows %s and says %s", (cents, display, spoken) => {
    expect(addedPrice(cents, copy)).toEqual({ display, spoken });
  });

  it("reads an added price of zero as no extra charge", () => {
    expect(addedPrice(0, copy)).toEqual({
      display: copy.noExtraCharge,
      spoken: copy.noExtraCharge,
    });
  });
});

describe("numberToWords", () => {
  it.each([
    [0, "zero"],
    [13, "thirteen"],
    [20, "twenty"],
    [21, "twenty-one"],
    [100, "one hundred"],
    [115, "one hundred fifteen"],
    [999, "nine hundred ninety-nine"],
    [1000, "one thousand"],
    [1234, "one thousand two hundred thirty-four"],
    [20000, "twenty thousand"],
  ])("%i is %s", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it("falls back to digits at one million and beyond", () => {
    expect(numberToWords(1_000_000)).toBe("1000000");
  });

  it("rejects fractions and negatives", () => {
    expect(() => numberToWords(1.5)).toThrow(RangeError);
    expect(() => numberToWords(-1)).toThrow(RangeError);
  });
});

describe("reading a typed price (D-139)", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["$12", 1200],
    ["$12.50", 1250],
    [" 7 ", 700],
    ["0", 0],
    ["0.99", 99],
    ["007", 700],
    ["99999.99", 9999999],
  ])("reads %j as %i cents", (typed, cents) => {
    expect(parsePrice(typed)).toEqual({ ok: true, cents });
  });

  it("reads blank as no price, which shows nothing", () => {
    expect(parsePrice("")).toEqual({ ok: true, cents: null });
    expect(parsePrice("   ")).toEqual({ ok: true, cents: null });
  });

  it.each([
    "12.",
    ".50",
    "12,50",
    "twelve",
    "$",
    "-1",
    "12.555",
    "12 50",
    "$ 12",
    "1e3",
    "12 dollars",
  ])("refuses %j by its shape and never guesses", (typed) => {
    expect(parsePrice(typed)).toEqual({ ok: false, rule: "priceFormat" });
  });

  it("refuses a price over the cap by name, and takes the cap itself", () => {
    expect(parsePrice("100000")).toEqual({ ok: false, rule: "priceRange" });
    expect(parsePrice("99999.99")).toEqual({
      ok: true,
      cents: PRICE_LIMITS.cents,
    });
    expect(PRICE_LIMITS.cents).toBe(9_999_999);
  });

  it("has a message for each rule, and the cap's names the cap", () => {
    const errors = en.owner.dish.errors;
    expect(errors.priceFormat).not.toBe("");
    expect(errors.priceRange).toContain("100,000");
  });
});

describe("a saved price as the field shows it (Michael, October 7, 2026)", () => {
  it.each([
    [1200, "12.00"],
    [1250, "12.50"],
    [5, "0.05"],
    [0, "0.00"],
    [9999999, "99999.99"],
  ])("%i cents shows as %s, two decimals always", (cents, text) => {
    expect(priceInputText(cents)).toBe(text);
  });

  it("shows no price as blank", () => {
    expect(priceInputText(null)).toBe("");
  });

  it("reads back what it shows", () => {
    for (const cents of [0, 5, 1250, 9999999]) {
      expect(parsePrice(priceInputText(cents))).toEqual({ ok: true, cents });
    }
    expect(parsePrice(priceInputText(null))).toEqual({ ok: true, cents: null });
  });
});
