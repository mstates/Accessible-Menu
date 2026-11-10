import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  reviewMenu,
  unconfirmedIn,
  type MenuReview,
  type PublishedSide,
} from "../../src/domain/menu-review";
import {
  menuDraftSchema,
  menuSnapshotSchema,
  type MenuDraft,
  type MenuSnapshot,
} from "../../src/domain/snapshot";
import { reviewWords } from "../../src/features/owner/publishing-words";

// The review before Publish (D-224, Q-150), on CI Diner's Dinner as
// publish_menu() wrote it (the snapshot fixture): three sections; Starters
// with its roll list, the soup by size, the salad with its dressing list,
// and the bread; Mains with a second soup; Desserts with nothing.
//
// Michael's rule, both ways: a changed menu whose review says nothing
// changed must be impossible, and so must an unchanged menu whose review
// names a change. Every case here goes through `read`, which holds the
// review's `changed` to the documents' own deep inequality, the value
// menu_publish_states() compares, and holds the words to it: a list of
// changes exactly when changed, one sentence exactly when not.

const strings = en.owner.publishing;
const fixture: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../fixtures/menu-snapshot.v1.json", import.meta.url),
    ),
    "utf8",
  ),
);

function dinner(): MenuSnapshot {
  return menuSnapshotSchema.parse(fixture);
}

type Since = Extract<MenuReview, { kind: "since" }>;
type Section = MenuDraft["sections"][number];
type Dish = Section["items"][number];

// The draft after one edit to a copy of what is published.
function edited(change: (draft: MenuDraft) => void): MenuDraft {
  const draft: MenuDraft = structuredClone(dinner());
  change(draft);
  return draft;
}

function section(document: MenuDraft, name: string): Section {
  const found = document.sections.find((entry) => entry.name === name);
  if (!found) throw new Error(`no section ${name}`);
  return found;
}

function dish(document: MenuDraft, sectionName: string, name: string): Dish {
  const found = section(document, sectionName).items.find(
    (entry) => entry.name === name,
  );
  if (!found) throw new Error(`no dish ${name} in ${sectionName}`);
  return found;
}

function at<T>(list: readonly T[], index: number): T {
  const found = list[index];
  if (found === undefined) throw new Error(`nothing at ${index}`);
  return found;
}

// The review of a draft against a published document, with the rule held
// both ways on the way out.
function read(
  draft: MenuDraft,
  published: MenuSnapshot = dinner(),
): { review: Since; changes: string[] } {
  const review = reviewMenu(draft, published);
  if (review.kind !== "since") throw new Error("a published menu's review");
  expect(review.changed, "changed is the documents' own deep inequality").toBe(
    !isDeepStrictEqual(draft, published),
  );
  const words = reviewWords(strings, review);
  expect(
    "changes" in words,
    "the words list changes exactly when the menu changed",
  ).toBe(review.changed);
  if ("changes" in words) {
    expect(words.changes.length).toBeGreaterThan(0);
    return { review, changes: words.changes };
  }
  expect(words.sentence).toBe(strings.review.none);
  return { review, changes: [] };
}

const quiet = {
  dishes: { added: 0, changed: 0, moved: 0, removed: 0, reordered: false },
  sections: { added: 0, changed: 0, removed: 0, reordered: false },
};

// The counts and flags of a review, with what the case expects over none.
function counts(
  expected: {
    menuRenamed?: boolean;
    dishes?: Partial<Since["dishes"]>;
    sections?: Partial<Since["sections"]>;
  } = {},
) {
  return {
    kind: "since",
    changed: true,
    menuRenamed: expected.menuRenamed ?? false,
    dishes: { ...quiet.dishes, ...expected.dishes },
    sections: { ...quiet.sections, ...expected.sections },
    other: false,
  };
}

// The same document with every object's keys in the opposite order.
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

describe("a menu with nothing changed", () => {
  it("reads as unchanged, with no line, when the draft is what was published", () => {
    const { review, changes } = read(edited(() => {}));
    expect(review).toEqual({
      kind: "since",
      changed: false,
      menuRenamed: false,
      ...quiet,
      other: false,
    });
    expect(changes).toEqual([]);
  });

  it("reads as unchanged whatever order the keys arrive in, as jsonb compares", () => {
    // The reader hands its keys back in its own order, so the document is
    // compared as it arrived.
    const draft = shuffled(fixture) as MenuDraft;
    expect(menuDraftSchema.safeParse(draft).success).toBe(true);
    expect(Object.keys(draft)).not.toEqual(Object.keys(dinner()));
    expect(read(draft).review.changed).toBe(false);
  });

  it("parses the fixture as a draft too: every published snapshot is a draft", () => {
    expect(menuDraftSchema.safeParse(fixture).success).toBe(true);
  });
});

