import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  blockerSentence,
  publishSummary,
  publishedOn,
  refusedSentence,
  stateSentence,
} from "../../src/features/owner/publishing-words";

// The sentences Publish shows and says (D-82, migration 12), from one
// place, read against the copy.

const strings = en.owner.publishing;
const editing = en.owner.editing;
const zone = "America/New_York";

const notPublished = {
  id: "a",
  name: "Dinner",
  published: false,
  publishedAt: null,
  changed: null,
};
// Just before midnight in New York, which is the next day in UTC.
const published = {
  ...notPublished,
  published: true,
  publishedAt: "2026-10-12T03:30:00Z",
  changed: false,
};

describe("the day a menu was published", () => {
  it("names the day in the restaurant's time zone", () => {
    expect(publishedOn(published.publishedAt, zone, "en")).toBe(
      "October 11, 2026",
    );
    expect(publishedOn(published.publishedAt, "UTC", "en")).toBe(
      "October 12, 2026",
    );
  });

  it("is empty for a time that does not read", () => {
    expect(publishedOn("not a time", zone, "en")).toBe("");
  });
});

describe("the state sentence", () => {
  it("says a menu is not published", () => {
    expect(stateSentence(strings, notPublished, zone, "en")).toBe(
      strings.state.notPublished,
    );
  });

  it("names the day for a published menu with nothing changed since", () => {
    expect(stateSentence(strings, published, zone, "en")).toBe(
      "Published on October 11, 2026. Nothing has changed since.",
    );
  });

  it("says changes are not published yet", () => {
    expect(
      stateSentence(strings, { ...published, changed: true }, zone, "en"),
    ).toBe(
      "Published on October 11, 2026. Changes since then are not published yet.",
    );
  });
});

describe("what blocks Publish", () => {
  it("names the dish and its section", () => {
    expect(
      blockerSentence(
        strings,
        { kind: "size-unnamed", dish: "Soup of the day", section: "Starters" },
        "Dinner",
      ),
    ).toBe("Soup of the day in Starters has a size with no name.");
    expect(
      blockerSentence(
        strings,
        { kind: "size-unpriced", dish: "Soup of the day", section: "Starters" },
        "Dinner",
      ),
    ).toBe("Soup of the day in Starters has a size with no price.");
  });

  it("names the menu when it has no dishes (D-177)", () => {
    expect(blockerSentence(strings, { kind: "no-dishes" }, "Lunch")).toBe(
      "Lunch has no dishes.",
    );
  });
});

describe("why a press did not land", () => {
  it("names the first blocker's dish and what to do", () => {
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", {
        kind: "blocked",
        blockers: [
          { kind: "size-unpriced", dish: "Soup of the day", section: "S" },
          { kind: "size-unnamed", dish: "Chili", section: "S" },
        ],
      }),
    ).toBe(
      "Dinner was not published. Soup of the day has a size with no price. Give it a price or remove it, then publish again.",
    );
  });

  it("tells the owner to add a dish when the menu has none (D-177)", () => {
    expect(
      refusedSentence(strings, editing, "Lunch", "publish", {
        kind: "blocked",
        blockers: [{ kind: "no-dishes" }],
      }),
    ).toBe(
      "Lunch was not published. It has no dishes. Add a dish, then publish again.",
    );
  });

  it("says a menu that is gone was not published or unpublished", () => {
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", { kind: "gone" }),
    ).toBe("Dinner was not published. It is not there any more.");
    expect(
      refusedSentence(strings, editing, "Dinner", "unpublish", {
        kind: "parent-gone",
      }),
    ).toBe("Dinner was not unpublished. It is not there any more.");
  });

  it("carries the editing problems for the rest", () => {
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", {
        kind: "out-of-date",
      }),
    ).toBe(`Dinner was not published. ${editing.problems.outOfDate}`);
    expect(
      refusedSentence(strings, editing, "Dinner", "unpublish", {
        kind: "unreachable",
      }),
    ).toBe(`Dinner was not unpublished. ${editing.problems.unreachable}`);
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", {
        kind: "signed-out",
      }),
    ).toBe(`Dinner was not published. ${editing.problems.signedOut}`);
    expect(
      refusedSentence(strings, editing, "Dinner", "unpublish", {
        kind: "failed",
      }),
    ).toBe(`Dinner was not unpublished. ${editing.problems.failed}`);
  });

  it("falls back to the plain refusal when a blocked press carries no blocker", () => {
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", {
        kind: "blocked",
        blockers: [],
      }),
    ).toBe(`Dinner was not published. ${editing.problems.failed}`);
  });
});

describe("the dashboard's summary", () => {
  const lunch = { ...notPublished, id: "l", name: "Lunch" };
  const drinks = { ...notPublished, id: "d", name: "Drinks" };

  it("says nothing for a restaurant with no menu", () => {
    expect(publishSummary(strings, [], "en")).toEqual([]);
  });

  it("says no menu is published", () => {
    expect(publishSummary(strings, [lunch, notPublished], "en")).toEqual([
      "No menu is published yet.",
    ]);
  });

  it("names the published menus, joined as the language joins a list", () => {
    expect(publishSummary(strings, [lunch, published], "en")).toEqual([
      "Dinner is published.",
    ]);
    expect(
      publishSummary(
        strings,
        [
          {
            ...lunch,
            published: true,
            publishedAt: "2026-10-11T12:00:00Z",
            changed: false,
          },
          published,
          {
            ...drinks,
            published: true,
            publishedAt: "2026-10-11T12:00:00Z",
            changed: false,
          },
        ],
        "en",
      ),
    ).toEqual(["Lunch, Dinner, and Drinks are published."]);
  });

  it("names the menus with changes not published yet, after the published ones", () => {
    expect(
      publishSummary(
        strings,
        [
          {
            ...lunch,
            published: true,
            publishedAt: "2026-10-11T12:00:00Z",
            changed: true,
          },
          { ...published, changed: true },
          drinks,
        ],
        "en",
      ),
    ).toEqual([
      "Lunch and Dinner are published.",
      "Lunch and Dinner have changes not yet published.",
    ]);
    expect(
      publishSummary(strings, [{ ...published, changed: true }], "en"),
    ).toEqual([
      "Dinner is published.",
      "Dinner has changes not yet published.",
    ]);
  });
});
