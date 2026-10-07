import { z } from "zod";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { Held } from "@/domain/menu";

// Every sentence an editing list shows or speaks, built in one place from
// copy, and the shape of its Undo entries. The menus of a restaurant, the
// sections of a menu, and the dishes of a section are one list three times
// (module rule 12): each hands this file its own slice of copy, the
// placeholder its sentences carry for a row's name, and the words of its
// fields. Pure: no React, no network.

export type EditingStrings = Copy["owner"]["editing"];

// The placeholder a list's sentences carry: "{menu} moved up." A size is
// not a list of its own, but its texts on the dish page are said with the
// same placeholder: "Price for {size} was not saved."
export type ListNoun = "menu" | "section" | "dish" | "size";

type Counted = { one: string; other: string };

// The sentences every list has, under the same keys in each slice of copy.
export type ListStrings = {
  none: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  rowAction: string;
  newLabel: string;
  add: string;
  count: Counted;
  added: string;
  movedUp: string;
  movedDown: string;
  alreadyFirst: string;
  alreadyLast: string;
  deleted: string;
  removed: string;
  notAdded: string;
  notMoved: string;
  notDeleted: string;
  errors: {
    nameTaken: string;
    gone: string;
    listChanged: string;
    // What the list sits in is gone: the menu, for its sections.
    parentGone?: string;
    // A delete would have taken more than the owner was told about.
    grew?: string;
  };
  undo: {
    renamed: string;
    added: string;
    deleted: string;
    moved: string;
    renamedBack: string;
    removed: string;
    restored: string;
    movedBack: string;
    textChanged: string;
    restoreBlocked: string;
    renameBlocked: string;
    // An added row that now holds content stays (D-119).
    addGrew?: string;
  };
  // Only a list whose rows hold content asks before a delete (D-119).
  keep?: string;
  deleteAsk?: string;
  deleteAskBoth?: string;
  sectionCount?: Counted;
  dishCount?: Counted;
};

// One text field of a row. Its label is followed in hidden text by the
// suffix, which names the row: "Menu name for Dinner".
export type FieldWords = {
  label: string;
  suffix: string;
  hint?: string;
  // A field that takes several lines.
  multiline?: boolean;
  // "Note for {section} was not saved."
  notSaved: string;
  // For a text that is not the name: the Undo control's words for a change
  // to it, and what Undo says once it is as it was.
  changed?: string;
  back?: string;
};

// The words a text needs to be committed, failed, and said, whatever page
// it is on (texts.ts): a list's words carry these and the list's sentences
// besides, and a page with no list carries these alone.
export type TextWords<Field extends string = string> = {
  noun: ListNoun;
  strings: { errors: ListStrings["errors"] };
  editing: EditingStrings;
  // The message for each rule a text can break, by the rule's name.
  rules: Readonly<Record<string, string>>;
  fields: Readonly<Record<Field, FieldWords>>;
};

export type ListWords<Field extends string = string> = {
  noun: ListNoun;
  strings: ListStrings;
  editing: EditingStrings;
  rules: Readonly<Record<string, string>>;
  fields: Readonly<Record<Field, FieldWords>>;
};

// One change the owner can take back. A delete and a move remember the order
// before them, so Undo puts the list back as it was. A changed text that is
// not the name remembers both texts, and is taken back only while the field
// still holds the one that change wrote: "text" for a row's own field, and
// "own" for a text of the page's own record, such as a section's note on
// the section's page (D-135), which shares the list's Undo.
type TextChange = {
  field: string;
  id: string;
  name: string;
  from: string;
  to: string;
};

export type ListUndo =
  | { kind: "rename"; id: string; from: string; to: string }
  | ({ kind: "text" } & TextChange)
  | ({ kind: "own" } & TextChange)
  | { kind: "add"; id: string; name: string }
  | { kind: "delete"; id: string; name: string; order: string[] }
  | { kind: "move"; id: string; name: string; order: string[] };

const LIST_KINDS: readonly string[] = [
  "rename",
  "text",
  "own",
  "add",
  "delete",
  "move",
];

// Tells a list's own change from another change the same screen can take
// back, a section moved to another menu.
export function isListUndo(entry: { kind: string }): entry is ListUndo {
  return LIST_KINDS.includes(entry.kind);
}

