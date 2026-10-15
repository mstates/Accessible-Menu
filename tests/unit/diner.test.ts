import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { caloriesOf } from "../../src/domain/calories";
import { optionSentence } from "../../src/domain/choices";
import {
  dishPriceWords,
  menuNaming,
  SECTION_LISTS_REPEAT_UP_TO,
  timedDishes,
  visibleMenu,
  type DinerCopy,
  type DishState,
} from "../../src/domain/diner";
import type { Hours } from "../../src/domain/hours";
import {
  menuSnapshotSchema,
  type MenuSnapshot,
  type SnapshotChoiceList,
  type SnapshotOption,
} from "../../src/domain/snapshot";

// The diner page's view model against CI Diner's Dinner as publish_menu()
// wrote it (tests/fixtures/menu-snapshot.v1.json) with the states its data
// file sets: Starters' soup a special every day from 4 to 9 pm, Garlic
// bread off the menu, everything else available; Mains' soup unchecked.

const fixture: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../fixtures/menu-snapshot.v1.json", import.meta.url),
    ),
    "utf8",
  ),
);

const copy: DinerCopy = {
  allergens: en.allergens,
  dietary: en.dietary,
  money: en.money,
  calories: en.calories,
  time: en.time,
  schedule: { ...en.schedule, day: en.days },
  marketPrice: en.menu.marketPrice,
  soldOut: en.availability.soldOut,
};

const zone = "America/New_York";
const hours: Hours = {
  mon: [],
  tue: [
    { open: "11:00", close: "14:00" },
    { open: "17:00", close: "21:00" },
  ],
  wed: [{ open: "11:00", close: "21:00" }],
  thu: [{ open: "11:00", close: "21:00" }],
  fri: [{ open: "11:00", close: "21:00" }],
  sat: [{ open: "17:00", close: "02:00" }],
  sun: [{ open: "00:00", close: "00:00" }],
};

function dinner(): MenuSnapshot {
  return menuSnapshotSchema.parse(fixture);
}

function dishId(snapshot: MenuSnapshot, section: string, name: string) {
  const found = snapshot.sections
    .find((s) => s.name === section)
    ?.items.find((i) => i.name === name);
  if (!found) throw new Error(`no dish ${name} in ${section}`);
  return found.id;
}

// The states as ci_diner.sql leaves them.
function ciStates(snapshot: MenuSnapshot): Map<string, DishState> {
  const available: DishState = {
    available: true,
    soldOutAt: null,
    schedule: null,
  };
  return new Map([
    [
      dishId(snapshot, "Starters", "Soup of the day"),
      { ...available, schedule: { hours: { open: "16:00", close: "21:00" } } },
    ],
    [dishId(snapshot, "Starters", "House salad"), available],
    [
      dishId(snapshot, "Starters", "Garlic bread"),
      { ...available, available: false },
    ],
    [dishId(snapshot, "Mains", "Soup of the day"), available],
  ]);
}

function view(now: Date, snapshot = dinner(), states = ciStates(snapshot)) {
  return visibleMenu({
    snapshot,
    states,
    now,
    hours,
    zone,
    copy,
    lang: "en",
  });
}

// 5 pm and 10 pm in New York on Tuesday, October 13, 2026 (EDT).
const fivePm = new Date("2026-10-13T21:00:00Z");
const tenPm = new Date("2026-10-14T02:00:00Z");

