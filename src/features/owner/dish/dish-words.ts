import { z } from "zod";
import {
  availabilityChangeSchema,
  availabilityUndoLabel,
  scheduleChangeSchema,
  scheduleUndoLabel,
  tagsChangeSchema,
  tagsUndoLabel,
  type BoxName,
  type TagNames,
} from "./schedule-words";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  DISH_TEXTS,
  PRICE_KINDS,
  SIZE_TEXTS,
  type DishText,
  type OwnerSize,
  type PriceKind,
  type SizeText,
} from "@/domain/dish";
import { allergenUndoLabel } from "../allergens/allergen-words";
import {
  allergenChangeSchema,
  applyChangeSchema,
  checkChangeSchema,
  othersChangeSchema,
  type UndoLists,
} from "../allergens/group-undo";
import {
  failureSentence,
  problemText,
  undoOutcome,
  type EditingStrings,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";
import type { UndoOutcome } from "../editing/undo";

// Every sentence a dish's page shows or speaks, built in one place from
// copy, and the shape of its Undo entries (D-128, D-139). The page is the
// dish, so its labels do not name it; every sentence the log says does,
// since a sentence is heard on its own. A size's texts are named for their
// size. The allergen group's own sentences are in allergen-words.ts
// (D-148). Pure: no React, no network.

export type DishStrings = Copy["owner"]["dish"];
export type MoveStrings = DishStrings["move"];

// A dish's two allergen lists as an Undo entry remembers them (D-148), the
// group's own shape (allergens/group-undo.ts).
export type { UndoLists };

// One change the owner can take back on a dish's page: a text of the dish,
// its price choice, a text of a size, a size added or removed, the dish
// moved to another section, a major allergen ticked or unticked, the other
// allergens changed, the list checked or unchecked, and this dish's lists
// applied to a same-named dish (D-129). A changed text remembers both texts
// and is taken back only while the field still holds the one that change
// wrote. A removed size remembers the order the page showed, so Undo puts
// it back in its place. A move remembers the section the dish came from and
// the order that section had. An apply remembers the other dish's lists
// and check as they were, and the stamp the apply made.
export const dishUndoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("own"),
    field: z.enum(DISH_TEXTS),
    id: z.string(),
    name: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    kind: z.literal("kind"),
    id: z.string(),
    name: z.string(),
    from: z.enum(PRICE_KINDS),
    to: z.enum(PRICE_KINDS),
  }),
  z.object({
    kind: z.literal("size-text"),
    field: z.enum(SIZE_TEXTS),
    id: z.string(),
    size: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({ kind: z.literal("size-add"), id: z.string(), size: z.string() }),
  z.object({
    kind: z.literal("size-remove"),
    id: z.string(),
    size: z.string(),
    order: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("relocate"),
    id: z.string(),
    name: z.string(),
    from: z.object({
      id: z.string(),
      name: z.string(),
      menu: z.string(),
      order: z.array(z.string()),
    }),
    to: z.object({ id: z.string(), name: z.string(), menu: z.string() }),
  }),
  // The allergen group's own changes, in its shape (D-149).
  allergenChangeSchema,
  othersChangeSchema,
  checkChangeSchema,
  applyChangeSchema,
  // The showing groups' own changes: the tags, availability, and the
  // schedule (task 5, schedule-words.ts).
  tagsChangeSchema,
  availabilityChangeSchema,
  scheduleChangeSchema,
]);

export type DishUndo = z.infer<typeof dishUndoSchema>;

// The entries the allergen group leaves, which it takes back itself.
export type AllergenUndo = Extract<
  DishUndo,
  { kind: "allergen" | "others" | "check" | "apply" }
>;

// The entries the showing groups leave, which each takes back itself.
export type ShowingUndo = Extract<
  DishUndo,
  { kind: "tags" | "availability" | "schedule" }
>;

// The entries whose Undo the page's texts and sizes take back.
export type TextUndo = Exclude<
  DishUndo,
  AllergenUndo | ShowingUndo | { kind: "relocate" }
>;

// The names an Undo label of the showing groups needs: a tag's visible
// words, and a day, week, or month box's.
export type ShowingNames = { tag: TagNames; box: BoxName };