describe("every leaf of the published document, changed in turn", () => {
  type Path = (string | number)[];

  // Every scalar in the document, by its path, but the shape's version,
  // which the reader holds to 1 on both sides.
  function leaves(value: unknown, path: Path = []): Path[] {
    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => leaves(entry, [...path, index]));
    }
    if (value !== null && typeof value === "object") {
      return Object.entries(value).flatMap(([key, entry]) =>
        leaves(entry, [...path, key]),
      );
    }
    return path.length === 1 && path[0] === "v" ? [] : [path];
  }

  // Another value for a leaf: a fresh id for an id, never one the document
  // already holds, and otherwise a different value of the leaf's own kind.
  function other(key: string | number | undefined, value: unknown): unknown {
    if (key === "id") return randomUUID();
    if (typeof value === "string") return `${value} changed`;
    if (typeof value === "number") return value + 1;
    if (typeof value === "boolean") return !value;
    return "set";
  }

  function withLeaf(path: Path): MenuDraft {
    const draft = structuredClone(fixture) as Record<string, unknown>;
    let node: Record<string | number, unknown> = draft;
    for (const key of path.slice(0, -1)) {
      node = node[key] as Record<string | number, unknown>;
    }
    const last = path[path.length - 1];
    if (last === undefined) throw new Error("a leaf has a path");
    node[last] = other(last, node[last]);
    return draft as unknown as MenuDraft;
  }

  const paths = leaves(fixture);

  it("finds the document's leaves", () => {
    expect(paths.length).toBeGreaterThan(80);
    expect(paths.some((path) => path.join(".") === "menu.name")).toBe(true);
    expect(paths.some((path) => path.includes("options"))).toBe(true);
    expect(paths.some((path) => path.includes("sizes"))).toBe(true);
  });

  it.each(paths.map((path) => [path.join("."), path] as const))(
    "%s changed is named by a rule's line, never left to the last one",
    (_name, path) => {
      const { review, changes } = read(withLeaf(path));
      expect(review.changed).toBe(true);
      expect(review.other, "a rule fired").toBe(false);
      expect(changes).not.toContain(strings.review.other);
    },
  );
});

