import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  menuDraftSchema,
  menuSnapshotSchema,
  SNAPSHOT_NEVER_HOLDS,
  snapshotKeys,
  type MenuSnapshot,
} from "../../src/domain/snapshot";
import { menuSnapshot, publishProblems } from "../local/menu-snapshot.mjs";
import { seedStore } from "../local/standin-seed.mjs";

// The fixture is CI Diner's Dinner as publish_menu() wrote it on a
// throwaway Postgres 17 after ci_diner.sql (migration 12): three sections;
// Soup of the day checked with milk, wheat, and celery, by size with Cup
// and Bowl; House salad checked with none, at one price, with its dressing
// list; Garlic bread unchecked, at market price, off the menu, cooked to
// order; Starters' roll list; a second, unchecked Soup of the day in
// Mains; Desserts with nothing. What the schema accepts here is what the
// diner page will read.
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

function section(name: string) {
  const found = dinner().sections.find((s) => s.name === name);
  if (!found) throw new Error(`no section ${name}`);
  return found;
}

function dish(sectionName: string, name: string) {
  const found = section(sectionName).items.find((i) => i.name === name);
  if (!found) throw new Error(`no dish ${name} in ${sectionName}`);
  return found;
}

describe("the published snapshot (migration 12, D-82)", () => {
  it("parses the fixture publish_menu() wrote", () => {
    const menu = dinner();
    expect(menu.v).toBe(1);
    expect(menu.menu.name).toBe("Dinner");
    expect(menu.sections.map((s) => s.name)).toEqual([
      "Starters",
      "Mains",
      "Desserts",
    ]);
  });

  it("refuses another shape's version and any key it does not know", () => {
    expect(menuSnapshotSchema.safeParse({ ...dinner(), v: 2 }).success).toBe(
      false,
    );
    const extra = structuredClone(dinner()) as Record<string, unknown>;
    extra.published_at = "2026-10-12T00:00:00Z";
    expect(menuSnapshotSchema.safeParse(extra).success).toBe(false);
    const stamped = structuredClone(dinner());
    const first = stamped.sections[0]?.items[0] as Record<string, unknown>;
    first.allergens_reviewed_by = "someone";
    expect(menuSnapshotSchema.safeParse(stamped).success).toBe(false);
  });

  it("holds no key a diner never reads, no photo, and no state", () => {
    const keys = snapshotKeys(fixture);
    for (const never of SNAPSHOT_NEVER_HOLDS) {
      expect(keys.has(never), never).toBe(false);
    }
  });

  it("carries a checked list and nothing of an unchecked one, on dishes and on options", () => {
    expect(dish("Starters", "Soup of the day").allergens).toEqual({
      checked: true,
      major: ["milk", "wheat"],
      other: ["celery"],
    });
    expect(dish("Starters", "House salad").allergens).toEqual({
      checked: true,
      major: [],
      other: [],
    });
    expect(dish("Starters", "Garlic bread").allergens).toEqual({
      checked: false,
    });
    expect(dish("Mains", "Soup of the day").allergens).toEqual({
      checked: false,
    });
    const dressing = dish("Starters", "House salad").choice_lists[0];
    expect(dressing?.lead).toBe("Choose a dressing");
    expect(dressing?.options.map((o) => o.name)).toEqual([
      "Ranch",
      "Vinaigrette",
    ]);
    expect(dressing?.options[0]?.allergens).toEqual({
      checked: true,
      major: ["milk", "eggs"],
      other: [],
    });
  });

  it("carries the three price shapes, sizes in price order, and calories where the price is", () => {
    const soup = dish("Starters", "Soup of the day").price;
    expect(soup.kind).toBe("sizes");
    if (soup.kind !== "sizes") return;
    expect(
      soup.sizes.map((z) => [z.name, z.price_cents, z.calories_low]),
    ).toEqual([
      ["Cup", 500, 180],
      ["Bowl", 800, 290],
    ]);
    expect(dish("Starters", "House salad").price).toEqual({
      kind: "one",
      price_cents: 900,
      calories_low: 320,
      calories_high: null,
    });
    expect(dish("Starters", "Garlic bread").price).toEqual({
      kind: "market",
      calories_low: 410,
      calories_high: null,
    });
    expect(dish("Starters", "Garlic bread").cooked_to_order).toBe(true);
    expect(dish("Starters", "House salad").dietary_tags).toEqual([
      "vegetarian",
      "made-without-gluten",
    ]);
  });

  it("keeps a dish that is off the menu, since its state is read live, and a section with nothing", () => {
    expect(dish("Starters", "Garlic bread").name).toBe("Garlic bread");
    expect(section("Desserts").items).toEqual([]);
    expect(section("Desserts").choice_lists).toEqual([]);
  });

  it("carries a section's list with its option's price in cents", () => {
    const roll = section("Starters").choice_lists[0];
    expect(roll?.lead).toBe("Add a buttered roll to any dish");
    expect(roll?.options).toHaveLength(1);
    expect(roll?.options[0]?.added_price_cents).toBe(200);
  });

  it("allows a blank one price and a dish by size with no live size: no price shown either way (D-139)", () => {
    const blank = structuredClone(dinner());
    const salad = blank.sections[0]?.items.find(
      (i) => i.name === "House salad",
    );
    if (!salad || salad.price.kind !== "one") throw new Error("no salad");
    salad.price.price_cents = null;
    expect(menuSnapshotSchema.safeParse(blank).success).toBe(true);
    const none = structuredClone(dinner());
    const soup = none.sections[0]?.items.find(
      (i) => i.name === "Soup of the day",
    );
    if (!soup || soup.price.kind !== "sizes") throw new Error("no soup");
    soup.price.sizes = [];
    expect(menuSnapshotSchema.safeParse(none).success).toBe(true);
  });

  it("refuses a list with no option and a published size with no name or no price", () => {
    const empty = structuredClone(dinner());
    const salad = empty.sections[0]?.items.find(
      (i) => i.name === "House salad",
    );
    if (!salad) throw new Error("no salad");
    salad.choice_lists[0]!.options = [];
    expect(menuSnapshotSchema.safeParse(empty).success).toBe(false);
    const unnamed = structuredClone(dinner());
    const soup = unnamed.sections[0]?.items.find(
      (i) => i.name === "Soup of the day",
    );
    if (!soup || soup.price.kind !== "sizes") throw new Error("no soup");
    (soup.price.sizes[0] as Record<string, unknown>).name = null;
    expect(menuSnapshotSchema.safeParse(unnamed).success).toBe(false);
  });
});

