import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  allergenSentence,
  checkedOnDate,
  majorAllergensOf,
  US_MAJOR_ALLERGENS,
  type AllergenCheck,
  type AllergenCopy,
  type AllergenLists,
  type AllergenSentence,
} from "@/domain/allergens";
import type { AllergenId } from "@/domain/types";
import {
  failureSentence,
  problemText,
  type EditingStrings,
  type ListProblem,
  type TextWords,
} from "../editing/list-words";

// Every sentence the allergen group shows or speaks, built in one place
// from copy (D-148, D-152). The nine boxes, the other-allergen rows, the
// check, the sentence diners will read with
// who checked it and when, and, on a dish's page, the same-named offer
// (D-129). The sentence diners read comes from the domain builder, the one
// place it lives (module rule 8). A sentence that names its subject names
// a dish or an option, through the placeholder each slice of copy carries
// ("{dish}", "{option}"), since a sentence is heard on its own (D-135).
// Pure: no React, no network.

// The slice of copy the group speaks with, as plain strings: the dish
// page's as it is, or an option's, which is the dish page's with the
// option's own sentences over it (choices/option-words.ts).
type Plain<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? readonly Plain<Item>[]
    : { readonly [Key in keyof T]: Plain<T[Key]> };

export type AllergenStrings = Plain<Copy["owner"]["dish"]["allergens"]>;

// What the group speaks for: the dish, or the option, and the placeholder
// its sentences fill with the name.
export type AllergenSubject = {
  id: string;
  noun: "dish" | "option";
  name: string;
};

// A sentence with the subject's name in its placeholder. A bare name is a
// dish's, which is how the dish page's own callers and tests name it.
function named(
  template: string,
  subject: string | AllergenSubject,
  more: Record<string, string | number> = {},
): string {
  const key = typeof subject === "string" ? "dish" : subject.noun;
  const name = typeof subject === "string" ? subject : subject.name;
  return fill(template, { [key]: name, ...more });
}

// The nine as the boxes name them.
export function allergenName(strings: AllergenStrings, id: AllergenId): string {
  return isMajor(id) ? strings.names[id] : id;
}

function isMajor(id: AllergenId): id is (typeof US_MAJOR_ALLERGENS)[number] {
  return (US_MAJOR_ALLERGENS as readonly AllergenId[]).includes(id);
}

// The rule a typed name breaks when it is one of the nine: the key of its
// message, which names the box, or both boxes for a word that could mean
// either (Michael, at approval).
export function majorRuleOf(value: string): string | null {
  const majors = majorAllergensOf(value);
  if (majors.length === 0) return null;
  return majors.length > 1 ? "otherMajor:both" : `otherMajor:${majors[0]}`;
}

// The words another allergen's row is committed, failed, and said in,
// named for its row: "Other allergen 2", "celery was not saved."
export function otherWords(
  strings: AllergenStrings,
  editing: EditingStrings,
  dishGone: string,
): TextWords<"name"> {
  const rules: Record<string, string> = {
    otherRequired: strings.errors.otherRequired,
    otherLength: strings.errors.otherLength,
    otherComma: strings.errors.otherComma,
    "otherMajor:both": strings.errors.otherMajorBoth,
  };
  for (const id of US_MAJOR_ALLERGENS) {
    rules[`otherMajor:${id}`] = fill(strings.errors.otherMajor, {
      allergen: strings.names[id],
    });
  }
  return {
    noun: "other",
    strings: {
      errors: {
        nameTaken: strings.errors.otherTaken,
        gone: dishGone,
        parentGone: dishGone,
        listChanged: strings.listsMoved,
      },
    },
    editing,
    rules,
    fields: {
      name: {
        label: strings.otherLabel,
        suffix: strings.otherLabelFor,
        hint: strings.otherHint,
        notSaved: strings.notSaved.other,
      },
    },
  };
}

// A row as its buttons name it: its name, or its place while it has none,
// "allergen 2".
export function otherLabel(
  strings: AllergenStrings,
  name: string,
  position: number,
): string {
  return name === "" ? fill(strings.unnamedOther, { position }) : name;
}

// The suffix after a row field's label words, which names its place; the
// label holds both as one node (D-193): "Other allergen 2".
export function otherSuffix(
  strings: AllergenStrings,
  position: number,
): string {
  return fill(strings.otherLabelFor, { position });
}

// A row control's whole name, its visible label first, then its row:
// "Remove allergen, celery" (D-112's form).
export function otherAction(
  strings: AllergenStrings,
  action: string,
  other: string,
): string {
  return fill(strings.otherAction, { action, other });
}

export function otherAddedSentence(
  strings: AllergenStrings,
  position: number,
): string {
  return fill(strings.otherAdded, { position });
}

export function otherRemovedSentence(
  strings: AllergenStrings,
  other: string,
): string {
  return fill(strings.otherRemoved, { other });
}

export function blankRemovedSentence(
  strings: AllergenStrings,
  position: number,
): string {
  return fill(strings.blankRemoved, { position });
}

// "The allergens of Soup of the day were not saved. We could not save
// that. Try again in a minute."
export function allergensNotSavedSentence(
  strings: AllergenStrings,
  words: TextWords,
  subject: string | AllergenSubject,
  problem: ListProblem,
): string {
  const name = typeof subject === "string" ? subject : subject.name;
  return failureSentence(
    named(strings.notSaved.allergens, subject),
    problemText(words, problem, name),
  );
}

