import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { HOLDS_NOTHING } from "../../src/domain/menu";
import {
  choiceListWords,
  choiceListsLead,
  leadWords,
  optionWords,
  placeIn,
} from "../../src/features/owner/choices/choice-words";
import {
  optionAllergenHeading,
  optionAllergenStrings,
} from "../../src/features/owner/choices/option-words";
import {
  dishPlaces,
  optionPlaces,
} from "../../src/features/owner/allergens/places";
import {
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

  it("ask before every delete, naming the options when there are some (D-221)", () => {
    expect(
      deleteQuestion(dishWords, "Choose one side", {
        sections: 0,
        dishes: 0,
        options: 3,
      }),
    ).toBe("Delete Choose one side, with its 3 options?");
    expect(deleteQuestion(dishWords, "Add on", HOLDS_NOTHING)).toBe(
      "Delete Add on?",
    );
    expect(dishWords.strings.keep).toBe("Keep");
  });

  it("have a lead for each home, a hint under the add field, and no field in a row", () => {
    expect(choiceListsLead(strings, "dish")).toBe(strings.leadDish);
    expect(choiceListsLead(strings, "section")).toBe(strings.leadSection);
    expect(dishWords.strings.newHint).toBe(strings.lists.newHint);
    expect(Object.keys(dishWords.fields)).toEqual([]);
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
