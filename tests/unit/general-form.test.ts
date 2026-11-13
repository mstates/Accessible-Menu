import { describe, expect, it } from "vitest";
import type { DishGeneral } from "../../src/domain/dish";
import {
  GENERAL_IDS,
  generalFields,
  isBlankSize,
  sameGeneralFields,
  sizeFieldId,
  validateGeneralForm,
  type GeneralFields,
} from "../../src/features/owner/dish/general-form";

// A dish's General page as one form (D-237): the fields from the document
// the page showed, what a Save checks in page order, the document it
// sends, and what counts as an unsaved change. Only the chosen price
// choice is checked and written (Q-171); a wholly blank size row is
// dropped without a word and is never a change.

const CUP = "11111111-1111-4111-8111-111111111111";
const BOWL = "22222222-2222-4222-8222-222222222222";

const shown: DishGeneral = {
  description: "Tomato and basil",
  note: null,
  price_kind: "sizes",
  price_cents: 900,
  calories_low: 320,
  calories_high: null,
  sizes: [
    {
      id: CUP,
      name: "Cup",
      price_cents: 500,
      calories_low: 180,
      calories_high: null,
    },
    {
      id: BOWL,
      name: "Bowl",
      price_cents: 800,
      calories_low: 290,
      calories_high: 310,
    },
  ],
};

function fields(change: Partial<GeneralFields> = {}): GeneralFields {
  return { ...generalFields(shown), ...change };
}

const added = (name: string, price: string, calories = "") => ({
  key: `new-${name || "blank"}`,
  id: null,
  name,
  price,
  calories,
});

describe("the form's fields from the document the page showed", () => {
  it("shows a blank for each null, a price with two decimals, calories as their field reads them, and the sizes in the document's order with their ids as keys", () => {
    expect(generalFields(shown)).toEqual({
      description: "Tomato and basil",
      note: "",
      kind: "sizes",
      price: "9.00",
      calories: "320",
      sizes: [
        { key: CUP, id: CUP, name: "Cup", price: "5.00", calories: "180" },
        {
          key: BOWL,
          id: BOWL,
          name: "Bowl",
          price: "8.00",
          calories: "290 to 310",
        },
      ],
    });
  });

  it("shows a size an older draft left blank as a blank row", () => {
    const draft = generalFields({
      ...shown,
      sizes: [
        {
          id: CUP,
          name: null,
          price_cents: null,
          calories_low: null,
          calories_high: null,
        },
      ],
    });
    expect(draft.sizes).toEqual([
      { key: CUP, id: CUP, name: "", price: "", calories: "" },
    ]);
    expect(draft.sizes.every(isBlankSize)).toBe(true);
  });
});

