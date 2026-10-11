import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  allergenNotUndone,
  allergensNotSavedSentence,
  allergenUndoLabel,
  allergenUndoneSentence,
  applyName,
  appliedSentence,
  checkNotSavedSentence,
  dinerSentence,
  dinersReadText,
  majorRuleOf,
  notAppliedSentence,
  otherAction,
  otherAddedSentence,
  otherLabel,
  otherRemovedSentence,
  otherSuffix,
  otherWords,
  othersChange,
  sameNamedLine,
  stampLine,
  type SameNamedPlace,
} from "../../src/features/owner/allergens/allergen-words";
import {
  dishUndoSchema,
  dishWords,
  undoLabel,
  type DishUndo,
} from "../../src/features/owner/dish/dish-words";
import {
  notSavedSentence,
  problemText,
} from "../../src/features/owner/editing/list-words";

// What the allergen group on a dish's page says, built from copy (D-148,
// D-129), and the Undo entries it keeps.

const strings = en.owner.dish.allergens;
const editing = en.owner.editing;
const words = dishWords(en.owner.dish, editing);
const others = otherWords(strings, editing, en.owner.dish.errors.parentGone);
const dish = "Soup of the day";
const lists = { allergens: ["milk", "wheat"] as const, others: ["celery"] };
const place: SameNamedPlace = {
  kind: "dish",
  id: "d2",
  name: dish,
  section: "Mains",
  menu: "Dinner",
  lists: { allergens: [], others: [] },
  reviewed: false,
  reason: "unchecked",
};

describe("the Undo entries of the allergen group", () => {
  const entries: DishUndo[] = [
    {
      kind: "allergen",
      id: "d1",
      name: dish,
      allergen: "milk",
      on: true,
      before: { allergens: [], others: [] },
      after: { allergens: ["milk"], others: [] },
    },
    {
      kind: "others",
      id: "d1",
      name: dish,
      before: { allergens: ["milk"], others: [] },
      after: { allergens: ["milk"], others: ["celery"] },
    },
    {
      kind: "check",
      id: "d1",
      name: dish,
      on: true,
      lists: { allergens: ["milk"], others: ["celery"] },
    },
    {
      kind: "apply",
      id: "d2",
      dish,
      section: "Mains",
      menu: "Dinner",
      before: { allergens: [], others: [], reviewed: false },
      after: { allergens: ["milk"], others: ["celery"] },
      at: "2026-10-08T12:00:00+00:00",
    },
  ];

  it.each(entries)("keeps a %s entry as it was", (entry) => {
    expect(dishUndoSchema.parse(JSON.parse(JSON.stringify(entry)))).toEqual(
      entry,
    );
  });

  it("refuses an allergen outside the nine", () => {
    expect(
      dishUndoSchema.safeParse({
        kind: "allergen",
        id: "d1",
        name: dish,
        allergen: "celery",
        on: true,
        before: { allergens: [], others: [] },
        after: { allergens: [], others: [] },
      }).success,
    ).toBe(false);
  });
});

describe("the words of the other-allergen rows", () => {
  it("names a row by its place, its buttons by its name, and says a taken name", () => {
    expect(otherSuffix(strings, 2)).toBe("2");
    expect(otherLabel(strings, "", 2)).toBe("allergen 2");
    expect(otherLabel(strings, "celery", 2)).toBe("celery");
    expect(otherAction(strings, strings.removeOther, "celery")).toBe(
      "Remove allergen, celery",
    );
    expect(otherAction(strings, strings.showOtherNames, "allergen 2")).toBe(
      "Show allergen names, allergen 2",
    );
    expect(notSavedSentence(others, "name", "celery")).toBe(
      "celery was not saved.",
    );
    expect(problemText(others, { kind: "name-taken" }, "celery")).toBe(
      "This dish already lists celery.",
    );
    expect(problemText(others, { kind: "mismatch" }, "celery")).toBe(
      strings.listsMoved,
    );
  });

  it("points a word that means one of the nine at its box, and nuts at both", () => {
    expect(majorRuleOf("Milk")).toBe("otherMajor:milk");
    expect(majorRuleOf("tree nuts")).toBe("otherMajor:tree-nuts");
    expect(majorRuleOf("nuts")).toBe("otherMajor:both");
    expect(majorRuleOf("kiwi")).toBeNull();
    expect(
      problemText(others, { kind: "invalid", rule: "otherMajor:milk" }, ""),
    ).toBe("Milk has its own box above. Tick it there instead.");
    expect(
      problemText(others, { kind: "invalid", rule: "otherMajor:both" }, ""),
    ).toBe(
      "Peanuts and Tree nuts have their own boxes above. Tick the one this dish has, or both.",
    );
    expect(
      problemText(others, { kind: "invalid", rule: "otherLength" }, ""),
    ).toBe(strings.errors.otherLength);
  });

  it("says a row added and removed", () => {
    expect(otherAddedSentence(strings, 2)).toBe("Other allergen 2 added.");
    expect(otherRemovedSentence(strings, "celery")).toBe(
      "celery removed. Undo is available.",
    );
  });
});

