import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  dishWords,
  generalNotSavedSentence,
  generalProblemText,
  lastDishSentence,
  movedSentence,
  nextDishLabel,
  notMovedSentence,
  sizeAction,
  sizeAddedSentence,
  sizeLabel,
  sizeLegend,
  sizeRemovedSentence,
  sizeSuffix,
} from "../../src/features/owner/dish/dish-words";
import { problemText } from "../../src/features/owner/editing/list-words";
import {
  GENERAL_IDS,
  sizeFieldId,
} from "../../src/features/owner/dish/general-form";

// What a dish's page says, built from copy (D-128, D-139, D-141, D-237).

const strings = en.owner.dish;
const editing = en.owner.editing;
const words = dishWords(strings, editing);

const dish = "Soup of the day";
describe("the words a dish's form pages say a failed save in", () => {
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
    expect(
      problemText(words, { kind: "invalid", rule: "sizeNamesDiffer" }, dish),
    ).toBe(strings.errors.sizeNamesDiffer);
  });

  // A dish's pages hold no list of their own, so that kind reads as a page
  // that is out of date; they have no as-you-go fields at all (D-237).
  it("holds no field of its own, and reads a changed list as out of date", () => {
    expect(words.fields).toEqual({});
    expect(problemText(words, { kind: "mismatch" }, dish)).toBe(
      editing.problems.outOfDate,
    );
  });
});

describe("a General save the server did not take (D-237)", () => {
  it("says what was not saved, then why", () => {
    expect(
      generalNotSavedSentence(strings, words, dish, { kind: "parent-gone" }),
    ).toBe(
      `The changes to ${dish} were not saved. This dish is no longer here. Go back to Menus.`,
    );
    expect(
      generalNotSavedSentence(strings, words, dish, { kind: "unreachable" }),
    ).toBe(
      `The changes to ${dish} were not saved. ${editing.problems.unreachable}`,
    );
    expect(
      generalNotSavedSentence(strings, words, dish, { kind: "out-of-date" }),
    ).toBe(
      `The changes to ${dish} were not saved. ${editing.problems.outOfDate}`,
    );
    expect(
      generalNotSavedSentence(strings, words, dish, {
        kind: "invalid",
        rule: "descriptionLength",
      }),
    ).toBe(
      `The changes to ${dish} were not saved. Keep the description to 500 characters.`,
    );
  });
});

describe("what a Save found wrong with a field (D-237)", () => {
  it("says the dish's own fields plainly", () => {
    expect(
      generalProblemText(strings, {
        id: GENERAL_IDS.price,
        rule: "priceFormat",
      }),
    ).toBe("Type a price like 12, 12.50, or $12.");
    expect(
      generalProblemText(strings, {
        id: GENERAL_IDS.note,
        rule: "noteLength",
      }),
    ).toBe("Keep the note to 120 characters.");
  });

  it("names the size a problem is in, by its name or its place", () => {
    const named = { position: 1, name: "Cup" };
    const unnamed = { position: 2, name: "" };
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "name"),
        rule: "sizeNameRequired",
        size: unnamed,
      }),
    ).toBe("Name size 2, like Cup or Bowl, or remove it.");
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "price"),
        rule: "sizePriceRequired",
        size: named,
      }),
    ).toBe("Type a price for Cup, like 5 or 5.50.");
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "price"),
        rule: "sizePriceFormat",
        size: unnamed,
      }),
    ).toBe("Type the price for size 2 like 12, 12.50, or $12.");
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "price"),
        rule: "sizePriceRange",
        size: named,
      }),
    ).toBe("Keep the price for Cup under $100,000.");
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "calories"),
        rule: "sizeCaloriesFormat",
        size: named,
      }),
    ).toBe(
      "Type the calories for Cup as a whole number, like 760, or a range, like 760 to 860.",
    );
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "calories"),
        rule: "sizeCaloriesRange",
        size: named,
      }),
    ).toBe("Keep the calories for Cup under 100,000.");
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "calories"),
        rule: "sizeCaloriesOrder",
        size: unnamed,
      }),
    ).toBe("For size 2, put the lower number first, like 760 to 860.");
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("a", "name"),
        rule: "sizeNameLength",
        size: named,
      }),
    ).toBe(strings.errors.sizeNameLength);
  });

  it("names the other size when two share a name", () => {
    expect(
      generalProblemText(strings, {
        id: sizeFieldId("b", "name"),
        rule: "nameTaken",
        size: { position: 2, name: "cup" },
        other: "Cup",
      }),
    ).toBe("Another size of this dish is called Cup.");
  });
});

describe("the words a size's controls are named in", () => {
  it("names a size by its name, or by its place while it has none", () => {
    expect(sizeLabel(strings, "Cup", 1)).toBe("Cup");
    expect(sizeLabel(strings, "", 2)).toBe("size 2");
    expect(sizeLegend(strings, "Cup", 1)).toBe("Cup");
    expect(sizeLegend(strings, "", 2)).toBe("Size 2");
    expect(sizeSuffix(strings, "Cup")).toBe("for Cup");
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
    expect(sizeRemovedSentence(strings, "Cup", 1)).toBe("Cup removed.");
    expect(sizeRemovedSentence(strings, "", 2)).toBe("Size 2 removed.");
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
