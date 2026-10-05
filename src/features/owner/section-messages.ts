import { z } from "zod";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { SectionRule, SectionText } from "@/domain/section";

// Every sentence a menu's sections list shows or speaks, built in one place
// from copy, and the shape of its Undo entries. It mirrors menu-messages.ts
// on purpose: the two lists are the first and second use, and the third,
// the dishes inside a section, is where they become one (module rule 12).
// Pure: no React, no network.

export type SectionStrings = Copy["owner"]["sections"];
export type EditingStrings = Copy["owner"]["editing"];

// One change the owner can take back. A delete and a move remember the order
// before them, so Undo puts the list back as it was. A changed note or
// every-dish line remembers both texts, and is taken back only while the
// field still holds the one that change wrote.
export const sectionUndoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rename"),
    id: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    kind: z.literal("text"),
    field: z.enum(["note", "everyItem"]),
    id: z.string(),
    name: z.string(),
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

export type SectionUndo = z.infer<typeof sectionUndoSchema>;

// Why a save did not land. The first group comes back from the server; the
// last two are what the browser makes of a call that never got an answer.
export type SectionProblem =
  | { kind: "signed-out" }
  | { kind: "invalid"; rule: SectionRule }
  | { kind: "name-taken" }
  | { kind: "gone" }
  // The menu itself was deleted, or is no longer this owner's.
  | { kind: "menu-gone" }
  | { kind: "changed" }
  | { kind: "mismatch" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

// The Undo control's whole name, which is also its visible text.
export function undoLabel(strings: SectionStrings, entry: SectionUndo): string {
  switch (entry.kind) {
    case "rename":
      return fill(strings.undo.renamed, { from: entry.from, to: entry.to });
    case "text":
      return fill(strings.undo[entry.field], { section: entry.name });
    case "add":
      return fill(strings.undo.added, { section: entry.name });
    case "delete":
      return fill(strings.undo.deleted, { section: entry.name });
    case "move":
      return fill(strings.undo.moved, { section: entry.name });
  }
}

export function sectionCount(strings: SectionStrings, count: number): string {
  return fill(count === 1 ? strings.count.one : strings.count.other, {
    count,
  });
}

// An add that landed, with how many sections the menu has now: "Mains
// added. 2 sections." The number comes from the server, so adds waiting
// behind one another never count wrong (D-125).
export function addedSentence(
  strings: SectionStrings,
  section: string,
  total: number,
): string {
  return fill(strings.added, { section, count: sectionCount(strings, total) });
}

// What was not saved, by field: "Note for Starters was not saved."
export function notSavedSentence(
  strings: SectionStrings,
  field: SectionText,
  section: string,
): string {
  return fill(strings.notSaved[field], { section });
}

// What went wrong, in words. The name is the one the owner typed or the
// section it concerns, for the sentence about a name already in use.
export function problemText(
  strings: SectionStrings,
  editing: EditingStrings,
  problem: SectionProblem,
  name: string,
): string {
  switch (problem.kind) {
    case "signed-out":
      return editing.problems.signedOut;
    case "invalid":
      return strings.errors[problem.rule];
    case "name-taken":
      return fill(strings.errors.nameTaken, { section: name });
    case "gone":
      return strings.errors.gone;
    case "menu-gone":
      return strings.errors.menuGone;
    case "changed":
      return editing.stale;
    case "mismatch":
      return strings.errors.listChanged;
    case "failed":
      return editing.problems.failed;
    case "unreachable":
      return editing.problems.unreachable;
    case "out-of-date":
      return editing.problems.outOfDate;
  }
}

// A failure names what was not saved, then the problem: "Name of Starters
// was not saved. A section needs a name."
export function failureSentence(thing: string, problem: string): string {
  return `${thing} ${problem}`;
}

export function movedSentence(
  strings: SectionStrings,
  direction: "up" | "down",
  section: string,
  position: number,
  total: number,
): string {
  return fill(direction === "up" ? strings.movedUp : strings.movedDown, {
    section,
    position,
    total,
  });
}

export function edgeSentence(
  strings: SectionStrings,
  direction: "up" | "down",
  section: string,
): string {
  return fill(direction === "up" ? strings.alreadyFirst : strings.alreadyLast, {
    section,
  });
}

// What Undo says once it has put a change back.
export function undoneSentence(
  strings: SectionStrings,
  entry: SectionUndo,
  position: number,
  total: number,
): string {
  switch (entry.kind) {
    case "rename":
      return fill(strings.undo.renamedBack, { from: entry.from });
    case "text":
      return fill(
        entry.field === "note"
          ? strings.undo.noteBack
          : strings.undo.everyItemBack,
        { section: entry.name },
      );
    case "add":
      return fill(strings.undo.removed, { section: entry.name });
    case "delete":
      return fill(strings.undo.restored, {
        section: entry.name,
        position,
        total,
      });
    case "move":
      return fill(strings.undo.movedBack, {
        section: entry.name,
        position,
        total,
      });
  }
}

// What Undo says when it could not: a taken name keeps the entry, a change
// that no longer stands drops it, and anything else is an ordinary failure.
export function notUndoneSentence(
  strings: SectionStrings,
  editing: EditingStrings,
  entry: SectionUndo,
  problem: SectionProblem,
): string {
  if (problem.kind === "name-taken") {
    return entry.kind === "rename"
      ? fill(strings.undo.renameBlocked, { from: entry.from })
      : fill(strings.undo.restoreBlocked, { section: entry.name });
  }
  if (
    problem.kind === "changed" &&
    (entry.kind === "rename" || entry.kind === "text")
  ) {
    return strings.undo.textChanged;
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
