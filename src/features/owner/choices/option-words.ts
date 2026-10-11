import { z } from "zod";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  allergenUndoLabel,
  type AllergenStrings,
} from "../allergens/allergen-words";
import {
  allergenChangeSchema,
  applyChangeSchema,
  checkChangeSchema,
  othersChangeSchema,
  type GroupChange,
} from "../allergens/group-undo";

// The words of an option's allergen group (D-154, D-166), and the shape of
// the entries it leaves on the list page's Undo. The group speaks with the
// dish page's words, with the option's own in place of every sentence that
// names a dish; the sentences name the option, since a sentence is heard
// on its own (D-135). Every entry carries the option's name the write
// carried (D-153), as the line's carried its words. Pure: no React, no
// network.

export type OptionAllergenStrings = Copy["owner"]["choices"]["allergens"];

// The group's words for an option: the dish page's, with the option's own
// over them. The heading is filled per row with the option's name.
export function optionAllergenStrings(
  dish: AllergenStrings,
  option: OptionAllergenStrings,
): AllergenStrings {
  return {
    ...dish,
    heading: option.heading,
    groupHint: option.lead,
    checkHint: option.checkHint,
    othersFull: option.othersFull,
    cleared: option.cleared,
    listsChanged: option.listsChanged,
    listsMoved: option.listsMoved,
    checkChanged: option.checkChanged,
    sameNamed: {
      ...dish.sameNamed,
      errors: {
        ...dish.sameNamed.errors,
        sourceChanged: option.sameNamed.sourceChanged,
        sourceUnchecked: option.sameNamed.sourceUnchecked,
      },
    },
    notSaved: {
      ...dish.notSaved,
      allergens: option.notSaved.allergens,
      check: option.notSaved.check,
    },
    errors: {
      ...dish.errors,
      otherTaken: option.errors.otherTaken,
      otherMajorBoth: option.errors.otherMajorBoth,
    },
    undo: {
      ...dish.undo,
      ticked: option.undo.ticked,
      unticked: option.undo.unticked,
      othersChanged: option.undo.othersChanged,
      othersBack: option.undo.othersBack,
      checked: option.undo.checked,
      unchecked: option.undo.unchecked,
      checkedBack: option.undo.checkedBack,
      uncheckedBack: option.undo.uncheckedBack,
      listsChanged: option.undo.listsChanged,
    },
  };
}

// The group's heading for one option: "Allergens for Fries".
export function optionAllergenHeading(
  strings: AllergenStrings,
  option: string,
): string {
  return fill(strings.heading, { option });
}

// An option's entries on the list page's Undo: the group's four changes,
// each with the option's name the write carried (D-153) and the option's
// id, so the page hands the entry to that option's group; an apply's own
// id names the other side. The kinds do not collide with the options
// list's own.
const carried = { words: z.string(), subject: z.string() };

export const optionAllergenUndoSchema = z.discriminatedUnion("kind", [
  allergenChangeSchema.extend({
    kind: z.literal("option-allergen"),
    ...carried,
  }),
  othersChangeSchema.extend({ kind: z.literal("option-others"), ...carried }),
  checkChangeSchema.extend({ kind: z.literal("option-check"), ...carried }),
  applyChangeSchema.extend({ kind: z.literal("option-apply"), ...carried }),
]);

export type OptionAllergenUndo = z.infer<typeof optionAllergenUndoSchema>;

const OPTION_KINDS: readonly string[] = [
  "option-allergen",
  "option-others",
  "option-check",
  "option-apply",
];

export function isOptionAllergenUndo(entry: {
  kind: string;
}): entry is OptionAllergenUndo {
  return OPTION_KINDS.includes(entry.kind);
}

// A change the group made, as the list page keeps it: with the option's
// name the write carried, and the option's id.
export function wrapChange(
  change: GroupChange,
  words: string,
  subject: string,
): OptionAllergenUndo {
  switch (change.kind) {
    case "allergen":
      return { ...change, kind: "option-allergen", words, subject };
    case "others":
      return { ...change, kind: "option-others", words, subject };
    case "check":
      return { ...change, kind: "option-check", words, subject };
    case "apply":
      return { ...change, kind: "option-apply", words, subject };
  }
}

// An option's entry as the group reads it, with the name it carried.
export function readChange(entry: OptionAllergenUndo): {
  change: GroupChange;
  words: string;
} {
  switch (entry.kind) {
    case "option-allergen": {
      const { kind, words, subject, ...rest } = entry;
      void kind;
      void subject;
      return { change: { ...rest, kind: "allergen" }, words };
    }
    case "option-others": {
      const { kind, words, subject, ...rest } = entry;
      void kind;
      void subject;
      return { change: { ...rest, kind: "others" }, words };
    }
    case "option-check": {
      const { kind, words, subject, ...rest } = entry;
      void kind;
      void subject;
      return { change: { ...rest, kind: "check" }, words };
    }
    case "option-apply": {
      const { kind, words, subject, ...rest } = entry;
      void kind;
      void subject;
      return { change: { ...rest, kind: "apply" }, words };
    }
  }
}

// The Undo control's whole name for one of an option's entries, which is
// also its visible text: the group's labels naming the option.
export function optionAllergenUndoLabel(
  strings: AllergenStrings,
  entry: OptionAllergenUndo,
): string {
  return allergenUndoLabel(strings, readChange(entry).change, "option");
}
