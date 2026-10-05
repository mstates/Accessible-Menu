// How long the confirming button of an alert dialog holds back a pointer
// press after the dialog opens (D-119). The dialog exists to stop a delete
// nobody meant, and the press that opens it can come twice: a tremor, a
// quick double tap, a double click. If the dialog opened under that second
// press and took it, it would confirm the very thing it asks about. So for
// about half a second the confirming button takes no press from a mouse, a
// finger, or a pen. It does not look or sound any different while it waits,
// and the other way out works at once.
//
// A key and a screen reader are not held back. Focus starts on the dialog
// itself and moves to the other answer (D-136), so a key pressed twice lands
// on one of them, and a screen reader presses what its cursor is on, not a
// place on the screen. A press from either on the confirming button was
// meant, and a press that was meant is never dropped without a word. Pure.

export const CONFIRM_GUARD_MS = 500;

// How long a dialog keeps focus on itself before focus moves to its first
// stop (D-136). React Aria focuses the dialog the moment it opens, and its
// question is read as its name. Safari with VoiceOver does not follow a focus
// placed in that same instant; a tenth of a second later it does, in every
// browser, and the question is not cut off. A timer chosen by ear on Michael's
// VoiceOver pass of October 5, 2026: change it only after listening again.
export const FIRST_FOCUS_WAIT_MS = 100;

// What made a press, as React Aria reports it: a pointer (a mouse, a finger,
// or a pen), a key, or a press with no pointer behind it, which it calls
// virtual and which is what a screen reader sends.
export type PressKind = "mouse" | "pen" | "touch" | "keyboard" | "virtual";

// Whether a press on the confirming button counts. openedAt is the moment
// the dialog showed, or null if it has not yet. Only a key and a screen
// reader count at once. Any other kind waits, so a kind this does not know
// is held back like a pointer.
export function confirmCounts(
  kind: PressKind,
  openedAt: number | null,
  now: number,
): boolean {
  if (kind === "keyboard" || kind === "virtual") return true;
  return openedAt !== null && now - openedAt >= CONFIRM_GUARD_MS;
}
