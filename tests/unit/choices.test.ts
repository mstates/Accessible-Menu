import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  CHOICE_LIMITS,
  cleanLead,
  cleanOptionText,
  leadProblem,
  OPTION_TEXTS,
  optionSentence,
  optionTextProblem,
  type OptionReading,
} from "../../src/domain/choices";
import { addedPrice } from "../../src/domain/money";

// Choice lists (D-166, task 7): the lead's and an option's rules, and the
// sentence diners read for one option, from the one builder (module rule
// 8), built here and rendered by the diner page task.

const copy = {
  money: en.money,
  calories: en.calories,
  allergens: en.allergens,
};
const errors = en.owner.choices;

const roll: OptionReading = {
  name: "Buttered roll",
  addedPriceCents: 200,
  calories: { low: 200, high: null },
  allergens: ["milk", "wheat"],
  customAllergens: [],
  allergensReviewed: true,
};

describe("a list's lead", () => {
  it("is one line, trimmed, like a name", () => {
    expect(cleanLead("  Choose one\tside\r\n ")).toBe("Choose one side");
    expect(leadProblem("Choose one side")).toBeNull();
  });

  it("is required, and takes 120 characters", () => {
    expect(leadProblem("")).toBe("leadRequired");
    expect(leadProblem("x".repeat(CHOICE_LIMITS.lead))).toBeNull();
    expect(leadProblem("x".repeat(CHOICE_LIMITS.lead + 1))).toBe("leadLength");
  });
});

describe("an option's texts", () => {
  it("come in the row's order", () => {
    expect(OPTION_TEXTS).toEqual(["name", "price", "calories"]);
  });

  it("has a name that is one line, required, and 60 characters at most", () => {
    expect(cleanOptionText("name", " Fries\n")).toBe("Fries");
    expect(optionTextProblem("name", "")).toBe("nameRequired");
    expect(
      optionTextProblem("name", "x".repeat(CHOICE_LIMITS.name)),
    ).toBeNull();
    expect(optionTextProblem("name", "x".repeat(CHOICE_LIMITS.name + 1))).toBe(
      "nameLength",
    );
  });

  it("reads an added price the way a dish's price is read, blank for none", () => {
    expect(cleanOptionText("price", " 1.5 ")).toBe("1.5");
    expect(optionTextProblem("price", "1.5")).toBeNull();
    expect(optionTextProblem("price", "")).toBeNull();
    expect(optionTextProblem("price", "two")).toBe("priceFormat");
    expect(optionTextProblem("price", "100000")).toBe("priceRange");
  });

  it("reads calories the way a dish's are read, blank for none", () => {
    expect(cleanOptionText("calories", " 150 ")).toBe("150");
    expect(optionTextProblem("calories", "150")).toBeNull();
    expect(optionTextProblem("calories", "150 to 200")).toBeNull();
    expect(optionTextProblem("calories", "")).toBeNull();
    expect(optionTextProblem("calories", "lots")).toBe("caloriesFormat");
    expect(optionTextProblem("calories", "200 to 150")).toBe("caloriesOrder");
  });

  it("matches the table constraints and names the caps in its messages", () => {
    expect(CHOICE_LIMITS).toEqual({ lead: 120, name: 60 });
    expect(errors.lists.errors.leadLength).toContain(
      String(CHOICE_LIMITS.lead),
    );
    expect(errors.page.errors.leadLength).toContain(String(CHOICE_LIMITS.lead));
    expect(errors.options.errors.nameLength).toContain(
      String(CHOICE_LIMITS.name),
    );
  });

  it("has a message for every rule", () => {
    for (const rule of [
      "nameRequired",
      "nameLength",
      "priceFormat",
      "priceRange",
      "caloriesFormat",
      "caloriesRange",
      "caloriesOrder",
    ] as const) {
      expect(errors.options.errors[rule]).not.toBe("");
    }
    for (const rule of ["leadRequired", "leadLength"] as const) {
      expect(errors.lists.errors[rule]).not.toBe("");
      expect(errors.page.errors[rule]).not.toBe("");
    }
  });
});

describe("an added price in words", () => {
  it("shows a plus sign and says plus, whole dollars without cents as every price (D-20)", () => {
    expect(addedPrice(200, en.money)).toEqual({
      display: "+$2",
      spoken: "plus two dollars",
    });
    expect(addedPrice(150, en.money)).toEqual({
      display: "+$1.50",
      spoken: "plus one dollar and fifty cents",
    });
  });

  it("reads zero as no extra charge, both ways", () => {
    expect(addedPrice(0, en.money)).toEqual({
      display: "no extra charge",
      spoken: "no extra charge",
    });
  });
});

describe("what diners read for one option (D-166, module rule 8)", () => {
  it("names the option, its added price, its calories, and its allergens", () => {
    expect(optionSentence(roll, copy, "en")).toMatchObject({
      display: "Buttered roll, +$2, 200 calories. Contains milk, wheat.",
      spoken:
        "Buttered roll, plus two dollars, 200 calories. Contains milk, wheat.",
    });
    expect(optionSentence(roll, copy, "en").allergen.kind).toBe("contains");
  });

  it("drops the price and the calories it does not have", () => {
    expect(
      optionSentence(
        { ...roll, addedPriceCents: null, calories: null },
        copy,
        "en",
      ).display,
    ).toBe("Buttered roll. Contains milk, wheat.");
    expect(
      optionSentence({ ...roll, calories: null }, copy, "en").display,
    ).toBe("Buttered roll, +$2. Contains milk, wheat.");
    expect(
      optionSentence({ ...roll, addedPriceCents: null }, copy, "en").display,
    ).toBe("Buttered roll, 200 calories. Contains milk, wheat.");
  });

  it("says a range of calories and other allergens with the nine", () => {
    expect(
      optionSentence(
        {
          ...roll,
          calories: { low: 150, high: 200 },
          customAllergens: ["celery"],
        },
        copy,
        "en",
      ).display,
    ).toBe(
      "Buttered roll, +$2, 150 to 200 calories. Contains milk, wheat, celery.",
    );
  });

  it("never reads as allergen-free unless a person said so (D-35)", () => {
    const unchecked = optionSentence(
      { ...roll, allergensReviewed: false },
      copy,
      "en",
    );
    expect(unchecked.allergen.kind).toBe("not-confirmed");
    expect(unchecked.display).toBe(
      `Buttered roll, +$2, 200 calories. ${en.allergens.notConfirmed}`,
    );
    const none = optionSentence(
      { ...roll, allergens: [], allergensReviewed: true },
      copy,
      "en",
    );
    expect(none.allergen.kind).toBe("checked-none");
  });
});
