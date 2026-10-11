"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

// Where focus belongs after the page next changes (D-112, D-119, D-139).
// React moves a row's node when the row travels down, and the browser
// drops focus when it does; a deleted row takes its button with it; a row
// just added wants focus in its first field. A handler says where focus
// should land, with force when the control that had focus is gone, and the
// effect places it after the next render: with force, on the element once
// it is on the page; without, only if focus is not already somewhere the
// owner put it. The lists, the dish page, and an option's allergen group
// each keep one (rule 12: the third use).
export type FocusWanted = { id: string; force: boolean };

export function useFocusNext(): RefObject<FocusWanted | null> {
  const focusNext = useRef<FocusWanted | null>(null);
  useLayoutEffect(() => {
    const wanted = focusNext.current;
    if (!wanted) return;
    const element = document.getElementById(wanted.id);
    const active = document.activeElement;
    if (wanted.force) {
      if (!element) return;
      focusNext.current = null;
      if (active !== element) element.focus();
      return;
    }
    if (active === element) return;
    if (active === null || active === document.body) element?.focus();
    else focusNext.current = null;
  });
  return focusNext;
}
