import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { cleanMenuName } from "../../src/domain/menu";
import { commitOf } from "../../src/features/owner/editing/commit";
import { afterHold, leaveOf } from "../../src/features/owner/editing/leave";
import {
  saysSaved,
  saysSavedAgain,
} from "../../src/features/owner/editing/spoken";
import { statusOf } from "../../src/features/owner/editing/status";
import {
  afterUndo,
  newestUndo,
  pushUndo,
  readUndo,
  UNDO_LIMIT,
} from "../../src/features/owner/editing/undo";
import {
  addedSentence,
  countText,
  deleteQuestion,
  edgeSentence,
  failureSentence,
  isListUndo,
  listUndoSchema,
  movedSentence,
  notSavedSentence,
  notUndoneSentence,
  problemText,
  undoLabel,
  undoneSentence,
  undoOutcome,
  type ListProblem,
  type ListUndo,
} from "../../src/features/owner/editing/list-words";
import { choiceListWords } from "../../src/features/owner/choices/choice-words";
import {
  dishList,
  menuList,
  SECTION_OWN_TEXTS,
  sectionList,
  sectionTexts,
} from "../../src/features/owner/lists";
import {
  moveNotUndone,
  movedSentence as sectionMovedSentence,
  moveUndoLabel,
  moveUndoneSentence,
  notMovedSentence,
  sectionMoveSchema,
  type SectionMove,
} from "../../src/features/owner/section-move";
import { cleanSectionText } from "../../src/domain/section";

const strings = en.owner.menus;
const editing = en.owner.editing;
const sections = en.owner.sections;
const dishes = en.owner.dishes;
const choices = en.owner.choices;

// Each list's words, as its screen builds them.
const menuWords = menuList.words(strings, editing);
const sectionWords = sectionList.words(sections, editing);
const dishWords = dishList.words(dishes, editing);
// A section's note and every-dish line, on its own page (D-135).
const ownWords = sectionTexts.words(sections, dishes, editing);

// The stored shape of each list's Undo entries. A section's page keeps the
// section's own texts on its dishes' stack.
const menuUndoSchema = listUndoSchema([]);
const sectionUndoSchema = listUndoSchema([]);
const sectionPageUndoSchema = listUndoSchema([], SECTION_OWN_TEXTS);

describe("when a field saves (D-111)", () => {
  const untouched = {
    saved: "Dinner",
    draft: null,
    inFlight: null,
    failed: null,
  };

  it("writes nothing for a field nobody typed in", () => {
    expect(commitOf(untouched, cleanMenuName)).toEqual({ kind: "nothing" });
  });

  it("writes nothing when the typed value is the saved one", () => {
    expect(commitOf({ ...untouched, draft: "Dinner" }, cleanMenuName)).toEqual({
      kind: "reset",
    });
    expect(
      commitOf({ ...untouched, draft: "  Dinner " }, cleanMenuName),
    ).toEqual({ kind: "reset" });
  });

  it("sends a changed value, cleaned", () => {
    expect(
      commitOf({ ...untouched, draft: " Supper " }, cleanMenuName),
    ).toEqual({ kind: "send", value: "Supper" });
  });

  it("sends an emptied field, so the problem can be named", () => {
    expect(commitOf({ ...untouched, draft: "   " }, cleanMenuName)).toEqual({
      kind: "send",
      value: "",
    });
  });

  it("does not send a value that is already on its way", () => {
    expect(
      commitOf(
        { ...untouched, draft: "Supper", inFlight: "Supper" },
        cleanMenuName,
      ),
    ).toEqual({ kind: "nothing" });
  });

  it("sends again when the owner typed on while a save was on its way", () => {
    expect(
      commitOf(
        { ...untouched, draft: "Supper club", inFlight: "Supper" },
        cleanMenuName,
      ),
    ).toEqual({ kind: "send", value: "Supper club" });
  });

  it("does not send a value that just failed when focus leaves again", () => {
    expect(
      commitOf({ ...untouched, draft: "", failed: "" }, cleanMenuName),
    ).toEqual({ kind: "nothing" });
    expect(
      commitOf(
        { ...untouched, draft: "Drinks ", failed: "Drinks" },
        cleanMenuName,
      ),
    ).toEqual({ kind: "nothing" });
  });

  it("sends a failed field once the owner changes it", () => {
    expect(
      commitOf(
        { ...untouched, draft: "Drinks menu", failed: "Drinks" },
        cleanMenuName,
      ),
    ).toEqual({ kind: "send", value: "Drinks menu" });
  });
});