describe("each way a draft can differ, by its own line", () => {
  it("the menu's name", () => {
    const { review, changes } = read(
      edited((draft) => {
        draft.menu.name = "Supper";
      }),
    );
    expect(review).toEqual(counts({ menuRenamed: true }));
    expect(changes).toEqual(["The menu's name changed."]);
  });

  it("a section's name, and its note", () => {
    const renamed = read(
      edited((draft) => {
        section(draft, "Mains").name = "Entrees";
      }),
    );
    expect(renamed.review).toEqual(counts({ sections: { changed: 1 } }));
    expect(renamed.changes).toEqual(["1 section changed."]);
    const noted = read(
      edited((draft) => {
        section(draft, "Desserts").note = "Made here every morning.";
      }),
    );
    expect(noted.review).toEqual(counts({ sections: { changed: 1 } }));
  });

  it("a section's choice lists: a lead, an option, an option taken away, a list added", () => {
    const lead = read(
      edited((draft) => {
        at(section(draft, "Starters").choice_lists, 0).lead = "Add a roll";
      }),
    );
    expect(lead.review).toEqual(counts({ sections: { changed: 1 } }));
    const option = read(
      edited((draft) => {
        const roll = at(
          at(section(draft, "Starters").choice_lists, 0).options,
          0,
        );
        roll.added_price_cents = 250;
      }),
    );
    expect(option.review).toEqual(counts({ sections: { changed: 1 } }));
    const unchecked = read(
      edited((draft) => {
        at(
          at(section(draft, "Starters").choice_lists, 0).options,
          0,
        ).allergens = { checked: false };
      }),
    );
    expect(unchecked.review).toEqual(counts({ sections: { changed: 1 } }));
    const added = read(
      edited((draft) => {
        const lists = section(draft, "Mains").choice_lists;
        lists.push({
          ...structuredClone(at(section(draft, "Starters").choice_lists, 0)),
          id: randomUUID(),
        });
      }),
    );
    expect(added.review).toEqual(counts({ sections: { changed: 1 } }));
  });

  it("the order of a section's lists, and of a list's options", () => {
    // Two lists on Starters in what is published, swapped in the draft.
    const published = dinner();
    const lists = section(published, "Starters").choice_lists;
    lists.push({
      ...structuredClone(at(lists, 0)),
      id: randomUUID(),
      lead: "Add a side salad",
    });
    const swapped = structuredClone(published) as MenuDraft;
    section(swapped, "Starters").choice_lists.reverse();
    expect(read(swapped, published).review).toEqual(
      counts({ sections: { changed: 1 } }),
    );
    // The dressing list's two options, swapped: the dish's own content.
    const options = read(
      edited((draft) => {
        at(
          dish(draft, "Starters", "House salad").choice_lists,
          0,
        ).options.reverse();
      }),
    );
    expect(options.review).toEqual(counts({ dishes: { changed: 1 } }));
    expect(options.changes).toEqual(["1 dish changed."]);
  });

  it("a section added with a dish, and a section taken off with its dish", () => {
    const added = read(
      edited((draft) => {
        draft.sections.push({
          id: randomUUID(),
          name: "Sides",
          note: null,
          choice_lists: [],
          items: [
            {
              ...structuredClone(dish(draft, "Starters", "Garlic bread")),
              id: randomUUID(),
              name: "Fries",
            },
          ],
        });
      }),
    );
    expect(added.review).toEqual(
      counts({ dishes: { added: 1 }, sections: { added: 1 } }),
    );
    expect(added.changes).toEqual(["1 dish added.", "1 section added."]);
    const removed = read(
      edited((draft) => {
        draft.sections = draft.sections.filter(
          (entry) => entry.name !== "Mains",
        );
      }),
    );
    expect(removed.review).toEqual(
      counts({ dishes: { removed: 1 }, sections: { removed: 1 } }),
    );
    expect(removed.changes).toEqual([
      "1 dish taken off.",
      "1 section taken off.",
    ]);
  });

  it("the order of sections, alone", () => {
    const { review, changes } = read(
      edited((draft) => {
        draft.sections.reverse();
      }),
    );
    expect(review).toEqual(counts({ sections: { reordered: true } }));
    expect(changes).toEqual(["The order of sections changed."]);
  });

  it("a dish added, and a dish taken off, with no order line for the dishes left", () => {
    const added = read(
      edited((draft) => {
        section(draft, "Desserts").items.push({
          ...structuredClone(dish(draft, "Starters", "House salad")),
          id: randomUUID(),
          name: "Pie",
          choice_lists: [],
        });
      }),
    );
    expect(added.review).toEqual(counts({ dishes: { added: 1 } }));
    expect(added.changes).toEqual(["1 dish added."]);
    // Taken from the middle of Starters: the two left keep their order.
    const removed = read(
      edited((draft) => {
        const starters = section(draft, "Starters");
        starters.items = starters.items.filter(
          (entry) => entry.name !== "House salad",
        );
      }),
    );
    expect(removed.review).toEqual(counts({ dishes: { removed: 1 } }));
    expect(removed.changes).toEqual(["1 dish taken off."]);
  });

  const dishEdits: [string, (draft: MenuDraft) => void][] = [
    [
      "its name",
      (draft) => {
        dish(draft, "Starters", "Garlic bread").name = "Garlic toast";
      },
    ],
    [
      "its description",
      (draft) => {
        dish(draft, "Starters", "Garlic bread").description = "With butter.";
      },
    ],
    [
      "its note",
      (draft) => {
        dish(draft, "Starters", "Garlic bread").note = "Ask for extra.";
      },
    ],
    [
      "its one price",
      (draft) => {
        const price = dish(draft, "Starters", "House salad").price;
        if (price.kind !== "one") throw new Error("the salad has one price");
        price.price_cents = 1000;
      },
    ],
    [
      "its price choice",
      (draft) => {
        dish(draft, "Starters", "House salad").price = {
          kind: "market",
          calories_low: null,
          calories_high: null,
        };
      },
    ],
    [
      "a size's price",
      (draft) => {
        const price = dish(draft, "Starters", "Soup of the day").price;
        if (price.kind !== "sizes") throw new Error("the soup is by size");
        at(price.sizes, 0).price_cents = 550;
      },
    ],
    [
      "a size taken away",
      (draft) => {
        const price = dish(draft, "Starters", "Soup of the day").price;
        if (price.kind !== "sizes") throw new Error("the soup is by size");
        price.sizes.pop();
      },
    ],
    [
      "a size with no name yet, which only a draft can hold (D-139)",
      (draft) => {
        const price = dish(draft, "Starters", "Soup of the day").price;
        if (price.kind !== "sizes") throw new Error("the soup is by size");
        price.sizes.push({
          id: randomUUID(),
          name: null,
          price_cents: null,
          calories_low: null,
          calories_high: null,
        });
      },
    ],
    [
      "its calories",
      (draft) => {
        const price = dish(draft, "Starters", "House salad").price;
        if (price.kind !== "one") throw new Error("the salad has one price");
        price.calories_low = 300;
      },
    ],
    [
      "its Cooked to order mark",
      (draft) => {
        const bread = dish(draft, "Starters", "Garlic bread");
        bread.cooked_to_order = !bread.cooked_to_order;
      },
    ],
    [
      "its dietary tags",
      (draft) => {
        dish(draft, "Starters", "House salad").dietary_tags = ["vegan"];
      },
    ],
    [
      "its allergens confirmed",
      (draft) => {
        dish(draft, "Starters", "Garlic bread").allergens = {
          checked: true,
          major: ["wheat", "milk"],
          other: [],
        };
      },
    ],
    [
      "its allergen check cleared",
      (draft) => {
        dish(draft, "Starters", "House salad").allergens = { checked: false };
      },
    ],
    [
      "its own choice list's lead",
      (draft) => {
        at(dish(draft, "Starters", "House salad").choice_lists, 0).lead =
          "Pick a dressing";
      },
    ],
    [
      "an option of its own list",
      (draft) => {
        at(
          at(dish(draft, "Starters", "House salad").choice_lists, 0).options,
          0,
        ).name = "Buttermilk ranch";
      },
    ],
  ];

  it.each(dishEdits)("a dish changed in %s", (_what, change) => {
    const { review, changes } = read(edited(change));
    expect(review).toEqual(counts({ dishes: { changed: 1 } }));
    expect(changes).toEqual(["1 dish changed."]);
  });

  it("a draft with a size that has no name parses as a draft and never as a published snapshot", () => {
    const draft = edited((document) => {
      const price = dish(document, "Starters", "Soup of the day").price;
      if (price.kind !== "sizes") throw new Error("the soup is by size");
      at(price.sizes, 0).name = null;
    });
    expect(menuDraftSchema.safeParse(draft).success).toBe(true);
    expect(menuSnapshotSchema.safeParse(draft).success).toBe(false);
  });

  it("a dish moved to another section, with nothing else said", () => {
    const { review, changes } = read(
      edited((draft) => {
        const starters = section(draft, "Starters");
        const bread = dish(draft, "Starters", "Garlic bread");
        starters.items = starters.items.filter((entry) => entry !== bread);
        section(draft, "Desserts").items.push(bread);
      }),
    );
    expect(review).toEqual(counts({ dishes: { moved: 1 } }));
    expect(changes).toEqual(["1 dish moved to another section."]);
  });

  it("a dish moved and changed, counted in both lines", () => {
    const { review, changes } = read(
      edited((draft) => {
        const starters = section(draft, "Starters");
        const bread = dish(draft, "Starters", "Garlic bread");
        starters.items = starters.items.filter((entry) => entry !== bread);
        bread.name = "Garlic toast";
        section(draft, "Mains").items.push(bread);
      }),
    );
    expect(review).toEqual(counts({ dishes: { changed: 1, moved: 1 } }));
    expect(changes).toEqual([
      "1 dish changed.",
      "1 dish moved to another section.",
    ]);
  });

  it("the order of a section's dishes, alone", () => {
    const { review, changes } = read(
      edited((draft) => {
        section(draft, "Starters").items.reverse();
      }),
    );
    expect(review).toEqual(counts({ dishes: { reordered: true } }));
    expect(changes).toEqual(["The order of dishes changed."]);
  });

  it("several edits at once, each counted exactly", () => {
    const { review, changes } = read(
      edited((draft) => {
        draft.menu.name = "Supper";
        const starters = section(draft, "Starters");
        const template = dish(draft, "Starters", "Garlic bread");
        // Two added in Desserts, the salad taken off, the soup changed,
        // Mains renamed, and the sections turned round.
        section(draft, "Desserts").items.push(
          { ...structuredClone(template), id: randomUUID(), name: "Pie" },
          { ...structuredClone(template), id: randomUUID(), name: "Cake" },
        );
        starters.items = starters.items.filter(
          (entry) => entry.name !== "House salad",
        );
        dish(draft, "Starters", "Soup of the day").note = "Ask what it is.";
        section(draft, "Mains").name = "Entrees";
        draft.sections.reverse();
      }),
    );
    expect(review).toEqual(
      counts({
        menuRenamed: true,
        dishes: { added: 2, changed: 1, removed: 1 },
        sections: { changed: 1, reordered: true },
      }),
    );
    expect(changes).toEqual([
      "2 dishes added.",
      "1 dish changed.",
      "1 dish taken off.",
      "1 section changed.",
      "The order of sections changed.",
      "The menu's name changed.",
    ]);
  });
});

