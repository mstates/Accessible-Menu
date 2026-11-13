import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { groupIds } from "../../src/features/owner/allergens/target";
import { CHOICE_LISTS_HEADING_ID } from "../../src/features/owner/choices/useChoiceListRows";
import {
  DISH_PAGE_KEYS,
  DISH_PAGE_SAVING,
  dishPageHeadingId,
  dishPageSaving,
  dishPageName,
  dishPageNavItems,
  dishPagePath,
  dishPageState,
  dishPageStateLine,
  dishPageTitle,
  GENERAL_HEADING_ID,
  type DishPageState,
} from "../../src/features/owner/dish/dish-pages";
import {
  AVAILABILITY_HEADING_ID,
  TAGS_HEADING_ID,
} from "../../src/features/owner/dish/showing-ids";
import {
  restaurantDishPagePath,
  restaurantDishPath,
} from "../../src/features/owner/paths";

// The dish's pages as one config (D-222, D-225): the five in order and no
// more, each page's path, its name, the id its h1 carries, the state line
// beside its name, the nav items with the current one marked, and the
// title with the page first on a sub page.

const strings = en.owner.dish;
const choices = en.owner.choices;
const code = "12345678";
const dish = "0b2f0a9e-1111-4222-8333-444455556666";
const sep = en.site.titleSeparator;

const base: DishPageState = {
  checked: false,
  tags: 0,
  availability: "available",
  scheduled: false,
  lists: 0,
};

describe("the dish's pages (D-222)", () => {
  it("lists General, Allergens, Dietary tags, Availability, and Choice lists, in that order, five at most", () => {
    expect(DISH_PAGE_KEYS).toEqual([
      "general",
      "allergens",
      "tags",
      "availability",
      "choices",
    ]);
    expect(DISH_PAGE_KEYS.length).toBeLessThanOrEqual(5);
  });

  it("names each page by its group's heading, and the first General", () => {
    expect(dishPageName("general", strings, choices)).toBe("General");
    expect(dishPageName("allergens", strings, choices)).toBe("Allergens");
    expect(dishPageName("tags", strings, choices)).toBe("Dietary tags");
    expect(dishPageName("availability", strings, choices)).toBe("Availability");
    expect(dishPageName("choices", strings, choices)).toBe("Choice lists");
  });

  it("keeps General at the dish's own address and puts each other page under it", () => {
    expect(dishPagePath(code, dish, "general")).toBe(
      restaurantDishPath(code, dish),
    );
    for (const key of [
      "allergens",
      "tags",
      "availability",
      "choices",
    ] as const) {
      expect(dishPagePath(code, dish, key)).toBe(
        restaurantDishPagePath(code, dish, key),
      );
      expect(dishPagePath(code, dish, key)).toBe(
        `${restaurantDishPath(code, dish)}/${key}`,
      );
    }
  });

  // General's h1 has an id of its own since D-237: the flash a landed save
  // brings hands focus to it.
  it("gives a sub page's h1 the id its first group labels itself by, and General's its own (D-225, D-237)", () => {
    expect(dishPageHeadingId("general")).toBe(GENERAL_HEADING_ID);
    expect(GENERAL_HEADING_ID).toBe("dish-general-heading");
    expect(dishPageHeadingId("allergens")).toBe(groupIds("dish").heading);
    expect(dishPageHeadingId("tags")).toBe(TAGS_HEADING_ID);
    expect(dishPageHeadingId("availability")).toBe(AVAILABILITY_HEADING_ID);
    expect(dishPageHeadingId("choices")).toBe(CHOICE_LISTS_HEADING_ID);
  });
});

describe("how each page saves (D-223, D-229, D-237)", () => {
  it("saves General, Allergens, Dietary tags, and Availability by a press, and Choice lists as the owner goes", () => {
    expect(DISH_PAGE_SAVING).toEqual({
      general: "press",
      allergens: "press",
      tags: "press",
      availability: "press",
      choices: "as-you-go",
    });
    expect(dishPageSaving("allergens")).toBe("press");
    expect(dishPageSaving("general")).toBe("press");
    expect(dishPageSaving("choices")).toBe("as-you-go");
  });
});