describe("what a diner sees at one moment (D-159, D-160, D-39)", () => {
  it("shows the special inside its hours with its days and hours in words, and hides the dish off the menu", () => {
    const menu = view(fivePm);
    expect(menu.name).toBe("Dinner");
    expect(menu.sections.map((s) => s.name)).toEqual(["Starters", "Mains"]);
    const starters = menu.sections[0];
    expect(starters?.dishes.map((d) => d.name)).toEqual([
      "Soup of the day",
      "House salad",
    ]);
    expect(starters?.dishes[0]?.special).toBe("Every day, 4 to 9 pm.");
    expect(starters?.dishes[1]?.special).toBeNull();
  });

  it("hides the special once its hours are over, so the section's count changes with it", () => {
    const menu = view(tenPm);
    expect(menu.sections[0]?.dishes.map((d) => d.name)).toEqual([
      "House salad",
    ]);
  });

  it("hides a section with nothing to show, so it leaves the section list", () => {
    expect(view(fivePm).sections.some((s) => s.name === "Desserts")).toBe(
      false,
    );
  });

  it("counts the unchecked dishes it shows, and the unchecked options, for the confirmation line", () => {
    const snapshot = dinner();
    expect(view(fivePm, snapshot).confirmation).toEqual({
      dishes: 1,
      options: 0,
      text: "We're still confirming allergens for 1 dish. Ask your server about that.",
    });
    // Ranch unchecked: the line names the option, while no list renders yet.
    const salad = snapshot.sections[0]?.items[1];
    const ranch = salad?.choice_lists[0]?.options[0];
    if (!ranch) throw new Error("no Ranch in the fixture");
    ranch.allergens = { checked: false };
    expect(view(fivePm, snapshot).confirmation.text).toBe(
      "We're still confirming allergens for 1 dish and 1 option. Ask your server about those.",
    );
    // Mains' soup checked too: options alone.
    const mainsSoup = snapshot.sections[1]?.items[0];
    if (!mainsSoup) throw new Error("no soup in Mains");
    mainsSoup.allergens = { checked: true, major: [], other: [] };
    expect(view(fivePm, snapshot).confirmation.text).toBe(
      "We're still confirming allergens for 1 option. Ask your server about that.",
    );
    // Every dish and option checked: confirmed for every dish.
    ranch.allergens = { checked: true, major: ["milk", "eggs"], other: [] };
    expect(view(fivePm, snapshot).confirmation.text).toBe(
      "Allergens confirmed for every dish.",
    );
  });

  it("never counts a hidden dish or a hidden section's options", () => {
    // Garlic bread is unchecked and off the menu: not counted.
    const snapshot = dinner();
    const bread = snapshot.sections[0]?.items[2];
    expect(bread?.allergens.checked).toBe(false);
    expect(view(fivePm, snapshot).confirmation.dishes).toBe(1);
    // Desserts given an unchecked section list, with nothing to show: not
    // counted either.
    const desserts = snapshot.sections[2];
    if (!desserts) throw new Error("no Desserts");
    desserts.choice_lists = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        lead: "Add on",
        options: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Cream",
            added_price_cents: null,
            calories_low: null,
            calories_high: null,
            allergens: { checked: false },
          },
        ],
      },
    ];
    expect(view(fivePm, snapshot).confirmation.options).toBe(0);
  });

  it("shows a dish with no state row as available, with no special", () => {
    const menu = view(fivePm, dinner(), new Map());
    expect(menu.sections.map((s) => s.name)).toEqual(["Starters", "Mains"]);
    expect(menu.sections[0]?.dishes.map((d) => d.name)).toEqual([
      "Soup of the day",
      "House salad",
      "Garlic bread",
    ]);
    expect(menu.sections[0]?.dishes[0]?.special).toBeNull();
    expect(menu.notices).toEqual({ calories: true, cookedToOrder: true });
  });

  it("shows a sold-out dish with its words until the day ends, and counts it", () => {
    const snapshot = dinner();
    const states = ciStates(snapshot);
    const salad = dishId(snapshot, "Starters", "House salad");
    // Marked at 4 pm Tuesday: sold out until 9 pm.
    states.set(salad, {
      available: true,
      soldOutAt: "2026-10-13T20:00:00Z",
      schedule: null,
    });
    const before = view(fivePm, snapshot, states);
    expect(before.sections[0]?.dishes[1]?.soldOut).toBe(true);
    expect(before.sections[0]?.dishes).toHaveLength(2);
    const after = view(tenPm, snapshot, states);
    expect(after.sections[0]?.dishes[0]?.soldOut).toBe(false);
  });

  it("shows the new state at the change second and one second after, so a render at the moment never caches the old page", () => {
    // 9 pm New York on Tuesday, October 13, 2026: the soup's hours end and
    // the day's service ends, the instant the page's lifetime is set to.
    const ninePm = new Date("2026-10-14T01:00:00Z");
    const snapshot = dinner();
    const states = ciStates(snapshot);
    const salad = dishId(snapshot, "Starters", "House salad");
    states.set(salad, {
      available: true,
      soldOutAt: "2026-10-13T20:00:00Z",
      schedule: null,
    });
    const before = view(new Date(ninePm.getTime() - 1000), snapshot, states);
    expect(before.sections[0]?.dishes.map((d) => d.name)).toEqual([
      "Soup of the day",
      "House salad",
    ]);
    expect(before.sections[0]?.dishes[1]?.soldOut).toBe(true);
    for (const at of [ninePm, new Date(ninePm.getTime() + 1000)]) {
      const menu = view(at, snapshot, states);
      expect(menu.sections[0]?.dishes.map((d) => d.name)).toEqual([
        "House salad",
      ]);
      expect(menu.sections[0]?.dishes[0]?.soldOut).toBe(false);
    }
  });

  it("builds every sentence a dish carries", () => {
    const menu = view(fivePm);
    const [soup, salad] = menu.sections[0]?.dishes ?? [];
    expect(soup?.price).toEqual({
      display: "Cup $5, 180 calories. Bowl $8, 290 calories.",
      spoken:
        "Cup, five dollars, 180 calories. Bowl, eight dollars, 290 calories.",
    });
    expect(soup?.allergen).toEqual({
      kind: "contains",
      lead: "Contains",
      words: ["milk", "wheat", "celery"],
      text: "Contains milk, wheat, celery.",
    });
    expect(salad?.price).toEqual({
      display: "$9, 320 calories",
      spoken: "nine dollars, 320 calories",
    });
    expect(salad?.allergen.text).toBe("Checked. No major allergens.");
    expect(salad?.dietary?.text).toBe(
      "Vegetarian. Made without gluten ingredients.",
    );
    expect(salad?.cookedToOrder).toBe(false);
    const mainsSoup = menu.sections[1]?.dishes[0];
    expect(mainsSoup?.price).toBeNull();
    expect(mainsSoup?.allergen.text).toBe(
      "Allergens not confirmed yet. Ask your server.",
    );
  });

  it("flags the notices from what it shows", () => {
    // The bread, cooked to order, is off the menu: no advisory; the salad's
    // calories bring the calorie notices.
    expect(view(fivePm).notices).toEqual({
      calories: true,
      cookedToOrder: false,
    });
  });

  it("carries a section's lists and whether they repeat inside each dish (Q-74)", () => {
    const starters = view(fivePm).sections[0];
    expect(starters?.lists.map((list) => list.lead)).toEqual([
      "Add a buttered roll to any dish",
    ]);
    expect(starters?.lists[0]?.options[0]?.words).toEqual({
      display: "Buttered roll, +$2",
      spoken: "Buttered roll, plus two dollars",
    });
    expect(starters?.lists[0]?.options[0]?.allergen.text).toBe(
      "Contains milk, wheat.",
    );
    expect(starters?.repeatLists).toBe(true);
    expect(SECTION_LISTS_REPEAT_UP_TO).toBe(4);
    const salad = starters?.dishes[1];
    expect(salad?.lists[0]?.options.map((o) => o.words.display)).toEqual([
      "Ranch, 150 calories",
      "Vinaigrette, 90 calories",
    ]);
  });

  it("carries a dish's lists with every option's words and its own allergen sentence, the pieces of the one builder (D-166, rule 8)", () => {
    const snapshot = dinner();
    const menu = view(fivePm, snapshot);
    const salad = menu.sections[0]?.dishes[1];
    expect(salad?.lists.map((list) => list.lead)).toEqual([
      "Choose a dressing",
    ]);
    const [ranch, vinaigrette] = salad?.lists[0]?.options ?? [];
    expect(ranch?.words).toEqual({
      display: "Ranch, 150 calories",
      spoken: "Ranch, 150 calories",
    });
    expect(ranch?.allergen).toEqual({
      kind: "contains",
      lead: "Contains",
      words: ["milk", "eggs"],
      text: "Contains milk, eggs.",
    });
    expect(vinaigrette?.words.display).toBe("Vinaigrette, 90 calories");
    expect(vinaigrette?.allergen.text).toBe("Checked. No major allergens.");
    // Every option the page shows, read as its words then its sentence, is
    // what optionSentence() builds from the same snapshot option.
    const sources = new Map<string, SnapshotOption>(
      snapshot.sections
        .flatMap((section) => [
          ...section.choice_lists,
          ...section.items.flatMap((dish) => dish.choice_lists),
        ])
        .flatMap((list) => list.options)
        .map((option) => [option.id, option]),
    );
    let checked = 0;
    for (const section of menu.sections) {
      const lists = [
        ...section.lists,
        ...section.dishes.flatMap((dish) => dish.lists),
      ];
      for (const list of lists) {
        for (const option of list.options) {
          const source = sources.get(option.id);
          if (!source) throw new Error(`no option ${option.id}`);
          const sentence = optionSentence(
            {
              name: source.name,
              addedPriceCents: source.added_price_cents,
              calories: caloriesOf(source.calories_low, source.calories_high),
              allergens: source.allergens.checked ? source.allergens.major : [],
              customAllergens: source.allergens.checked
                ? source.allergens.other
                : [],
              allergensReviewed: source.allergens.checked,
            },
            copy,
            "en",
          );
          expect(`${option.words.spoken}. ${option.allergen.text}`).toBe(
            sentence.spoken,
          );
          expect(`${option.words.display}. ${option.allergen.text}`).toBe(
            sentence.display,
          );
          checked += 1;
        }
      }
    }
    // The roll, Ranch, and Vinaigrette: every option the fixture holds.
    expect(checked).toBe(3);
  });

  it("repeats a section's lists inside each dish while their options number the constant or fewer in all, and not past it (Q-74)", () => {
    const at = SECTION_LISTS_REPEAT_UP_TO;
    const option = (n: number): SnapshotOption => ({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      name: `Option ${n}`,
      added_price_cents: null,
      calories_low: null,
      calories_high: null,
      allergens: { checked: true, major: [], other: [] },
    });
    const listOf = (
      id: string,
      count: number,
      from: number,
    ): SnapshotChoiceList => ({
      id,
      lead: `List ${id.slice(0, 1)}`,
      options: Array.from({ length: count }, (_, index) =>
        option(from + index),
      ),
    });
    const one = "11111111-1111-4111-8111-111111111111";
    const two = "22222222-2222-4222-8222-222222222222";
    // Mains shows one dish, so its lists decide the form for that dish.
    const mainsWith = (lists: SnapshotChoiceList[]) => {
      const snapshot = dinner();
      const mains = snapshot.sections[1];
      if (!mains) throw new Error("no Mains");
      mains.choice_lists = lists;
      return view(fivePm, snapshot).sections[1];
    };
    expect(mainsWith([listOf(one, at, 1)])?.repeatLists).toBe(true);
    expect(mainsWith([listOf(one, at + 1, 1)])?.repeatLists).toBe(false);
    // The options are counted across the section's lists, not per list.
    const first = Math.floor(at / 2);
    expect(
      mainsWith([listOf(one, first, 1), listOf(two, at - first, first + 1)])
        ?.repeatLists,
    ).toBe(true);
    expect(
      mainsWith([listOf(one, first, 1), listOf(two, at - first + 1, first + 1)])
        ?.repeatLists,
    ).toBe(false);
    expect(mainsWith([])?.repeatLists).toBe(true);
  });

  it("lists every dish with its state for the timed ends", () => {
    const snapshot = dinner();
    const dishes = timedDishes(snapshot, ciStates(snapshot));
    expect(dishes).toHaveLength(4);
    expect(dishes.filter((d) => d.schedule)).toHaveLength(1);
    expect(dishes.filter((d) => !d.available)).toHaveLength(1);
    expect(timedDishes(snapshot, new Map()).every((d) => d.available)).toBe(
      true,
    );
  });
});

