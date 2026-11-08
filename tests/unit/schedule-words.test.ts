import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { availabilityLine } from "../../src/features/owner/dish/schedule-words";

// Task 5: the line under the availability radios (D-160), built from what
// the server decided.

const strings = en.owner.dish;

describe("the line under the availability radios (D-160)", () => {
  const newYork = "America/New_York";
  const now = "2026-10-13T17:00:00Z";
  const line = (
    state: "available" | "sold-out" | "off",
    until: string | null,
  ) =>
    availabilityLine(
      strings.availability,
      { state, until },
      newYork,
      "en",
      en.time,
      now,
    );

  it("says nothing for an available dish and that an off dish is hidden", () => {
    expect(line("available", null)).toBeUndefined();
    expect(line("off", null)).toBe(strings.availability.hidden);
  });

  it("says when a sold-out dish comes back: today, midnight tonight, tomorrow, or a named day", () => {
    expect(line("sold-out", "2026-10-14T02:00:00Z")).toBe(
      "Available again on its own at 10 pm today.",
    );
    expect(line("sold-out", "2026-10-14T04:00:00Z")).toBe(
      "Available again on its own at midnight tonight.",
    );
    expect(line("sold-out", "2026-10-14T06:00:00Z")).toBe(
      "Available again on its own at 2 am tomorrow.",
    );
    expect(line("sold-out", "2026-10-15T02:00:00Z")).toBe(
      "Available again on its own at 10 pm tomorrow.",
    );
    expect(line("sold-out", "2026-10-17T02:00:00Z")).toBe(
      "Available again on its own on Friday, October 16, at 10 pm.",
    );
    expect(line("sold-out", "not a date")).toBeUndefined();
    expect(line("sold-out", null)).toBeUndefined();
  });
});
