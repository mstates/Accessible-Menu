import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  cookedToOrderUndoneSentence,
  dishUndoSchema,
  dishWords,
  kindLabel,
  kindNotSavedSentence,
  lastDishSentence,
  movedSentence,
  moveNotUndone,
  moveUndoneSentence,
  nextDishLabel,
  notAddedSentence,
  notMovedSentence,
  notRemovedSentence,
  notUndoneSentence,
  sizeAction,
  sizeAddedSentence,
  sizeLabel,
  sizeRemovedSentence,
  sizeSuffix,
  sizeWords,
  undoLabel,
  undoneSentence,
  type DishUndo,
} from "../../src/features/owner/dish/dish-words";
import {
  notSavedSentence,
  problemText,
} from "../../src/features/owner/editing/list-words";

// What a dish's page says, built from copy (D-128, D-139, D-141), and the
// Undo entries it keeps.

const strings = en.owner.dish;
const editing = en.owner.editing;
const words = dishWords(strings, editing);
const sizes = sizeWords(strings, editing);

const dish = "Soup of the day";
const relocate: DishUndo = {
  kind: "relocate",
  id: "d1",
  name: dish,
  from: { id: "s1", name: "Starters", menu: "Dinner", order: ["d1", "d2"] },
  to: { id: "s2", name: "Mains", menu: "Dinner" },
};

