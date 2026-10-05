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
  deleteQuestion,
  edgeSentence,
  failureSentence,
  menuCount,
  menuUndoSchema,
  movedSentence,
  notUndoneSentence,
  problemText,
  undoLabel,
  undoneSentence,
  type MenuProblem,
  type MenuUndo,
} from "../../src/features/owner/menu-messages";
import * as sectionWords from "../../src/features/owner/section-messages";
import { cleanSectionText } from "../../src/domain/section";

const strings = en.owner.menus;
const editing = en.owner.editing;
const sections = en.owner.sections;

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

const renamed: MenuUndo = {
  kind: "rename",
  id: "a",
  from: "Dinner",
  to: "Supper",
};
const added: MenuUndo = { kind: "add", id: "b", name: "Lunch" };
const deleted: MenuUndo = {
  kind: "delete",
  id: "a",
  name: "Dinner",
  order: ["a", "b"],
};
const moved: MenuUndo = {
  kind: "move",
  id: "b",
  name: "Lunch",
  order: ["a", "b"],
};

describe("the Undo stack", () => {
  it("names the newest change and nothing when empty", () => {
    expect(newestUndo([])).toBeNull();
    expect(newestUndo(pushUndo<MenuUndo>([renamed], added))).toEqual(added);
  });

  it("keeps the last twenty changes", () => {
    let stack: MenuUndo[] = [];
    for (let index = 0; index < UNDO_LIMIT + 5; index += 1) {
      stack = pushUndo(stack, { kind: "add", id: String(index), name: "x" });
    }
    expect(stack).toHaveLength(UNDO_LIMIT);
    expect(stack[0]).toMatchObject({ id: "5" });
    expect(newestUndo(stack)).toMatchObject({ id: String(UNDO_LIMIT + 4) });
  });

  it("replays strictly in order, newest first", () => {
    let stack = pushUndo<MenuUndo>(
      pushUndo<MenuUndo>([deleted], added),
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
    expect(undoLabel(strings, renamed)).toBe("Undo: renamed Dinner to Supper");
    expect(undoLabel(strings, added)).toBe("Undo: added Lunch");
    expect(undoLabel(strings, deleted)).toBe("Undo: deleted Dinner");
    expect(undoLabel(strings, moved)).toBe("Undo: moved Lunch");
  });

  it("counts menus in words", () => {
    expect(menuCount(strings, 1)).toBe("1 menu");
    expect(menuCount(strings, 3)).toBe("3 menus");
  });

  it("says where a moved menu is, and when it is at the edge", () => {
    expect(movedSentence(strings, "up", "Dinner", 1, 3)).toBe(
      "Dinner moved up. 1 of 3.",
    );
    expect(movedSentence(strings, "down", "Dinner", 2, 3)).toBe(
      "Dinner moved down. 2 of 3.",
    );
    expect(edgeSentence(strings, "up", "Dinner")).toBe(
      "Dinner is already first.",
    );
    expect(edgeSentence(strings, "down", "Dinner")).toBe(
      "Dinner is already last.",
    );
  });

  it("names the field and the problem when a save fails", () => {
    const thing = "Name of Supper was not saved.";
    expect(
      failureSentence(
        thing,
        problemText(strings, editing, { kind: "name-taken" }, "Dinner"),
      ),
    ).toBe("Name of Supper was not saved. Another menu is called Dinner.");
    expect(
      problemText(
        strings,
        editing,
        { kind: "invalid", rule: "nameRequired" },
        "",
      ),
    ).toBe(strings.errors.nameRequired);
  });

  it.each<[MenuProblem, string]>([
    [{ kind: "signed-out" }, editing.problems.signedOut],
    [{ kind: "invalid", rule: "nameLength" }, strings.errors.nameLength],
    [{ kind: "gone" }, strings.errors.gone],
    [{ kind: "changed" }, editing.stale],
    [{ kind: "mismatch" }, strings.errors.listChanged],
    [{ kind: "failed" }, editing.problems.failed],
    [{ kind: "unreachable" }, editing.problems.unreachable],
    [{ kind: "out-of-date" }, editing.problems.outOfDate],
  ])("has words for %j", (problem, text) => {
    expect(problemText(strings, editing, problem, "Dinner")).toBe(text);
  });

  it("says what Undo put back", () => {
    expect(undoneSentence(strings, renamed, 0, 0)).toBe(
      "Undone. The name is Dinner again.",
    );
    expect(undoneSentence(strings, added, 0, 0)).toBe(
      "Undone. Lunch is removed.",
    );
    expect(undoneSentence(strings, deleted, 2, 3)).toBe(
      "Undone. Dinner is back, 2 of 3.",
    );
    expect(undoneSentence(strings, moved, 1, 3)).toBe(
      "Undone. Lunch is back at 1 of 3.",
    );
  });

  it("says why Undo could not, when a name is taken", () => {
    expect(
      notUndoneSentence(strings, editing, deleted, { kind: "name-taken" }),
    ).toBe("Dinner cannot come back while another menu is called Dinner.");
    expect(
      notUndoneSentence(strings, editing, renamed, { kind: "name-taken" }),
    ).toBe("The name Dinner is taken by another menu, so this was not undone.");
  });

  it("says when a change can no longer be undone", () => {
    expect(
      notUndoneSentence(strings, editing, renamed, { kind: "changed" }),
    ).toBe(strings.undo.renameChanged);
    expect(notUndoneSentence(strings, editing, added, { kind: "gone" })).toBe(
      editing.stale,
    );
    expect(
      notUndoneSentence(strings, editing, moved, { kind: "mismatch" }),
    ).toBe(editing.stale);
  });

  it("says when the Undo itself did not get through", () => {
    expect(
      notUndoneSentence(strings, editing, deleted, { kind: "unreachable" }),
    ).toBe(`${editing.notUndone} ${editing.problems.unreachable}`);
  });
});

describe("what a delete asks and when it is refused (D-119)", () => {
  it("names the menu and what goes with it", () => {
    expect(deleteQuestion(strings, "Lunch", 4)).toBe(
      "Delete Lunch, with its 4 sections?",
    );
    expect(deleteQuestion(strings, "Kids", 1)).toBe(
      "Delete Kids, with its 1 section?",
    );
  });

  it("says why a delete from a page that is out of date did not happen", () => {
    expect(
      failureSentence(
        "Dinner was not deleted.",
        problemText(strings, editing, { kind: "grew" }, "Dinner"),
      ),
    ).toBe(
      "Dinner was not deleted. It has sections this page did not show. Press Delete again.",
    );
  });

  it("says an added menu stays once it holds sections, since Undo never deletes content", () => {
    expect(notUndoneSentence(strings, editing, added, { kind: "grew" })).toBe(
      "Lunch has sections now, so it stays. To delete it, use its Delete button.",
    );
  });

  it("drops that entry, so Undo moves on to the change before", () => {
    expect(afterUndo([renamed, added], "stale")).toEqual([renamed]);
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

const sectionRenamed: sectionWords.SectionUndo = {
  kind: "rename",
  id: "a",
  from: "Mains",
  to: "Entrees",
};
const sectionNoted: sectionWords.SectionUndo = {
  kind: "text",
  field: "note",
  id: "a",
  name: "Starters",
  from: "",
  to: "Fried in peanut oil.",
};
const sectionLined: sectionWords.SectionUndo = {
  kind: "text",
  field: "everyItem",
  id: "a",
  name: "Starters",
  from: "Add spaghetti for 3 dollars.",
  to: "",
};
const sectionAdded: sectionWords.SectionUndo = {
  kind: "add",
  id: "c",
  name: "Desserts",
};
const sectionDeleted: sectionWords.SectionUndo = {
  kind: "delete",
  id: "a",
  name: "Starters",
  order: ["a", "b", "c"],
};
const sectionMoved: sectionWords.SectionUndo = {
  kind: "move",
  id: "a",
  name: "Starters",
  order: ["a", "b", "c"],
};

describe("what the sections list says", () => {
  it("names each kind of change on the Undo control", () => {
    expect(sectionWords.undoLabel(sections, sectionRenamed)).toBe(
      "Undo: renamed Mains to Entrees",
    );
    expect(sectionWords.undoLabel(sections, sectionNoted)).toBe(
      "Undo: changed the note for Starters",
    );
    expect(sectionWords.undoLabel(sections, sectionLined)).toBe(
      "Undo: changed the line for every dish in Starters",
    );
    expect(sectionWords.undoLabel(sections, sectionAdded)).toBe(
      "Undo: added Desserts",
    );
    expect(sectionWords.undoLabel(sections, sectionDeleted)).toBe(
      "Undo: deleted Starters",
    );
    expect(sectionWords.undoLabel(sections, sectionMoved)).toBe(
      "Undo: moved Starters",
    );
  });

  it("counts sections in words", () => {
    expect(sectionWords.sectionCount(sections, 1)).toBe("1 section");
    expect(sectionWords.sectionCount(sections, 3)).toBe("3 sections");
  });

  it("says where a moved section is, and when it is at the edge", () => {
    expect(sectionWords.movedSentence(sections, "down", "Starters", 2, 3)).toBe(
      "Starters moved down. 2 of 3.",
    );
    expect(sectionWords.movedSentence(sections, "up", "Mains", 1, 3)).toBe(
      "Mains moved up. 1 of 3.",
    );
    expect(sectionWords.edgeSentence(sections, "up", "Starters")).toBe(
      "Starters is already first.",
    );
    expect(sectionWords.edgeSentence(sections, "down", "Desserts")).toBe(
      "Desserts is already last.",
    );
  });

  it("names the field and the problem when a save fails", () => {
    expect(
      sectionWords.failureSentence(
        sectionWords.notSavedSentence(sections, "name", "Mains"),
        sectionWords.problemText(
          sections,
          editing,
          { kind: "name-taken" },
          "Starters",
        ),
      ),
    ).toBe("Name of Mains was not saved. Another section is called Starters.");
    expect(
      sectionWords.failureSentence(
        sectionWords.notSavedSentence(sections, "note", "Starters"),
        sectionWords.problemText(
          sections,
          editing,
          { kind: "invalid", rule: "noteLength" },
          "",
        ),
      ),
    ).toBe("Note for Starters was not saved. Keep the note to 500 characters.");
    expect(
      sectionWords.failureSentence(
        sectionWords.notSavedSentence(sections, "everyItem", "Starters"),
        sectionWords.problemText(
          sections,
          editing,
          { kind: "invalid", rule: "everyItemLength" },
          "",
        ),
      ),
    ).toBe(
      "The line for every dish in Starters was not saved. Keep this line to 120 characters.",
    );
  });

  it.each<[sectionWords.SectionProblem, string]>([
    [{ kind: "signed-out" }, editing.problems.signedOut],
    [{ kind: "invalid", rule: "nameRequired" }, sections.errors.nameRequired],
    [{ kind: "invalid", rule: "nameLength" }, sections.errors.nameLength],
    [{ kind: "gone" }, sections.errors.gone],
    [{ kind: "menu-gone" }, sections.errors.menuGone],
    [{ kind: "changed" }, editing.stale],
    [{ kind: "mismatch" }, sections.errors.listChanged],
    [{ kind: "failed" }, editing.problems.failed],
    [{ kind: "unreachable" }, editing.problems.unreachable],
    [{ kind: "out-of-date" }, editing.problems.outOfDate],
  ])("has words for %j", (problem, text) => {
    expect(sectionWords.problemText(sections, editing, problem, "Mains")).toBe(
      text,
    );
  });

  it("says what Undo put back", () => {
    expect(sectionWords.undoneSentence(sections, sectionRenamed, 0, 0)).toBe(
      "Undone. The name is Mains again.",
    );
    expect(sectionWords.undoneSentence(sections, sectionNoted, 0, 0)).toBe(
      "Undone. The note for Starters is as it was.",
    );
    expect(sectionWords.undoneSentence(sections, sectionLined, 0, 0)).toBe(
      "Undone. The line for every dish in Starters is as it was.",
    );
    expect(sectionWords.undoneSentence(sections, sectionAdded, 0, 0)).toBe(
      "Undone. Desserts is removed.",
    );
    expect(sectionWords.undoneSentence(sections, sectionDeleted, 1, 3)).toBe(
      "Undone. Starters is back, 1 of 3.",
    );
    expect(sectionWords.undoneSentence(sections, sectionMoved, 1, 3)).toBe(
      "Undone. Starters is back at 1 of 3.",
    );
  });

  it("says why Undo could not, when a name is taken", () => {
    expect(
      sectionWords.notUndoneSentence(sections, editing, sectionDeleted, {
        kind: "name-taken",
      }),
    ).toBe(
      "Starters cannot come back while another section is called Starters.",
    );
    expect(
      sectionWords.notUndoneSentence(sections, editing, sectionRenamed, {
        kind: "name-taken",
      }),
    ).toBe(
      "The name Mains is taken by another section, so this was not undone.",
    );
  });

  it("says when a text was changed again since, so nothing is written over", () => {
    for (const entry of [sectionRenamed, sectionNoted, sectionLined]) {
      expect(
        sectionWords.notUndoneSentence(sections, editing, entry, {
          kind: "changed",
        }),
      ).toBe(sections.undo.textChanged);
    }
  });

  it("says when a change can no longer be undone", () => {
    expect(
      sectionWords.notUndoneSentence(sections, editing, sectionAdded, {
        kind: "gone",
      }),
    ).toBe(editing.stale);
    expect(
      sectionWords.notUndoneSentence(sections, editing, sectionMoved, {
        kind: "mismatch",
      }),
    ).toBe(editing.stale);
  });

  it("says when the Undo itself did not get through", () => {
    expect(
      sectionWords.notUndoneSentence(sections, editing, sectionDeleted, {
        kind: "unreachable",
      }),
    ).toBe(`${editing.notUndone} ${editing.problems.unreachable}`);
    expect(
      sectionWords.notUndoneSentence(sections, editing, sectionNoted, {
        kind: "menu-gone",
      }),
    ).toBe(`${editing.notUndone} ${sections.errors.menuGone}`);
  });

  it("keeps its Undo stack through storage, the two text changes included", () => {
    const stack = [
      sectionRenamed,
      sectionNoted,
      sectionLined,
      sectionAdded,
      sectionDeleted,
      sectionMoved,
    ];
    expect(
      readUndo(JSON.stringify(stack), sectionWords.sectionUndoSchema),
    ).toEqual(stack);
  });

  it("reads a menus stack, or a text change to a field it does not know, as empty", () => {
    expect(
      readUndo(
        '[{"kind":"text","field":"name","id":"a","name":"x","from":"","to":"y"}]',
        sectionWords.sectionUndoSchema,
      ),
    ).toEqual([]);
    expect(readUndo(JSON.stringify([sectionNoted]), menuUndoSchema)).toEqual(
      [],
    );
  });
});