describe("the saved status", () => {
  const rest = { inFlight: 0, slow: false, failedFields: 0, notice: null };

  it("is saved at rest", () => {
    expect(statusOf(rest)).toBe("saved");
  });

  it("is saving while a save is on its way, and slow when it says so", () => {
    expect(statusOf({ ...rest, inFlight: 1 })).toBe("saving");
    expect(statusOf({ ...rest, inFlight: 1, slow: true })).toBe("slow");
  });

  it("is failed while a field or the last change is not saved", () => {
    expect(statusOf({ ...rest, failedFields: 1 })).toBe("failed");
    expect(statusOf({ ...rest, notice: "Dinner was not moved." })).toBe(
      "failed",
    );
  });

  it("shows saving over an older failure while a retry is on its way", () => {
    expect(statusOf({ ...rest, inFlight: 1, failedFields: 1 })).toBe("saving");
  });
});

// Enter and focus leaving a field reach the same commit; these follow what
// each one sends and what a landing then says. The calls that make a
// landing are checked on the page, by ear.
describe("what a landed save says (D-118)", () => {
  const renaming = {
    saved: "Dinner",
    draft: "Supper",
    inFlight: null,
    failed: null,
  };
  const quiet = { owed: false, failedFields: 0, waiting: 0 };

  it("says Saved. once for a rename sent by leaving the field", () => {
    expect(commitOf(renaming, cleanMenuName)).toEqual({
      kind: "send",
      value: "Supper",
    });
    expect(saysSaved({ kind: "text", ...quiet })).toBe(true);
    expect(saysSavedAgain(false, "saved"), "the status says nothing").toBe(
      false,
    );
  });

  it("says Saved. once for a rename sent with Enter, since the blur after it sends nothing", () => {
    expect(commitOf(renaming, cleanMenuName).kind).toBe("send");
    expect(
      commitOf({ ...renaming, inFlight: "Supper" }, cleanMenuName),
      "focus leaves while the save is on its way",
    ).toEqual({ kind: "nothing" });
    expect(
      commitOf({ ...renaming, saved: "Supper", draft: null }, cleanMenuName),
      "focus leaves after it landed",
    ).toEqual({ kind: "nothing" });
    expect(saysSaved({ kind: "text", ...quiet })).toBe(true);
  });

  it("says nothing when nothing changed, since nothing is sent", () => {
    expect(commitOf({ ...renaming, draft: null }, cleanMenuName).kind).toBe(
      "nothing",
    );
    expect(
      commitOf({ ...renaming, draft: "Dinner " }, cleanMenuName).kind,
    ).toBe("reset");
    expect(saysSavedAgain(false, "saved")).toBe(false);
  });

  it("adds nothing to what an add, a move, a delete, or an Undo says", () => {
    expect(saysSaved({ kind: "change", ...quiet })).toBe(false);
    expect(saysSaved({ kind: "change", ...quiet, owed: true })).toBe(false);
    expect(saysSaved({ kind: "change", ...quiet, waiting: 1 })).toBe(false);
    expect(saysSavedAgain(false, "saved")).toBe(false);
  });

  it("says only All changes saved. when the save that lands ends a failure", () => {
    expect(saysSaved({ kind: "text", ...quiet, owed: true })).toBe(false);
    expect(saysSavedAgain(true, "saving")).toBe(false);
    expect(saysSavedAgain(true, "slow")).toBe(false);
    expect(saysSavedAgain(true, "failed")).toBe(false);
    expect(saysSavedAgain(true, "saved")).toBe(true);
  });

  it("says Saved. for a field that lands while another is still failed or a save is behind it", () => {
    expect(
      saysSaved({ kind: "text", owed: true, failedFields: 1, waiting: 0 }),
    ).toBe(true);
    expect(
      saysSaved({ kind: "text", owed: true, failedFields: 0, waiting: 1 }),
    ).toBe(true);
  });

  it("says Saved. for each of two fields saved in a row", () => {
    expect(
      saysSaved({ kind: "text", ...quiet, waiting: 1 }),
      "the first lands with the second behind it",
    ).toBe(true);
    expect(saysSaved({ kind: "text", ...quiet }), "then the second").toBe(true);
  });
});

describe("an owner link on an editing screen", () => {
  it("goes when nothing is unsaved", () => {
    expect(leaveOf({ inFlight: 0, failedFields: 0 })).toBe("go");
  });

  it("holds while a save is on its way", () => {
    expect(leaveOf({ inFlight: 2, failedFields: 0 })).toBe("hold");
  });

  it("stays when a save has failed, even with another on its way", () => {
    expect(leaveOf({ inFlight: 0, failedFields: 1 })).toBe("stay");
    expect(leaveOf({ inFlight: 1, failedFields: 1 })).toBe("stay");
  });

  it("goes after a hold only if every save landed", () => {
    expect(afterHold({ failedFields: 0, failedWhileHeld: false })).toBe("go");
    expect(afterHold({ failedFields: 1, failedWhileHeld: true })).toBe("stay");
    expect(afterHold({ failedFields: 0, failedWhileHeld: true })).toBe("stay");
  });
});

