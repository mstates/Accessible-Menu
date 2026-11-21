// When a field saves (D-111): when it is committed, focus leaving it or
// Enter, and only if its value changed. Tabbing through an unchanged field
// writes nothing, a value already on its way is not sent twice, and a value
// that just failed is not sent again by leaving the field: its error is on
// screen, and Try again is what sends it. Pure.

export type Commit =
  // Untouched, already on its way, or the value that just failed.
  | { kind: "nothing" }
  // Typed back to the saved value: show it as saved again.
  | { kind: "reset" }
  | { kind: "send"; value: string };

export type FieldValues = {
  // The value the server holds.
  saved: string;
  // What the owner typed, or null for a field nobody typed in.
  draft: string | null;
  // A value sent and not yet answered.
  inFlight: string | null;
  // The value the last save of this field failed with.
  failed: string | null;
  // The text the field showed when the owner began to change it, while it
  // holds one (shown.ts), or null. It differs from saved only when a newer
  // value arrived under the typed text.
  shown?: string | null;
};

export function commitOf(
  field: FieldValues,
  clean: (value: string) => string,
): Commit {
  if (field.draft === null) return { kind: "nothing" };
  const value = clean(field.draft);
  if (value === field.inFlight || value === field.failed) {
    return { kind: "nothing" };
  }
  // Typed back to what the field stands on, the owner changed nothing, so
  // nothing is sent and the field shows what is saved. With a hold that is
  // the hold's text alone (Q-199): a save that landed makes the hold the
  // answer's value before the refreshed rows arrive, so the render's saved
  // value may be the old one, and typed back to it the owner did change the
  // field. A text typed to a newer value that arrived under it is sent as
  // well, and a write that finds its value in place is answered as landed
  // (missed() in compare.ts, D-239). With no hold, the saved value.
  if (value === (field.shown ?? field.saved)) {
    return { kind: "reset" };
  }
  return { kind: "send", value };
}
