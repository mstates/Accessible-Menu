"use client";

import { useEffect, useRef, useState } from "react";

// The "Saved." notice after a save. The details page mounts it with the saved
// value from the URL as its key, so every save, two in a row included, mounts
// a fresh one that takes focus and is read. No live role: moving focus to
// the paragraph is what announces it, and a focus-visible outline shows a
// keyboard user where focus landed.
//
// Each handled value is recorded in sessionStorage. Next can restore the
// earlier render from its router cache on Back, notice and all, even after
// the URL was rewritten, so a value already handled renders nothing and
// moves no focus. The query is stripped with replaceState for the reload
// case. The decision is made once at mount, so the notice stays visible
// until the next navigation whatever re-renders happen.

const STORAGE_KEY = "owner-saved-notices";
const KEEP = 20;

function handledValues(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function recordHandled(value: string): void {
  try {
    const next = [...handledValues().filter((v) => v !== value), value].slice(
      -KEEP,
    );
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the notice still shows and is read this once.
  }
}

type Props = { value: string; message: string };

export function SavedNotice({ value, message }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fresh] = useState(
    () => typeof window === "undefined" || !handledValues().includes(value),
  );

  useEffect(() => {
    if (!fresh) return;
    ref.current?.focus();
    recordHandled(value);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, [fresh, value]);

  if (!fresh) return null;
  return (
    <p
      ref={ref}
      tabIndex={-1}
      className="mt-4 rounded bg-background-raised p-4 outline-none focus-visible:outline-3"
    >
      {message}
    </p>
  );
}