const renamed: ListUndo = {
  kind: "rename",
  id: "a",
  from: "Dinner",
  to: "Supper",
};
const added: ListUndo = { kind: "add", id: "b", name: "Lunch" };
const deleted: ListUndo = {
  kind: "delete",
  id: "a",
  name: "Dinner",
  order: ["a", "b"],
};
const moved: ListUndo = {
  kind: "move",
  id: "b",
  name: "Lunch",
  order: ["a", "b"],
};

describe("the Undo stack", () => {
  it("names the newest change and nothing when empty", () => {
    expect(newestUndo([])).toBeNull();
    expect(newestUndo(pushUndo<ListUndo>([renamed], added))).toEqual(added);
  });

  it("keeps the last twenty changes", () => {
    let stack: ListUndo[] = [];
    for (let index = 0; index < UNDO_LIMIT + 5; index += 1) {
      stack = pushUndo(stack, { kind: "add", id: String(index), name: "x" });
    }
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(stack[0]).toMatchObject({ id: "5" });
    expect(newestUndo(stack)).toMatchObject({ id: String(UNDO_LIMIT + 4) });
  });

  it("replays strictly in order, newest first", () => {
    let stack = pushUndo<ListUndo>(
      pushUndo<ListUndo>([deleted], added),
      renamed,
    );
    expect(newestUndo(stack)).toEqual(renamed);
    stack = afterUndo(stack, "applied");
    expect(newestUndo(stack)).toEqual(added);
    stack = afterUndo(stack, "applied");
    expect(newestUndo(stack)).toEqual(deleted);
  });

  it("drops an entry that no longer applies", () => {
    expect(afterUndo([deleted, renamed], "stale")).toEqual([deleted]);
  });

  it("keeps an entry blocked by a taken name, and one whose save failed", () => {
    expect(afterUndo([deleted, renamed], "blocked")).toEqual([
      deleted,
      renamed,
    ]);
    expect(afterUndo([deleted, renamed], "failed")).toEqual([deleted, renamed]);
  });

  it("survives the trip through storage", () => {
    const stack = [renamed, added, deleted, moved];
    expect(readUndo(JSON.stringify(stack), menuUndoSchema)).toEqual(stack);
  });

  it.each([
    [null],
    [""],
    ["not json"],
    ['{"kind":"rename"}'],
    ['[{"kind":"rename","id":"a"}]'],
    ['[{"kind":"shuffle","id":"a","name":"x"}]'],
  ])("reads %j as an empty stack", (raw) => {
    expect(readUndo(raw, menuUndoSchema)).toEqual([]);
  });
});

