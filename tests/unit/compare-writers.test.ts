import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  renameOwnerOption,
  setOwnerChoiceListLead,
  setOwnerOptionCalories,
  setOwnerOptionPrice,
  writeOwnerOptionAllergens,
} from "../../src/core/supabase/choices";
import {
  renameOwnerDish,
  writeOwnerDishAllergens,
  writeOwnerDishShowing,
  writeOwnerDishTagsPage,
} from "../../src/core/supabase/dishes";
import { renameOwnerMenu } from "../../src/core/supabase/menus";
import {
  updateOwnerRestaurant,
  type RestaurantShown,
} from "../../src/core/supabase/restaurants";
import { setOwnerSectionText } from "../../src/core/supabase/sections";

// D-237, rule 2: every write names what its page showed in its own
// statement. These pin the exact filters each changed writer sends, with
// the Supabase client stood in, and what a write that matched no row comes
// back as. What PostgREST does with a filter is proved against the real
// thing, not here.

const restaurant = "11111111-1111-4111-8111-111111111111";
const menu = "22222222-2222-4222-8222-222222222222";
const section = "33333333-3333-4333-8333-333333333333";
const dish = "44444444-4444-4444-8444-444444444444";
const list = "55555555-5555-4555-8555-555555555555";
const option = "66666666-6666-4666-8666-666666666666";
const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Answer = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