describe("the sentence diners read, and the stamp line", () => {
  it("comes from the one builder, with milk as the word", () => {
    const sentence = dinerSentence(en.allergens, lists, true);
    expect(sentence.text).toBe("Contains milk, wheat, celery.");
    expect(dinersReadText(strings, sentence)).toBe(
      "Diners read: Contains milk, wheat, celery.",
    );
    expect(dinerSentence(en.allergens, lists, false).text).toBe(
      "Allergens not confirmed yet. Ask your server.",
    );
    expect(
      dinerSentence(en.allergens, { allergens: [], others: [] }, true).text,
    ).toBe("Checked. No major allergens.");
  });

  it("reads who checked it and when, in the restaurant's time zone", () => {
    const at = "2026-10-08T02:30:00+00:00";
    expect(
      stampLine(
        strings,
        { check: { at, byYou: true }, pending: false, cleared: false },
        "America/New_York",
        "en",
      ),
    ).toBe("Checked by you on October 7, 2026.");
    expect(
      stampLine(
        strings,
        { check: { at, byYou: false }, pending: false, cleared: false },
        "America/Chicago",
        "en",
      ),
    ).toBe("Checked on October 7, 2026.");
    expect(
      stampLine(
        strings,
        { check: null, pending: true, cleared: false },
        "America/New_York",
        "en",
      ),
    ).toBe("Checked by you.");
    expect(
      stampLine(
        strings,
        { check: null, pending: false, cleared: true },
        "America/New_York",
        "en",
      ),
    ).toBe(strings.cleared);
    expect(
      stampLine(
        strings,
        { check: null, pending: false, cleared: false },
        "America/New_York",
        "en",
      ),
    ).toBe("Not checked yet.");
  });
});

describe("the same-named offer (D-129)", () => {
  it("names where the dish is, and the button's visible words come first", () => {
    expect(sameNamedLine(strings, place)).toBe(
      `${dish} is also in Mains, Dinner, not checked yet.`,
    );
    expect(sameNamedLine(strings, { ...place, reason: "different" })).toBe(
      `${dish} is also in Mains, Dinner, with a different allergen list.`,
    );
    expect(applyName(strings, place)).toBe(
      `Apply this list there, ${dish} in Mains, Dinner`,
    );
    expect(appliedSentence(strings, place)).toBe(
      `Applied. ${dish} in Mains, Dinner has this list, checked by you.`,
    );
  });

  it("says why an apply did not land", () => {
    const gone = en.owner.dish.errors.parentGone;
    expect(
      notAppliedSentence(
        strings,
        editing,
        gone,
        { kind: "source-changed" },
        place,
      ),
    ).toBe(strings.sameNamed.errors.sourceChanged);
    expect(
      notAppliedSentence(
        strings,
        editing,
        gone,
        { kind: "target-changed" },
        place,
      ),
    ).toBe(
      `${dish} in Mains, Dinner changed since this page loaded, so nothing was applied. Open its page to see it.`,
    );
    expect(
      notAppliedSentence(strings, editing, gone, { kind: "gone" }, place),
    ).toBe(`Nothing was applied. ${gone}`);
    expect(
      notAppliedSentence(
        strings,
        editing,
        gone,
        { kind: "out-of-date" },
        place,
      ),
    ).toBe(`Nothing was applied. ${editing.problems.outOfDate}`);
  });
});

