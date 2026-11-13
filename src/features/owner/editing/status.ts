// The one saved status an editing screen shows (D-111). Pure.

export type SaveState = {
  // Saves sent and not yet answered.
  inFlight: number;
  // One save has waited long enough to say so.
  slow: boolean;
  // Fields that hold a value the server refused or never got.
  failedFields: number;
  // The last failure's sentence, until a later save lands.
  notice: string | null;
};

export type Status = "saved" | "saving" | "slow" | "failed";

export function statusOf(state: SaveState): Status {
  if (state.inFlight > 0) return state.slow ? "slow" : "saving";
  if (state.failedFields > 0 || state.notice !== null) return "failed";
  return "saved";
}

// What a failure can still do about itself, by its kind (D-237, rule 3). A
// failure a retry cannot fix offers Reload and never Try again: the row is
// gone, what the page sits in is gone, the thing a move or an apply aimed
// at is gone, or the page is from before a deploy. Everything else can be
// tried again: a dropped connection, a server error, a session that ended,
// a value the owner can still correct. This is the one place the rule
// lives, so a kind that joins it later, what the page showed having moved,
// joins it here.
export type Remedy = "retry" | "reload";

const RELOAD_KINDS: ReadonlySet<string> = new Set([
  "gone",
  "parent-gone",
  "menu-gone",
  "section-gone",
  "target-gone",
  "out-of-date",
]);

export function remedyOf(kind: string): Remedy {
  return RELOAD_KINDS.has(kind) ? "reload" : "retry";
}

// The buttons beside the saved status. Try again shows while a field holds
// a value a retry could land; a change with no field of its own, a move or
// a delete, never had one, since its own button is still there to press.
// Reload shows while any failure on the page can only be fixed by one, or
// the page is known to be out of date.
export type FailureButtons = { tryAgain: boolean; reload: boolean };

export function buttonsOf(state: {
  // The kind of each failed field.
  fields: readonly string[];
  // The kind of the last change that failed, while its sentence shows.
  change: string | null;
  outOfDate: boolean;
}): FailureButtons {
  const kinds =
    state.change === null ? state.fields : [...state.fields, state.change];
  return {
    tryAgain: state.fields.some((kind) => remedyOf(kind) === "retry"),
    reload:
      state.outOfDate || kinds.some((kind) => remedyOf(kind) === "reload"),
  };
}