// The stored shape of a list's Undo entries. texts are a row's fields besides
// the name, and own the page's own texts; a list with none of either stores
// no change of that kind, and a change to a field the list does not have
// reads as no entry at all.
export function listUndoSchema(
  texts: readonly string[],
  own: readonly string[] = [],
): z.ZodType<ListUndo> {
  const rename = z.object({
    kind: z.literal("rename"),
    id: z.string(),
    from: z.string(),
    to: z.string(),
  });
  const add = z.object({
    kind: z.literal("add"),
    id: z.string(),
    name: z.string(),
  });
  const remove = z.object({
    kind: z.literal("delete"),
    id: z.string(),
    name: z.string(),
    order: z.array(z.string()),
  });
  const move = z.object({
    kind: z.literal("move"),
    id: z.string(),
    name: z.string(),
    order: z.array(z.string()),
  });
  const change = <Kind extends "text" | "own">(
    kind: Kind,
    fields: readonly string[],
  ) =>
    z.object({
      kind: z.literal(kind),
      field: z.enum(fields as [string, ...string[]]),
      id: z.string(),
      name: z.string(),
      from: z.string(),
      to: z.string(),
    });
  const options = [
    rename,
    ...(texts.length > 0 ? [change("text", texts)] : []),
    ...(own.length > 0 ? [change("own", own)] : []),
    add,
    remove,
    move,
  ] as const;
  return z.discriminatedUnion("kind", options) as z.ZodType<ListUndo>;
}