// The Undo control's whole name for a showing group's change.
export function showingUndoLabel(
  strings: DishStrings,
  names: ShowingNames,
  entry: ShowingUndo,
): string {
  switch (entry.kind) {
    case "tags":
      return tagsUndoLabel(strings.tags, names.tag, entry);
    case "availability":
      return availabilityUndoLabel(strings.availability, entry);
    case "schedule":
      return scheduleUndoLabel(strings.schedule, names.box, entry);
  }
}

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
        changed: strings.undo.description,
        back: strings.undo.descriptionBack,
      },
      price: {
        label: strings.price.amountLabel,
        suffix: "",
        hint: strings.price.amountHint,
        notSaved: strings.notSaved.price,
        changed: strings.undo.price,
        back: strings.undo.priceBack,
      },
      note: {
        label: strings.noteLabel,
        suffix: "",
        hint: strings.noteHint,
        notSaved: strings.notSaved.note,
        changed: strings.undo.note,
        back: strings.undo.noteBack,
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
        changed: strings.undo.sizeName,
        back: strings.undo.sizeNameBack,
      },
      price: {
        label: strings.price.sizePriceLabel,
        suffix: strings.price.labelFor,
        hint: strings.price.amountHint,
        notSaved: strings.notSaved.sizePrice,
        changed: strings.undo.sizePrice,
        back: strings.undo.sizePriceBack,
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

// The hidden text after a size field's label, which names its size.
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

// "Cup removed. Undo is available."
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

// The Undo control's whole name, which is also its visible text. The
// showing groups' entries have their own (showingUndoLabel).
export function undoLabel(
  strings: DishStrings,
  entry: Exclude<DishUndo, ShowingUndo>,
): string {
  switch (entry.kind) {
    case "own":
      return fill(strings.undo[entry.field], { dish: entry.name });
    case "kind":
      return fill(strings.undo.priceKind, { dish: entry.name });
    case "size-text":
      return fill(
        entry.field === "name" ? strings.undo.sizeName : strings.undo.sizePrice,
        { size: entry.size },
      );
    case "size-add":
      return fill(strings.undo.sizeAdded, { size: entry.size });
    case "size-remove":
      return fill(strings.undo.sizeDeleted, { size: entry.size });
    case "relocate":
      return fill(strings.move.undo.moved, {
        dish: entry.name,
        section: entry.to.name,
      });
    case "allergen":
    case "others":
    case "check":
    case "apply":
      return allergenUndoLabel(strings.allergens, entry);
  }
}

// What Undo says once it has put a change back. A move's own sentence is
// said by the page, once the page shows the dish back in its section, and
// the allergen group says its own (allergen-words.ts).
export function undoneSentence(strings: DishStrings, entry: TextUndo): string {
  switch (entry.kind) {
    case "own":
      return fill(strings.undo[`${entry.field}Back`], { dish: entry.name });
    case "kind":
      return fill(strings.undo.priceKindBack, {
        dish: entry.name,
        kind: kindLabel(strings, entry.from),
      });
    case "size-text":
      return fill(
        entry.field === "name"
          ? strings.undo.sizeNameBack
          : strings.undo.sizePriceBack,
        { size: entry.size },
      );
    case "size-add":
      return fill(strings.undo.sizeRemoved, { size: entry.size });
    case "size-remove":
      return fill(strings.undo.sizeRestored, { size: entry.size });
  }
}

// What Undo says when it could not, and what becomes of its entry: a taken
// name keeps the entry, a change that no longer stands drops it, an added
// size that holds something now stays (D-119), and anything else is an
// ordinary failure that keeps the entry for another try.
export function notUndoneSentence(
  strings: DishStrings,
  editing: EditingStrings,
  words: TextWords,
  entry: TextUndo,
  problem: ListProblem,
): { outcome: Exclude<UndoOutcome, "applied">; sentence: string } {
  if (problem.kind === "grew" && entry.kind === "size-add") {
    return {
      outcome: "stale",
      sentence: fill(strings.undo.addGrew, { size: entry.size }),
    };
  }
  if (problem.kind === "name-taken") {
    const size = entry.kind === "size-remove" ? entry.size : "";
    return {
      outcome: "blocked",
      sentence: fill(strings.undo.restoreBlocked, { size }),
    };
  }
  if (
    problem.kind === "changed" &&
    (entry.kind === "own" ||
      entry.kind === "kind" ||
      entry.kind === "size-text")
  ) {
    return { outcome: "stale", sentence: strings.undo.textChanged };
  }
  if (
    problem.kind === "changed" ||
    problem.kind === "gone" ||
    problem.kind === "parent-gone" ||
    problem.kind === "mismatch"
  ) {
    return { outcome: "stale", sentence: editing.stale };
  }
  const name = "size" in entry ? entry.size : entry.name;
  return {
    outcome: undoOutcome(problem),
    sentence: failureSentence(
      editing.notUndone,
      problemText(words, problem, name),
    ),
  };
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

// "Undone. Soup of the day is back in Starters, 1 of 3."
export function moveUndoneSentence(
  strings: MoveStrings,
  entry: Extract<DishUndo, { kind: "relocate" }>,
  position: number,
  total: number,
): string {
  return fill(strings.undo.movedBack, {
    dish: entry.name,
    section: entry.from.name,
    position,
    total,
  });
}

// What an Undo of a move that could not be applied says, and what becomes
// of its entry, as for a section's move: a taken name keeps it, a section
// or a dish that is gone, or a dish back there already, drops it, and
// anything else is an ordinary failure.
export function moveNotUndone(
  strings: MoveStrings,
  editing: EditingStrings,
  dishGone: string,
  entry: Extract<DishUndo, { kind: "relocate" }>,
  problem: DishMoveProblem,
): { outcome: Exclude<UndoOutcome, "applied">; sentence: string } {
  switch (problem.kind) {
    case "name-taken":
      return {
        outcome: "blocked",
        sentence: fill(strings.undo.blocked, {
          dish: entry.name,
          section: entry.from.name,
        }),
      };
    case "section-gone":
    case "gone":
    case "parent-gone":
    case "changed":
      return { outcome: "stale", sentence: editing.stale };
    default:
      return {
        outcome: "failed",
        sentence: `${editing.notUndone} ${moveProblemText(
          strings,
          editing,
          dishGone,
          problem,
          entry.name,
          entry.from.name,
        )}`,
      };
  }
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
