import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";

// A section moved to another menu of its restaurant, from its own page
// (D-129): why a move did not land, and every sentence it shows or says.
// The move shares the page's one saved status with the dishes below it.
// Pure: no React, no network.

export type MoveStrings = Copy["owner"]["dishes"]["move"];
type EditingStrings = Copy["owner"]["editing"];

// Why a move did not land. The last two are what the browser makes of a
// call that never got an answer.
export type MoveProblem =
  | { kind: "signed-out" }
  // The section, or the menu it is in, is no longer there.
  | { kind: "gone" }
  | { kind: "parent-gone" }
  // The menu it would go to already has a section of that name.
  | { kind: "name-taken" }
  // The menu it would go to is no longer one of this restaurant's.
  | { kind: "menu-gone" }
  // The section is already in that menu: this page is behind.
  | { kind: "changed" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

// What went wrong, in words. sectionGone is the page's own sentence for a
// section that is no longer here.
function problemText(
  strings: MoveStrings,
  editing: EditingStrings,
  sectionGone: string,
  problem: MoveProblem,
  section: string,
  menu: string,
): string {
  switch (problem.kind) {
    case "signed-out":
      return editing.problems.signedOut;
    case "gone":
    case "parent-gone":
      return sectionGone;
    case "name-taken":
      return fill(strings.errors.nameTaken, { section, menu });
    case "menu-gone":
      return strings.errors.menuGone;
    case "changed":
    case "out-of-date":
      return editing.problems.outOfDate;
    case "failed":
      return editing.problems.failed;
    case "unreachable":
      return editing.problems.unreachable;
  }
}

// "Starters moved to Lunch. It is the last section there. You are still on
// this page." The title read first after a move names the new menu, so the
// sentence says the owner has not left (D-141).
export function movedSentence(
  strings: MoveStrings,
  section: string,
  menu: string,
): string {
  return fill(strings.moved, { section, menu });
}

// "Starters was not moved. Lunch already has a section called Starters."
export function notMovedSentence(
  strings: MoveStrings,
  editing: EditingStrings,
  sectionGone: string,
  problem: MoveProblem,
  section: string,
  menu: string,
): string {
  const text = problemText(
    strings,
    editing,
    sectionGone,
    problem,
    section,
    menu,
  );
  return `${fill(strings.notMoved, { section })} ${text}`;
}