describe("the Undo entries of a dish's page", () => {
  const entries: DishUndo[] = [
    {
      kind: "own",
      field: "description",
      id: "d1",
      name: dish,
      from: "",
      to: "Hot",
    },
    { kind: "kind", id: "d1", name: dish, from: "one", to: "sizes" },
    {
      kind: "size-text",
      field: "price",
      id: "z1",
      size: "Cup",
      from: "5.00",
      to: "6.00",
    },
    { kind: "size-add", id: "z2", size: "size 3" },
    { kind: "size-remove", id: "z1", size: "Cup", order: ["z1", "z2"] },
    relocate,
  ];

  it.each(entries)("keeps a %s entry as it was", (entry) => {
    expect(dishUndoSchema.parse(JSON.parse(JSON.stringify(entry)))).toEqual(
      entry,
    );
  });

  it("refuses a kind it does not know, and a price choice it does not know", () => {
    expect(
      dishUndoSchema.safeParse({ kind: "rename", id: "d1", from: "", to: "" })
        .success,
    ).toBe(false);
    expect(
      dishUndoSchema.safeParse({
        kind: "kind",
        id: "d1",
        name: dish,
        from: "one",
        to: "range",
      }).success,
    ).toBe(false);
  });
});

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
    const entry: DishUndo = {
      kind: "own",
      field: "calories",
      id: "d1",
      name: dish,
      from: "",
      to: "760",
    };
    expect(undoLabel(strings, entry)).toBe(
      `Undo: changed the calories of ${dish}`,
    );
    expect(undoneSentence(strings, entry)).toBe(
      `Undone. The calories of ${dish} are as they were.`,
    );
    const size: DishUndo = {
      kind: "size-text",
      field: "calories",
      id: "z1",
      size: "Cup",
      from: "",
      to: "180",
    };
    expect(undoLabel(strings, size)).toBe("Undo: changed the calories for Cup");
    expect(undoneSentence(strings, size)).toBe(
      "Undone. The calories for Cup are as they were.",
    );
  });

  // D-167: the Cooked to order mark, under its own heading after Schedule.
  it("names the Cooked to order mark's changes and its failure", () => {
    const on: DishUndo = {
      kind: "cooked-to-order",
      id: "d1",
      name: dish,
      on: true,
    };
    expect(dishUndoSchema.parse(JSON.parse(JSON.stringify(on)))).toEqual(on);
    expect(undoLabel(strings, on)).toBe(
      `Undo: ticked Cooked to order for ${dish}`,
    );
    expect(undoLabel(strings, { ...on, on: false })).toBe(
      `Undo: unticked Cooked to order for ${dish}`,
    );
    expect(cookedToOrderUndoneSentence(strings, on)).toBe(
      `Undone. ${dish} is not marked cooked to order.`,
    );
    expect(cookedToOrderUndoneSentence(strings, { ...on, on: false })).toBe(
      `Undone. ${dish} is marked cooked to order again.`,
    );
    expect(fill(strings.cookedToOrder.notSaved, { dish })).toBe(
      `The Cooked to order mark for ${dish} was not saved.`,
    );
    expect(
      dishUndoSchema.parse({
        kind: "choice-list",
        entry: { kind: "add", id: "l1", name: "Add on" },
      }),
      "a choice list's entry sits on the dish page's stack (D-166)",
    ).toEqual({
      kind: "choice-list",
      entry: { kind: "add", id: "l1", name: "Add on" },
    });
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
    expect(sizeRemovedSentence(strings, "Cup")).toBe(
      "Cup removed. Undo is available.",
    );
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

describe("Undo on a dish's page", () => {
  it("names each change in the control, with the dish or the size", () => {
    expect(
      undoLabel(strings, {
        kind: "own",
        field: "description",
        id: "d1",
        name: dish,
        from: "",
        to: "x",
      }),
    ).toBe(`Undo: changed the description of ${dish}`);
    expect(
      undoLabel(strings, {
        kind: "kind",
        id: "d1",
        name: dish,
        from: "one",
        to: "market",
      }),
    ).toBe(`Undo: changed how ${dish} is priced`);
    expect(
      undoLabel(strings, {
        kind: "size-text",
        field: "name",
        id: "z1",
        size: "Cup",
        from: "Cup",
        to: "Mug",
      }),
    ).toBe("Undo: changed the name of Cup");
    expect(
      undoLabel(strings, { kind: "size-add", id: "z2", size: "size 3" }),
    ).toBe("Undo: added size 3");
    expect(
      undoLabel(strings, {
        kind: "size-remove",
        id: "z1",
        size: "Cup",
        order: [],
      }),
    ).toBe("Undo: removed Cup");
    expect(undoLabel(strings, relocate)).toBe(`Undo: moved ${dish} to Mains`);
  });

  it("says what it put back", () => {
    expect(
      undoneSentence(strings, {
        kind: "own",
        field: "price",
        id: "d1",
        name: dish,
        from: "9.00",
        to: "12.00",
      }),
    ).toBe(`Undone. The price of ${dish} is as it was.`);
    expect(
      undoneSentence(strings, {
        kind: "kind",
        id: "d1",
        name: dish,
        from: "one",
        to: "sizes",
      }),
    ).toBe(`Undone. ${dish} is priced as before: One price.`);
    expect(
      undoneSentence(strings, {
        kind: "size-text",
        field: "price",
        id: "z1",
        size: "Cup",
        from: "5.00",
        to: "6.00",
      }),
    ).toBe("Undone. The price for Cup is as it was.");
    expect(
      undoneSentence(strings, { kind: "size-add", id: "z2", size: "size 3" }),
    ).toBe("Undone. size 3 is removed.");
    expect(
      undoneSentence(strings, {
        kind: "size-remove",
        id: "z1",
        size: "Cup",
        order: [],
      }),
    ).toBe("Undone. Cup is back.");
    expect(moveUndoneSentence(strings.move, relocate, 1, 2)).toBe(
      `Undone. ${dish} is back in Starters, 1 of 2.`,
    );
  });

  it("keeps an added size that holds content now, and says where its Remove button is (D-119)", () => {
    expect(
      notUndoneSentence(
        strings,
        editing,
        words,
        { kind: "size-add", id: "z2", size: "Pint" },
        { kind: "grew" },
      ),
    ).toEqual({
      outcome: "stale",
      sentence:
        "Pint has a name or a price now, so it stays. To remove it, use its Remove button.",
    });
  });

  it("keeps the entry when a taken name is in the way, and drops a change that no longer stands", () => {
    expect(
      notUndoneSentence(
        strings,
        editing,
        sizes,
        { kind: "size-remove", id: "z1", size: "Cup", order: [] },
        { kind: "name-taken" },
      ),
    ).toEqual({
      outcome: "blocked",
      sentence: "Cup cannot come back while another size is called Cup.",
    });
    expect(
      notUndoneSentence(
        strings,
        editing,
        words,
        {
          kind: "own",
          field: "note",
          id: "d1",
          name: dish,
          from: "",
          to: "x",
        },
        { kind: "changed" },
      ),
    ).toEqual({ outcome: "stale", sentence: strings.undo.textChanged });
    expect(
      notUndoneSentence(
        strings,
        editing,
        words,
        { kind: "kind", id: "d1", name: dish, from: "one", to: "sizes" },
        { kind: "parent-gone" },
      ),
    ).toEqual({ outcome: "stale", sentence: editing.stale });
    expect(
      notUndoneSentence(
        strings,
        editing,
        sizes,
        {
          kind: "size-text",
          field: "name",
          id: "z1",
          size: "Cup",
          from: "Cup",
          to: "Mug",
        },
        { kind: "failed" },
      ),
    ).toEqual({
      outcome: "failed",
      sentence: `${editing.notUndone} ${editing.problems.failed}`,
    });
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

  it("says why a move could not be undone, and what becomes of the entry", () => {
    const gone = strings.errors.parentGone;
    expect(
      moveNotUndone(strings.move, editing, gone, relocate, {
        kind: "name-taken",
      }),
    ).toEqual({
      outcome: "blocked",
      sentence: `${dish} cannot go back while Starters has another dish called ${dish}.`,
    });
    expect(
      moveNotUndone(strings.move, editing, gone, relocate, {
        kind: "section-gone",
      }),
    ).toEqual({ outcome: "stale", sentence: editing.stale });
    expect(
      moveNotUndone(strings.move, editing, gone, relocate, { kind: "failed" }),
    ).toEqual({
      outcome: "failed",
      sentence: `${editing.notUndone} ${editing.problems.failed}`,
    });
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