export function checkNotSavedSentence(
  strings: AllergenStrings,
  words: TextWords,
  subject: string | AllergenSubject,
  problem: ListProblem,
): string {
  const name = typeof subject === "string" ? subject : subject.name;
  return failureSentence(
    named(strings.notSaved.check, subject),
    problemText(words, problem, name),
  );
}

// The sentence diners will read, from the one builder (D-35, module rule
// 8), for the lists as the page shows them and whether they are checked.
export function dinerSentence(
  copy: AllergenCopy,
  lists: AllergenLists,
  checked: boolean,
): AllergenSentence {
  return allergenSentence(
    {
      allergens: [...lists.allergens],
      customAllergens: [...lists.others],
      allergensReviewed: checked,
    },
    copy,
  );
}

// 'Diners read: "Contains milk, wheat."', as the check box is described.
export function dinersReadText(
  strings: AllergenStrings,
  sentence: AllergenSentence,
): string {
  return fill(strings.dinersRead, { sentence: sentence.text });
}

// The state the stamp line reads: the check as the server holds it, whether
// a check is on its way, and whether a change in this visit cleared one.
export type StampState = {
  check: AllergenCheck | null;
  pending: boolean;
  cleared: boolean;
};

// "Checked by you on October 8, 2026.", "Checked on October 8, 2026.",
// "Checked by you." while the date is on its way, "Not checked since the
// list changed...", or "Not checked yet."
export function stampLine(
  strings: AllergenStrings,
  state: StampState,
  timeZone: string,
  lang: string,
): string {
  if (state.check) {
    const date = checkedOnDate(state.check.at, timeZone, lang);
    return fill(state.check.byYou ? strings.checkedByYou : strings.checkedOn, {
      date,
    });
  }
  if (state.pending) return strings.checkedByYouNow;
  if (state.cleared) return strings.cleared;
  return strings.notChecked;
}

// Where a same-named dish or option is, for its line and its button
// (D-129, grown to options by D-166). For a dish, section is its section's
// name; for an option, the list it is in and the list's home ("Choose one
// side for Kids burger"), so the sentences read the same way.
export type SameNamedPlace = {
  kind: "dish" | "option";
  id: string;
  name: string;
  section: string;
  menu: string;
  lists: AllergenLists;
  reviewed: boolean;
  // Why the line shows: the lists differ, or the dish is not checked.
  reason: "different" | "unchecked";
};

export function sameNamedLine(
  strings: AllergenStrings,
  place: SameNamedPlace,
): string {
  return fill(strings.sameNamed[place.reason], {
    dish: place.name,
    section: place.section,
    menu: place.menu,
  });
}

// The Apply button's whole name, its visible words first (WCAG 2.5.3):
// "Apply this list there, Soup of the day in Mains, Dinner".
export function applyName(
  strings: AllergenStrings,
  place: Pick<SameNamedPlace, "name" | "section" | "menu">,
): string {
  return fill(strings.sameNamed.applyTo, {
    action: strings.sameNamed.apply,
    dish: place.name,
    section: place.section,
    menu: place.menu,
  });
}

export function appliedSentence(
  strings: AllergenStrings,
  place: Pick<SameNamedPlace, "name" | "section" | "menu">,
): string {
  return fill(strings.sameNamed.applied, {
    dish: place.name,
    section: place.section,
    menu: place.menu,
  });
}

// Why an apply did not land. The last two are what the browser makes of a
// call that never got an answer.
export type ApplyProblem =
  | { kind: "signed-out" }
  // This dish, or its section or menu, is no longer there.
  | { kind: "gone" }
  | { kind: "parent-gone" }
  // This dish's lists are not the ones the page showed.
  | { kind: "source-changed" }
  // This dish is not checked now.
  | { kind: "source-unchecked" }
  // The other dish's lists are not the ones the line showed, or it was
  // renamed since.
  | { kind: "target-changed" }
  // The other dish, or its section or menu, is no longer there.
  | { kind: "target-gone" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

export function notAppliedSentence(
  strings: AllergenStrings,
  editing: EditingStrings,
  dishGone: string,
  problem: ApplyProblem,
  place: Pick<SameNamedPlace, "name" | "section" | "menu">,
): string {
  const where = { dish: place.name, section: place.section, menu: place.menu };
  switch (problem.kind) {
    case "signed-out":
      return failureSentence(
        strings.sameNamed.errors.failed,
        editing.problems.signedOut,
      );
    case "gone":
    case "parent-gone":
      return failureSentence(strings.sameNamed.errors.failed, dishGone);
    case "source-changed":
      return strings.sameNamed.errors.sourceChanged;
    case "source-unchecked":
      return strings.sameNamed.errors.sourceUnchecked;
    case "target-changed":
      return fill(strings.sameNamed.errors.targetChanged, where);
    case "target-gone":
      return fill(strings.sameNamed.errors.targetGone, where);
    case "failed":
      return failureSentence(
        strings.sameNamed.errors.failed,
        editing.problems.failed,
      );
    case "unreachable":
      return failureSentence(
        strings.sameNamed.errors.failed,
        editing.problems.unreachable,
      );
    case "out-of-date":
      return failureSentence(
        strings.sameNamed.errors.failed,
        editing.problems.outOfDate,
      );
  }
}
