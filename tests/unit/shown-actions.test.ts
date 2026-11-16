import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../src/copy";
import { SHOWN_TEXT_BOUND } from "../../src/core/supabase/compare";

// D-237, rule 2, at the actions, with the owner's scope, the writers, and
// the cache stood in. What a page showed is user input on its way to a
// compare, so each action checks it for its type and one generous bound and
// hands it to its writer as it arrived, never through a field's own rule.
// A call that carries nothing the page showed is refused and nothing is
// written: no action has a path that writes without its compare. A refused
// save clears no diner page.

const code = "12345678";
const restaurant = "11111111-1111-4111-8111-111111111111";
const menu = "22222222-2222-4222-8222-222222222222";
const section = "33333333-3333-4333-8333-333333333333";
const dish = "44444444-4444-4444-8444-444444444444";
const list = "55555555-5555-4555-8555-555555555555";
const option = "66666666-6666-4666-8666-666666666666";
const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// A character outside the basic plane: one character to Postgres, whose
// caps count characters, and two units to a rule that counts UTF-16. A text
// of these at a column's cap is twice the cap to such a rule.
const wide = (count: number) => "\u{1F35C}".repeat(count);

type Sent = { writer: string; args: unknown[] };
let sent: Sent[] = [];
let answer: unknown = null;
const refreshed = vi.fn();
const expired = vi.fn();

// A writer stood in: it keeps what it was handed and answers as told.
const stood =
  (writer: string) =>
  async (...args: unknown[]) => {
    sent.push({ writer, args });
    return answer;
  };

type Menus = typeof import("../../src/features/owner/menu-actions");
type Sections = typeof import("../../src/features/owner/section-actions");
type Dishes = typeof import("../../src/features/owner/dish-actions");
type Choices = typeof import("../../src/features/owner/choices/choice-actions");
type OptionAllergens =
  typeof import("../../src/features/owner/choices/option-allergen-actions");
type Forms = typeof import("../../src/features/owner/dish/form-actions");
type Owner = typeof import("../../src/features/owner/actions");
type Apply = typeof import("../../src/features/owner/allergens/apply-server");

let menus: Menus;
let sections: Sections;
let dishes: Dishes;
let choices: Choices;
let optionAllergens: OptionAllergens;
let forms: Forms;
let owner: Owner;
let apply: Apply;

let targetDish: unknown = "not-found";
let targetOption: unknown = "not-found";

