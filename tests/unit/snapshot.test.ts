import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  menuSnapshotSchema,
  SNAPSHOT_NEVER_HOLDS,
  snapshotKeys,
  type MenuSnapshot,
} from "../../src/domain/snapshot";

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
