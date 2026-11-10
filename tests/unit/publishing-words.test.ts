import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import type { MenuReview, Unconfirmed } from "../../src/domain/menu-review";
import {
  restaurantChoiceListPath,
  restaurantDishPagePath,
  restaurantDishPath,
  restaurantMenuPath,
} from "../../src/features/owner/paths";
import {
  blockerLink,
  blockerSentence,
  publishSummary,
  publishedOn,
  refusedSentence,
  reviewWords,
  stateSentence,
  unconfirmedWords,
} from "../../src/features/owner/publishing-words";

// The sentences Publish shows and says (D-82, migration 12, D-224), from
// one place, read against the copy.

const strings = en.owner.publishing;
const editing = en.owner.editing;
const zone = "America/New_York";
const code = "12345678";
const soupId = "0b2f0a9e-1111-4222-8333-444455556666";

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
        {
          kind: "size-unnamed",
          dishId: soupId,
          dish: "Soup of the day",
          section: "Starters",
        },
        "Dinner",
      ),
    ).toBe("Soup of the day in Starters has a size with no name.");
    expect(
      blockerSentence(
        strings,
        {
          kind: "size-unpriced",
          dishId: soupId,
          dish: "Soup of the day",
          section: "Starters",
        },
        "Dinner",
      ),
    ).toBe("Soup of the day in Starters has a size with no price.");
  });

  it("names the menu when it has no dishes (D-177)", () => {
    expect(blockerSentence(strings, { kind: "no-dishes" }, "Lunch")).toBe(
      "Lunch has no dishes.",
    );
  });

  it("links each one to the page that fixes it: a size to its dish's General page, no dishes to the menu's Sections (D-224)", () => {
    const menu = { id: "9d7e6c5b-aaaa-4bbb-8ccc-ddddeeeeffff", name: "Dinner" };
    expect(
      blockerLink(
        strings,
        {
          kind: "size-unnamed",
          dishId: soupId,
          dish: "Soup of the day",
          section: "Starters",
        },
        code,
        menu,
      ),
    ).toEqual({
      href: restaurantDishPath(code, soupId),
      text: "Soup of the day in Starters has a size with no name.",
    });
    expect(blockerLink(strings, { kind: "no-dishes" }, code, menu)).toEqual({
      href: restaurantMenuPath(code, menu.id),
      text: "Dinner has no dishes.",
    });
  });
});

describe("the review's words (D-224)", () => {
  const nothing: Extract<MenuReview, { kind: "since" }> = {
    kind: "since",
    changed: false,
    menuRenamed: false,
    dishes: { added: 0, changed: 0, moved: 0, removed: 0, reordered: false },
    sections: { added: 0, changed: 0, removed: 0, reordered: false },
    other: false,
  };

  it("says what a first Publish shows, with its sections and dishes counted", () => {
    expect(
      reviewWords(strings, { kind: "first", sections: 3, dishes: 4 }),
    ).toEqual({
      sentence:
        "Nothing is published yet. Publishing shows diners the whole menu: 3 sections and 4 dishes.",
    });
    expect(
      reviewWords(strings, { kind: "first", sections: 1, dishes: 1 }),
    ).toEqual({
      sentence:
        "Nothing is published yet. Publishing shows diners the whole menu: 1 section and 1 dish.",
    });
  });

  it("says a menu with no dishes has none, whatever its sections", () => {
    const empty = {
      sentence: "Nothing is published yet, and this menu has no dishes yet.",
    };
    expect(
      reviewWords(strings, { kind: "first", sections: 0, dishes: 0 }),
    ).toEqual(empty);
    expect(
      reviewWords(strings, { kind: "first", sections: 2, dishes: 0 }),
    ).toEqual(empty);
  });

  it("says nothing has changed, in one sentence", () => {
    expect(reviewWords(strings, nothing)).toEqual({
      sentence: "Nothing has changed since the last publish.",
    });
  });

  it("gives one sentence a kind of change, dishes first, then sections, then the menu's name", () => {
    expect(
      reviewWords(strings, {
        ...nothing,
        changed: true,
        menuRenamed: true,
        dishes: { added: 2, changed: 1, moved: 1, removed: 3, reordered: true },
        sections: { added: 1, changed: 2, removed: 1, reordered: true },
      }),
    ).toEqual({
      changes: [
        "2 dishes added.",
        "1 dish changed.",
        "1 dish moved to another section.",
        "3 dishes taken off.",
        "The order of dishes changed.",
        "1 section added.",
        "2 sections changed.",
        "1 section taken off.",
        "The order of sections changed.",
        "The menu's name changed.",
      ],
    });
  });

  it("counts one and many in their own words", () => {
    expect(
      reviewWords(strings, {
        ...nothing,
        changed: true,
        dishes: {
          added: 1,
          changed: 2,
          moved: 2,
          removed: 1,
          reordered: false,
        },
        sections: { added: 2, changed: 1, removed: 2, reordered: false },
      }),
    ).toEqual({
      changes: [
        "1 dish added.",
        "2 dishes changed.",
        "2 dishes moved to another section.",
        "1 dish taken off.",
        "2 sections added.",
        "1 section changed.",
        "2 sections taken off.",
      ],
    });
  });

  it("never leaves a changed menu with no line: the last sentence stands for what no other names", () => {
    expect(
      reviewWords(strings, { ...nothing, changed: true, other: true }),
    ).toEqual({ changes: ["Something else on this menu changed."] });
    // A review that says changed and counts nothing, which the compare
    // never makes, still reads as changed.
    expect(reviewWords(strings, { ...nothing, changed: true })).toEqual({
      changes: ["Something else on this menu changed."],
    });
  });
});

