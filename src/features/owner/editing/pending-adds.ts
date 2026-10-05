// Names sent from a list's add field that the list does not show yet
// (D-125). Pure. Nothing typed is ever dropped or erased: at Enter the name
// leaves the field and shows at once as a row marked not saved yet, and its
// add waits its turn behind every save made before it. A row that landed
// shows its name until the refreshed list brings its real row, which, with
// several saves on their way, is only once the last of them is answered. A
// row that failed stays, with its error, until it is sent again or removed.
// Until it lands a row has no field and no buttons, so it cannot be renamed,
// moved, or deleted.

export type PendingAdd = {
  // This page's own number for the add; it is never sent.
  key: string;
  name: string;
  phase: "waiting" | "failed" | "landed";
  // The row's id once it has landed.
  id: string | null;
};

export function enterAdd(
  adds: readonly PendingAdd[],
  key: string,
  name: string,
): PendingAdd[] {
  return [...adds, { key, name, phase: "waiting", id: null }];
}

function changed(
  adds: readonly PendingAdd[],
  key: string,
  from: PendingAdd["phase"],
  to: Partial<PendingAdd>,
): PendingAdd[] {
  return adds.map((add) =>
    add.key === key && add.phase === from ? { ...add, ...to } : add,
  );
}

export function addLanded(
  adds: readonly PendingAdd[],
  key: string,
  id: string,
): PendingAdd[] {
  return changed(adds, key, "waiting", { phase: "landed", id });
}

export function addFailed(
  adds: readonly PendingAdd[],
  key: string,
): PendingAdd[] {
  return changed(adds, key, "waiting", { phase: "failed" });
}

// Try again sends a failed add once more, from its own place in the list.
export function addSentAgain(
  adds: readonly PendingAdd[],
  key: string,
): PendingAdd[] {
  return changed(adds, key, "failed", { phase: "waiting" });
}

// Only a failed add can be removed: one on its way is the owner's to wait
// for, and one that landed is a row like any other.
export function removeAdd(
  adds: readonly PendingAdd[],
  key: string,
): PendingAdd[] {
  return adds.filter((add) => !(add.key === key && add.phase === "failed"));
}

// A new list from the server holds every add that had landed by then.
export function settleAdds(adds: readonly PendingAdd[]): PendingAdd[] {
  return adds.filter((add) => add.phase !== "landed");
}

// The rows to show after the saved ones, in the order they were added. A
// landed add whose real row is already in the list is not shown twice.
export function addsShown(
  adds: readonly PendingAdd[],
  savedIds: ReadonlySet<string>,
): PendingAdd[] {
  return adds.filter(
    (add) => !(add.phase === "landed" && add.id && savedIds.has(add.id)),
  );
}

// The rows a new name must differ from, beside the saved ones: every name
// already sent, whether it is waiting, failed, or landed.
export function addsAsRows(
  adds: readonly PendingAdd[],
): { id: string; name: string }[] {
  return adds.map((add) => ({ id: add.key, name: add.name }));
}

// A failed add's failure is kept under its own key, apart from the add
// field's own, which holds a name refused before it was sent.
export function failureKeyOf(key: string): string {
  return `add:${key}`;
}

export function isAddFailure(failureKey: string): boolean {
  return failureKey.startsWith("add:");
}
