"use client";

import { useEffect } from "react";
import { FIRST_FOCUS_WAIT_MS } from "./alert-dialog-guard";

// Focus on a summary of problems' heading (D-229, Q-183), placed after the
// dialog's own wait (D-136, D-241). The summary is drawn in the same commit
// that would focus it, and a focus placed in the instant its target appears
// is not followed by Safari with VoiceOver: the heading was silent on the
// first press and its cursor stayed behind on Save (Q-202). After
// FIRST_FOCUS_WAIT_MS it is followed: heard by Michael on the first press in
// Safari on the Mac and on the iPhone, on a dish's General, Details, and
// Publishing, November 22, 2026. A heading already on the page takes the
// same wait, so every refusal lands the same way.
//
// request is null when there is nothing to focus, and a new value for each
// focus wanted: a new value starts the wait again and drops one pending. If
// the owner moves focus before the wait ends, with a Tab, a link, or a press,
// focus stays where they put it.
export function useSummaryFocus(id: string, request: unknown): void {
  useEffect(() => {
    if (request === null) return;
    const before = document.activeElement;
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active !== before && active !== null && active !== document.body) {
        return;
      }
      document.getElementById(id)?.focus();
    }, FIRST_FOCUS_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [id, request]);
}
