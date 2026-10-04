// What an owner link does on an editing screen (D-111). The browser's leave
// warning covers full unloads only, and Next drops a pending save's result
// when a navigation starts, so a link asks first. Pure.

export type Leave =
  // Nothing is unsaved: the link navigates as usual.
  | "go"
  // A save is on its way: the link waits for it, then asks again.
  | "hold"
  // A save failed: the page stays, so the failure is never left behind.
  | "stay";

export function leaveOf(state: {
  inFlight: number;
  failedFields: number;
}): Leave {
  if (state.failedFields > 0) return "stay";
  if (state.inFlight > 0) return "hold";
  return "go";
}

// After a hold, once every save has landed. A save that failed during the
// wait keeps the page, whether it left a failed field or not.
export function afterHold(state: {
  failedFields: number;
  failedWhileHeld: boolean;
}): "go" | "stay" {
  return state.failedFields > 0 || state.failedWhileHeld ? "stay" : "go";
}
