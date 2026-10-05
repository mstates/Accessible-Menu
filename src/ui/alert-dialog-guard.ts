// How long the confirming button of an alert dialog ignores presses after
// the dialog opens (D-119). The dialog exists to stop a delete nobody meant,
// and the press that opens it can come twice: a tremor, a quick double tap,
// a double click. If the dialog opened under that second press and took it,
// it would confirm the very thing it asks about. So for about half a second
// the confirming button takes no press. It does not look or sound any
// different while it waits, and the other way out works at once. Pure.

export const CONFIRM_GUARD_MS = 500;

// Whether a press on the confirming button counts. openedAt is the moment
// the dialog showed, or null if it has not yet.
export function confirmCounts(openedAt: number | null, now: number): boolean {
  return openedAt !== null && now - openedAt >= CONFIRM_GUARD_MS;
}