describe("Undo in the allergen group", () => {
  const tick: DishUndo = {
    kind: "allergen",
    id: "d1",
    name: dish,
    allergen: "sesame",
    on: true,
    before: { allergens: ["milk"], others: [] },
    after: { allergens: ["milk", "sesame"], others: [] },
  };
  const applied: DishUndo = {
    kind: "apply",
    id: "d2",
    dish,
    section: "Mains",
    menu: "Dinner",
    before: { allergens: [], others: [], reviewed: true },
    after: { allergens: ["milk"], others: [] },
    at: "2026-10-08T12:00:00+00:00",
  };

  it("names each change in the control, through the page's own label", () => {
    expect(undoLabel(en.owner.dish, tick)).toBe(
      `Undo: ticked Sesame for ${dish}`,
    );
    expect(allergenUndoLabel(strings, { ...tick, on: false })).toBe(
      `Undo: unticked Sesame for ${dish}`,
    );
    expect(
      allergenUndoLabel(strings, {
        kind: "others",
        id: "d1",
        name: dish,
        before: { allergens: [], others: ["celery"] },
        after: { allergens: [], others: ["celery", "mustard"] },
      }),
    ).toBe("Undo: added mustard");
    expect(
      allergenUndoLabel(strings, {
        kind: "others",
        id: "d1",
        name: dish,
        before: { allergens: [], others: ["celery"] },
        after: { allergens: [], others: ["lupin"] },
      }),
    ).toBe("Undo: renamed celery to lupin");
    expect(
      allergenUndoLabel(strings, {
        kind: "check",
        id: "d1",
        name: dish,
        on: true,
        lists: { allergens: [], others: [] },
      }),
    ).toBe(`Undo: checked the allergens for ${dish}`);
    expect(allergenUndoLabel(strings, applied)).toBe(
      `Undo: applied this list to ${dish} in Mains, Dinner`,
    );
  });

  it("says what it put back, and that a check it cleared is gone", () => {
    expect(allergenUndoneSentence(strings, tick, false)).toBe(
      "Undone. Sesame is unticked again.",
    );
    expect(allergenUndoneSentence(strings, tick, true)).toBe(
      "Undone. Sesame is unticked again. The list is not checked now.",
    );
    expect(allergenUndoneSentence(strings, applied, false)).toBe(
      `Undone. ${dish} in Mains, Dinner has its old list back. It is not checked now.`,
    );
    expect(
      allergenUndoneSentence(
        strings,
        { ...applied, before: { ...applied.before, reviewed: false } },
        false,
      ),
    ).toBe(`Undone. ${dish} in Mains, Dinner is as it was.`);
  });

  it("drops an entry whose lists moved, with one sentence, and keeps one that merely failed", () => {
    expect(
      allergenNotUndone(strings, editing, words, tick, {
        kind: "lists-changed",
      }),
    ).toEqual({ outcome: "stale", sentence: strings.undo.listsChanged });
    expect(
      allergenNotUndone(strings, editing, words, applied, {
        kind: "lists-changed",
      }),
    ).toEqual({
      outcome: "stale",
      sentence: `${dish} in Mains, Dinner has changed since, so it stays as it is.`,
    });
    expect(
      allergenNotUndone(strings, editing, words, tick, { kind: "failed" }),
    ).toEqual({
      outcome: "failed",
      sentence: `${editing.notUndone} ${editing.problems.failed}`,
    });
  });

  it("reads one change to the other allergens", () => {
    expect(othersChange(["a"], ["a", "b"])).toEqual({
      kind: "added",
      other: "b",
    });
    expect(othersChange(["a", "b"], ["a"])).toEqual({
      kind: "removed",
      other: "b",
    });
    expect(othersChange(["a"], ["c"])).toEqual({
      kind: "renamed",
      from: "a",
      to: "c",
    });
    expect(othersChange(["a", "b"], ["c", "d"])).toEqual({ kind: "changed" });
  });

  it("says what was not saved, then why", () => {
    expect(
      allergensNotSavedSentence(strings, words, dish, { kind: "failed" }),
    ).toBe(
      `The allergens of ${dish} were not saved. ${editing.problems.failed}`,
    );
    expect(
      checkNotSavedSentence(strings, words, dish, { kind: "unreachable" }),
    ).toBe(
      `The allergen check for ${dish} was not saved. ${editing.problems.unreachable}`,
    );
  });
});
