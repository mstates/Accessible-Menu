import {
  cleanOtherAllergen,
  hasOtherAllergenComma,
  otherAllergenKey,
  OTHER_ALLERGEN_LIMITS,
} from "@/domain/allergens";
import { majorRuleOf } from "../allergens/allergen-words";

// What a Save of the allergen form checks before anything is sent (D-229),
// and what the server checks again: each other-allergen row as typed, in
// row order. A blank row holds nothing and is dropped without a word
// (Michael, November 9, 2026), the way a blank added row is not a change.
// A row with a comma, one over the length, one that names a major allergen
// the boxes already cover, and one that repeats an earlier row are
// problems, one per row, the first that applies, in the order the domain
// checks them. The repeat names the earlier row's value, so the later row
// is the one to fix. Pure: no React, no network.

export type OtherRowProblem = {
  // The row's place among the rows as typed, blanks included.
  index: number;
  // A rule from the other-allergen words: otherComma, otherLength,
  // otherMajor:<id>, otherMajor:both, or otherTaken.
  rule: string;
  // For otherTaken, the earlier row's value as it will be saved.
  other?: string;
};

export type AllergenFormCheck = {
  // The other allergens to save, cleaned, blanks dropped, in row order.
  others: string[];
  problems: OtherRowProblem[];
};

export function validateAllergenForm(
  typed: readonly string[],
): AllergenFormCheck {
  const others: string[] = [];
  const problems: OtherRowProblem[] = [];
  typed.forEach((raw, index) => {
    const value = cleanOtherAllergen(raw);
    if (value === "") return;
    const rule = problemOf(value, others);
    if (rule) {
      problems.push(
        rule.rule === "otherTaken"
          ? { index, rule: rule.rule, other: rule.other }
          : { index, rule: rule.rule },
      );
    }
    others.push(value);
  });
  return { others, problems };
}

function problemOf(
  value: string,
  earlier: readonly string[],
): { rule: string; other?: string } | null {
  if (hasOtherAllergenComma(value)) return { rule: "otherComma" };
  if (value.length > OTHER_ALLERGEN_LIMITS.length)
    return { rule: "otherLength" };
  const major = majorRuleOf(value);
  if (major) return { rule: major };
  const key = otherAllergenKey(value);
  const taken = earlier.find((other) => otherAllergenKey(other) === key);
  return taken === undefined ? null : { rule: "otherTaken", other: taken };
}