describe("a menu that is not published", () => {
  it("has nothing to compare with: the review counts what a first Publish shows", () => {
    expect(reviewMenu(dinner(), null)).toEqual({
      kind: "first",
      sections: 3,
      dishes: 4,
    });
  });

  it("counts none for a menu with no sections, and none for sections with no dishes", () => {
    expect(
      reviewMenu(
        edited((draft) => {
          draft.sections = [];
        }),
        null,
      ),
    ).toEqual({ kind: "first", sections: 0, dishes: 0 });
    expect(
      reviewMenu(
        edited((draft) => {
          for (const entry of draft.sections) entry.items = [];
        }),
        null,
      ),
    ).toEqual({ kind: "first", sections: 3, dishes: 0 });
  });
});

describe("a document no rule can read", () => {
  // One section id twice, which no database makes: sections are rows by
  // their primary key. The rules look a section up by its id, so the first
  // of the two is never seen.
  function twice(firstName: string): MenuSnapshot {
    const document = dinner();
    const desserts = document.sections.find(
      (entry) => entry.name === "Desserts",
    );
    if (!desserts) throw new Error("no Desserts");
    document.sections = [
      { ...structuredClone(desserts), name: firstName },
      structuredClone(desserts),
    ];
    return document;
  }

  it("still reads as changed, by the last line, when two such documents differ", () => {
    const { review, changes } = read(twice("Desserts"), twice("Sweets"));
    expect(review).toEqual({ ...counts(), other: true });
    expect(changes).toEqual(["Something else on this menu changed."]);
  });

  it("reads as unchanged when two such documents are equal, since the compare comes first", () => {
    const { review, changes } = read(twice("Sweets"), twice("Sweets"));
    expect(review.changed).toBe(false);
    expect(changes).toEqual([]);
  });

  it("reads a published document the v1 reader refuses as changed, with nothing counted and the last line alone", () => {
    const unreadable: PublishedSide = "unreadable";
    const review = reviewMenu(dinner(), unreadable);
    expect(review).toEqual({ ...counts(), other: true });
    expect(reviewWords(strings, review)).toEqual({
      changes: ["Something else on this menu changed."],
    });
  });
});