describe("what the menus list says", () => {
  it("names each kind of change on the Undo control", () => {
    expect(undoLabel(menuWords, renamed)).toBe(
      "Undo: renamed Dinner to Supper",
    );
    expect(undoLabel(menuWords, added)).toBe("Undo: added Lunch");
    expect(undoLabel(menuWords, deleted)).toBe("Undo: deleted Dinner");
    expect(undoLabel(menuWords, moved)).toBe("Undo: moved Lunch");
  });

  it("counts menus in words", () => {
    expect(countText(menuWords, 1)).toBe("1 menu");
    expect(countText(menuWords, 3)).toBe("3 menus");
    expect(addedSentence(menuWords, "Brunch", 4)).toBe(
      "Brunch added. 4 menus.",
    );
  });

  it("says where a moved menu is, and when it is at the edge", () => {
    expect(movedSentence(menuWords, "up", "Dinner", 1, 3)).toBe(
      "Dinner moved up. 1 of 3.",
    );
    expect(movedSentence(menuWords, "down", "Dinner", 2, 3)).toBe(
      "Dinner moved down. 2 of 3.",
    );
    expect(edgeSentence(menuWords, "up", "Dinner")).toBe(
      "Dinner is already first.",
    );
    expect(edgeSentence(menuWords, "down", "Dinner")).toBe(
      "Dinner is already last.",
    );
  });

  it("names the field and the problem when a save fails", () => {
    expect(
      failureSentence(
        notSavedSentence(menuWords, "name", "Supper"),
        problemText(menuWords, { kind: "name-taken" }, "Dinner"),
      ),
    ).toBe("Name of Supper was not saved. Another menu is called Dinner.");
    expect(
      problemText(menuWords, { kind: "invalid", rule: "nameRequired" }, ""),
    ).toBe(strings.errors.nameRequired);
  });

  it.each<[ListProblem, string]>([
    [{ kind: "signed-out" }, editing.problems.signedOut],
    [{ kind: "invalid", rule: "nameLength" }, strings.errors.nameLength],
    [{ kind: "gone" }, strings.errors.gone],
    [{ kind: "changed" }, editing.stale],
    [{ kind: "mismatch" }, strings.errors.listChanged],
    [{ kind: "grew" }, strings.errors.grew],
    [{ kind: "failed" }, editing.problems.failed],
    [{ kind: "unreachable" }, editing.problems.unreachable],
    [{ kind: "out-of-date" }, editing.problems.outOfDate],
  ])("has words for %j", (problem, text) => {
    expect(problemText(menuWords, problem, "Dinner")).toBe(text);
  });

  it("says what Undo put back", () => {
    expect(undoneSentence(menuWords, renamed, 0, 0)).toBe(
      "Undone. The name is Dinner again.",
    );
    expect(undoneSentence(menuWords, added, 0, 0)).toBe(
      "Undone. Lunch is removed.",
    );
    expect(undoneSentence(menuWords, deleted, 2, 3)).toBe(
      "Undone. Dinner is back, 2 of 3.",
    );
    expect(undoneSentence(menuWords, moved, 1, 3)).toBe(
      "Undone. Lunch is back at 1 of 3.",
    );
  });

  it("says why Undo could not, when a name is taken", () => {
    expect(notUndoneSentence(menuWords, deleted, { kind: "name-taken" })).toBe(
      "Dinner cannot come back while another menu is called Dinner.",
    );
    expect(notUndoneSentence(menuWords, renamed, { kind: "name-taken" })).toBe(
      "The name Dinner is taken by another menu, so this was not undone.",
    );
  });

  it("says when a change can no longer be undone", () => {
    expect(notUndoneSentence(menuWords, renamed, { kind: "changed" })).toBe(
      strings.undo.textChanged,
    );
    expect(notUndoneSentence(menuWords, added, { kind: "gone" })).toBe(
      editing.stale,
    );
    expect(notUndoneSentence(menuWords, moved, { kind: "mismatch" })).toBe(
      editing.stale,
    );
  });

  it("says when the Undo itself did not get through", () => {
    expect(notUndoneSentence(menuWords, deleted, { kind: "unreachable" })).toBe(
      `${editing.notUndone} ${editing.problems.unreachable}`,
    );
  });
});

describe("what becomes of an Undo that could not be applied", () => {
  it("keeps an entry a taken name is in the way of", () => {
    expect(undoOutcome({ kind: "name-taken" })).toBe("blocked");
  });

  it.each<ListProblem>([
    { kind: "changed" },
    { kind: "gone" },
    { kind: "mismatch" },
    { kind: "grew" },
  ])("drops an entry whose change no longer stands: %j", (problem) => {
    expect(undoOutcome(problem)).toBe("stale");
  });

  it.each<ListProblem>([
    { kind: "failed" },
    { kind: "unreachable" },
    { kind: "out-of-date" },
    { kind: "signed-out" },
    { kind: "parent-gone" },
  ])("keeps an entry for another try after %j", (problem) => {
    expect(undoOutcome(problem)).toBe("failed");
  });
});