// Why a save did not land. The first group comes back from the server; the
// last two are what the browser makes of a call that never got an answer.
export type ListProblem =
  | { kind: "signed-out" }
  | { kind: "invalid"; rule: string }
  | { kind: "name-taken" }
  | { kind: "gone" }
  // What the list sits in was deleted, or is no longer this owner's.
  | { kind: "parent-gone" }
  | { kind: "changed" }
  | { kind: "mismatch" }
  // A delete would have taken more than the owner was told about.
  | { kind: "grew" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

// A sentence with the row's name in the list's own placeholder.
function named(
  words: TextWords,
  template: string,
  name: string,
  more: Record<string, string | number> = {},
): string {
  return fill(template, { [words.noun]: name, ...more });
}

function counted(words: Counted, count: number): string {
  return fill(count === 1 ? words.one : words.other, { count });
}

// A row control's whole name, its visible label first, then its row: "Move
// up, Dinner". It is set whole, as a label, because hidden text after the
// visible words would be read with a space in front of the comma (D-112).
export function rowAction(
  words: ListWords,
  action: string,
  name: string,
): string {
  return named(words, words.strings.rowAction, name, { action });
}

// The hidden text after a field's label, which names its row.
export function fieldSuffix(
  words: ListWords,
  field: string,
  name: string,
): string {
  return named(words, words.fields[field]?.suffix ?? "", name);
}

// The Undo control's whole name, which is also its visible text.
export function undoLabel(words: ListWords, entry: ListUndo): string {
  const { undo } = words.strings;
  switch (entry.kind) {
    case "rename":
      return fill(undo.renamed, { from: entry.from, to: entry.to });
    case "text":
    case "own":
      return named(words, words.fields[entry.field]?.changed ?? "", entry.name);
    case "add":
      return named(words, undo.added, entry.name);
    case "delete":
      return named(words, undo.deleted, entry.name);
    case "move":
      return named(words, undo.moved, entry.name);
  }
}

export function countText(words: ListWords, count: number): string {
  return counted(words.strings.count, count);
}

// An add that landed, with how many rows there are now: "Brunch added. 4
// menus." The number comes from the server, so adds waiting behind one
// another never count wrong (D-125).
export function addedSentence(
  words: ListWords,
  name: string,
  total: number,
): string {
  return named(words, words.strings.added, name, {
    count: countText(words, total),
  });
}

// What was not saved, by field: "Note for Starters was not saved."
export function notSavedSentence(
  words: TextWords,
  field: string,
  name: string,
): string {
  return named(words, words.fields[field]?.notSaved ?? "", name);
}

// What a delete asks before it takes content with it (D-119), which is also
// the confirmation's name: "Delete Lunch, with its 4 sections?", "Delete
// Lunch, with its 4 sections and 12 dishes?", "Delete Starters, with its 3
// dishes?". Dishes are named only when there are some.
export function deleteQuestion(
  words: ListWords,
  name: string,
  held: Held,
): string {
  const { strings } = words;
  const dishes = strings.dishCount
    ? counted(strings.dishCount, held.dishes)
    : "";
  const sections = strings.sectionCount
    ? counted(strings.sectionCount, held.sections)
    : "";
  if (held.sections > 0 && held.dishes > 0 && strings.deleteAskBoth) {
    return named(words, strings.deleteAskBoth, name, { sections, dishes });
  }
  return named(words, strings.deleteAsk ?? "", name, { sections, dishes });
}

// What went wrong, in words. The name is the one the owner typed or the row
// it concerns, for the sentence about a name already in use.
export function problemText(
  words: TextWords,
  problem: ListProblem,
  name: string,
): string {
  const { strings, editing } = words;
  switch (problem.kind) {
    case "signed-out":
      return editing.problems.signedOut;
    case "invalid":
      return words.rules[problem.rule] ?? editing.problems.failed;
    case "name-taken":
      return named(words, strings.errors.nameTaken, name);
    case "gone":
      return strings.errors.gone;
    case "parent-gone":
      return strings.errors.parentGone ?? strings.errors.gone;
    case "changed":
      return editing.stale;
    case "mismatch":
      return strings.errors.listChanged;
    case "grew":
      return strings.errors.grew ?? editing.problems.failed;
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

// What did not happen to a row: "Dinner was not moved."
export function notDone(
  words: ListWords,
  what: "notAdded" | "notMoved" | "notDeleted",
  name: string,
): string {
  return named(words, words.strings[what], name);
}

export function deletedSentence(words: ListWords, name: string): string {
  return named(words, words.strings.deleted, name);
}

export function removedSentence(words: ListWords, name: string): string {
  return named(words, words.strings.removed, name);
}

export function movedSentence(
  words: ListWords,
  direction: "up" | "down",
  name: string,
  position: number,
  total: number,
): string {
  const { strings } = words;
  return named(
    words,
    direction === "up" ? strings.movedUp : strings.movedDown,
    name,
    { position, total },
  );
}

export function edgeSentence(
  words: ListWords,
  direction: "up" | "down",
  name: string,
): string {
  const { strings } = words;
  return named(
    words,
    direction === "up" ? strings.alreadyFirst : strings.alreadyLast,
    name,
  );
}

// What Undo says once it has put a change back.
export function undoneSentence(
  words: ListWords,
  entry: ListUndo,
  position: number,
  total: number,
): string {
  const { undo } = words.strings;
  switch (entry.kind) {
    case "rename":
      return fill(undo.renamedBack, { from: entry.from });
    case "text":
    case "own":
      return named(words, words.fields[entry.field]?.back ?? "", entry.name);
    case "add":
      return named(words, undo.removed, entry.name);
    case "delete":
      return named(words, undo.restored, entry.name, { position, total });
    case "move":
      return named(words, undo.movedBack, entry.name, { position, total });
  }
}

// What an Undo that could not be applied does to its entry: a taken name
// keeps it, a change that no longer stands drops it, and so does an added
// row that holds content by now; anything else is an ordinary failure, and
// the entry stays for another try.
export function undoOutcome(
  problem: ListProblem,
): "blocked" | "stale" | "failed" {
  switch (problem.kind) {
    case "name-taken":
      return "blocked";
    case "changed":
    case "gone":
    case "mismatch":
    case "grew":
      return "stale";
    default:
      return "failed";
  }
}

// What Undo says when it could not: a taken name keeps the entry, a change
// that no longer stands drops it, and anything else is an ordinary failure.
// An added row that now holds content no longer stands as the change it
// was: Undo never deletes content, so it says where the Delete button is.
export function notUndoneSentence(
  words: ListWords,
  entry: ListUndo,
  problem: ListProblem,
): string {
  const { strings, editing } = words;
  if (problem.kind === "grew" && entry.kind === "add" && strings.undo.addGrew) {
    return named(words, strings.undo.addGrew, entry.name);
  }
  if (problem.kind === "name-taken") {
    return entry.kind === "rename"
      ? fill(strings.undo.renameBlocked, { from: entry.from })
      : named(words, strings.undo.restoreBlocked, entry.name);
  }
  if (
    problem.kind === "changed" &&
    (entry.kind === "rename" || entry.kind === "text" || entry.kind === "own")
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
  return failureSentence(editing.notUndone, problemText(words, problem, name));
}
