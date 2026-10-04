import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { cleanMenuName } from "../../src/domain/menu";
import { commitOf } from "../../src/features/owner/editing/commit";
import { afterHold, leaveOf } from "../../src/features/owner/editing/leave";
import { statusOf } from "../../src/features/owner/editing/status";
import {
  afterUndo,
  newestUndo,
  pushUndo,
  readUndo,
  UNDO_LIMIT,
} from "../../src/features/owner/editing/undo";
import {
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

const strings = en.owner.menus;
const editing = en.owner.editing;

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