describe("the allergen lists not confirmed, from the draft (D-224, D-166)", () => {
  it("names the dishes not checked, in the menu's order, each with its section", () => {
    const found = unconfirmedIn(dinner());
    expect(
      found.dishes.map(({ name, section: where }) => `${name} in ${where}`),
    ).toEqual(["Garlic bread in Starters", "Soup of the day in Mains"]);
    expect(found.dishes.map((entry) => entry.id)).toEqual([
      dish(dinner(), "Starters", "Garlic bread").id,
      dish(dinner(), "Mains", "Soup of the day").id,
    ]);
    expect(found.options).toEqual([]);
    expect(found.holdsDishes).toBe(true);
    expect(found.holdsOptions).toBe(true);
  });

  it("names an option not checked with its list and the list's home, a section's before its dishes'", () => {
    const draft = edited((document) => {
      at(
        at(dish(document, "Starters", "House salad").choice_lists, 0).options,
        0,
      ).allergens = { checked: false };
      at(
        at(section(document, "Starters").choice_lists, 0).options,
        0,
      ).allergens = { checked: false };
    });
    const dressing = at(dish(draft, "Starters", "House salad").choice_lists, 0);
    const roll = at(section(draft, "Starters").choice_lists, 0);
    expect(unconfirmedIn(draft).options).toEqual([
      {
        id: at(roll.options, 0).id,
        name: "Buttered roll",
        listId: roll.id,
        lead: "Add a buttered roll to any dish",
        home: "Starters",
      },
      {
        id: at(dressing.options, 0).id,
        name: "Ranch",
        listId: dressing.id,
        lead: "Choose a dressing",
        home: "House salad",
      },
    ]);
  });

  it("says whether the draft holds any dish and any option, so nothing reads as all confirmed at zero (D-177)", () => {
    const empty = unconfirmedIn(
      edited((draft) => {
        draft.sections = [];
      }),
    );
    expect(empty).toEqual({
      dishes: [],
      options: [],
      holdsDishes: false,
      holdsOptions: false,
    });
    const noLists = unconfirmedIn(
      edited((draft) => {
        for (const entry of draft.sections) {
          entry.choice_lists = [];
          for (const item of entry.items) item.choice_lists = [];
        }
      }),
    );
    expect(noLists.holdsDishes).toBe(true);
    expect(noLists.holdsOptions).toBe(false);
  });
});
