import { z } from "zod";

// The Undo stack of one editing screen (D-111): the last twenty changes,
// newest last, replayed strictly in order. Replaying in order is what keeps
// one tab's history from colliding with itself: each Undo returns the screen
// to a state it was in before. Pure; the screen keeps the stack in the tab's
// session storage, so it survives a reload in the same tab and nothing else.

export const UNDO_LIMIT = 20;

export function pushUndo<Entry>(
  stack: readonly Entry[],
  entry: Entry,
): Entry[] {
  return [...stack, entry].slice(-UNDO_LIMIT);
}

export function newestUndo<Entry>(stack: readonly Entry[]): Entry | null {
  return stack[stack.length - 1] ?? null;
}

// What an Undo press did to the newest entry.
export type UndoOutcome =
  // Undone: the entry goes.
  | "applied"
  // The change it reverses no longer stands: it says so, and the entry goes.
  | "stale"
  // A taken name is in the way: it says so, and the entry stays.
  | "blocked"
  // The save itself failed: the entry stays for another try.
  | "failed";

export function afterUndo<Entry>(
  stack: readonly Entry[],
  outcome: UndoOutcome,
): Entry[] {
  return outcome === "applied" || outcome === "stale"
    ? stack.slice(0, -1)
    : [...stack];
}

// The stack as stored. Anything that is not a list of entries reads as an
// empty stack, so a value from an older build never breaks the screen.
export function readUndo<Entry>(
  raw: string | null,
  entry: z.ZodType<Entry>,
): Entry[] {
  if (!raw) return [];
  try {
    const parsed = z.array(entry).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.slice(-UNDO_LIMIT) : [];
  } catch {
    return [];
  }
}
