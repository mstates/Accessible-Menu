import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { formatPrice, numberToWords } from "../../src/domain/money";

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
