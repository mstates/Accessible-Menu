import type { Status } from "./status";

// What the shared editing code says when saves land (D-111, D-118). Pure.
// The saved status is never spoken. A field whose text save lands says
// "Saved." once through the page's log, so a screen reader user hears what
// a sighted owner sees in the status. A failure is said where it happens and
// leaves "All changes saved." owed until the status is next saved; the save
// that gets it there says only that, never both. An add, a move, and a
// delete say their own sentences on their screen, and nothing here.

export type Landing = {
  // A field's text, or a change that has its own sentence.
  kind: "text" | "change";
  // A failure was said, and "All changes saved." has not been since.
  owed: boolean;
  // Fields still failed once this save is recorded.
  failedFields: number;
  // Saves still on their way behind this one.
  waiting: number;
};

export function saysSaved(landing: Landing): boolean {
  if (landing.kind === "change") return false;
  // With nothing failed and nothing behind it, this save is the one the
  // status returns to saved on, and that return is said instead.
  return !(landing.owed && landing.failedFields === 0 && landing.waiting === 0);
}

export function saysSavedAgain(owed: boolean, status: Status): boolean {
  return owed && status === "saved";
}