beforeAll(async () => {
  const core = "../../src/core/supabase";
  const realMenus = await vi.importActual<object>(`${core}/menus`);
  const realSections = await vi.importActual<object>(`${core}/sections`);
  const realDishes = await vi.importActual<object>(`${core}/dishes`);
  const realChoices = await vi.importActual<object>(`${core}/choices`);
  const realRestaurants = await vi.importActual<object>(`${core}/restaurants`);

  vi.doMock("next/cache", () => ({ refresh: refreshed }));
  vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
  vi.doMock("next/navigation", () => ({
    redirect: (url: string) => {
      throw new Error(`redirected to ${url}`);
    },
  }));
  vi.doMock("../../src/core/cache", () => ({ expireRestaurant: expired }));
  vi.doMock(`${core}/server`, () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        getClaims: async () => ({
          data: { claims: { email: "owner@example.test", sub: viewer } },
        }),
      },
    }),
  }));

  const scope = {
    ok: true,
    client: {},
    restaurantId: restaurant,
    userId: viewer,
  };
  vi.doMock("../../src/features/owner/owner-scope", () => ({
    ownerScope: async () => scope,
    menuScope: async (_code: string, rawMenu: string) => ({
      ...scope,
      menuId: rawMenu,
    }),
    sectionScope: async (_code: string, rawSection: string) => ({
      ...scope,
      sectionId: rawSection,
      menuId: menu,
    }),
    dishScope: async (_code: string, rawDish: string) => ({
      ...scope,
      dishId: rawDish,
      sectionId: section,
      menuId: menu,
    }),
    listScope: async (_code: string, rawList: string) => ({
      ...scope,
      listId: rawList,
      home: { kind: "dish", id: dish },
    }),
  }));

  vi.doMock(`${core}/menus`, () => ({
    ...realMenus,
    renameOwnerMenu: stood("renameOwnerMenu"),
  }));
  vi.doMock(`${core}/sections`, () => ({
    ...realSections,
    setOwnerSectionText: stood("setOwnerSectionText"),
  }));
  vi.doMock(`${core}/dishes`, () => ({
    ...realDishes,
    findOwnerDish: async () => targetDish,
    renameOwnerDish: stood("renameOwnerDish"),
    writeOwnerDishAllergens: stood("writeOwnerDishAllergens"),
    writeOwnerDishTagsPage: stood("writeOwnerDishTagsPage"),
    writeOwnerDishShowing: stood("writeOwnerDishShowing"),
  }));
  vi.doMock(`${core}/choices`, () => ({
    ...realChoices,
    findOwnerOption: async () => targetOption,
    setOwnerChoiceListLead: stood("setOwnerChoiceListLead"),
    renameOwnerOption: stood("renameOwnerOption"),
    setOwnerOptionPrice: stood("setOwnerOptionPrice"),
    setOwnerOptionCalories: stood("setOwnerOptionCalories"),
    writeOwnerOptionAllergens: stood("writeOwnerOptionAllergens"),
  }));
  vi.doMock(`${core}/restaurants`, () => ({
    ...realRestaurants,
    updateOwnerRestaurant: stood("updateOwnerRestaurant"),
  }));

  menus = await import("../../src/features/owner/menu-actions");
  sections = await import("../../src/features/owner/section-actions");
  dishes = await import("../../src/features/owner/dish-actions");
  choices = await import("../../src/features/owner/choices/choice-actions");
  optionAllergens =
    await import("../../src/features/owner/choices/option-allergen-actions");
  forms = await import("../../src/features/owner/dish/form-actions");
  owner = await import("../../src/features/owner/actions");
  apply = await import("../../src/features/owner/allergens/apply-server");
});

beforeEach(() => {
  sent = [];
  answer = null;
  targetDish = "not-found";
  targetOption = "not-found";
  refreshed.mockClear();
  expired.mockClear();
});

const anOption = {
  id: option,
  name: "Ranch",
  price: "",
  calories: "",
  priceCents: null,
  caloriesLow: null,
  caloriesHigh: null,
  allergens: [],
  otherAllergens: [],
  check: null,
};
const lists = { allergens: [], others: [] };
const moved = { ok: false, error: { kind: "moved" } };
const refusedAsFailed = { ok: false, problem: { kind: "failed" } };

// Each text a page that saves as it goes hands back: its column's cap, the
// writer's answer when the write lands, the call, and where the writer
// finds what the page showed.
type Text = {
  what: string;
  cap: number;
  landed: unknown;
  run: (shown: unknown) => Promise<unknown>;
  writer: string;
  shownOf: (args: unknown[]) => unknown;
};

const texts: Text[] = [
  {
    what: "a menu's name",
    cap: 60,
    landed: { ok: true, value: { id: menu, name: "Supper" } },
    run: (shown) => menus.renameMenu(code, menu, "Supper", shown),
    writer: "renameOwnerMenu",
    shownOf: (args) => args[4],
  },
  {
    what: "a section's name",
    cap: 60,
    landed: { ok: true, value: { id: section, name: "Soups", note: "" } },
    run: (shown) => sections.renameSection(code, menu, section, "Soups", shown),
    writer: "setOwnerSectionText",
    shownOf: (args) => args[5],
  },
  {
    what: "a section's note",
    cap: 500,
    landed: {
      ok: true,
      value: { id: section, name: "Soups", note: "Ask us." },
    },
    run: (shown) =>
      dishes.setOwnSectionText(code, section, "note", "Ask us.", shown),
    writer: "setOwnerSectionText",
    shownOf: (args) => args[5],
  },
  {
    what: "a dish's name",
    cap: 120,
    landed: { ok: true, value: { id: dish, name: "Chowder" } },
    run: (shown) => dishes.renameDish(code, section, dish, "Chowder", shown),
    writer: "renameOwnerDish",
    shownOf: (args) => args[4],
  },
  {
    what: "a choice list's lead",
    cap: 120,
    landed: { ok: true, value: { id: list, lead: "Pick a side", options: 0 } },
    run: (shown) => choices.setChoiceListLead(code, list, "Pick a side", shown),
    writer: "setOwnerChoiceListLead",
    shownOf: (args) => args[4],
  },
  {
    what: "an option's name",
    cap: 60,
    landed: { ok: true, value: anOption },
    run: (shown) =>
      choices.setOptionText(code, list, option, "name", "Ranch", shown),
    writer: "renameOwnerOption",
    shownOf: (args) => args[5],
  },
];

