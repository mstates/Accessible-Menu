import { z } from "zod";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  allergenUndoLabel,
  type AllergenStrings,
} from "../allergens/allergen-words";
import {
  allergenChangeSchema,
  checkChangeSchema,
  othersChangeSchema,
  undoListsSchema,
  type GroupChange,
  type ListChange,
} from "../allergens/group-undo";

// The words of a section's line shown with every dish and its allergen
// group (D-152, D-153), and the shape of the entries it leaves on the
// section page's Undo. The group speaks with the dish page's words, with
// the line's own in place of every sentence that names a dish; the
// sentences name the section, since a sentence is heard on its own
// (D-135), and the heading names the line, since the headings list reads
// it alone. Pure: no React, no network.

export type LineStrings = Copy["owner"]["dishes"]["line"];
export type SectionStrings = Copy["owner"]["sections"];

// The group's words for a line: the dish page's, with the line's own over
// them.
export function lineAllergenStrings(
  dish: AllergenStrings,
  line: LineStrings,
): AllergenStrings {
  return {
    ...dish,
    heading: line.heading,
    groupHint: line.lead,
    checkHint: line.checkHint,
    othersFull: line.othersFull,
    cleared: line.cleared,
    listsChanged: line.listsChanged,
    listsMoved: line.listsMoved,
    checkChanged: line.checkChanged,
    notSaved: {
      ...dish.notSaved,
      allergens: line.notSaved.allergens,
      check: line.notSaved.check,
    },
    errors: {
      ...dish.errors,
      otherTaken: line.errors.otherTaken,
      otherMajorBoth: line.errors.otherMajorBoth,
    },
    undo: {
      ...dish.undo,
      ticked: line.undo.ticked,
      unticked: line.undo.unticked,
      othersChanged: line.undo.othersChanged,
      othersBack: line.undo.othersBack,
      checked: line.undo.checked,
      unchecked: line.undo.unchecked,
      checkedBack: line.undo.checkedBack,
      uncheckedBack: line.undo.uncheckedBack,
      listsChanged: line.undo.listsChanged,
    },
  };
}

// The lead under the group's heading, quoting the words the server holds,
// so the owner sees which line a check covers (D-153).
export function lineLead(line: LineStrings, words: string): string {
  return fill(line.lead, { words });
}

// The line's entries on the section page's Undo: the group's three changes,
// each with the words the write carried (D-153), and a change to the words
// themselves, which remembers the lists and whether the line was checked at
// the time, so the Undo of a clear brings the lists back and the Undo of a
// change can say the check is gone (D-152).
export const lineUndoSchema = z.discriminatedUnion("kind", [
  allergenChangeSchema.extend({
    kind: z.literal("line-allergen"),
    words: z.string(),
  }),
  othersChangeSchema.extend({
    kind: z.literal("line-others"),
    words: z.string(),
  }),
  checkChangeSchema.extend({
    kind: z.literal("line-check"),
    words: z.string(),
  }),
  z.object({
    kind: z.literal("line-words"),
    id: z.string(),
    name: z.string(),
    from: z.string(),
    to: z.string(),
    lists: undoListsSchema,
    reviewed: z.boolean(),
  }),
]);

export type LineUndo = z.infer<typeof lineUndoSchema>;
export type LineWordsUndo = Extract<LineUndo, { kind: "line-words" }>;

const LINE_KINDS: readonly string[] = [
  "line-allergen",
  "line-others",
  "line-check",
  "line-words",
];

export function isLineUndo(entry: { kind: string }): entry is LineUndo {
  return LINE_KINDS.includes(entry.kind);
}

// A change the group made, as the section page keeps it: with the words
// the write carried. A line has no same-named offer (D-129 is a dish's), so
// an apply never reaches here.
export function wrapChange(change: GroupChange, words: string): LineUndo {
  switch (change.kind) {
    case "allergen":
      return { ...change, kind: "line-allergen", words };
    case "others":
      return { ...change, kind: "line-others", words };
    case "check":
      return { ...change, kind: "line-check", words };
    case "apply":
      throw new Error("a line has no same-named offer");
  }
}

// A line entry as the group reads it, with the words it carried; null for
// the words' own entry, which the page takes back itself.
export function readChange(
  entry: LineUndo,
): { change: ListChange; words: string } | null {
  switch (entry.kind) {
    case "line-allergen": {
      const { kind, words, ...rest } = entry;
      void kind;
      return { change: { ...rest, kind: "allergen" }, words };
    }
    case "line-others": {
      const { kind, words, ...rest } = entry;
      void kind;
      return { change: { ...rest, kind: "others" }, words };
    }
    case "line-check": {
      const { kind, words, ...rest } = entry;
      void kind;
      return { change: { ...rest, kind: "check" }, words };
    }
    case "line-words":
      return null;
  }
}

// The Undo control's whole name for one of the line's entries, which is
// also its visible text: the group's labels naming the section, and the
// section's own words for a change to the line.
export function lineUndoLabel(
  strings: AllergenStrings,
  sections: SectionStrings,
  entry: LineUndo,
): string {
  const read = readChange(entry);
  if (read) return allergenUndoLabel(strings, read.change, "section");
  return fill(sections.undo.everyItem, { section: entry.name });
}
