import { sameListsAsStored, type AllergenLists } from "@/domain/allergens";
import type { AllergenId } from "@/domain/types";

// The statements one Save of an allergen form sends (D-148, D-229): the
// lists the page showed and the check it showed, against the lists and
// the check the owner left. Every statement lands only if the dish still
// holds what the page showed (D-149), and the database clears the check
// on any change to a list and stamps who and when on a check, so a save
// that changes a list and keeps the check ticked is two statements: the
// lists, then the check against the new lists. If the second fails, the
// dish holds the new lists unchecked, the safe state. Pure: no React, no
// network.

export type AllergenShown = { lists: AllergenLists; checked: boolean };

export type AllergenSaveStep = {
  patch: {
    allergens?: readonly AllergenId[];
    custom_allergens?: readonly string[];
    allergens_reviewed?: boolean;
  };
  expected: { lists?: AllergenLists; allergens_reviewed?: boolean };
};

export function allergenSaveSteps(
  shown: AllergenShown,
  next: AllergenShown,
): AllergenSaveStep[] {
  const listsChanged = !sameListsAsStored(next.lists, shown.lists);
  if (listsChanged) {
    const steps: AllergenSaveStep[] = [
      {
        patch: {
          allergens: next.lists.allergens,
          custom_allergens: next.lists.others,
        },
        expected: { lists: shown.lists },
      },
    ];
    if (next.checked) {
      steps.push({
        patch: { allergens_reviewed: true },
        expected: { lists: next.lists },
      });
    }
    return steps;
  }
  if (next.checked === shown.checked) return [];
  return [
    {
      patch: { allergens_reviewed: next.checked },
      expected: next.checked
        ? { lists: shown.lists }
        : { allergens_reviewed: true },
    },
  ];
}