describe("what a Save checks, in page order", () => {
  it("passes the form as the page showed it, and sends the same document back", () => {
    expect(validateGeneralForm(fields(), shown)).toEqual({
      problems: [],
      next: shown,
    });
  });

  it("finds the description and the note over their lengths, then the chosen choice's own fields", () => {
    const check = validateGeneralForm(
      fields({
        description: "x".repeat(501),
        note: "y".repeat(121),
        kind: "one",
        price: "twelve",
        calories: "lots",
      }),
      shown,
    );
    expect(check.next).toBeNull();
    expect(check.problems).toEqual([
      { id: GENERAL_IDS.description, rule: "descriptionLength" },
      { id: GENERAL_IDS.note, rule: "noteLength" },
      { id: GENERAL_IDS.price, rule: "priceFormat" },
      { id: GENERAL_IDS.calories, rule: "caloriesFormat" },
    ]);
  });

  it("names the one price over the cap and calories over the cap or out of order", () => {
    const rule = (change: Partial<GeneralFields>) =>
      validateGeneralForm(
        fields({ kind: "one", ...change }),
        shown,
      ).problems.map((problem) => problem.rule);
    expect(rule({ price: "100000" })).toEqual(["priceRange"]);
    expect(rule({ calories: "100,000" })).toEqual(["caloriesRange"]);
    expect(rule({ calories: "500 to 400" })).toEqual(["caloriesOrder"]);
  });

  it("checks calories alone under Market price, and never the one price", () => {
    expect(
      validateGeneralForm(
        fields({ kind: "market", price: "twelve", calories: "lots" }),
        shown,
      ).problems,
    ).toEqual([{ id: GENERAL_IDS.calories, rule: "caloriesFormat" }]);
  });

  it("needs a name and a price for every size, one problem a field, in row order, each naming its size by its name or its place", () => {
    const rows = [
      { key: CUP, id: CUP, name: "Cup", price: "", calories: "180" },
      { key: BOWL, id: BOWL, name: "", price: "8", calories: "" },
      added("", "", "200"),
    ];
    const check = validateGeneralForm(fields({ sizes: rows }), shown);
    expect(check.problems).toEqual([
      {
        id: sizeFieldId(CUP, "price"),
        rule: "sizePriceRequired",
        size: { position: 1, name: "Cup" },
      },
      {
        id: sizeFieldId(BOWL, "name"),
        rule: "sizeNameRequired",
        size: { position: 2, name: "" },
      },
      {
        id: sizeFieldId("new-blank", "name"),
        rule: "sizeNameRequired",
        size: { position: 3, name: "" },
      },
      {
        id: sizeFieldId("new-blank", "price"),
        rule: "sizePriceRequired",
        size: { position: 3, name: "" },
      },
    ]);
  });

  it("names a size's own length, price, and calorie rules", () => {
    const long = "x".repeat(41);
    const rows = [
      { key: CUP, id: CUP, name: long, price: "five", calories: "lots" },
      {
        key: BOWL,
        id: BOWL,
        name: "Bowl",
        price: "100000",
        calories: "9 to 5",
      },
      added("Pint", "7", "100,000"),
    ];
    expect(
      validateGeneralForm(fields({ sizes: rows }), shown).problems.map(
        (problem) => [problem.id, problem.rule],
      ),
    ).toEqual([
      [sizeFieldId(CUP, "name"), "sizeNameLength"],
      [sizeFieldId(CUP, "price"), "sizePriceFormat"],
      [sizeFieldId(CUP, "calories"), "sizeCaloriesFormat"],
      [sizeFieldId(BOWL, "price"), "sizePriceRange"],
      [sizeFieldId(BOWL, "calories"), "sizeCaloriesOrder"],
      [sizeFieldId("new-Pint", "calories"), "sizeCaloriesRange"],
    ]);
  });

  it("refuses a name another size above it has, whatever the case or the outer spaces, and names the earlier one", () => {
    const rows = [...fields().sizes, added(" cup ", "6")];
    expect(
      validateGeneralForm(fields({ sizes: rows }), shown).problems,
    ).toEqual([
      {
        id: sizeFieldId("new- cup ", "name"),
        rule: "nameTaken",
        size: { position: 3, name: "cup" },
        other: "Cup",
      },
    ]);
  });

  it("lets two sizes trade names, since no two end with the same one", () => {
    const rows = [
      { key: CUP, id: CUP, name: "Bowl", price: "5", calories: "" },
      { key: BOWL, id: BOWL, name: "Cup", price: "8", calories: "" },
    ];
    expect(
      validateGeneralForm(fields({ sizes: rows }), shown).problems,
    ).toEqual([]);
  });

  it("drops a size row left wholly blank without a word, an added one and one an older draft held", () => {
    const rows = [
      { key: CUP, id: CUP, name: "  ", price: " ", calories: "" },
      { key: BOWL, id: BOWL, name: "Bowl", price: "8.00", calories: "" },
      added("", ""),
    ];
    const check = validateGeneralForm(fields({ sizes: rows }), shown);
    expect(check.problems).toEqual([]);
    expect(check.next?.sizes).toEqual([
      {
        id: BOWL,
        name: "Bowl",
        price_cents: 800,
        calories_low: null,
        calories_high: null,
      },
    ]);
  });

  it("checks nothing under a choice that is not the chosen one", () => {
    const rows = [added("", "nonsense", "lots")];
    expect(
      validateGeneralForm(
        fields({ kind: "one", price: "9", calories: "", sizes: rows }),
        shown,
      ).problems,
    ).toEqual([]);
    expect(
      validateGeneralForm(
        fields({ kind: "sizes", price: "twelve", calories: "lots" }),
        shown,
      ).problems,
    ).toEqual([]);
  });
});

