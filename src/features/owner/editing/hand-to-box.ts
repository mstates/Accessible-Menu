import type { FocusEvent } from "react";

// A wrapper that takes a failed save's focus and hands it to the box
// inside, so a reader hears the box and its state (the price group's
// pattern, D-143). The allergen group, the dietary tags, and the schedule's
// boxes share it (rule 12: the third use).
export function handToBox(event: FocusEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  event.currentTarget
    .querySelector<HTMLInputElement>('input[type="checkbox"]')
    ?.focus();
}