// A client that answers each statement in turn, the write first and then
// the read a miss makes, and keeps what each was asked.
function standIn(...answers: Answer[]) {
  const asked: unknown[][] = [];
  let next = 0;
  const builder = {
    update: (values: unknown) => {
      asked.push(["update", values]);
      return builder;
    },
    select: (columns: string) => {
      asked.push(["select", columns]);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      asked.push(["eq", column, value]);
      return builder;
    },
    is: (column: string, value: unknown) => {
      asked.push(["is", column, value]);
      return builder;
    },
    maybeSingle: () => {
      const answer = answers[next] ?? { data: null, error: null };
      next += 1;
      return Promise.resolve(answer);
    },
  };
  const client = {
    from: (table: string) => {
      asked.push(["from", table]);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, asked };
}

const row = (data: unknown): Answer => ({ data, error: null });
const nothing: Answer = { data: null, error: null };

// The filters of the first statement, the write: everything it was asked
// between its update and its select.
function writeFilters(asked: unknown[][]): unknown[][] {
  const start = asked.findIndex(([what]) => what === "update");
  const end = asked.findIndex(
    ([what], index) => index > start && what === "select",
  );
  return asked.slice(start + 1, end);
}

describe("a menu's name", () => {
  const menuRow = (name: string) => ({
    id: menu,
    name,
    sort: 1,
    published: false,
  });

  it("is written against the name the page showed, in the one statement", async () => {
    const { client, asked } = standIn(row(menuRow("Supper")));
    const result = await renameOwnerMenu(
      client,
      restaurant,
      menu,
      "Supper",
      "Dinner",
    );
    expect(result).toEqual({ ok: true, value: { id: menu, name: "Supper" } });
    expect(asked).toEqual([
      ["from", "menus"],
      ["update", { name: "Supper" }],
      ["eq", "id", menu],
      ["eq", "restaurant_id", restaurant],
      ["is", "deleted_at", null],
      ["eq", "name", "Dinner"],
      ["select", "id, name, sort, published"],
    ]);
  });

  it("hands the shown name back as it stands, outer spaces and all", async () => {
    const { client, asked } = standIn(row(menuRow("Supper")));
    await renameOwnerMenu(client, restaurant, menu, "Supper", " Dinner ");
    expect(writeFilters(asked)).toContainEqual(["eq", "name", " Dinner "]);
  });

  it("is moved when the menu holds another name, and reads the menu once more without the compare to say so", async () => {
    const { client, asked } = standIn(nothing, row(menuRow("Brunch")));
    expect(
      await renameOwnerMenu(client, restaurant, menu, "Supper", "Dinner"),
    ).toEqual({ ok: false, error: { kind: "moved" } });
    expect(asked.slice(7)).toEqual([
      ["from", "menus"],
      ["select", "id, name, sort, published"],
      ["eq", "id", menu],
      ["eq", "restaurant_id", restaurant],
      ["is", "deleted_at", null],
    ]);
  });

  it("is not found when the menu is gone, never moved", async () => {
    const { client } = standIn(nothing, nothing);
    expect(
      await renameOwnerMenu(client, restaurant, menu, "Supper", "Dinner"),
    ).toEqual({ ok: false, error: { kind: "not-found" } });
  });

  it("has landed when the menu already holds the name this write would set: a retry whose first try landed", async () => {
    const { client } = standIn(nothing, row(menuRow("Supper")));
    expect(
      await renameOwnerMenu(client, restaurant, menu, "Supper", "Dinner"),
    ).toEqual({ ok: true, value: { id: menu, name: "Supper" } });
  });

  it("is failed when the read after a miss fails", async () => {
    const { client } = standIn(nothing, {
      data: null,
      error: { message: "down" },
    });
    expect(
      await renameOwnerMenu(client, restaurant, menu, "Supper", "Dinner"),
    ).toEqual({ ok: false, error: { kind: "failed" } });
  });
});

describe("a section's name and note", () => {
  const sectionRow = (name: string, note: string | null) => ({
    id: section,
    name,
    note,
    sort: 1,
  });

  it("writes the name against the name shown", async () => {
    const { client, asked } = standIn(row(sectionRow("Soups", null)));
    await setOwnerSectionText(
      client,
      menu,
      section,
      "name",
      "Soups",
      "Starters",
    );
    expect(asked.slice(0, 6)).toEqual([
      ["from", "sections"],
      ["update", { name: "Soups" }],
      ["eq", "id", section],
      ["eq", "menu_id", menu],
      ["is", "deleted_at", null],
      ["eq", "name", "Starters"],
    ]);
  });

  it("compares a note shown as blank as null, the only blank the table holds, and stores a blank note as null", async () => {
    const { client, asked } = standIn(row(sectionRow("Soups", "Ask us.")));
    await setOwnerSectionText(client, menu, section, "note", "Ask us.", "");
    expect(writeFilters(asked)).toContainEqual(["is", "note", null]);

    const cleared = standIn(row(sectionRow("Soups", null)));
    await setOwnerSectionText(
      cleared.client,
      menu,
      section,
      "note",
      "",
      "Ask us.",
    );
    expect(cleared.asked[1]).toEqual(["update", { note: null }]);
    expect(writeFilters(cleared.asked)).toContainEqual([
      "eq",
      "note",
      "Ask us.",
    ]);
  });

  it("hands a note's line breaks and outer spaces back as they were read", async () => {
    const { client, asked } = standIn(row(sectionRow("Soups", "new")));
    await setOwnerSectionText(
      client,
      menu,
      section,
      "note",
      "new",
      "\n one\ntwo \n",
    );
    expect(writeFilters(asked)).toContainEqual([
      "eq",
      "note",
      "\n one\ntwo \n",
    ]);
  });

  it("is moved, not found, or landed by one more read", async () => {
    const moved = standIn(
      nothing,
      row(sectionRow("Soups", "Changed elsewhere.")),
    );
    expect(
      await setOwnerSectionText(
        moved.client,
        menu,
        section,
        "note",
        "Mine.",
        "",
      ),
    ).toEqual({ ok: false, error: { kind: "moved" } });

    const gone = standIn(nothing, nothing);
    expect(
      await setOwnerSectionText(
        gone.client,
        menu,
        section,
        "note",
        "Mine.",
        "",
      ),
    ).toEqual({ ok: false, error: { kind: "not-found" } });

    const landed = standIn(nothing, row(sectionRow("Soups", "Mine.")));
    expect(
      await setOwnerSectionText(
        landed.client,
        menu,
        section,
        "note",
        "Mine.",
        "",
      ),
    ).toEqual({
      ok: true,
      value: { id: section, name: "Soups", note: "Mine." },
    });

    // A note cleared by a save whose answer was lost: null already.
    const cleared = standIn(nothing, row(sectionRow("Soups", null)));
    expect(
      await setOwnerSectionText(
        cleared.client,
        menu,
        section,
        "note",
        "",
        "Old.",
      ),
    ).toEqual({ ok: true, value: { id: section, name: "Soups", note: "" } });
  });
});

describe("a dish's name", () => {
  it("is written against the name shown, and a miss is read once more", async () => {
    const { client, asked } = standIn(
      row({ id: dish, name: "Chowder", sort: 1 }),
    );
    await renameOwnerDish(client, section, dish, "Chowder", "Soup");
    expect(asked.slice(0, 6)).toEqual([
      ["from", "items"],
      ["update", { name: "Chowder" }],
      ["eq", "id", dish],
      ["eq", "section_id", section],
      ["is", "deleted_at", null],
      ["eq", "name", "Soup"],
    ]);

    const moved = standIn(nothing, row({ id: dish, name: "Bisque", sort: 1 }));
    expect(
      await renameOwnerDish(moved.client, section, dish, "Chowder", "Soup"),
    ).toEqual({ ok: false, error: { kind: "moved" } });
    const gone = standIn(nothing, nothing);
    expect(
      await renameOwnerDish(gone.client, section, dish, "Chowder", "Soup"),
    ).toEqual({ ok: false, error: { kind: "not-found" } });
  });
});

describe("a choice list's lead", () => {
  const listRow = (lead: string) => ({
    id: list,
    item_id: dish,
    section_id: null,
    lead,
    sort: 1,
  });

  it("is written against the lead shown, under the home the page read it in", async () => {
    const { client, asked } = standIn(row(listRow("Pick a side")));
    await setOwnerChoiceListLead(
      client,
      { kind: "dish", id: dish },
      list,
      "Pick a side",
      "Choose a side",
    );
    expect(asked.slice(0, 6)).toEqual([
      ["from", "choice_lists"],
      ["update", { lead: "Pick a side" }],
      ["eq", "id", list],
      ["eq", "item_id", dish],
      ["is", "deleted_at", null],
      ["eq", "lead", "Choose a side"],
    ]);
  });

  it("is moved, not found, or landed by one more read", async () => {
    const home = { kind: "dish" as const, id: dish };
    const moved = standIn(nothing, row(listRow("Changed elsewhere")));
    expect(
      await setOwnerChoiceListLead(moved.client, home, list, "Mine", "Old"),
    ).toEqual({ ok: false, error: { kind: "moved" } });
    const gone = standIn(nothing, nothing);
    expect(
      await setOwnerChoiceListLead(gone.client, home, list, "Mine", "Old"),
    ).toEqual({ ok: false, error: { kind: "not-found" } });
    const landed = standIn(nothing, row(listRow("Mine")));
    expect(
      await setOwnerChoiceListLead(landed.client, home, list, "Mine", "Old"),
    ).toEqual({ ok: true, value: { id: list, lead: "Mine", options: 0 } });
  });
});

describe("an option's name, added price, and calories", () => {
  const optionRow = (over: Record<string, unknown> = {}) => ({
    id: option,
    choice_list_id: list,
    name: "Ranch",
    added_price_cents: null,
    calories_low: null,
    calories_high: null,
    allergens: [],
    custom_allergens: [],
    allergens_reviewed: false,
    allergens_reviewed_by: null,
    allergens_reviewed_at: null,
    sort: 1,
    ...over,
  });

  it("writes the name against the name shown", async () => {
    const { client, asked } = standIn(row(optionRow({ name: "Blue cheese" })));
    await renameOwnerOption(
      client,
      list,
      option,
      viewer,
      "Blue cheese",
      "Ranch",
    );
    expect(asked.slice(0, 6)).toEqual([
      ["from", "choice_options"],
      ["update", { name: "Blue cheese" }],
      ["eq", "id", option],
      ["eq", "choice_list_id", list],
      ["is", "deleted_at", null],
      ["eq", "name", "Ranch"],
    ]);
  });

  it("writes the added price against the cents shown: none as null, and a free option's zero as zero", async () => {
    const none = standIn(row(optionRow({ added_price_cents: 150 })));
    await setOwnerOptionPrice(none.client, list, option, 150, null);
    expect(writeFilters(none.asked)).toContainEqual([
      "is",
      "added_price_cents",
      null,
    ]);

    const free = standIn(row(optionRow({ added_price_cents: 150 })));
    await setOwnerOptionPrice(free.client, list, option, 150, 0);
    expect(writeFilters(free.asked)).toContainEqual([
      "eq",
      "added_price_cents",
      0,
    ]);
    expect(writeFilters(free.asked)).not.toContainEqual([
      "is",
      "added_price_cents",
      null,
    ]);
  });

  it("writes the calories against the two stored numbers, never the text: a stored 250 and 250 is compared as that pair", async () => {
    const pair = standIn(row(optionRow({ calories_low: 300 })));
    await setOwnerOptionCalories(
      pair.client,
      list,
      option,
      { low: 300, high: null },
      { low: 250, high: 250 },
    );
    expect(pair.asked[1]).toEqual([
      "update",
      { calories_low: 300, calories_high: null },
    ]);
    expect(writeFilters(pair.asked).slice(3)).toEqual([
      ["eq", "calories_low", 250],
      ["eq", "calories_high", 250],
    ]);

    const single = standIn(row(optionRow()));
    await setOwnerOptionCalories(single.client, list, option, null, {
      low: 250,
      high: null,
    });
    expect(writeFilters(single.asked).slice(3)).toEqual([
      ["eq", "calories_low", 250],
      ["is", "calories_high", null],
    ]);
  });

  it("is moved, not found, or landed by one more read, on the columns the write sets", async () => {
    const moved = standIn(nothing, row(optionRow({ added_price_cents: 300 })));
    expect(
      await setOwnerOptionPrice(moved.client, list, option, 150, null),
    ).toEqual({ ok: false, error: { kind: "moved" } });

    const gone = standIn(nothing, nothing);
    expect(
      await setOwnerOptionPrice(gone.client, list, option, 150, null),
    ).toEqual({ ok: false, error: { kind: "not-found" } });

    const landed = standIn(nothing, row(optionRow({ added_price_cents: 150 })));
    const result = await setOwnerOptionPrice(
      landed.client,
      list,
      option,
      150,
      null,
    );
    expect(result.ok && result.value.priceCents).toBe(150);

    // Calories land only when both columns are the ones the write sets.
    const half = standIn(
      nothing,
      row(optionRow({ calories_low: 300, calories_high: 400 })),
    );
    expect(
      await setOwnerOptionCalories(
        half.client,
        list,
        option,
        { low: 300, high: null },
        { low: 250, high: null },
      ),
    ).toEqual({ ok: false, error: { kind: "moved" } });
  });

  it("hands the page the stored numbers beside the texts its fields show", async () => {
    const { client } = standIn(
      row(
        optionRow({
          added_price_cents: 0,
          calories_low: 250,
          calories_high: 250,
        }),
      ),
    );
    const result = await renameOwnerOption(
      client,
      list,
      option,
      viewer,
      "Ranch",
      "Ranch",
    );
    expect(result.ok && result.value).toMatchObject({
      price: "0.00",
      calories: "250",
      priceCents: 0,
      caloriesLow: 250,
      caloriesHigh: 250,
    });
  });
});

describe("a dish's Dietary tags page", () => {
  it("is written against the tags as they were read, in their stored order, and the Cooked to order mark", async () => {
    const { client, asked } = standIn(nothing);
    await writeOwnerDishTagsPage(
      client,
      section,
      dish,
      viewer,
      { dietary_tags: ["vegan", "vegetarian"], cooked_to_order: true },
      { tags: ["vegetarian", "vegan"], cookedToOrder: false },
    );
    expect(asked.slice(0, 7)).toEqual([
      ["from", "items"],
      [
        "update",
        { dietary_tags: ["vegan", "vegetarian"], cooked_to_order: true },
      ],
      ["eq", "id", dish],
      ["eq", "section_id", section],
      ["is", "deleted_at", null],
      ["eq", "dietary_tags", '{"vegetarian","vegan"}'],
      ["eq", "cooked_to_order", false],
    ]);
  });
});

describe("a dish's Availability page", () => {
  const mark = "2026-11-15T17:03:21.123456+00:00";

  it("is written against the schedule, the flag, and the mark as the text it was read as", async () => {
    const { client, asked } = standIn(nothing);
    await writeOwnerDishShowing(
      client,
      section,
      dish,
      viewer,
      { special_schedule: { days: ["mon"] } },
      { schedule: { days: ["tue"] }, available: true, soldOutAt: mark },
    );
    expect(asked.slice(0, 8)).toEqual([
      ["from", "items"],
      ["update", { special_schedule: { days: ["mon"] } }],
      ["eq", "id", dish],
      ["eq", "section_id", section],
      ["is", "deleted_at", null],
      ["eq", "special_schedule", '{"days":["tue"]}'],
      ["eq", "available", true],
      ["eq", "sold_out_at", mark],
    ]);
  });

  it("compares no schedule and no mark as null, and an unavailable dish's flag as false", async () => {
    const { client, asked } = standIn(nothing);
    await writeOwnerDishShowing(
      client,
      section,
      dish,
      viewer,
      { special_schedule: null, available: true, sold_out_at: null },
      { schedule: null, available: false, soldOutAt: null },
    );
    expect(writeFilters(asked).slice(3)).toEqual([
      ["is", "special_schedule", null],
      ["eq", "available", false],
      ["is", "sold_out_at", null],
    ]);
  });
});

describe("an allergen write", () => {
  it("names the dish's name too when the same-named Apply asks, beside its lists", async () => {
    const { client, asked } = standIn(nothing);
    await writeOwnerDishAllergens(
      client,
      section,
      dish,
      viewer,
      { allergens_reviewed: true },
      {
        name: "Soup of the day",
        lists: { allergens: ["milk"], others: ["celery"] },
      },
    );
    expect(writeFilters(asked).slice(3)).toEqual([
      ["eq", "name", "Soup of the day"],
      ["eq", "allergens", '{"milk"}'],
      ["eq", "custom_allergens", '{"celery"}'],
    ]);
  });

  it("names the lists alone for the dish's own Save, as before, and the flag for an untick", async () => {
    const lists = standIn(nothing);
    await writeOwnerDishAllergens(
      lists.client,
      section,
      dish,
      viewer,
      { allergens: ["milk"] },
      { lists: { allergens: [], others: [] } },
    );
    expect(writeFilters(lists.asked).slice(3)).toEqual([
      ["eq", "allergens", "{}"],
      ["eq", "custom_allergens", "{}"],
    ]);

    const untick = standIn(nothing);
    await writeOwnerDishAllergens(
      untick.client,
      section,
      dish,
      viewer,
      { allergens_reviewed: false },
      { allergens_reviewed: true },
    );
    expect(writeFilters(untick.asked).slice(3)).toEqual([
      ["eq", "allergens_reviewed", true],
    ]);
  });

  it("names an option's name and lists, as D-153 has it", async () => {
    const { client, asked } = standIn(nothing);
    await writeOwnerOptionAllergens(
      client,
      list,
      option,
      viewer,
      { allergens_reviewed: false },
      {
        name: "Ranch",
        lists: { allergens: ["milk", "eggs"], others: [] },
        allergens_reviewed: true,
      },
    );
    expect(writeFilters(asked).slice(3)).toEqual([
      ["eq", "name", "Ranch"],
      ["eq", "allergens", '{"milk","eggs"}'],
      ["eq", "custom_allergens", "{}"],
      ["eq", "allergens_reviewed", true],
    ]);
  });
});

describe("Details", () => {
  const hours = '{"mon": [{"open": "11:00", "close": "21:00"}]}';
  const shown: RestaurantShown = {
    name: "Test Bistro",
    address: "12 Penn Street",
    city: "Reading",
    region: "PA",
    postal_code: "19601",
    phone: null,
    website: null,
    hours,
    timezone: "America/New_York",
    allergen_note: "",
    prep_notes: ["shared-fryer", "shared-kitchen"],
    show_icons: false,
  };
  const input = {
    name: "Test Bistro",
    address: "12 Penn Street",
    city: "Reading",
    region: "PA" as const,
    postalCode: "19601",
    phone: "(610) 555-0100",
    website: null,
    hours: null,
    timezone: "America/New_York" as const,
    allergenNote: null,
    prepNotes: ["shared-fryer" as const],
    showIcons: true,
  };
  const code = "12345678";

  it("is written in one statement that names the twelve values the page showed, each by its own kind", async () => {
    const { client, asked } = standIn(nothing, nothing);
    await updateOwnerRestaurant(client, code, input, shown);
    expect(asked[0]).toEqual(["from", "restaurants"]);
    expect(asked[1]).toEqual([
      "update",
      {
        name: "Test Bistro",
        address: "12 Penn Street",
        city: "Reading",
        region: "PA",
        postal_code: "19601",
        phone: "(610) 555-0100",
        website: null,
        hours: null,
        timezone: "America/New_York",
        allergen_note: null,
        prep_notes: ["shared-fryer"],
        show_icons: true,
      },
    ]);
    expect(writeFilters(asked)).toEqual([
      ["eq", "code", code],
      ["eq", "name", "Test Bistro"],
      ["eq", "address", "12 Penn Street"],
      ["eq", "city", "Reading"],
      ["eq", "region", "PA"],
      ["eq", "postal_code", "19601"],
      ["is", "phone", null],
      ["is", "website", null],
      // The column's own text, as read, not a value parsed and written out
      // again.
      ["eq", "hours", hours],
      ["eq", "timezone", "America/New_York"],
      // An empty note is a value, and is not null.
      ["eq", "allergen_note", ""],
      ["eq", "prep_notes", '{"shared-fryer","shared-kitchen"}'],
      ["eq", "show_icons", false],
    ]);
  });

  it("is moved when the restaurant is there and the statement matched nothing, and not found when it is not", async () => {
    const moved = standIn(nothing, row({ id: restaurant }));
    expect(
      await updateOwnerRestaurant(moved.client, code, input, shown),
    ).toEqual({
      ok: false,
      error: { kind: "moved" },
    });
    expect(moved.asked.slice(-3)).toEqual([
      ["from", "restaurants"],
      ["select", "id"],
      ["eq", "code", code],
    ]);

    const gone = standIn(nothing, nothing);
    expect(
      await updateOwnerRestaurant(gone.client, code, input, shown),
    ).toEqual({
      ok: false,
      error: { kind: "not-found" },
    });

    const down = standIn(nothing, { data: null, error: { message: "down" } });
    expect(
      await updateOwnerRestaurant(down.client, code, input, shown),
    ).toEqual({
      ok: false,
      error: { kind: "failed" },
    });
  });

  it("compares no hours as null", async () => {
    const { client, asked } = standIn(nothing, nothing);
    await updateOwnerRestaurant(client, code, input, { ...shown, hours: null });
    expect(writeFilters(asked)).toContainEqual(["is", "hours", null]);
  });
});
