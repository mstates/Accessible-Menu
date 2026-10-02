import { cache } from "react";

// A result that arrives with a page (?checkout=success, ?error=link) repeats
// its query value, so the key that keeps it from being read twice belongs to
// the render, not the URL (D-110): a Back restore replays the same render and
// reads nothing, and a new arrival is a new render and is read. React's cache
// gives the whole request one stamp, so every render of it agrees.
const requestStamp = cache(() => Date.now());

export function arrivalKey(kind: string, value: string): string {
  return `${kind}-${value}-${requestStamp()}`;
}
