import { useLayoutEffect, useRef, type RefObject } from "react";

// What the server last confirmed, read when the queue sends a write, so a
// compare-and-set names the value the page showed at that moment and not
// the value at render (D-149, D-153). The allergen group, the dietary tags,
// and the schedule each carry one (rule 12: the third use). A layout effect
// keeps it in step with every refresh before anything is sent.
export function useConfirmed<T>(value: T): RefObject<T> {
  const confirmed = useRef<T>(value);
  useLayoutEffect(() => {
    confirmed.current = value;
  }, [value]);
  return confirmed;
}
