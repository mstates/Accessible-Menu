import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  choiceListEntrySchema,
  choiceListUndoLabel,
  choiceListWords,
  choiceListsLead,
  leadWords,
  optionWords,
  placeIn,
  readListEntry,
  wrapListEntry,
} from "../../src/features/owner/choices/choice-words";
import {
  isOptionAllergenUndo,
  optionAllergenHeading,
  optionAllergenStrings,
  optionAllergenUndoLabel,
  optionAllergenUndoSchema,
  readChange,
  wrapChange,
} from "../../src/features/owner/choices/option-words";
import {
  dishPlaces,
  optionPlaces,
} from "../../src/features/owner/allergens/places";
import {
  allergenUndoneSentence,
  allergensNotSavedSentence,
  applyName,
  sameNamedLine,
} from "../../src/features/owner/allergens/allergen-words";
import {
  addedSentence,
  deleteQuestion,
  fieldSuffix,
  notSavedSentence,
  problemText,
  rowAction,
  undoLabel,
  undoneSentence,
} from "../../src/features/owner/editing/list-words";

// What the choice lists say (D-166, task 7): the rows on a home page, the
// list's own page with its lead and its options, an option's allergen
// group in the option's words, and where a same-named option is.

const strings = en.owner.choices;
const editing = en.owner.editing;
const dishWords = choiceListWords(strings, editing, "dish");
const sectionWords = choiceListWords(strings, editing, "section");
const lead = leadWords(strings, editing, "dish");
const options = optionWords(strings, editing);
const group = optionAllergenStrings(en.owner.dish.allergens, strings.allergens);

describe("the rows on a dish's or a section's page", () => {
  it("name each control by the list's lead", () => {
    expect(rowAction(dishWords, strings.lists.moveUp, "Choose one side")).toBe(
      "Move up, Choose one side",
    );
    expect(rowAction(dishWords, strings.lists.edit, "Choose one side")).toBe(
      "Edit choices, Choose one side",
    );
    expect(rowAction(dishWords, strings.lists.remove, "Add on")).toBe(
      "Delete, Add on",
    );
  });

  it("say what happened, counting choice lists", () => {
    expect(addedSentence(dishWords, "Choose one side", 2)).toBe(
      "Choose one side added. 2 choice lists.",
    );
    expect(addedSentence(dishWords, "Add on", 1)).toBe(
      "Add on added. 1 choice list.",
    );
  });

  it("refuse a lead the home already has, in the home's words", () => {
    expect(problemText(dishWords, { kind: "name-taken" }, "Add on")).toBe(
      "This dish already has a choice list called Add on.",
    );
    expect(problemText(sectionWords, { kind: "name-taken" }, "Add on")).toBe(
      "This section already has a choice list called Add on.",
    );
    expect(problemText(dishWords, { kind: "grew" }, "Add on")).toBe(
      strings.lists.errors.grew,
    );
  });

  it("ask before a delete that takes options, and not before an empty one", () => {
    expect(
      deleteQuestion(dishWords, "Choose one side", {
        sections: 0,
        dishes: 0,
        options: 3,
      }),
    ).toBe("Delete Choose one side, with its 3 options?");
    expect(dishWords.strings.keep).toBe("Keep");
  });

  it("have a lead for each home, a hint under the add field, and no field in a row", () => {
    expect(choiceListsLead(strings, "dish")).toBe(strings.leadDish);
    expect(choiceListsLead(strings, "section")).toBe(strings.leadSection);
    expect(dishWords.strings.newHint).toBe(strings.lists.newHint);
    expect(Object.keys(dishWords.fields)).toEqual([]);
  });

  it("wrap their entries for the home page's stack and read them back", () => {
    const entry = wrapListEntry({ kind: "add", id: "l1", name: "Add on" });
    expect(
      choiceListEntrySchema.parse(JSON.parse(JSON.stringify(entry))),
    ).toEqual(entry);
    expect(readListEntry(entry)).toEqual({
      kind: "add",
      id: "l1",
      name: "Add on",
    });
    expect(readListEntry({ kind: "relocate" })).toBeNull();
    expect(choiceListUndoLabel(dishWords, entry)).toBe("Undo: added Add on");
    expect(
      choiceListUndoLabel(
        dishWords,
        wrapListEntry({
          kind: "delete",
          id: "l1",
          name: "Choose one side",
          order: ["l1"],
        }),
      ),
    ).toBe("Undo: deleted Choose one side");
    expect(
      choiceListEntrySchema.safeParse({
        kind: "choice-list",
        entry: {
          kind: "text",
          field: "lead",
          id: "l1",
          name: "",
          from: "",
          to: "",
        },
      }).success,
      "a row has no field, so no text entry is read",
    ).toBe(false);
  });

  it("say when an added list cannot be undone because it holds options now", () => {
    expect(
      fill(strings.lists.undo.addGrew ?? "", { list: "Choose one side" }),
    ).toBe(
      "Choose one side has options now, so it stays. To delete it, use its Delete button.",
    );
  });
});