describe("the state line beside each page's name", () => {
  const line = (
    key: Parameters<typeof dishPageStateLine>[0],
    state: Partial<DishPageState>,
  ) => dishPageStateLine(key, { ...base, ...state }, strings, choices);

  it("gives General none", () => {
    expect(line("general", {})).toBeNull();
  });

  it("says whether the allergen list is confirmed", () => {
    expect(line("allergens", { checked: false })).toBe("Not confirmed yet");
    expect(line("allergens", { checked: true })).toBe("Confirmed");
  });

  it("counts the tags, or says none", () => {
    expect(line("tags", { tags: 0 })).toBe("None");
    expect(line("tags", { tags: 1 })).toBe("1 tag");
    expect(line("tags", { tags: 2 })).toBe("2 tags");
    expect(line("tags", { tags: 3 })).toBe("3 tags");
  });

  it("says the availability choice, then whether a schedule is set", () => {
    expect(line("availability", { availability: "available" })).toBe(
      "Available, no schedule",
    );
    expect(
      line("availability", { availability: "available", scheduled: true }),
    ).toBe("Available, schedule set");
    expect(
      line("availability", { availability: "sold-out", scheduled: true }),
    ).toBe("Sold out today, schedule set");
    expect(line("availability", { availability: "off" })).toBe(
      "Off the menu for now, no schedule",
    );
  });

  it("counts the choice lists, or says none", () => {
    expect(line("choices", { lists: 0 })).toBe("None");
    expect(line("choices", { lists: 1 })).toBe("1 choice list");
    expect(line("choices", { lists: 2 })).toBe("2 choice lists");
  });

  it("is read off the dish, its lists, and what the server decided", () => {
    expect(
      dishPageState(
        {
          check: { at: "2026-11-08T12:00:00Z", byYou: true },
          tags: ["vegan"],
          schedule: { hours: { open: "16:00", close: "21:00" } },
        },
        [{ id: "a", lead: "Choose a side", options: 2 }],
        { state: "sold-out", until: "2026-11-08T23:00:00Z" },
      ),
    ).toEqual({
      checked: true,
      tags: 1,
      availability: "sold-out",
      scheduled: true,
      lists: 1,
    });
    expect(
      dishPageState({ check: null, tags: [], schedule: null }, [], {
        state: "off",
        until: null,
      }),
    ).toEqual({
      checked: false,
      tags: 0,
      availability: "off",
      scheduled: false,
      lists: 0,
    });
  });
});

describe("the nav items", () => {
  it("come in order with their paths, names, and states, the current one alone marked", () => {
    const items = dishPageNavItems(
      code,
      dish,
      "tags",
      { ...base, checked: true, tags: 2, scheduled: true, lists: 1 },
      strings,
      choices,
    );
    expect(items.map((item) => item.name)).toEqual([
      "General",
      "Allergens",
      "Dietary tags",
      "Availability",
      "Choice lists",
    ]);
    expect(items.map((item) => item.state)).toEqual([
      null,
      "Confirmed",
      "2 tags",
      "Available, schedule set",
      "1 choice list",
    ]);
    expect(items.map((item) => item.href)).toEqual(
      DISH_PAGE_KEYS.map((key) => dishPagePath(code, dish, key)),
    );
    expect(items.map((item) => item.current)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });
});

describe("the title (D-225)", () => {
  const names = {
    dish: "Soup of the day",
    section: "Starters",
    menu: "Dinner",
    restaurant: "Test Bistro",
  };

  it("names General for the dish, inside its section and its menu", () => {
    expect(dishPageTitle(en, "general", names)).toBe(
      `Soup of the day${sep}Starters${sep}Dinner${sep}Test Bistro${sep}Accessible Menu`,
    );
  });

  it("puts a sub page's name first, then the dish, the section, and the menu", () => {
    expect(dishPageTitle(en, "allergens", names)).toBe(
      `Allergens${sep}Soup of the day${sep}Starters${sep}Dinner${sep}Test Bistro${sep}Accessible Menu`,
    );
    expect(dishPageTitle(en, "choices", names)).toBe(
      `Choice lists${sep}Soup of the day${sep}Starters${sep}Dinner${sep}Test Bistro${sep}Accessible Menu`,
    );
  });
});