describe("the allergen lists not confirmed (D-224, D-166)", () => {
  const choices = en.owner.choices;
  const dinersRead = en.allergens.notConfirmed;
  const breadId = "1c3d5e7f-2222-4333-8444-555566667777";
  const friesId = "2d4e6f80-3333-4444-8555-666677778888";
  const listId = "3e5f7a91-4444-4555-8666-777788889999";
  const none: Unconfirmed = {
    dishes: [],
    options: [],
    holdsDishes: true,
    holdsOptions: false,
  };

  it("lists the dishes, then the options, each a link to the page where its check is, under a lead that says what the list is first", () => {
    expect(
      unconfirmedWords(
        strings,
        choices,
        {
          dishes: [{ id: breadId, name: "Garlic bread", section: "Starters" }],
          options: [
            {
              id: friesId,
              name: "Fries",
              listId,
              lead: "Choose one side",
              home: "Kids",
            },
          ],
          holdsDishes: true,
          holdsOptions: true,
        },
        dinersRead,
        code,
      ),
    ).toEqual({
      lead: 'Allergens are not confirmed for these yet. You can still publish. With each one, diners read: "Allergens not confirmed yet. Ask your server."',
      links: [
        {
          href: restaurantDishPagePath(code, breadId, "allergens"),
          text: "Garlic bread in Starters",
        },
        {
          href: restaurantChoiceListPath(code, listId),
          text: "Fries in Choose one side for Kids",
        },
      ],
    });
  });

  it("says every dish is confirmed, and every option too when the menu holds any", () => {
    expect(unconfirmedWords(strings, choices, none, dinersRead, code)).toEqual({
      sentence: "Every dish on this menu has its allergens confirmed.",
    });
    expect(
      unconfirmedWords(
        strings,
        choices,
        { ...none, holdsOptions: true },
        dinersRead,
        code,
      ),
    ).toEqual({
      sentence:
        "Every dish and every option on this menu has its allergens confirmed.",
    });
  });

  it("never says all are confirmed for a menu with no dishes: zero of zero is not every dish (D-177)", () => {
    expect(
      unconfirmedWords(
        strings,
        choices,
        { ...none, holdsDishes: false },
        dinersRead,
        code,
      ),
    ).toEqual({ sentence: "This menu has no dishes yet." });
    expect(
      unconfirmedWords(
        strings,
        choices,
        { ...none, holdsDishes: false, holdsOptions: true },
        dinersRead,
        code,
      ),
    ).toEqual({ sentence: "This menu has no dishes yet." });
  });

  it("still lists an option not confirmed on a menu with no dishes", () => {
    const words = unconfirmedWords(
      strings,
      choices,
      {
        dishes: [],
        options: [
          {
            id: friesId,
            name: "Fries",
            listId,
            lead: "Choose one side",
            home: "Kids",
          },
        ],
        holdsDishes: false,
        holdsOptions: true,
      },
      dinersRead,
      code,
    );
    expect("links" in words && words.links.map((link) => link.text)).toEqual([
      "Fries in Choose one side for Kids",
    ]);
  });
});

describe("why a press did not land", () => {
  it("names the first blocker's dish and what to do", () => {
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", {
        kind: "blocked",
        blockers: [
          {
            kind: "size-unpriced",
            dishId: soupId,
            dish: "Soup of the day",
            section: "S",
          },
          { kind: "size-unnamed", dishId: soupId, dish: "Chili", section: "S" },
        ],
      }),
    ).toBe(
      "Dinner was not published. Soup of the day has a size with no price. Give it a price or remove it, then publish again.",
    );
  });

  it("says the menu changed since the page showed it, that nothing was published, and to reload (D-224)", () => {
    expect(
      refusedSentence(strings, editing, "Dinner", "publish", { kind: "moved" }),
    ).toBe(
      "Dinner changed since this page showed it, so nothing was published. Reload the page to read what changed, then publish again.",
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
