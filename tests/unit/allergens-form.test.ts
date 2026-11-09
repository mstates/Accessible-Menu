import { describe, expect, it } from "vitest";
import { validateAllergenForm } from "../../src/features/owner/dish/allergens-form";

// What a Save of the allergen form checks (D-229): blank rows dropped
// without a word, one problem per row in row order, a repeat named after
// the earlier row.

describe("validateAllergenForm", () => {
  it("drops blank rows and cleans the rest", () => {
    expect(validateAllergenForm(["", "  celery ", "   ", "mustard"])).toEqual({
      others: ["celery", "mustard"],
      problems: [],
    });
  });

  it("finds a comma, a length, a major name, and a repeat, one per row, in row order", () => {
    const long = "x".repeat(41);
    const result = validateAllergenForm([
      "Milk",
      "nuts, except almonds",
      long,
      "celery",
      "",
      "Celery",
    ]);
    expect(result.problems).toEqual([
      { index: 0, rule: "otherMajor:milk" },
      { index: 1, rule: "otherComma" },
      { index: 2, rule: "otherLength" },
      { index: 5, rule: "otherTaken", other: "celery" },
    ]);
    expect(result.others).toEqual([
      "Milk",
      "nuts, except almonds",
      long,
      "celery",
      "Celery",
    ]);
  });

  it("names both when a row covers two major allergens", () => {
    expect(validateAllergenForm(["nuts"]).problems).toEqual([
      { index: 0, rule: "otherMajor:both" },
    ]);
  });

  it("flags the later of two repeats, never the earlier", () => {
    const result = validateAllergenForm(["celery", "mustard", " CELERY"]);
    expect(result.problems).toEqual([
      { index: 2, rule: "otherTaken", other: "celery" },
    ]);
  });
});