describe("what a delete asks and when it is refused (D-119)", () => {
  it("names the menu and its sections when they hold no dishes", () => {
    expect(
      deleteQuestion(menuWords, "Lunch", {
        sections: 4,
        dishes: 0,
        options: 0,
      }),
    ).toBe("Delete Lunch, with its 4 sections?");
    expect(
      deleteQuestion(menuWords, "Kids", { sections: 1, dishes: 0, options: 0 }),
    ).toBe("Delete Kids, with its 1 section?");
  });

  it("names the menu's dishes too, once its sections hold any", () => {
    expect(
      deleteQuestion(menuWords, "Dinner", {
        sections: 3,
        dishes: 14,
        options: 0,
      }),
    ).toBe("Delete Dinner, with its 3 sections and 14 dishes?");
    expect(
      deleteQuestion(menuWords, "Kids", { sections: 1, dishes: 1, options: 0 }),
    ).toBe("Delete Kids, with its 1 section and 1 dish?");
  });

  it("names the section and its dishes", () => {
    expect(
      deleteQuestion(sectionWords, "Starters", {
        sections: 0,
        dishes: 4,
        options: 0,
      }),
    ).toBe("Delete Starters, with its 4 dishes?");
    expect(
      deleteQuestion(sectionWords, "Sides", {
        sections: 0,
        dishes: 1,
        options: 0,
      }),
    ).toBe("Delete Sides, with its 1 dish?");
  });

  // D-166: a choice list with options asks the same way.
  it("names the choice list and its options", () => {
    const listWords = choiceListWords(choices, editing, "dish");
    expect(
      deleteQuestion(listWords, "Choose one side", {
        sections: 0,
        dishes: 0,
        options: 3,
      }),
    ).toBe("Delete Choose one side, with its 3 options?");
    expect(
      deleteQuestion(listWords, "Add on", {
        sections: 0,
        dishes: 0,
        options: 1,
      }),
    ).toBe("Delete Add on, with its 1 option?");
  });

  it("says why a delete from a page that is out of date did not happen", () => {
    expect(
      failureSentence(
        "Dinner was not deleted.",
        problemText(menuWords, { kind: "grew" }, "Dinner"),
      ),
    ).toBe(
      "Dinner was not deleted. It has sections or dishes this page did not show. Press Delete again.",
    );
    expect(
      failureSentence(
        "Starters was not deleted.",
        problemText(sectionWords, { kind: "grew" }, "Starters"),
      ),
    ).toBe(
      "Starters was not deleted. It has dishes this page did not show. Press Delete again.",
    );
  });

  it("says an added menu stays once it holds sections, since Undo never deletes content", () => {
    expect(notUndoneSentence(menuWords, added, { kind: "grew" })).toBe(
      "Lunch has sections now, so it stays. To delete it, use its Delete button.",
    );
  });

  it("says an added section stays once it holds dishes", () => {
    expect(
      notUndoneSentence(
        sectionWords,
        { kind: "add", id: "c", name: "Desserts" },
        { kind: "grew" },
      ),
    ).toBe(
      "Desserts has dishes now, so it stays. To delete it, use its Delete button.",
    );
  });

  it("drops that entry, so Undo moves on to the change before", () => {
    expect(afterUndo([renamed, added], undoOutcome({ kind: "grew" }))).toEqual([
      renamed,
    ]);
  });
});

// A note and an every-dish line start empty and may be emptied again.
describe("when an optional field saves", () => {
  const empty = { saved: "", draft: null, inFlight: null, failed: null };
  const note = (value: string) => cleanSectionText("note", value);

  it("writes nothing for an empty field that was left empty", () => {
    expect(commitOf(empty, note)).toEqual({ kind: "nothing" });
    expect(commitOf({ ...empty, draft: "  \n " }, note)).toEqual({
      kind: "reset",
    });
  });

  it("sends a first note, cleaned, with its line break kept", () => {
    expect(
      commitOf({ ...empty, draft: " Fried in peanut oil.\r\nAsk us. " }, note),
    ).toEqual({ kind: "send", value: "Fried in peanut oil.\nAsk us." });
  });

  it("sends an emptied note, which clears it", () => {
    expect(
      commitOf({ ...empty, saved: "Fried in peanut oil.", draft: "" }, note),
    ).toEqual({ kind: "send", value: "" });
  });

  it("writes nothing when a note only gained a line break at its end", () => {
    expect(
      commitOf(
        {
          ...empty,
          saved: "Fried in peanut oil.",
          draft: "Fried in peanut oil.\n",
        },
        note,
      ),
    ).toEqual({ kind: "reset" });
  });
});

const sectionRenamed: ListUndo = {
  kind: "rename",
  id: "a",
  from: "Mains",
  to: "Entrees",
};
const sectionNoted: ListUndo = {
  kind: "own",
  field: "note",
  id: "a",
  name: "Starters",
  from: "",
  to: "Fried in peanut oil.",
};
const sectionAdded: ListUndo = {
  kind: "add",
  id: "c",
  name: "Desserts",
};
const sectionDeleted: ListUndo = {
  kind: "delete",
  id: "a",
  name: "Starters",
  order: ["a", "b", "c"],
};
const sectionMoved: ListUndo = {
  kind: "move",
  id: "a",
  name: "Starters",
  order: ["a", "b", "c"],
};