describe("a text the page showed goes to its compare as it arrived (D-237)", () => {
  it.each(texts)(
    "$what, at its cap of $cap characters outside the basic plane",
    async ({ cap, landed, run, writer, shownOf }) => {
      answer = landed;
      const shown = wide(cap);
      expect(shown.length).toBe(cap * 2);
      expect(await run(shown)).toMatchObject({ ok: true });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.writer).toBe(writer);
      expect(shownOf(sent[0]?.args ?? [])).toBe(shown);
    },
  );

  it.each(texts)(
    "$what, with outer spaces and line breaks kept",
    async ({ landed, run, shownOf }) => {
      answer = landed;
      const shown = "  Soup\r\nof the day \n";
      await run(shown);
      expect(shownOf(sent[0]?.args ?? [])).toBe(shown);
    },
  );

  it("an option's name with its allergens, at 60 characters outside the basic plane, in all three writes of its group", async () => {
    answer = { ok: true, value: anOption };
    const shown = { words: wide(60), lists };
    await optionAllergens.setOptionAllergens(
      code,
      list,
      option,
      ["milk"],
      shown,
    );
    await optionAllergens.setOptionOtherAllergens(
      code,
      list,
      option,
      ["celery"],
      shown,
    );
    await optionAllergens.setOptionAllergenCheck(
      code,
      list,
      option,
      true,
      shown,
    );
    expect(sent.map((each) => each.writer)).toEqual(
      Array(3).fill("writeOwnerOptionAllergens"),
    );
    for (const each of sent) {
      expect(each.args[5]).toMatchObject({ name: wide(60), lists });
    }
  });

  it("is bounded by one generous bound for every text, at least twice the longest a column can hold", () => {
    // The longest text any compared column can hold is the hours as their
    // own text, 4,000 octets; the allergen note is next, 1,000 characters,
    // which is 2,000 units outside the basic plane.
    expect(SHOWN_TEXT_BOUND).toBeGreaterThanOrEqual(2 * 4_000);
    expect(SHOWN_TEXT_BOUND).toBeGreaterThanOrEqual(2 * wide(1_000).length);
  });
});

