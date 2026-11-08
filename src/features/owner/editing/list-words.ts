import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { Held } from "@/domain/menu";

// Every sentence an editing list shows or speaks, built in one place from
// copy. The menus of a restaurant, the sections of a menu, and the dishes of
// a section are one list three times (module rule 12): each hands this file
// its own slice of copy, the placeholder its sentences carry for a row's
// name, and the words of its fields. Pure: no React, no network.

export type EditingStrings = Copy["owner"]["editing"];

// The placeholder a list's sentences carry: "{menu} moved up." A size is
// not a list of its own, but its texts on the dish page are said with the
// same placeholder: "Price for {size} was not saved."; so is another
// allergen's row: "{other} was not saved." A choice list and its options
// are lists of their own (D-166).
export type ListNoun =
  "menu" | "section" | "dish" | "size" | "other" | "list" | "option";

type Counted = { one: string; other: string };

// The sentences every list has, under the same keys in each slice of copy.
export type ListStrings = {
  none: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  rowAction: string;
  newLabel: string;
  // A hint under the add field, for a list whose rows are added by a text
  // that needs one: a choice list's lead (D-166).
  newHint?: string;
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
  // For a list whose Delete asks first (D-221): the safe answer, the
  // question by the row's name alone, and the questions that name what
  // goes with a row that holds content (D-119).
  keep?: string;
  deleteAskEmpty?: string;
  deleteAsk?: string;
  deleteAskBoth?: string;
  sectionCount?: Counted;
  dishCount?: Counted;
  optionCount?: Counted;
};

// One text field of a row. Its label holds its words then the suffix,
// which names the row, as one node: "Menu name for Dinner" (D-193).
export type FieldWords = {
  label: string;
  suffix: string;
  hint?: string;
  // A field that takes several lines.
  multiline?: boolean;
  // A price field asks a phone for its number keypad and shows the dollar
  // sign beside it (D-139).
  inputMode?: "decimal";
  prefix?: string;
  // "Note for {section} was not saved."
  notSaved: string;
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

// Why a save did not land. The first group comes back from the server; the
// last two are what the browser makes of a call that never got an answer.
export type ListProblem =
  | { kind: "signed-out" }
  | { kind: "invalid"; rule: string }
  | { kind: "name-taken" }
  | { kind: "gone" }
  // What the list sits in was deleted, or is no longer this owner's.
  | { kind: "parent-gone" }
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

// The suffix after a field's label words, which names its row; the label
// holds both as one node (D-193).
export function fieldSuffix(
  words: ListWords,
  field: string,
  name: string,
): string {
  return named(words, words.fields[field]?.suffix ?? "", name);
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

// What a delete asks, which is also the confirmation's name (D-119, D-221):
// "Delete Kids?" for a row that holds nothing, and for one that holds
// content what goes with it, "Delete Lunch, with its 4 sections?", "Delete
// Lunch, with its 4 sections and 12 dishes?", "Delete Starters, with its 3
// dishes?", "Delete Choose one side, with its 3 options?" (D-166). Dishes
// are named only when there are some.
export function deleteQuestion(
  words: ListWords,
  name: string,
  held: Held,
): string {
  const { strings } = words;
  if (held.sections + held.dishes + held.options === 0) {
    return named(words, strings.deleteAskEmpty ?? "", name);
  }
  const dishes = strings.dishCount
    ? counted(strings.dishCount, held.dishes)
    : "";
  const sections = strings.sectionCount
    ? counted(strings.sectionCount, held.sections)
    : "";
  const options = strings.optionCount
    ? counted(strings.optionCount, held.options)
    : "";
  if (held.sections > 0 && held.dishes > 0 && strings.deleteAskBoth) {
    return named(words, strings.deleteAskBoth, name, { sections, dishes });
  }
  return named(words, strings.deleteAsk ?? "", name, {
    sections,
    dishes,
    options,
  });
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