describe("the menu's name in the title and under the restaurant's name (Q-97)", () => {
  const naming = (menu: string) => menuNaming(menu, "Test Bistro", en.menu);

  it("names the menu with the word added once, whatever the number of menus", () => {
    expect(naming("Dinner")).toEqual({
      title: "Dinner menu, Test Bistro",
      line: "Dinner menu",
    });
    expect(naming("Menudo")).toEqual({
      title: "Menudo menu, Test Bistro",
      line: "Menudo menu",
    });
  });

  it("adds nothing to a name that already ends in the word, in any case", () => {
    expect(naming("Kids Menu")).toEqual({
      title: "Kids Menu, Test Bistro",
      line: "Kids Menu",
    });
    expect(naming("DINNER MENU")).toEqual({
      title: "DINNER MENU, Test Bistro",
      line: "DINNER MENU",
    });
  });

  it("reads a name that is only the word as no name: the restaurant's title and no line", () => {
    expect(naming("Menu")).toEqual({ title: "Test Bistro menu", line: null });
    expect(naming(" Menu ")).toEqual({
      title: "Test Bistro menu",
      line: null,
    });
    expect(naming("Menu").title).toBe(
      fill(en.menu.title, { restaurant: "Test Bistro" }),
    );
  });
});

describe("a dish's price in words (Q-6, D-139, D-167)", () => {
  it("says market price with its calories, and nothing for a blank price or no size", () => {
    expect(
      dishPriceWords(
        { kind: "market", calories_low: 410, calories_high: null },
        copy,
        "en",
      ),
    ).toEqual({
      display: "Market price, 410 calories",
      spoken: "Market price, 410 calories",
    });
    expect(
      dishPriceWords(
        {
          kind: "one",
          price_cents: null,
          calories_low: null,
          calories_high: null,
        },
        copy,
        "en",
      ),
    ).toBeNull();
    expect(dishPriceWords({ kind: "sizes", sizes: [] }, copy, "en")).toBeNull();
    expect(
      dishPriceWords(
        {
          kind: "one",
          price_cents: null,
          calories_low: 760,
          calories_high: 860,
        },
        copy,
        "en",
      ),
    ).toEqual({
      display: "760 to 860 calories",
      spoken: "760 to 860 calories",
    });
  });
});