describe("a call that carries nothing the page showed is refused, and nothing is written (D-237)", () => {
  const notTexts: unknown[] = [
    undefined,
    null,
    7,
    true,
    {},
    ["Supper"],
    "x".repeat(SHOWN_TEXT_BOUND + 1),
  ];

  it.each(texts)("$what", async ({ landed, run }) => {
    answer = landed;
    for (const shown of notTexts) {
      expect(await run(shown)).toEqual(refusedAsFailed);
    }
    expect(sent).toEqual([]);
  });

  it("an option's added price: the cents as stored, or null for none, and nothing else", async () => {
    answer = { ok: true, value: anOption };
    const price = (shown: unknown) =>
      choices.setOptionText(code, list, option, "price", "1.50", shown);
    for (const shown of [
      undefined,
      "150",
      "1.50",
      1.5,
      Number.NaN,
      {},
      [150],
    ]) {
      expect(await price(shown)).toEqual(refusedAsFailed);
    }
    expect(sent).toEqual([]);

    // No price shown is a value, compared as null, and so is a free
    // option's zero.
    await price(null);
    await price(0);
    await price(150);
    expect(
      sent.map((each) => [each.writer, each.args[3], each.args[4]]),
    ).toEqual([
      ["setOwnerOptionPrice", 150, null],
      ["setOwnerOptionPrice", 150, 0],
      ["setOwnerOptionPrice", 150, 150],
    ]);
  });

  it("an option's calories: the two stored numbers as a pair, and nothing else", async () => {
    answer = { ok: true, value: anOption };
    const calories = (shown: unknown) =>
      choices.setOptionText(code, list, option, "calories", "300", shown);
    for (const shown of [
      undefined,
      null,
      250,
      "250",
      { low: 250 },
      { high: null },
      { low: "250", high: null },
      { low: 2.5, high: null },
      { low: 250, high: null, text: "250" },
    ]) {
      expect(await calories(shown)).toEqual(refusedAsFailed);
    }
    expect(sent).toEqual([]);

    // A stored 250 and 250, which the field shows as "250", goes back as
    // the pair it is.
    await calories({ low: 250, high: 250 });
    await calories({ low: null, high: null });
    expect(
      sent.map((each) => [each.writer, each.args[3], each.args[4]]),
    ).toEqual([
      [
        "setOwnerOptionCalories",
        { low: 300, high: null },
        { low: 250, high: 250 },
      ],
      [
        "setOwnerOptionCalories",
        { low: 300, high: null },
        { low: null, high: null },
      ],
    ]);
  });

  it("an option's allergens", async () => {
    answer = { ok: true, value: anOption };
    for (const shown of [
      undefined,
      null,
      {},
      { words: "Ranch" },
      { lists },
      { words: 7, lists },
      { words: "x".repeat(SHOWN_TEXT_BOUND + 1), lists },
    ]) {
      expect(
        await optionAllergens.setOptionAllergens(
          code,
          list,
          option,
          ["milk"],
          shown,
        ),
      ).toEqual(refusedAsFailed);
      expect(
        await optionAllergens.setOptionAllergenCheck(
          code,
          list,
          option,
          true,
          shown,
        ),
      ).toEqual(refusedAsFailed);
    }
    expect(sent).toEqual([]);
  });
});

describe("a write the row refused comes back as moved (D-237)", () => {
  it.each(texts)("$what", async ({ run }) => {
    answer = moved;
    expect(await run("Dinner")).toEqual({
      ok: false,
      problem: { kind: "moved" },
    });
    expect(sent).toHaveLength(1);
  });

  it("an option's price and calories", async () => {
    answer = moved;
    for (const [field, value, shown] of [
      ["price", "1.50", null],
      ["calories", "300", { low: null, high: null }],
    ] as const) {
      expect(
        await choices.setOptionText(code, list, option, field, value, shown),
      ).toEqual({ ok: false, problem: { kind: "moved" } });
    }
  });

  it("tells a row that is gone from one that moved", async () => {
    answer = { ok: false, error: { kind: "not-found" } };
    expect(await menus.renameMenu(code, menu, "Supper", "Dinner")).toEqual({
      ok: false,
      problem: { kind: "gone" },
    });
    expect(
      await dishes.setOwnSectionText(code, section, "note", "Ask us.", ""),
    ).toEqual({ ok: false, problem: { kind: "parent-gone" } });
    expect(
      await choices.setChoiceListLead(code, list, "Pick a side", "Choose"),
    ).toEqual({ ok: false, problem: { kind: "parent-gone" } });
  });
});

// Details. The form posts what the page showed as one JSON field beside the
// typed fields.
const hoursText = `{"note": "${"h".repeat(3_988)}"}`;
const detailsShown = {
  name: wide(120),
  address: wide(200),
  city: wide(100),
  region: "PA",
  postal_code: "19601-0001",
  phone: "(610) 555-0100",
  website: `https://${wide(492)}`,
  hours: hoursText,
  timezone: "America/New_York",
  allergen_note: wide(1_000),
  prep_notes: ["shared-kitchen", "shared-fryer", "dedicated-fryer"],
  show_icons: true,
};

