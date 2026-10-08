import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  allergenUndoLabel,
  allergensNotSavedSentence,
  checkNotSavedSentence,
  type AllergenStrings,
} from "../../src/features/owner/allergens/allergen-words";
import { dishWords } from "../../src/features/owner/dish/dish-words";
import {
  isLineUndo,
  lineAllergenStrings,
  lineLead,
  lineUndoLabel,
  lineUndoSchema,
  readChange,
  wrapChange,
  type LineUndo,
} from "../../src/features/owner/line/line-words";

// The words of a section's line shown with every dish and its allergen
// group (D-152, D-153): the dish page's words with the line's own over
// them, the entries the group leaves with the line's words beside them,
// and what each sentence names.

const dish = en.owner.dish.allergens;
const line = en.owner.dishes.line;
const sections = en.owner.sections;
const strings: AllergenStrings = lineAllergenStrings(dish, line);
const words = dishWords(en.owner.dish, en.owner.editing);
const lists = { allergens: ["milk" as const], others: ["celery"] };

describe("the line's words (D-152)", () => {
  it("keeps the dish page's words where a sentence names no dish, and takes the line's where one does", () => {
    expect(strings.names).toEqual(dish.names);
    expect(strings.hints).toEqual(dish.hints);
    expect(strings.otherHint).toBe(dish.otherHint);
    expect(strings.addOther).toBe(dish.addOther);
    expect(strings.dinersRead).toBe(dish.dinersRead);
    expect(strings.errors.otherComma).toBe(dish.errors.otherComma);
    expect(strings.heading).toBe(line.heading);
    expect(strings.checkHint).toBe(line.checkHint);
    expect(strings.othersFull).toBe(line.othersFull);
    expect(strings.errors.otherTaken).toBe(line.errors.otherTaken);
    expect(strings.listsChanged).toBe(line.listsChanged);
    expect(strings.undo.listsChanged).toBe(line.undo.listsChanged);
  });

  it("names no dish as its subject in any sentence the line speaks with", () => {
    const flat = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.flatMap(flat)
          : value && typeof value === "object"
            ? Object.entries(value)
                .filter(([key]) => key !== "sameNamed")
                .flatMap(([, inner]) => flat(inner))
            : [];
    // "every dish" names the line itself; "this dish" or "a dish" would
    // name a dish.
    for (const sentence of flat(strings)) {
      expect(sentence, sentence).not.toMatch(
        /\{dish\}|\b(this|a|the|each) dish\b/i,
      );
    }
  });

  it("quotes the words the server holds in the lead", () => {
    expect(lineLead(line, "Add spaghetti to any dish for 3 dollars.")).toBe(
      'For "Add spaghetti to any dish for 3 dollars.": tick each major allergen this line contains, add any others below, then check the list once it is complete.',
    );
  });

  it("names the section in a failure, through the section's placeholder", () => {
    const subject = { id: "s1", noun: "section" as const, name: "Starters" };
    expect(
      allergensNotSavedSentence(strings, words, subject, { kind: "failed" }),
    ).toBe(
      `The allergens of the line for every dish in Starters were not saved. ${en.owner.editing.problems.failed}`,
    );
    expect(
      checkNotSavedSentence(strings, words, subject, { kind: "failed" }),
    ).toBe(
      `The allergen check for the line for every dish in Starters was not saved. ${en.owner.editing.problems.failed}`,
    );
    // A bare name is a dish's, as the dish page's callers and tests name it.
    expect(
      allergensNotSavedSentence(dish, words, "Soup of the day", {
        kind: "failed",
      }),
    ).toBe(
      `The allergens of Soup of the day were not saved. ${en.owner.editing.problems.failed}`,
    );
  });
});

describe("the line's Undo entries (D-153)", () => {
  const change = {
    kind: "allergen" as const,
    id: "s1",
    name: "Starters",
    allergen: "milk" as const,
    on: true,
    before: { allergens: [], others: [] },
    after: lists,
  };

  it("wraps each of the group's changes with the words the write carried, and reads it back", () => {
    const wrapped = wrapChange(change, "Add spaghetti");
    expect(wrapped.kind).toBe("line-allergen");
    expect(isLineUndo(wrapped)).toBe(true);
    expect(isLineUndo({ kind: "relocate" })).toBe(false);
    expect(lineUndoSchema.parse(JSON.parse(JSON.stringify(wrapped)))).toEqual(
      wrapped,
    );
    expect(readChange(wrapped)).toEqual({ change, words: "Add spaghetti" });
    const check = wrapChange(
      { kind: "check", id: "s1", name: "Starters", on: true, lists },
      "Add spaghetti",
    );
    expect(check.kind).toBe("line-check");
    expect(readChange(check)?.change.kind).toBe("check");
    expect(() =>
      wrapChange(
        {
          kind: "apply",
          id: "d2",
          dish: "Soup",
          section: "Mains",
          menu: "Dinner",
          before: { ...lists, reviewed: false },
          after: lists,
          at: "",
        },
        "",
      ),
    ).toThrow();
  });

  it("keeps the words' own entry with the lists and the check at the time, which the group never reads", () => {
    const entry: LineUndo = {
      kind: "line-words",
      id: "s1",
      name: "Starters",
      from: "Add spaghetti",
      to: "",
      lists,
      reviewed: true,
    };
    expect(lineUndoSchema.parse(JSON.parse(JSON.stringify(entry)))).toEqual(
      entry,
    );
    expect(readChange(entry)).toBeNull();
    expect(lineUndoLabel(strings, sections, entry)).toBe(
      fill(sections.undo.everyItem, { section: "Starters" }),
    );
  });

  it("names the group's changes in the Undo control with the section, and the dish page's with the dish", () => {
    expect(lineUndoLabel(strings, sections, wrapChange(change, "w"))).toBe(
      "Undo: ticked Milk for the line for every dish in Starters",
    );
    expect(
      lineUndoLabel(
        strings,
        sections,
        wrapChange(
          { kind: "check", id: "s1", name: "Starters", on: false, lists },
          "w",
        ),
      ),
    ).toBe(
      "Undo: unchecked the allergens for the line for every dish in Starters",
    );
    expect(
      allergenUndoLabel(dish, { ...change, name: "Soup of the day" }),
    ).toBe("Undo: ticked Milk for Soup of the day");
  });
});
