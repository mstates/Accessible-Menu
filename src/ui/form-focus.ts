// Where focus goes after a Save finds problems or the server refuses it
// (D-229, Primer's form validation): with this many problems or more, the
// summary, since its links are the quickest way through them; with fewer,
// the first invalid field, where the fix is typed; after a failure the
// server answered, the summary, where the failure sentence sits. Pure: no
// React, no network.
export const SUMMARY_FROM = 3;

export type FocusTarget = "summary" | "field" | null;

export function focusTarget(problems: number, failure: boolean): FocusTarget {
  if (failure) return "summary";
  if (problems === 0) return null;
  return problems >= SUMMARY_FROM ? "summary" : "field";
}