describe("the list's own page", () => {
  it("labels the lead plainly and names the list in its sentences", () => {
    expect(lead.fields.lead).toMatchObject({
      label: "Lead",
      suffix: "",
      hint: strings.page.leadHint,
    });
    expect(notSavedSentence(lead, "lead", "Choose one side")).toBe(
      "The lead of Choose one side was not saved.",
    );
    expect(
      undoLabel(lead, {
        kind: "own",
        field: "lead",
        id: "l1",
        name: "Choose one side",
        from: "Choose one side",
        to: "Choose a side",
      }),
    ).toBe("Undo: changed the lead of Choose one side");
    expect(
      undoneSentence(
        lead,
        {
          kind: "own",
          field: "lead",
          id: "l1",
          name: "Choose one side",
          from: "Choose one side",
          to: "Choose a side",
        },
        0,
        0,
      ),
    ).toBe("Undone. The lead is Choose one side again.");
    expect(problemText(lead, { kind: "parent-gone" }, "")).toBe(
      strings.page.errors.parentGone,
    );
    expect(
      problemText(lead, { kind: "invalid", rule: "leadRequired" }, ""),
    ).toBe(strings.page.errors.leadRequired);
  });

  it("names each option field for its option, the price with its keypad and sign", () => {
    expect(options.fields.name.label).toBe("Option name");
    expect(fieldSuffix(options, "name", "Fries")).toBe("for Fries");
    expect(options.fields.price).toMatchObject({
      label: "Added price",
      inputMode: "decimal",
      prefix: "$",
      hint: strings.options.priceHint,
    });
    expect(options.fields.calories).toMatchObject({
      label: "Calories",
      hint: strings.options.caloriesHint,
    });
    expect(notSavedSentence(options, "name", "Fries")).toBe(
      "Name of Fries was not saved.",
    );
    expect(notSavedSentence(options, "price", "Fries")).toBe(
      "The added price for Fries was not saved.",
    );
    expect(notSavedSentence(options, "calories", "Fries")).toBe(
      "The calories for Fries were not saved.",
    );
  });

  it("says what happened to an option, with Remove in place of Delete", () => {
    expect(strings.options.remove).toBe("Remove");
    expect(rowAction(options, strings.options.remove, "Fries")).toBe(
      "Remove, Fries",
    );
    expect(addedSentence(options, "Fries", 3)).toBe("Fries added. 3 options.");
    expect(problemText(options, { kind: "name-taken" }, "Fries")).toBe(
      "This list already has an option called Fries.",
    );
    expect(
      undoLabel(options, {
        kind: "text",
        field: "calories",
        id: "o1",
        name: "Fries",
        from: "",
        to: "320",
      }),
    ).toBe("Undo: changed the calories for Fries");
    expect(
      undoneSentence(
        options,
        {
          kind: "text",
          field: "price",
          id: "o1",
          name: "Fries",
          from: "",
          to: "2.00",
        },
        0,
        0,
      ),
    ).toBe("Undone. The added price for Fries is as it was.");
  });
});

describe("an option's allergen group, in the option's words", () => {
  const fries = { id: "o1", noun: "option" as const, name: "Fries" };

  it("heads the group for its option and keeps the dish's boxes and hints", () => {
    expect(optionAllergenHeading(group, "Fries")).toBe("Allergens for Fries");
    expect(group.names).toEqual(en.owner.dish.allergens.names);
    expect(group.hints).toEqual(en.owner.dish.allergens.hints);
    expect(group.groupHint).toBe(strings.allergens.lead);
    expect(group.checkHint).toBe(strings.allergens.checkHint);
    expect(group.cleared).toBe(strings.allergens.cleared);
    expect(group.sameNamed.errors.sourceChanged).toBe(
      strings.allergens.sameNamed.sourceChanged,
    );
    expect(group.sameNamed.apply).toBe(en.owner.dish.allergens.sameNamed.apply);
  });

  it("names the option in its sentences", () => {
    expect(
      allergensNotSavedSentence(group, options, fries, { kind: "failed" }),
    ).toBe(`The allergens of Fries were not saved. ${editing.problems.failed}`);
    expect(
      allergenUndoneSentence(
        group,
        {
          kind: "check",
          id: "o1",
          name: "Fries",
          on: true,
          lists: { allergens: [], others: [] },
        },
        false,
        "option",
      ),
    ).toBe("Undone. The allergens for Fries are not checked.");
  });

  it("keeps its entries on the list page's stack with the option's id and name, and reads them back", () => {
    const change = {
      kind: "allergen" as const,
      id: "o1",
      name: "Fries",
      allergen: "milk" as const,
      on: true,
      before: { allergens: [], others: [] },
      after: { allergens: ["milk" as const], others: [] },
    };
    const entry = wrapChange(change, "Fries", "o1");
    expect(entry).toMatchObject({
      kind: "option-allergen",
      words: "Fries",
      subject: "o1",
    });
    expect(
      optionAllergenUndoSchema.parse(JSON.parse(JSON.stringify(entry))),
    ).toEqual(entry);
    expect(readChange(entry)).toEqual({ change, words: "Fries" });
    expect(isOptionAllergenUndo(entry)).toBe(true);
    expect(isOptionAllergenUndo({ kind: "allergen" })).toBe(false);
    expect(optionAllergenUndoLabel(group, entry)).toBe(
      "Undo: ticked Milk for Fries",
    );
    const apply = wrapChange(
      {
        kind: "apply",
        target: "dish",
        id: "d2",
        dish: "Fries",
        section: "Sides",
        menu: "Dinner",
        before: { allergens: [], others: [], reviewed: false },
        after: { allergens: ["milk"], others: [] },
        at: "2026-10-10T00:00:00Z",
      },
      "Fries",
      "o1",
    );
    expect(apply.subject).toBe("o1");
    expect(readChange(apply).change.kind).toBe("apply");
  });
});

