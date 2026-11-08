import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { AllergenStrings } from "../allergens/allergen-words";

// The words of an option's allergen group (D-154, D-166). The group speaks
// with the dish page's words, with the option's own in place of every
// sentence that names a dish; the sentences name the option, since a
// sentence is heard on its own (D-135). Every write carries the option's
// name (D-153), as the line's carried its words. Pure: no React, no
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
  };
}

// The group's heading for one option: "Allergens for Fries".
export function optionAllergenHeading(
  strings: AllergenStrings,
  option: string,
): string {
  return fill(strings.heading, { option });
}
