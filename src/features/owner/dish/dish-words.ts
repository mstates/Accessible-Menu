import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { DishText, OwnerSize, PriceKind, SizeText } from "@/domain/dish";
import {
  failureSentence,
  problemText,
  type EditingStrings,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";

// Every sentence a dish's page shows or speaks, built in one place from
// copy (D-128, D-139). The page is the dish, so its labels do not name it;
// every sentence the log says does, since a sentence is heard on its own.
// A size's texts are named for their size. The allergen group's own
// sentences are in allergen-words.ts (D-148). Pure: no React, no network.

export type DishStrings = Copy["owner"]["dish"];
export type MoveStrings = DishStrings["move"];

// The words the dish's own texts are committed, failed, and said in
// (texts.ts): the page's rules and errors, with the dish as the placeholder
// every sentence names. A dish that is gone is the page's parent gone.
export function dishWords(
  strings: DishStrings,
  editing: EditingStrings,
): TextWords<DishText> {
  return {
    noun: "dish",
    strings: {
      errors: {
        nameTaken: strings.errors.nameTaken,
        gone: strings.errors.parentGone,
        parentGone: strings.errors.parentGone,
        listChanged: strings.errors.listChanged,
      },
    },
    editing,
    rules: strings.errors,
    fields: {
      description: {
        label: strings.descriptionLabel,
        suffix: "",
        hint: strings.descriptionHint,
        multiline: true,
        notSaved: strings.notSaved.description,
      },
      price: {
        label: strings.price.amountLabel,
        suffix: "",
        hint: strings.price.amountHint,
        notSaved: strings.notSaved.price,
      },
      calories: {
        label: strings.price.caloriesLabel,
        suffix: "",
        hint: strings.price.caloriesHint,
        notSaved: strings.notSaved.calories,
      },
      note: {
        label: strings.noteLabel,
        suffix: "",
        hint: strings.noteHint,
        notSaved: strings.notSaved.note,
      },
    },
  };
}

// The words a size's two texts are committed, failed, and said in, named
// for their size: "Size for Cup", "Price for Cup was not saved."
export function sizeWords(
  strings: DishStrings,
  editing: EditingStrings,
): TextWords<SizeText> {
  return {
    noun: "size",
    strings: {
      errors: {
        nameTaken: strings.errors.nameTaken,
        gone: strings.errors.gone,
        parentGone: strings.errors.parentGone,
        listChanged: strings.errors.listChanged,
      },
    },
    editing,
    rules: strings.errors,
    fields: {
      name: {
        label: strings.price.sizeNameLabel,
        suffix: strings.price.labelFor,
        hint: strings.price.sizeHint,
        notSaved: strings.notSaved.sizeName,
      },
      price: {
        label: strings.price.sizePriceLabel,
        suffix: strings.price.labelFor,
        hint: strings.price.amountHint,
        notSaved: strings.notSaved.sizePrice,
      },
      calories: {
        label: strings.price.sizeCaloriesLabel,
        suffix: strings.price.labelFor,
        hint: strings.price.caloriesHint,
        notSaved: strings.notSaved.sizeCalories,
      },
    },
  };
}

// A size as its sentences and its controls name it: its name, or its place
// while it has none, "size 2".
export function sizeLabel(
  strings: DishStrings,
  size: OwnerSize,
  position: number,
): string {
  return size.name === ""
    ? fill(strings.price.unnamedSize, { position })
    : size.name;
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

// The price choice's visible words.
export function kindLabel(strings: DishStrings, kind: PriceKind): string {
  return strings.price[kind];
}

// "Size added. 2 sizes."
export function sizeAddedSentence(strings: DishStrings, total: number): string {
  const count = fill(
    total === 1 ? strings.price.sizeCount.one : strings.price.sizeCount.other,
    { count: total },
  );
  return fill(strings.price.sizeAdded, { count });
}

// "Cup removed."
export function sizeRemovedSentence(
  strings: DishStrings,
  size: string,
): string {
  return fill(strings.price.sizeRemoved, { size });
}

// "The price choice for Soup of the day was not saved. We could not save
// that. Try again in a minute."
export function kindNotSavedSentence(
  strings: DishStrings,
  words: TextWords,
  dish: string,
  problem: ListProblem,
): string {
  return failureSentence(
    fill(strings.notSaved.priceKind, { dish }),
    problemText(words, problem, dish),
  );
}

export function notAddedSentence(
  strings: DishStrings,
  words: TextWords,
  problem: ListProblem,
): string {
  return failureSentence(strings.notAdded, problemText(words, problem, ""));
}

export function notRemovedSentence(
  strings: DishStrings,
  words: TextWords,
  size: string,
  problem: ListProblem,
): string {
  return failureSentence(
    fill(strings.notRemoved, { size }),
    problemText(words, problem, size),
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