describe("where a same-named dish or option is (D-129, D-166)", () => {
  const context = {
    sections: [
      { id: "s1", name: "Sides", menuId: "m1" },
      { id: "s2", name: "Kids", menuId: "m1" },
      { id: "s3", name: "Old", menuId: "m9" },
    ],
    menus: [{ id: "m1", name: "Dinner" }],
    dishes: [{ id: "d1", name: "Kids burger", sectionId: "s2" }],
    placeIn: (leadText: string, home: string) =>
      placeIn(strings, leadText, home),
  };
  const own = { allergens: ["milk" as const], others: [] };

  it("reads a place as the lead for its home, in the section's place of the sentence", () => {
    expect(placeIn(strings, "Choose one side", "Kids burger")).toBe(
      "Choose one side for Kids burger",
    );
    const [place] = optionPlaces(
      [
        {
          id: "o2",
          name: "Fries",
          listId: "l2",
          lead: "Choose one side",
          home: { kind: "dish", id: "d1" },
          allergens: [],
          otherAllergens: [],
          reviewed: false,
        },
      ],
      own,
      context,
    );
    expect(place).toMatchObject({
      kind: "option",
      id: "o2",
      section: "Choose one side for Kids burger",
      menu: "Dinner",
      reason: "unchecked",
    });
    if (!place) throw new Error("no place");
    expect(sameNamedLine(group, place)).toBe(
      "Fries is also in Choose one side for Kids burger, Dinner, not checked yet.",
    );
    expect(applyName(group, place)).toBe(
      "Apply this list there, Fries in Choose one side for Kids burger, Dinner",
    );
  });

  it("reads a section home, leaves out a checked twin with the same list, and a place whose chain is broken", () => {
    const places = optionPlaces(
      [
        {
          id: "o3",
          name: "Fries",
          listId: "l3",
          lead: "Add on",
          home: { kind: "section", id: "s1" },
          allergens: ["milk"],
          otherAllergens: [],
          reviewed: true,
        },
        {
          id: "o4",
          name: "Fries",
          listId: "l4",
          lead: "Add on",
          home: { kind: "section", id: "s1" },
          allergens: ["milk", "wheat"],
          otherAllergens: [],
          reviewed: true,
        },
        {
          id: "o5",
          name: "Fries",
          listId: "l5",
          lead: "Add on",
          home: { kind: "section", id: "s3" },
          allergens: [],
          otherAllergens: [],
          reviewed: false,
        },
        {
          id: "o6",
          name: "Fries",
          listId: "l6",
          lead: "Add on",
          home: { kind: "dish", id: "gone" },
          allergens: [],
          otherAllergens: [],
          reviewed: false,
        },
      ],
      own,
      context,
    );
    expect(places.map((place) => place.id)).toEqual(["o4"]);
    expect(places[0]).toMatchObject({
      section: "Add on for Sides",
      menu: "Dinner",
      reason: "different",
    });
  });

  it("reads a dish's place as before", () => {
    const places = dishPlaces(
      [
        {
          id: "d2",
          name: "Fries",
          sectionId: "s1",
          allergens: [],
          otherAllergens: [],
          reviewed: false,
        },
        {
          id: "d3",
          name: "Fries",
          sectionId: "s3",
          allergens: [],
          otherAllergens: [],
          reviewed: false,
        },
      ],
      own,
      context,
    );
    expect(places).toEqual([
      {
        kind: "dish",
        id: "d2",
        name: "Fries",
        section: "Sides",
        menu: "Dinner",
        lists: { allergens: [], others: [] },
        reviewed: false,
        reason: "unchecked",
      },
    ]);
  });
});
