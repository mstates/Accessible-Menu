import { describe, expect, it } from "vitest";
import {
  ADDRESS_LOOKUPS_PER_DAY,
  allowLookup,
  type LookupCounts,
} from "../../src/features/owner/address/cap";

// The address route's fuse per owner (Q-111): so many requests a UTC day,
// counted in memory.

describe("allowLookup", () => {
  it("allows the day's requests up to the cap and refuses the next", () => {
    const counts: LookupCounts = new Map();
    const now = new Date("2026-10-18T22:00:00Z");
    for (let i = 0; i < ADDRESS_LOOKUPS_PER_DAY; i += 1) {
      expect(allowLookup(counts, "owner-1", now)).toBe(true);
    }
    expect(allowLookup(counts, "owner-1", now)).toBe(false);
    expect(allowLookup(counts, "owner-1", now)).toBe(false);
  });

  it("counts each owner on their own", () => {
    const counts: LookupCounts = new Map();
    const now = new Date("2026-10-18T22:00:00Z");
    for (let i = 0; i < ADDRESS_LOOKUPS_PER_DAY; i += 1) {
      allowLookup(counts, "owner-1", now);
    }
    expect(allowLookup(counts, "owner-1", now)).toBe(false);
    expect(allowLookup(counts, "owner-2", now)).toBe(true);
  });

  it("starts over on a new UTC day", () => {
    const counts: LookupCounts = new Map();
    const late = new Date("2026-10-18T23:59:59Z");
    for (let i = 0; i < ADDRESS_LOOKUPS_PER_DAY; i += 1) {
      allowLookup(counts, "owner-1", late);
    }
    expect(allowLookup(counts, "owner-1", late)).toBe(false);
    expect(
      allowLookup(counts, "owner-1", new Date("2026-10-19T00:00:00Z")),
    ).toBe(true);
  });
});
