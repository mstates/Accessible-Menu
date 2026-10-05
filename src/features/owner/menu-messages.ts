import { z } from "zod";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";

// Every sentence the menus list shows or speaks, built in one place from
// copy, and the shape of its Undo entries. Pure: no React, no network.

export type MenuStrings = Copy["owner"]["menus"];
export type EditingStrings = Copy["owner"]["editing"];

// One change the owner can take back. A delete and a move remember the order
// before them, so Undo puts the list back as it was.
export const menuUndoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rename"),
    id: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({ kind: z.literal("add"), id: z.string(), name: z.string() }),
  z.object({
    kind: z.literal("delete"),
    id: z.string(),
    name: z.string(),
    order: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("move"),
    id: z.string(),
    name: z.string(),
    order: z.array(z.string()),
  }),
]);

export type MenuUndo = z.infer<typeof menuUndoSchema>;

// Why a save did not land. The first group comes back from the server; the
// last two are what the browser makes of a call that never got an answer.
export type MenuProblem =
  | { kind: "signed-out" }
  | { kind: "invalid"; rule: "nameRequired" | "nameLength" }
  | { kind: "name-taken" }
  | { kind: "gone" }
  | { kind: "changed" }
  | { kind: "mismatch" }
  // A delete would have taken more sections than the owner was told about.
  | { kind: "grew" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

// The Undo control's whole name, which is also its visible text.
export function undoLabel(strings: MenuStrings, entry: MenuUndo): string {
  switch (entry.kind) {
    case "rename":
      return fill(strings.undo.renamed, { from: entry.from, to: entry.to });
    case "add":
      return fill(strings.undo.added, { menu: entry.name });
    case "delete":
      return fill(strings.undo.deleted, { menu: entry.name });
    case "move":
      return fill(strings.undo.moved, { menu: entry.name });
  }
}

export function menuCount(strings: MenuStrings, count: number): string {
  return fill(count === 1 ? strings.count.one : strings.count.other, {
    count,
  });
}

// What a delete asks before it takes sections with it (D-119), which is
// also the confirmation's name: "Delete Lunch, with its 4 sections?"
export function deleteQuestion(
  strings: MenuStrings,
  menu: string,
  sections: number,
): string {
  const counted = fill(
    sections === 1 ? strings.sectionCount.one : strings.sectionCount.other,
    { count: sections },
  );
  return fill(strings.deleteAsk, { menu, sections: counted });
}

// What went wrong, in words. The name is the one the owner typed or the menu
// it concerns, for the sentence about a name already in use.
export function problemText(
  strings: MenuStrings,
  editing: EditingStrings,
  problem: MenuProblem,
  name: string,
): string {
  switch (problem.kind) {
    case "signed-out":
      return editing.problems.signedOut;
    case "invalid":
      return strings.errors[problem.rule];
    case "name-taken":
      return fill(strings.errors.nameTaken, { menu: name });
    case "gone":
      return strings.errors.gone;
    case "changed":
      return editing.stale;
    case "mismatch":
      return strings.errors.listChanged;
    case "grew":
      return strings.errors.grew;
    case "failed":
      return editing.problems.failed;
    case "unreachable":
      return editing.problems.unreachable;
    case "out-of-date":
      return editing.problems.outOfDate;
  }
}

// A failure names what was not saved, then the problem: "Name of Dinner was
// not saved. A menu needs a name."
export function failureSentence(thing: string, problem: string): string {
  return `${thing} ${problem}`;
}

export function movedSentence(
  strings: MenuStrings,
  direction: "up" | "down",
  menu: string,
  position: number,
  total: number,
): string {
  return fill(direction === "up" ? strings.movedUp : strings.movedDown, {
    menu,
    position,
    total,
  });
}

export function edgeSentence(
  strings: MenuStrings,
  direction: "up" | "down",
  menu: string,
): string {
  return fill(direction === "up" ? strings.alreadyFirst : strings.alreadyLast, {
    menu,
  });
}

// What Undo says once it has put a change back.
export function undoneSentence(
  strings: MenuStrings,
  entry: MenuUndo,
  position: number,
  total: number,
): string {
  switch (entry.kind) {
    case "rename":
      return fill(strings.undo.renamedBack, { from: entry.from });
    case "add":
      return fill(strings.undo.removed, { menu: entry.name });
    case "delete":
      return fill(strings.undo.restored, {
        menu: entry.name,
        position,
        total,
      });
    case "move":
      return fill(strings.undo.movedBack, {
        menu: entry.name,
        position,
        total,
      });
  }
}

// What Undo says when it could not: a taken name keeps the entry, a change
// that no longer stands drops it, and anything else is an ordinary failure.
// An added menu that now holds sections no longer stands as the change it
// was: Undo never deletes content, so it says where the Delete button is.
export function notUndoneSentence(
  strings: MenuStrings,
  editing: EditingStrings,
  entry: MenuUndo,
  problem: MenuProblem,
): string {
  if (problem.kind === "grew" && entry.kind === "add") {
    return fill(strings.undo.addGrew, { menu: entry.name });
  }
  if (problem.kind === "name-taken") {
    return entry.kind === "rename"
      ? fill(strings.undo.renameBlocked, { from: entry.from })
      : fill(strings.undo.restoreBlocked, { menu: entry.name });
  }
  if (problem.kind === "changed" && entry.kind === "rename") {
    return strings.undo.renameChanged;
  }
  if (
    problem.kind === "changed" ||
    problem.kind === "gone" ||
    problem.kind === "mismatch"
  ) {
    return editing.stale;
  }
  const name = entry.kind === "rename" ? entry.to : entry.name;
  return failureSentence(
    editing.notUndone,
    problemText(strings, editing, problem, name),
  );
}