describe("what the sections list says", () => {
  it("names each kind of change on the Undo control", () => {
    expect(undoLabel(sectionWords, sectionRenamed)).toBe(
      "Undo: renamed Mains to Entrees",
    );
    expect(undoLabel(sectionWords, sectionAdded)).toBe("Undo: added Desserts");
    expect(undoLabel(sectionWords, sectionDeleted)).toBe(
      "Undo: deleted Starters",
    );
    expect(undoLabel(sectionWords, sectionMoved)).toBe("Undo: moved Starters");
  });

  it("counts sections in words", () => {
    expect(countText(sectionWords, 1)).toBe("1 section");
    expect(countText(sectionWords, 3)).toBe("3 sections");
    expect(addedSentence(sectionWords, "Mains", 2)).toBe(
      "Mains added. 2 sections.",
    );
  });

  it("says where a moved section is, and when it is at the edge", () => {
    expect(movedSentence(sectionWords, "down", "Starters", 2, 3)).toBe(
      "Starters moved down. 2 of 3.",
    );
    expect(movedSentence(sectionWords, "up", "Mains", 1, 3)).toBe(
      "Mains moved up. 1 of 3.",
    );
    expect(edgeSentence(sectionWords, "up", "Starters")).toBe(
      "Starters is already first.",
    );
    expect(edgeSentence(sectionWords, "down", "Desserts")).toBe(
      "Desserts is already last.",
    );
  });

  it("names the field and the problem when a save fails", () => {
    expect(
      failureSentence(
        notSavedSentence(sectionWords, "name", "Mains"),
        problemText(sectionWords, { kind: "name-taken" }, "Starters"),
      ),
    ).toBe("Name of Mains was not saved. Another section is called Starters.");
  });

  it.each<[ListProblem, string]>([
    [{ kind: "signed-out" }, editing.problems.signedOut],
    [{ kind: "invalid", rule: "nameRequired" }, sections.errors.nameRequired],
    [{ kind: "invalid", rule: "nameLength" }, sections.errors.nameLength],
    [{ kind: "gone" }, sections.errors.gone],
    [{ kind: "parent-gone" }, sections.errors.parentGone],
    [{ kind: "changed" }, editing.stale],
    [{ kind: "mismatch" }, sections.errors.listChanged],
    [{ kind: "grew" }, sections.errors.grew],
    [{ kind: "failed" }, editing.problems.failed],
    [{ kind: "unreachable" }, editing.problems.unreachable],
    [{ kind: "out-of-date" }, editing.problems.outOfDate],
  ])("has words for %j", (problem, text) => {
    expect(problemText(sectionWords, problem, "Mains")).toBe(text);
  });

  it("says what Undo put back", () => {
    expect(undoneSentence(sectionWords, sectionRenamed, 0, 0)).toBe(
      "Undone. The name is Mains again.",
    );
    expect(undoneSentence(sectionWords, sectionAdded, 0, 0)).toBe(
      "Undone. Desserts is removed.",
    );
    expect(undoneSentence(sectionWords, sectionDeleted, 1, 3)).toBe(
      "Undone. Starters is back, 1 of 3.",
    );
    expect(undoneSentence(sectionWords, sectionMoved, 1, 3)).toBe(
      "Undone. Starters is back at 1 of 3.",
    );
  });

  it("says why Undo could not, when a name is taken", () => {
    expect(
      notUndoneSentence(sectionWords, sectionDeleted, { kind: "name-taken" }),
    ).toBe(
      "Starters cannot come back while another section is called Starters.",
    );
    expect(
      notUndoneSentence(sectionWords, sectionRenamed, { kind: "name-taken" }),
    ).toBe(
      "The name Mains is taken by another section, so this was not undone.",
    );
  });

  it("says when a name was changed again since, so nothing is written over", () => {
    expect(
      notUndoneSentence(sectionWords, sectionRenamed, { kind: "changed" }),
    ).toBe(sections.undo.textChanged);
  });

  it("says when a change can no longer be undone", () => {
    expect(
      notUndoneSentence(sectionWords, sectionAdded, { kind: "gone" }),
    ).toBe(editing.stale);
    expect(
      notUndoneSentence(sectionWords, sectionMoved, { kind: "mismatch" }),
    ).toBe(editing.stale);
  });

  it("says when the Undo itself did not get through", () => {
    expect(
      notUndoneSentence(sectionWords, sectionDeleted, { kind: "unreachable" }),
    ).toBe(`${editing.notUndone} ${editing.problems.unreachable}`);
    expect(
      notUndoneSentence(sectionWords, sectionRenamed, { kind: "parent-gone" }),
    ).toBe(`${editing.notUndone} ${sections.errors.parentGone}`);
  });

  it("keeps its Undo stack through storage", () => {
    const stack = [sectionRenamed, sectionAdded, sectionDeleted, sectionMoved];
    expect(readUndo(JSON.stringify(stack), sectionUndoSchema)).toEqual(stack);
  });

  it("reads a stack holding a note changed on a menu's page, before D-135, as empty", () => {
    expect(
      readUndo(
        '[{"kind":"text","field":"note","id":"a","name":"Starters","from":"","to":"y"}]',
        sectionUndoSchema,
      ),
    ).toEqual([]);
    expect(readUndo(JSON.stringify([sectionNoted]), menuUndoSchema)).toEqual(
      [],
    );
  });
});