// The draft as menu_snapshot() builds it for the review before Publish
// (D-224): the same v1 shape, but a size may have no name or no price yet
// (D-139), which is the one thing a published snapshot never holds.
describe("the draft's reader (D-224)", () => {
  function soupSizes(document: unknown): Record<string, unknown>[] {
    const sections = (document as MenuSnapshot).sections;
    const soup = sections[0]?.items.find((i) => i.name === "Soup of the day");
    if (!soup || soup.price.kind !== "sizes") throw new Error("no soup");
    return soup.price.sizes as Record<string, unknown>[];
  }

  it("reads everything a published snapshot holds", () => {
    expect(menuDraftSchema.parse(fixture)).toEqual(dinner());
  });

  it("takes a size with no name, a size with no price, and a size with neither", () => {
    for (const blank of [
      { name: null },
      { price_cents: null },
      { name: null, price_cents: null },
    ]) {
      const draft = structuredClone(fixture);
      Object.assign(soupSizes(draft)[0] ?? {}, blank);
      expect(
        menuDraftSchema.safeParse(draft).success,
        JSON.stringify(blank),
      ).toBe(true);
      expect(menuSnapshotSchema.safeParse(draft).success).toBe(false);
    }
  });

  it("refuses what the published reader refuses otherwise: another version, a key it does not know, a list with no option", () => {
    expect(
      menuDraftSchema.safeParse({ ...(fixture as object), v: 2 }).success,
    ).toBe(false);
    const extra = structuredClone(fixture) as Record<string, unknown>;
    extra.published_at = "2026-10-12T00:00:00Z";
    expect(menuDraftSchema.safeParse(extra).success).toBe(false);
    const stamped = structuredClone(fixture);
    (soupSizes(stamped)[0] ?? {}).updated_at = "2026-10-12T00:00:00Z";
    expect(menuDraftSchema.safeParse(stamped).success).toBe(false);
    const empty = structuredClone(dinner());
    const salad = empty.sections[0]?.items.find(
      (i) => i.name === "House salad",
    );
    if (!salad) throw new Error("no salad");
    salad.choice_lists[0]!.options = [];
    expect(menuDraftSchema.safeParse(empty).success).toBe(false);
  });
});

