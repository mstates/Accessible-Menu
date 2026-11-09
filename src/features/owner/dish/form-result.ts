import type { AllergenShown } from "../allergens/save-steps";
import type { ListProblem } from "../editing/list-words";

// What a Save of one of the dish's form pages comes back as (D-229): it
// landed, and the page loads again with the flash; the data moved under
// the page since it showed it, so nothing was written and the page says to
// look at it as it is now; or the server refused it, with the problem the
// page says in its own words and, for a save made of more than one
// statement, what the first statement left behind. Pure types.

export type SaveResult<Detail = never> =
  | { status: "saved" }
  | { status: "moved" }
  | { status: "failed"; problem: ListProblem; detail?: Detail };

export type SaveRefused<Detail = never> = Exclude<
  SaveResult<Detail>,
  { status: "saved" }
>;

// The allergen save's second statement failed (D-148): the lists landed,
// unchecked, so the page adopts them as shown and keeps the check ticked
// for the next press.
export type AllergenSaveDetail = { part: "check"; shown: AllergenShown };