// A section's note, at the top of its own page (D-120, D-135). Its label
// is the page's and does not name the section; every sentence the log says
// still does. What a section offered with every dish is a choice list now
// (D-166), so the note is the section's one own text.
describe("what a section's own text says on its page", () => {
  it("is the note alone, labelled plainly, with its hint and no hidden suffix", () => {
    expect(SECTION_OWN_TEXTS).toEqual(["note"]);
    expect(ownWords.fields.note).toMatchObject({
      label: "Note",
      suffix: "",
      hint: dishes.section.noteHint,
      multiline: true,
    });
  });

  it("names the change on the Undo control", () => {
    expect(undoLabel(ownWords, sectionNoted)).toBe(
      "Undo: changed the note for Starters",
    );
  });

  it("names the field and the problem when a save fails", () => {
    expect(
      failureSentence(
        notSavedSentence(ownWords, "note", "Starters"),
        problemText(ownWords, { kind: "invalid", rule: "noteLength" }, ""),
      ),
    ).toBe("Note for Starters was not saved. Keep the note to 500 characters.");
  });

  it("says a section that is gone in the page's own words", () => {
    expect(problemText(ownWords, { kind: "parent-gone" }, "")).toBe(
      dishes.errors.parentGone,
    );
    expect(
      notUndoneSentence(ownWords, sectionNoted, { kind: "parent-gone" }),
    ).toBe(`${editing.notUndone} ${dishes.errors.parentGone}`);
  });

  it("says what Undo put back", () => {
    expect(undoneSentence(ownWords, sectionNoted, 0, 0)).toBe(
      "Undone. The note for Starters is as it was.",
    );
  });

  it("says when a text was changed again since, so nothing is written over", () => {
    expect(notUndoneSentence(ownWords, sectionNoted, { kind: "changed" })).toBe(
      sections.undo.textChanged,
    );
  });

  it("are kept on the section's page's Undo stack with its dishes' changes", () => {
    const stack: ListUndo[] = [
      { kind: "rename", id: "d", from: "Soup", to: "Soup of the day" },
      sectionNoted,
      { kind: "add", id: "e", name: "House salad" },
    ];
    expect(readUndo(JSON.stringify(stack), sectionPageUndoSchema)).toEqual(
      stack,
    );
    expect(
      readUndo(JSON.stringify(stack), listUndoSchema([])),
      "a dishes stack with no own texts reads it as empty",
    ).toEqual([]);
    expect(
      isListUndo(sectionNoted),
      "a change the list itself takes back",
    ).toBe(true);
  });

  it("reads an own change to a field the page does not have as empty", () => {
    expect(
      readUndo(
        '[{"kind":"own","field":"name","id":"a","name":"Starters","from":"","to":"y"}]',
        sectionPageUndoSchema,
      ),
    ).toEqual([]);
  });
});

// The third list (D-128). It says what the other two say, in its own words.
describe("what the dishes list says", () => {
  const dishRenamed: ListUndo = {
    kind: "rename",
    id: "a",
    from: "Soup",
    to: "Soup of the day",
  };
  const dishAdded: ListUndo = { kind: "add", id: "b", name: "House salad" };
  const dishDeleted: ListUndo = {
    kind: "delete",
    id: "a",
    name: "Garlic bread",
    order: ["a", "b"],
  };

  it("names each kind of change on the Undo control", () => {
    expect(undoLabel(dishWords, dishRenamed)).toBe(
      "Undo: renamed Soup to Soup of the day",
    );
    expect(undoLabel(dishWords, dishAdded)).toBe("Undo: added House salad");
    expect(undoLabel(dishWords, dishDeleted)).toBe(
      "Undo: deleted Garlic bread",
    );
  });

  it("counts dishes in words, and says an add with the count", () => {
    expect(countText(dishWords, 1)).toBe("1 dish");
    expect(countText(dishWords, 3)).toBe("3 dishes");
    expect(addedSentence(dishWords, "House salad", 2)).toBe(
      "House salad added. 2 dishes.",
    );
  });

  it("says a move, an edge, and what Undo put back", () => {
    expect(movedSentence(dishWords, "down", "Soup of the day", 2, 3)).toBe(
      "Soup of the day moved down. 2 of 3.",
    );
    expect(edgeSentence(dishWords, "up", "Soup of the day")).toBe(
      "Soup of the day is already first.",
    );
    expect(undoneSentence(dishWords, dishDeleted, 1, 2)).toBe(
      "Undone. Garlic bread is back, 1 of 2.",
    );
  });

  it("names the field and the problem when a save fails", () => {
    expect(
      failureSentence(
        notSavedSentence(dishWords, "name", "Soup"),
        problemText(dishWords, { kind: "name-taken" }, "House salad"),
      ),
    ).toBe(
      "Name of Soup was not saved. Another dish in this section is called House salad.",
    );
    expect(
      problemText(dishWords, { kind: "invalid", rule: "nameLength" }, ""),
    ).toBe("Keep the name to 120 characters.");
    expect(problemText(dishWords, { kind: "parent-gone" }, "")).toBe(
      "This section is no longer here. Go back to Menus.",
    );
  });

  it("stores no text change, since a dish has only its name here", () => {
    const schema = listUndoSchema([]);
    expect(readUndo(JSON.stringify([dishRenamed, dishAdded]), schema)).toEqual([
      dishRenamed,
      dishAdded,
    ]);
    expect(readUndo(JSON.stringify([sectionNoted]), schema)).toEqual([]);
  });
});

