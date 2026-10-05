"use client";

import { useEffect } from "react";
import { FIRST_FOCUS_WAIT_MS } from "./alert-dialog-guard";

// The first focus of every dialog on the site (D-136). React Aria focuses the
// dialog itself the moment it opens, so a screen reader reads its name first.
// After FIRST_FOCUS_WAIT_MS, focus moves once to the dialog's first stop, the
// element with this id: the safe answer of a question, or the first field of a
// form. Placed in the same instant the dialog appears, focus is not followed by
// Safari with VoiceOver, whose cursor stays behind on the button that opened
// it; a tenth of a second later it is, in every browser. Nothing is blurred and
// nothing is focused twice. If the owner has already moved to something inside
// the dialog, with a Tab or a press, focus stays where they put it. React
// Aria's own refocus, half a second in, then finds focus off the dialog
// itself and leaves it.
//
// Call it from a component that mounts with the dialog's content, so the wait
// starts when the dialog opens and is dropped if it closes first.
export function useFirstFocus(firstStopId: string): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const target = document.getElementById(firstStopId);
      if (!target) return;
      const dialog = target.closest('[role="dialog"], [role="alertdialog"]');
      const active = document.activeElement;
      if (dialog && active && active !== dialog && dialog.contains(active)) {
        return;
      }
      target.focus();
    }, FIRST_FOCUS_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [firstStopId]);
}
