import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REVIEW_TOKEN_SHAPE,
  reviewToken,
} from "../../src/features/owner/menu/review-token";

// What the owner reviewed is what gets published (D-224): the draft as one
// short value the Publish press carries. Two reads of the same draft give
// the same value, whatever order their keys arrive in, and any change to
// the draft gives another.

const fixture: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../fixtures/menu-snapshot.v1.json", import.meta.url),
    ),
    "utf8",
  ),
);

function shuffled(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffled);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, shuffled(entry)]),
    );
  }
  return value;
}

type Draft = {
  menu: { name: string };
  sections: { note: string | null; items: { name: string }[] }[];
};

function draft(): Draft {
  return structuredClone(fixture) as Draft;
}

describe("the review's token", () => {
  it("is one short value in a shape the action can check", () => {
    const token = reviewToken(fixture);
    expect(token).toMatch(REVIEW_TOKEN_SHAPE);
    expect(token).toHaveLength(43);
    expect(reviewToken(fixture)).toBe(token);
    expect(reviewToken(structuredClone(fixture))).toBe(token);
  });

  it("does not move with the order of an object's keys", () => {
    const other = shuffled(fixture);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(fixture));
    expect(reviewToken(other)).toBe(reviewToken(fixture));
  });

  it("moves with any change: a name, a note set where there was none, a dish taken away", () => {
    const token = reviewToken(fixture);
    const renamed = draft();
    renamed.menu.name = "Supper";
    expect(reviewToken(renamed)).not.toBe(token);
    const noted = draft();
    const first = noted.sections[0];
    if (!first) throw new Error("the fixture has sections");
    first.note = "";
    expect(reviewToken(noted)).not.toBe(token);
    const fewer = draft();
    fewer.sections[0]?.items.pop();
    expect(reviewToken(fewer)).not.toBe(token);
  });

  it("moves with the order of a list, which diners read in order", () => {
    const turned = draft();
    turned.sections.reverse();
    expect(reviewToken(turned)).not.toBe(reviewToken(fixture));
  });

  it("tells a missing document from an empty one", () => {
    expect(reviewToken(null)).not.toBe(reviewToken({}));
    expect(reviewToken({})).not.toBe(reviewToken([]));
    expect(reviewToken("")).not.toBe(reviewToken(null));
  });
});
