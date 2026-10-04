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
