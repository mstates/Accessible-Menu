"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { z } from "zod";
import { readUndo } from "./undo";

// One screen's Undo stack, kept in the tab's session storage (D-111): it
// survives a reload in the same tab and nothing else. Session storage is a
// client-only value, so it is read through an external store: the server
// render and the first client render see an empty stack, and React renders
// again with the stored one once hydrated, with no effect and no mismatch.
// If storage is not available the stack lives in memory for the page.

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readRaw(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
  for (const listener of listeners) listener();
}

const readNothing = () => null;

export function useUndoStack<Entry>(key: string, entry: z.ZodType<Entry>) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), readNothing);
  const stack = useMemo(() => readUndo(raw, entry), [raw, entry]);
  // The stack as it is now, for a save that finishes after this render.
  const peek = useCallback(() => readUndo(readRaw(key), entry), [key, entry]);
  const replace = useCallback(
    (next: readonly Entry[]) => writeRaw(key, JSON.stringify(next)),
    [key],
  );
  return { stack, peek, replace };
}