describe("the document a Save sends", () => {
  it("cleans the texts, stores a blank as null, and writes the chosen choice's values", () => {
    const check = validateGeneralForm(
      fields({
        description: "  Soup\r\nof the day\t ",
        note: "  ",
        kind: "one",
        price: "$12.5",
        calories: "300 to 340",
      }),
      shown,
    );
    expect(check.next).toEqual({
      description: "Soup\nof the day",
      note: null,
      price_kind: "one",
      price_cents: 1250,
      calories_low: 300,
      calories_high: 340,
      sizes: shown.sizes,
    });
  });

  it("copies what the page showed for every choice that is not the chosen one: the sizes under One price and Market price, the one price under the others, the dish's calories under Prices by size", () => {
    const typed = [added("Typed", "3")];
    const one = validateGeneralForm(
      fields({ kind: "one", price: "10", calories: "", sizes: typed }),
      shown,
    ).next;
    expect(one?.sizes).toBe(shown.sizes);
    expect(one?.price_cents).toBe(1000);
    expect(one?.calories_low).toBeNull();

    const market = validateGeneralForm(
      fields({ kind: "market", price: "10", calories: "410", sizes: typed }),
      shown,
    ).next;
    expect(market?.sizes).toBe(shown.sizes);
    expect(market?.price_cents).toBe(900);
    expect(market?.calories_low).toBe(410);

    const sizes = validateGeneralForm(
      fields({ kind: "sizes", price: "10", calories: "410" }),
      shown,
    ).next;
    expect(sizes?.price_cents).toBe(900);
    expect(sizes?.calories_low).toBe(320);
    expect(sizes?.calories_high).toBeNull();
  });

  it("keeps each size's id, gives a new size a null id, and leaves a removed size out, in the page's order", () => {
    const rows = [
      { key: BOWL, id: BOWL, name: "Bowl", price: "9", calories: "290 to 310" },
      added("Pint", "7", "200"),
    ];
    expect(
      validateGeneralForm(fields({ sizes: rows }), shown).next?.sizes,
    ).toEqual([
      {
        id: BOWL,
        name: "Bowl",
        price_cents: 900,
        calories_low: 290,
        calories_high: 310,
      },
      {
        id: null,
        name: "Pint",
        price_cents: 700,
        calories_low: 200,
        calories_high: null,
      },
    ]);
  });
});

describe("what counts as an unsaved change", () => {
  const first = generalFields(shown);

  it("is nothing on arrival, and nothing for a text or a price typed another way", () => {
    expect(sameGeneralFields(fields(), first)).toBe(true);
    expect(
      sameGeneralFields(fields({ description: " Tomato and basil " }), first),
    ).toBe(true);
    const retyped = first.sizes.map((row) =>
      row.id === CUP ? { ...row, price: "5" } : row,
    );
    expect(sameGeneralFields(fields({ sizes: retyped }), first)).toBe(true);
  });

  it("is a changed text, a changed choice, or a changed value under the chosen choice", () => {
    expect(sameGeneralFields(fields({ description: "Other" }), first)).toBe(
      false,
    );
    expect(sameGeneralFields(fields({ note: "Comes with bread" }), first)).toBe(
      false,
    );
    expect(sameGeneralFields(fields({ kind: "one" }), first)).toBe(false);
    const repriced = first.sizes.map((row) =>
      row.id === CUP ? { ...row, price: "6" } : row,
    );
    expect(sameGeneralFields(fields({ sizes: repriced }), first)).toBe(false);
    expect(
      sameGeneralFields(fields({ sizes: first.sizes.slice(1) }), first),
    ).toBe(false);
    expect(
      sameGeneralFields(
        fields({ sizes: [...first.sizes, added("Pint", "")] }),
        first,
      ),
    ).toBe(false);
  });

  it("is not a blank row, added or held, since a Save drops it", () => {
    expect(
      sameGeneralFields(
        fields({ sizes: [...first.sizes, added("", "")] }),
        first,
      ),
    ).toBe(true);
    const held = generalFields({
      ...shown,
      sizes: [
        ...shown.sizes,
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: null,
          price_cents: null,
          calories_low: null,
          calories_high: null,
        },
      ],
    });
    expect(
      sameGeneralFields({ ...held, sizes: held.sizes.slice(0, 2) }, held),
    ).toBe(true);
  });

  it("is not an edit under a choice that is not the chosen one, since a Save does not write it (Q-171)", () => {
    expect(
      sameGeneralFields(fields({ price: "55", calories: "999" }), first),
    ).toBe(true);
    const one = generalFields({ ...shown, price_kind: "one" });
    expect(
      sameGeneralFields({ ...one, sizes: [added("Typed", "3")] }, one),
    ).toBe(true);
  });

  it("is not an older draft the validator would refuse, until the owner changes it", () => {
    const draft = generalFields({
      ...shown,
      sizes: [
        {
          id: CUP,
          name: "Cup",
          price_cents: null,
          calories_low: null,
          calories_high: null,
        },
      ],
    });
    expect(sameGeneralFields(draft, draft)).toBe(true);
    expect(
      validateGeneralForm(draft, { ...shown, sizes: [] }).problems.map(
        (problem) => problem.rule,
      ),
    ).toEqual(["sizePriceRequired"]);
  });
});