// The stand-in's builder (tests/local/menu-snapshot.mjs) writes the same
// shape over the stand-in's rows, which mirror CI Diner's, so the local
// checks press a Publish that means what the database's does.
describe("the stand-in's snapshot builder", () => {
  let clock = Date.parse("2026-10-04T12:00:00Z");
  const store = seedStore({
    restaurant: { id: "11111111-1111-4111-8111-111111111111" },
    user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    stamp: () => new Date((clock += 1000)).toISOString(),
  });
  const dinnerId = store.menus[1]?.id ?? "";

  it("builds a snapshot the one schema accepts, in the fixture's shape", () => {
    const built = menuSnapshotSchema.parse(menuSnapshot(store, dinnerId));
    expect(built.menu.name).toBe("Dinner");
    expect(built.sections.map((s) => s.name)).toEqual(
      dinner().sections.map((s) => s.name),
    );
    const starters = built.sections[0];
    expect(starters?.items.map((i) => i.name)).toEqual(
      section("Starters").items.map((i) => i.name),
    );
    expect(starters?.items.map((i) => i.price.kind)).toEqual(
      section("Starters").items.map((i) => i.price.kind),
    );
    expect(starters?.choice_lists.map((l) => l.lead)).toEqual(
      section("Starters").choice_lists.map((l) => l.lead),
    );
    const keys = snapshotKeys(built);
    for (const never of SNAPSHOT_NEVER_HOLDS) {
      expect(keys.has(never), never).toBe(false);
    }
  });

  it("reports nothing blocking the seed, and an unnamed or unpriced size once it is there", () => {
    expect(publishProblems(store, dinnerId)).toEqual([]);
    const soup = store.items[0];
    if (!soup) throw new Error("no soup");
    const blank = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      item_id: soup.id,
      restaurant_id: soup.restaurant_id,
      name: null,
      price_cents: 300,
      calories_low: null,
      calories_high: null,
      deleted_at: null,
      created_at: "2026-10-04T13:00:00.000Z",
    };
    const withBlank = { ...store, sizes: [...store.sizes, blank] };
    expect(publishProblems(withBlank, dinnerId)).toEqual([
      {
        problem: "size_unnamed",
        dish: soup.id,
        dish_name: "Soup of the day",
        section_name: "Starters",
        size: blank.id,
      },
    ]);
    const unpriced = { ...blank, name: "Mug", price_cents: null };
    expect(
      publishProblems(
        { ...store, sizes: [...store.sizes, unpriced] },
        dinnerId,
      ).map((row: { problem: string }) => row.problem),
    ).toEqual(["size_unpriced"]);
    expect(
      menuSnapshotSchema.safeParse(menuSnapshot(withBlank, dinnerId)).success,
      "a snapshot with a blank size is one the schema refuses, which is why Publish refuses first",
    ).toBe(false);
    expect(
      menuDraftSchema.safeParse(menuSnapshot(withBlank, dinnerId)).success,
      "the same document is a draft the review can read (D-224)",
    ).toBe(true);
  });

  it("reports a menu with no dishes once, by the menu, with no sections, a section with no dish, or only deleted dishes, and nothing for a dish off the menu or past its schedule (D-177)", () => {
    const noDishes = [
      {
        problem: "no_dishes",
        dish: null,
        dish_name: null,
        section_name: null,
        size: null,
      },
    ];
    const lunchId = store.menus[0]?.id ?? "";
    expect(store.menus[0]?.name).toBe("Lunch");
    expect(publishProblems(store, lunchId)).toEqual(noDishes);
    // A section with no dish is still no dish.
    const emptySection = {
      ...store,
      sections: [
        ...store.sections,
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          menu_id: lunchId,
          restaurant_id: store.sections[0]?.restaurant_id ?? "",
          name: "Boundary empty",
          sort: 1,
          note: null,
          deleted_at: null,
          created_at: "2026-10-15T12:00:00.000Z",
        },
      ],
    };
    expect(publishProblems(emptySection, lunchId)).toEqual(noDishes);
    // Dinner with every dish deleted reads the same, by the menu.
    const deleted = {
      ...store,
      items: store.items.map((dish) => ({
        ...dish,
        deleted_at: "2026-10-15T12:00:00.000Z",
      })),
    };
    expect(publishProblems(deleted, dinnerId)).toEqual(noDishes);
    // Availability and schedules are not read: the bread off the menu, and a
    // soup whose last day is past, still count as dishes.
    expect(publishProblems(store, dinnerId)).toEqual([]);
    const soup = store.items[0];
    const past = {
      ...store,
      items: store.items.map((dish) =>
        dish.id === soup?.id
          ? { ...dish, special_schedule: { until: "2026-01-01" } }
          : dish,
      ),
    };
    expect(publishProblems(past, dinnerId)).toEqual([]);
    // An empty menu's snapshot is still a shape the schema accepts, which is
    // why the refusal is Publish's and not the reader's.
    expect(
      menuSnapshotSchema.safeParse(menuSnapshot(store, lunchId)).success,
    ).toBe(true);
  });

  it("builds null for a menu that is missing or deleted", () => {
    expect(menuSnapshot(store, "nope")).toBeNull();
    const deleted = {
      ...store,
      menus: store.menus.map((m) =>
        m.id === dinnerId
          ? { ...m, deleted_at: "2026-10-04T13:00:00.000Z" }
          : m,
      ),
    };
    expect(menuSnapshot(deleted, dinnerId)).toBeNull();
  });
});