function detailsForm(shown: unknown): FormData {
  const form = new FormData();
  form.set("name", "Test Bistro");
  form.set("address", "12 Penn Street");
  form.set("city", "Reading");
  form.set("region", "PA");
  form.set("postalCode", "19601");
  form.set("timezone", "America/New_York");
  form.set("allergenNote", "Ask us about anything.");
  if (shown !== undefined) {
    form.set(
      "shown",
      typeof shown === "string" ? shown : JSON.stringify(shown),
    );
  }
  return form;
}

const saveDetails = (shown: unknown) =>
  owner.updateRestaurant(code, { status: "idle" }, detailsForm(shown));

describe("a Details save (D-237)", () => {
  const errors = en.owner.restaurants.errors;

  it("hands back the twelve values the page showed as they arrived, every text at its column's cap", async () => {
    expect(hoursText).toHaveLength(4_000);
    answer = { ok: true, restaurant: {} };
    expect(await saveDetails(detailsShown)).toEqual({ status: "saved", code });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.writer).toBe("updateOwnerRestaurant");
    expect(sent[0]?.args[1]).toBe(code);
    expect(sent[0]?.args[3]).toEqual(detailsShown);
    // The hours stay the text they were read as, never an object.
    expect((sent[0]?.args[3] as { hours: unknown }).hours).toBe(hoursText);
  });

  it("keeps a note's line breaks and outer spaces, an empty note apart from none, and no hours as null", async () => {
    answer = { ok: true, restaurant: {} };
    const shown = {
      ...detailsShown,
      allergen_note: " one\r\ntwo \n",
      hours: null,
      phone: null,
      website: null,
    };
    await saveDetails(shown);
    await saveDetails({ ...shown, allergen_note: "" });
    await saveDetails({ ...shown, allergen_note: null });
    expect(
      sent.map((each) => (each.args[3] as typeof shown).allergen_note),
    ).toEqual([" one\r\ntwo \n", "", null]);
    expect(sent[0]?.args[3]).toEqual(shown);
  });

  it("is refused when the form carries nothing it showed, with nothing written and no diner page cleared", async () => {
    answer = { ok: true, restaurant: {} };
    const { name, ...short } = detailsShown;
    void name;
    for (const shown of [
      undefined,
      "",
      "not json",
      "null",
      {},
      [],
      short,
      { ...detailsShown, more: 1 },
      { ...detailsShown, hours: { mon: [] } },
      { ...detailsShown, show_icons: "true" },
      { ...detailsShown, prep_notes: "shared-fryer" },
      { ...detailsShown, allergen_note: "x".repeat(SHOWN_TEXT_BOUND + 1) },
    ]) {
      expect(await saveDetails(shown)).toEqual({
        status: "error",
        message: errors.failed,
      });
    }
    expect(sent).toEqual([]);
    expect(expired).not.toHaveBeenCalled();
  });

  it("says the details moved, and clears no diner page, when the restaurant holds something else", async () => {
    answer = moved;
    expect(await saveDetails(detailsShown)).toEqual({
      status: "error",
      message: errors.moved,
    });
    expect(errors.moved).toContain("nothing was saved");
    expect(expired).not.toHaveBeenCalled();
  });

  it("clears no diner page for a restaurant that is gone or a write that failed", async () => {
    answer = { ok: false, error: { kind: "not-found" } };
    expect(await saveDetails(detailsShown)).toEqual({
      status: "error",
      message: errors.missing,
    });
    answer = { ok: false, error: { kind: "failed" } };
    expect(await saveDetails(detailsShown)).toEqual({
      status: "error",
      message: errors.failed,
    });
    expect(expired).not.toHaveBeenCalled();
  });

  it("clears the restaurant's diner pages once, after a save that landed", async () => {
    answer = { ok: true, restaurant: {} };
    await saveDetails(detailsShown);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledWith(code);
  });
});