// A section moved to another menu, from its own page (D-129). It shares the
// page's Undo with the dishes.
describe("what a section's move says", () => {
  const move = dishes.move;
  const gone = dishes.errors.parentGone;
  const entry: SectionMove = {
    kind: "relocate",
    id: "s",
    name: "Starters",
    from: { id: "d", name: "Dinner", order: ["s", "m"] },
    to: { id: "l", name: "Lunch" },
  };

  it("says the move once, with where the section landed and that the owner is still on this page", () => {
    expect(sectionMovedSentence(move, "Starters", "Lunch")).toBe(
      "Starters moved to Lunch. It is the last section there. You are still on this page.",
    );
  });

  it("says why a move did not happen", () => {
    expect(
      notMovedSentence(
        move,
        editing,
        gone,
        { kind: "name-taken" },
        "Starters",
        "Lunch",
      ),
    ).toBe(
      "Starters was not moved. Lunch already has a section called Starters.",
    );
    expect(
      notMovedSentence(
        move,
        editing,
        gone,
        { kind: "menu-gone" },
        "Starters",
        "Lunch",
      ),
    ).toBe(
      "Starters was not moved. That menu is no longer here. Reload the page.",
    );
    expect(
      notMovedSentence(
        move,
        editing,
        gone,
        { kind: "parent-gone" },
        "Starters",
        "Lunch",
      ),
    ).toBe(`Starters was not moved. ${gone}`);
    expect(
      notMovedSentence(
        move,
        editing,
        gone,
        { kind: "out-of-date" },
        "Starters",
        "Lunch",
      ),
    ).toBe(`Starters was not moved. ${editing.problems.outOfDate}`);
  });

  it("names the move on the Undo control, and says where Undo put the section", () => {
    expect(moveUndoLabel(move, entry)).toBe("Undo: moved Starters to Lunch");
    expect(moveUndoneSentence(move, entry, 1, 3)).toBe(
      "Undone. Starters is back in Dinner, 1 of 3.",
    );
  });

  it("keeps the entry when the old menu has taken the name since", () => {
    expect(
      moveNotUndone(move, editing, gone, entry, { kind: "name-taken" }),
    ).toEqual({
      outcome: "blocked",
      sentence:
        "Starters cannot go back while Dinner has another section called Starters.",
    });
  });

  it.each([
    { kind: "menu-gone" },
    { kind: "gone" },
    { kind: "parent-gone" },
    { kind: "changed" },
  ] as const)(
    "drops the entry when the move no longer stands: %j",
    (problem) => {
      expect(moveNotUndone(move, editing, gone, entry, problem)).toEqual({
        outcome: "stale",
        sentence: editing.stale,
      });
    },
  );

  it("keeps the entry for another try when the save did not get through", () => {
    expect(
      moveNotUndone(move, editing, gone, entry, { kind: "unreachable" }),
    ).toEqual({
      outcome: "failed",
      sentence: `${editing.notUndone} ${editing.problems.unreachable}`,
    });
  });

  it("is told apart from a list's own change, and survives storage beside one", () => {
    expect(isListUndo(entry)).toBe(false);
    expect(isListUndo(renamed)).toBe(true);
    expect(readUndo(JSON.stringify([entry]), sectionMoveSchema)).toEqual([
      entry,
    ]);
    expect(readUndo(JSON.stringify([entry]), listUndoSchema([]))).toEqual([]);
  });
});
