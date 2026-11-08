import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  dishWords,
  kindLabel,
  kindNotSavedSentence,
  lastDishSentence,
  movedSentence,
  nextDishLabel,
  notAddedSentence,
  notMovedSentence,
  notRemovedSentence,
  sizeAction,
  sizeAddedSentence,
  sizeLabel,
  sizeRemovedSentence,
  sizeSuffix,
  sizeWords,
} from "../../src/features/owner/dish/dish-words";
import {
  notSavedSentence,
  problemText,
} from "../../src/features/owner/editing/list-words";

// What a dish's page says, built from copy (D-128, D-139, D-141).

const strings = en.owner.dish;
const editing = en.owner.editing;
const words = dishWords(strings, editing);
const sizes = sizeWords(strings, editing);

const dish = "Soup of the day";
describe("the words the dish's texts are said in", () => {
  it("names the page's fields without the dish, and its sentences with it", () => {
    expect(words.fields.description?.label).toBe(strings.descriptionLabel);
    expect(words.fields.description?.suffix).toBe("");
    expect(words.fields.description?.multiline).toBe(true);
    expect(words.fields.price?.label).toBe(strings.price.amountLabel);
    expect(words.fields.note?.label).toBe(strings.noteLabel);
    expect(notSavedSentence(words, "note", dish)).toBe(
      `The note for ${dish} was not saved.`,
    );
    expect(notSavedSentence(words, "price", dish)).toBe(
      `The price of ${dish} was not saved.`,
    );
  });

  it("says a dish that is gone as the page's parent gone", () => {
    expect(problemText(words, { kind: "parent-gone" }, dish)).toBe(
      strings.errors.parentGone,
    );
    expect(problemText(words, { kind: "gone" }, dish)).toBe(
      strings.errors.parentGone,
    );
  });

  it("names each rule's message", () => {
    expect(
      problemText(words, { kind: "invalid", rule: "priceFormat" }, dish),
    ).toBe(strings.errors.priceFormat);
    expect(
      problemText(words, { kind: "invalid", rule: "descriptionLength" }, dish),
    ).toBe(strings.errors.descriptionLength);
    expect(
      problemText(words, { kind: "invalid", rule: "caloriesOrder" }, dish),
    ).toBe(strings.errors.caloriesOrder);
  });

  // D-167: calories beside each price, one field a place.
  it("names the calories field plainly on the dish and for its size", () => {
    expect(words.fields.calories).toMatchObject({
      label: strings.price.caloriesLabel,
      suffix: "",
      hint: strings.price.caloriesHint,
    });
    expect(notSavedSentence(words, "calories", dish)).toBe(
      `The calories of ${dish} were not saved.`,
    );
    expect(sizes.fields.calories).toMatchObject({
      label: strings.price.sizeCaloriesLabel,
      suffix: strings.price.labelFor,
    });
    expect(notSavedSentence(sizes, "calories", "Cup")).toBe(
      "The calories for Cup were not saved.",
    );
  });

  // D-167: the Cooked to order mark, under its own heading after Schedule.
  it("names the Cooked to order mark's failure", () => {
    expect(fill(strings.cookedToOrder.notSaved, { dish })).toBe(
      `The Cooked to order mark for ${dish} was not saved.`,
    );
  });
});

describe("the words a size's texts are said in", () => {
  it("names a size's fields for their size, and says a taken name", () => {
    expect(sizes.fields.name?.label).toBe(strings.price.sizeNameLabel);
    expect(sizes.fields.name?.suffix).toBe(strings.price.labelFor);
    expect(sizeSuffix(strings, "Cup")).toBe("for Cup");
    expect(notSavedSentence(sizes, "price", "Cup")).toBe(
      "The price for Cup was not saved.",
    );
    expect(problemText(sizes, { kind: "name-taken" }, "Cup")).toBe(
      "Another size of this dish is called Cup.",
    );
    expect(problemText(sizes, { kind: "gone" }, "Cup")).toBe(
      strings.errors.gone,
    );
  });

  it("names a size by its name, or by its place while it has none", () => {
    expect(
      sizeLabel(
        strings,
        { id: "z", name: "Cup", price: "5.00", calories: "" },
        1,
      ),
    ).toBe("Cup");
    expect(
      sizeLabel(strings, { id: "z", name: "", price: "", calories: "" }, 2),
    ).toBe("size 2");
    expect(sizeAction(strings, strings.price.removeSize, "Cup")).toBe(
      "Remove, Cup",
    );
    expect(sizeAction(strings, strings.price.showNames, "size 2")).toBe(
      "Show size names, size 2",
    );
  });

  it("counts sizes as they are added, and says a removal", () => {
    expect(sizeAddedSentence(strings, 1)).toBe("Size added. 1 size.");
    expect(sizeAddedSentence(strings, 2)).toBe("Size added. 2 sizes.");
    expect(sizeRemovedSentence(strings, "Cup")).toBe("Cup removed.");
  });

  it("says what did not happen, then why", () => {
    expect(notAddedSentence(strings, words, { kind: "failed" })).toBe(
      `A size was not added. ${editing.problems.failed}`,
    );
    expect(
      notRemovedSentence(strings, sizes, "Cup", { kind: "out-of-date" }),
    ).toBe(`Cup was not removed. ${editing.problems.outOfDate}`);
    expect(
      kindNotSavedSentence(strings, words, dish, { kind: "unreachable" }),
    ).toBe(
      `The price choice for ${dish} was not saved. ${editing.problems.unreachable}`,
    );
  });

  it("gives each price choice its visible words", () => {
    expect(kindLabel(strings, "one")).toBe("One price");
    expect(kindLabel(strings, "sizes")).toBe("Prices by size");
    expect(kindLabel(strings, "market")).toBe("Market price");
  });
});

describe("moving a dish (D-129, D-141)", () => {
  it("says the move, the menu, and that the owner has not left", () => {
    expect(movedSentence(strings.move, dish, "Mains", "Dinner")).toBe(
      `${dish} moved to Mains in Dinner. It is the last dish there. You are still on this page.`,
    );
  });

  it("says why a move did not land", () => {
    const gone = strings.errors.parentGone;
    expect(
      notMovedSentence(
        strings.move,
        editing,
        gone,
        { kind: "name-taken" },
        dish,
        "Mains",
      ),
    ).toBe(`${dish} was not moved. Mains already has a dish called ${dish}.`);
    expect(
      notMovedSentence(
        strings.move,
        editing,
        gone,
        { kind: "section-gone" },
        dish,
        "Mains",
      ),
    ).toBe(`${dish} was not moved. ${strings.move.errors.sectionGone}`);
    expect(
      notMovedSentence(
        strings.move,
        editing,
        gone,
        { kind: "gone" },
        dish,
        "Mains",
      ),
    ).toBe(`${dish} was not moved. ${gone}`);
    expect(
      notMovedSentence(
        strings.move,
        editing,
        gone,
        { kind: "out-of-date" },
        dish,
        "Mains",
      ),
    ).toBe(`${dish} was not moved. ${editing.problems.outOfDate}`);
  });
});

describe("the next dish (D-128)", () => {
  it("names the next dish in the link, and says when there is none", () => {
    expect(nextDishLabel(strings, "House salad")).toBe(
      "Next dish: House salad",
    );
    expect(lastDishSentence(strings, "Starters")).toBe(
      "This is the last dish in Starters.",
    );
  });
});
