import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  failureSentence,
  problemText,
  type EditingStrings,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";
import type { GeneralProblem } from "./general-form";

// Every sentence a dish's page shows or speaks, built in one place from
// copy (D-128, D-139). The page is the dish, so its labels do not name it;
// every sentence the log says does, since a sentence is heard on its own.
// A size's controls and problems are named for their size. The allergen
// group's own sentences are in allergen-words.ts (D-148). Pure: no React,
// no network.

export type DishStrings = Copy["owner"]["dish"];
export type MoveStrings = DishStrings["move"];

// The words a dish's form pages say a failed save in (D-229, D-237): the
// page's rules and errors, with the dish as the placeholder every sentence
// names. A dish that is gone is the page's parent gone. A dish's pages
// hold no list of their own to fall out of step with, so that kind reads
// as a page that is out of date.
export function dishWords(
  strings: DishStrings,
  editing: EditingStrings,
): TextWords {
  return {
    noun: "dish",
    strings: {
      errors: {
        nameTaken: strings.errors.nameTaken,
        gone: strings.errors.parentGone,
        parentGone: strings.errors.parentGone,
        listChanged: editing.problems.outOfDate,
      },
    },
    editing,
    rules: strings.errors,
    fields: {},
  };
}

// A size as its sentences and its controls name it: its name, or its place
// while it has none, "size 2".
export function sizeLabel(
  strings: DishStrings,
  name: string,
  position: number,
): string {
  return name === "" ? fill(strings.price.unnamedSize, { position }) : name;
}

// A size as its group is named (D-236): its name, or "Size 2" while it has
// none.
export function sizeLegend(
  strings: DishStrings,
  name: string,
  position: number,
): string {
  return name === "" ? fill(strings.price.sizeLegend, { position }) : name;
}

// A size control's whole name, its visible label first, then its size:
// "Remove, Cup" (D-112's form).
export function sizeAction(
  strings: DishStrings,
  action: string,
  size: string,
): string {
  return fill(strings.price.sizeAction, { action, size });
}

// The suffix after a size field's label words, which names its size; the
// label holds both as one node (D-193).
export function sizeSuffix(strings: DishStrings, size: string): string {
  return fill(strings.price.labelFor, { size });
}

// "Size added. 2 sizes."
export function sizeAddedSentence(strings: DishStrings, total: number): string {
  const count = fill(
    total === 1 ? strings.price.sizeCount.one : strings.price.sizeCount.other,
    { count: total },
  );
  return fill(strings.price.sizeAdded, { count });
}

// "Cup removed.", and "Size 2 removed." for a size with no name, which
// opens the sentence.
export function sizeRemovedSentence(
  strings: DishStrings,
  name: string,
  position: number,
): string {
  return fill(strings.price.sizeRemoved, {
    size: sizeLegend(strings, name, position),
  });
}

// What a Save found wrong with one field of the General form (D-237), in
// the page's words. A size's problem names its size, by its name or its
// place, since the same words are its link in the summary; a name another
// size has names that size.
export function generalProblemText(
  strings: DishStrings,
  problem: GeneralProblem,
): string {
  if (problem.rule === "nameTaken") {
    return fill(strings.errors.nameTaken, { size: problem.other ?? "" });
  }
  const size = problem.size
    ? sizeLabel(strings, problem.size.name, problem.size.position)
    : "";
  return fill(strings.errors[problem.rule], { size });
}

// The sentence for a General save the server did not take (D-237): what
// was not saved, then why. "The changes to Soup of the day were not saved.
// This dish is no longer here. Go back to Menus."
export function generalNotSavedSentence(
  strings: DishStrings,
  words: TextWords,
  dish: string,
  problem: ListProblem,
): string {
  return failureSentence(
    fill(strings.general.notSaved, { dish }),
    problemText(words, problem, dish),
  );
}

// Why a move did not land. The last two are what the browser makes of a
// call that never got an answer.
export type DishMoveProblem =
  | { kind: "signed-out" }
  // The dish, or the section or menu it is in, is no longer there.
  | { kind: "gone" }
  | { kind: "parent-gone" }
  // The section it would go to already has a dish of that name.
  | { kind: "name-taken" }
  // The section it would go to is no longer a live section of a live menu
  // of this restaurant.
  | { kind: "section-gone" }
  // The dish is already in that section: this page is behind.
  | { kind: "changed" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

function moveProblemText(
  strings: MoveStrings,
  editing: EditingStrings,
  dishGone: string,
  problem: DishMoveProblem,
  dish: string,
  section: string,
): string {
  switch (problem.kind) {
    case "signed-out":
      return editing.problems.signedOut;
    case "gone":
    case "parent-gone":
      return dishGone;
    case "name-taken":
      return fill(strings.errors.nameTaken, { dish, section });
    case "section-gone":
      return strings.errors.sectionGone;
    case "changed":
    case "out-of-date":
      return editing.problems.outOfDate;
    case "failed":
      return editing.problems.failed;
    case "unreachable":
      return editing.problems.unreachable;
  }
}

// "Soup of the day moved to Mains in Dinner. It is the last dish there. You
// are still on this page." The title read first after a move names the new
// section and menu, so the sentence says the owner has not left (D-141).
export function movedSentence(
  strings: MoveStrings,
  dish: string,
  section: string,
  menu: string,
): string {
  return fill(strings.moved, { dish, section, menu });
}

// "Soup of the day was not moved. Mains already has a dish called Soup of
// the day."
export function notMovedSentence(
  strings: MoveStrings,
  editing: EditingStrings,
  dishGone: string,
  problem: DishMoveProblem,
  dish: string,
  section: string,
): string {
  return `${fill(strings.notMoved, { dish })} ${moveProblemText(
    strings,
    editing,
    dishGone,
    problem,
    dish,
    section,
  )}`;
}

// "Next dish: House salad", and what the last dish says instead.
export function nextDishLabel(strings: DishStrings, dish: string): string {
  return fill(strings.next.label, { dish });
}

export function lastDishSentence(
  strings: DishStrings,
  section: string,
): string {
  return fill(strings.next.last, { section });
}
