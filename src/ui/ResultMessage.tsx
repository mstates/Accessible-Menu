"use client";

import { useEffect, useRef, useState } from "react";

// One focused result message (D-104): the "Saved." after a save and the
// sign-in outcomes. It takes focus when it mounts, and moving focus is what
// announces it: no live role, and a focus-visible outline shows a keyboard
// user where focus landed. The caller keys it per result, so the same
// message twice mounts twice and is read twice.
//
// A result carried in the URL (?saved=...) passes that value as fromUrl.
// Next can restore an earlier render from its router cache on Back, message
// and all, even after the URL was rewritten, so each handled value is
// recorded in sessionStorage and a value already handled renders nothing and
// moves no focus. The query is stripped with replaceState for the reload
// case. The decision is made once at mount, so the message stays visible
// until the next navigation whatever re-renders happen.

const STORAGE_KEY = "result-messages";
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
    // Storage unavailable: the message still shows and is read this once.
  }
}

type Props = { message: string; fromUrl?: string; className?: string };

export function ResultMessage({ message, fromUrl, className }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fresh] = useState(
    () =>
      fromUrl === undefined ||
      typeof window === "undefined" ||
      !handledValues().includes(fromUrl),
  );

  useEffect(() => {
    if (!fresh) return;
    ref.current?.focus();
    if (fromUrl === undefined) return;
    recordHandled(fromUrl);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, [fresh, fromUrl]);

  if (!fresh) return null;
  return (
    <p
      ref={ref}
      tabIndex={-1}
      className={`rounded bg-background-raised p-4 outline-none focus-visible:outline-3 ${className ?? ""}`}
    >
      {message}
    </p>
  );
}
