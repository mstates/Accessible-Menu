import type { Editing } from "../editing/useEditing";

// Try again on a dish's sub page (D-222): focus goes to the first failed
// field, and every failed field is offered to each group on the page, in
// order, until one sends it again with the value that failed. General
// keeps its own, since its texts and sizes take another path
// (useDishGeneral.ts).
export function tryAgainWith(
  editing: Editing,
  groups: readonly ((key: string, failedValue: string) => boolean)[],
): void {
  editing.focusFirstFailed();
  const { failures } = editing.peek();
  for (const key of Object.keys(failures)) {
    const value = failures[key]?.value ?? "";
    groups.some((group) => group(key, value));
  }
}