describe("a Dietary tags save (D-237)", () => {
  const payload = {
    tags: ["made-without-gluten", "vegan"],
    cookedToOrder: true,
    // Stored out of the enum's order, as SQL or an import could leave it.
    shown: { tags: ["vegetarian", "vegan"], cookedToOrder: false },
  };

  it("hands the tags the page showed on in the order they arrived, and writes the new tags in the enum's order", async () => {
    answer = { ok: true, value: {} };
    expect(await forms.saveDishTags(code, dish, payload)).toEqual({
      status: "saved",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.args[4]).toEqual({
      dietary_tags: ["vegan", "made-without-gluten"],
      cooked_to_order: true,
    });
    expect(sent[0]?.args[5]).toEqual({
      tags: ["vegetarian", "vegan"],
      cookedToOrder: false,
    });
  });

  it("is refused when the payload carries nothing it showed, with nothing written", async () => {
    answer = { ok: true, value: {} };
    const { shown, ...bare } = payload;
    for (const bad of [
      bare,
      { ...bare, shown: null },
      { ...bare, shown: { tags: shown.tags } },
      { ...bare, shown: { cookedToOrder: false } },
      { ...bare, shown: { ...shown, more: 1 } },
      { ...bare, shown: { ...shown, cookedToOrder: "false" } },
      { ...bare, shown: { ...shown, tags: ["spicy"] } },
    ]) {
      expect(await forms.saveDishTags(code, dish, bad)).toEqual({
        status: "failed",
        problem: { kind: "failed" },
      });
    }
    expect(sent).toEqual([]);
  });

  it("says moved when the dish holds other tags or another mark", async () => {
    answer = { ok: false, error: { kind: "not-found" } };
    expect(await forms.saveDishTags(code, dish, payload)).toEqual({
      status: "moved",
    });
    expect(expired).not.toHaveBeenCalled();
  });
});

describe("an Availability save (D-237)", () => {
  // A mark stamped by the database keeps its microseconds, which a Date
  // would drop.
  const mark = "2026-11-15T17:03:21.123456+00:00";
  const fields = {
    days: ["mon"],
    weeks: [],
    months: [],
    open: "",
    close: "",
    from: "",
    until: "",
  };
  const payload = {
    choice: "sold-out",
    shownState: "sold-out",
    fields,
    today: "2026-11-15",
    shown: { schedule: { days: ["tue"] }, available: true, soldOutAt: mark },
  };

  it("hands back the schedule, the flag, and the mark as the text it was read as", async () => {
    answer = { ok: true, value: {} };
    expect(await forms.saveDishAvailability(code, dish, payload)).toEqual({
      status: "saved",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.writer).toBe("writeOwnerDishShowing");
    // The choice did not change, so the schedule alone is written.
    expect(sent[0]?.args[4]).toEqual({ special_schedule: { days: ["mon"] } });
    expect(sent[0]?.args[5]).toEqual({
      schedule: { days: ["tue"] },
      available: true,
      soldOutAt: mark,
    });
  });

  it("names no schedule and no mark as null, and an unavailable dish's flag as false", async () => {
    answer = { ok: true, value: {} };
    await forms.saveDishAvailability(code, dish, {
      ...payload,
      choice: "available",
      shownState: "off",
      shown: { schedule: null, available: false, soldOutAt: null },
    });
    expect(sent[0]?.args[4]).toEqual({
      special_schedule: { days: ["mon"] },
      available: true,
      sold_out_at: null,
    });
    expect(sent[0]?.args[5]).toEqual({
      schedule: null,
      available: false,
      soldOutAt: null,
    });
  });

  it("is refused when the payload carries nothing it showed, with nothing written and no diner page cleared", async () => {
    answer = { ok: true, value: {} };
    const { shown, ...bare } = payload;
    for (const bad of [
      bare,
      { ...bare, shown: null },
      { ...bare, shown: { schedule: shown.schedule, available: true } },
      { ...bare, shown: { schedule: shown.schedule, soldOutAt: mark } },
      { ...bare, shown: { ...shown, more: 1 } },
      { ...bare, shown: { ...shown, available: "true" } },
      { ...bare, shown: { ...shown, soldOutAt: 1_794_762_201 } },
      { ...bare, shown: { ...shown, soldOutAt: "x".repeat(65) } },
      // A schedule that is not one: the page showed something this code
      // cannot name in a compare.
      { ...bare, shown: { ...shown, schedule: { days: [] } } },
      { ...bare, shown: { ...shown, schedule: "weekdays" } },
    ]) {
      expect(await forms.saveDishAvailability(code, dish, bad)).toEqual({
        status: "failed",
        problem: { kind: "failed" },
      });
    }
    expect(sent).toEqual([]);
    expect(expired).not.toHaveBeenCalled();
  });

  it("says moved, and clears no diner page, when the dish holds something else", async () => {
    answer = { ok: false, error: { kind: "not-found" } };
    expect(await forms.saveDishAvailability(code, dish, payload)).toEqual({
      status: "moved",
    });
    answer = { ok: false, error: { kind: "failed" } };
    expect(await forms.saveDishAvailability(code, dish, payload)).toEqual({
      status: "failed",
      problem: { kind: "failed" },
    });
    expect(expired).not.toHaveBeenCalled();
  });

  it("clears the restaurant's diner pages once, after a save that landed", async () => {
    answer = { ok: true, value: {} };
    await forms.saveDishAvailability(code, dish, payload);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledWith(code);
  });
});

describe("the same-named Apply names its target's name in each statement (D-237)", () => {
  const source = {
    name: "Soup of the day",
    allergens: ["milk"] as const,
    others: ["celery"],
  };
  // The target's own name as stored: the same name by its key, and another
  // text. The statement names this one, as read, never the subject's.
  const stored = "soup of the Day ";
  const before = { allergens: [], otherAllergens: [] };
  const after = { allergens: ["milk"], otherAllergens: ["celery"] };

  it("onto a dish: the lists, then the check, each naming the name it read and the lists the dish must hold", async () => {
    targetDish = {
      id: dish,
      name: stored,
      sectionId: section,
      ...before,
      check: null,
    };
    answer = { ok: true, value: { ...after, check: null } };
    const result = await apply.applyListsTo(
      code,
      { kind: "dish", id: dish },
      source,
      { allergens: [], others: [] },
      viewer,
    );
    expect(result).toMatchObject({ ok: true });
    expect(sent.map((each) => each.writer)).toEqual([
      "writeOwnerDishAllergens",
      "writeOwnerDishAllergens",
    ]);
    expect(sent[0]?.args.slice(4)).toEqual([
      { allergens: ["milk"], custom_allergens: ["celery"] },
      { name: stored, lists: { allergens: [], others: [] } },
    ]);
    expect(sent[1]?.args.slice(4)).toEqual([
      { allergens_reviewed: true },
      { name: stored, lists: { allergens: ["milk"], others: ["celery"] } },
    ]);
  });

  it("onto an option: the same two statements through the option's writer", async () => {
    targetOption = {
      id: option,
      listId: list,
      name: stored,
      ...before,
      check: null,
    };
    answer = { ok: true, value: { ...after, check: null } };
    await apply.applyListsTo(
      code,
      { kind: "option", id: option },
      source,
      { allergens: [], others: [] },
      viewer,
    );
    expect(sent.map((each) => each.writer)).toEqual([
      "writeOwnerOptionAllergens",
      "writeOwnerOptionAllergens",
    ]);
    expect(sent.map((each) => each.args[5])).toEqual([
      { name: stored, lists: { allergens: [], others: [] } },
      { name: stored, lists: { allergens: ["milk"], others: ["celery"] } },
    ]);
  });

  it("says the target changed when the write finds another name or other lists", async () => {
    targetDish = {
      id: dish,
      name: stored,
      sectionId: section,
      ...before,
      check: null,
    };
    answer = { ok: false, error: { kind: "not-found" } };
    expect(
      await apply.applyListsTo(
        code,
        { kind: "dish", id: dish },
        source,
        { allergens: [], others: [] },
        viewer,
      ),
    ).toEqual({ ok: false, problem: { kind: "target-changed" } });
    expect(sent).toHaveLength(1);
  });
});
