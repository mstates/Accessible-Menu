import { createHash } from "node:crypto";

// What the owner reviewed is what gets published (D-224): the Publishing
// page turns the draft it reviewed into one short value, the Publish press
// carries it, and the action makes the same value from the draft as it
// stands at the press and refuses when the two differ. The value is a
// SHA-256 of the draft written with its keys in one order, so two reads of
// the same draft give the same value whatever order their keys arrived in,
// and any change to any part of it gives another. It says nothing a signed-in
// owner could not read, so it travels in the clear. Server only: the page
// and the action make it, the browser only hands it back.

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function reviewToken(draft: unknown): string {
  return createHash("sha256").update(canonical(draft)).digest("base64url");
}

// A token's shape, for the action's check of what the browser sent back.
export const REVIEW_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
