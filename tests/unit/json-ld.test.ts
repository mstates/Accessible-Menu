import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  visibleMenu,
  type DinerCopy,
  type DinerMenuView,
  type DishState,
} from "../../src/domain/diner";
import type { Hours } from "../../src/domain/hours";
import {
  menuJsonLd,
  serializeJsonLd,
  type MenuJsonLd,
  type MenuJsonLdRestaurant,
} from "../../src/domain/json-ld";
import { menuUrl } from "../../src/domain/menu-url";
import {
  menuSnapshotSchema,
  snapshotKeys,
  type MenuSnapshot,
} from "../../src/domain/snapshot";

// The menu page's markup (Spec 3.1, D-184) against CI Diner's Dinner as
// publish_menu() wrote it (tests/fixtures/menu-snapshot.v1.json) with the
// states its data file sets (Starters' soup a special every day from 4 to
// 9 pm, Garlic bread off the menu) and the restaurant's details as the
// stand-in holds them: the graph says what the page shows and nothing else.

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
const origin = "https://menus.example";
const code = "56097672";

const restaurant: MenuJsonLdRestaurant = {
  name: "CI Diner (test restaurant, not real)",
  website: "https://ci-diner.example",
  city: "Reading",
  country: "US",
  hours,
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

const available: DishState = {
  available: true,
  soldOutAt: null,
  schedule: null,
};

// The states as ci_diner.sql leaves them.
function ciStates(snapshot: MenuSnapshot): Map<string, DishState> {
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

// 5 pm in New York on Tuesday, October 13, 2026 (EDT): the soup shows.
const fivePm = new Date("2026-10-13T21:00:00Z");

function view(
  snapshot = dinner(),
  states = ciStates(snapshot),
  now = fivePm,
): DinerMenuView {
  return visibleMenu({ snapshot, states, now, hours, zone, copy, lang: "en" });
}

// The bread back on the menu, so the market price and the unchecked dish
// are in the graph.
function withBread(): DinerMenuView {
  const snapshot = dinner();
  const states = ciStates(snapshot);
  states.set(dishId(snapshot, "Starters", "Garlic bread"), available);
  return view(snapshot, states);
}

function graph(
  menu: DinerMenuView = view(),
  details: MenuJsonLdRestaurant = restaurant,
  menuUrlOfPage = menuUrl(origin, code),
): MenuJsonLd {
  return menuJsonLd({
    restaurant: details,
    urls: { restaurant: menuUrl(origin, code), menu: menuUrlOfPage },
    menu,
    copy: en.calories,
    lang: "en",
  });
}

function section(root: MenuJsonLd, name: string) {
  const found = root.hasMenu.hasMenuSection?.find((s) => s.name === name);
  if (!found) throw new Error(`no section ${name}`);
  return found;
}

function item(root: MenuJsonLd, sectionName: string, name: string) {
  const found = section(root, sectionName).hasMenuItem.find(
    (i) => i.name === name,
  );
  if (!found) throw new Error(`no dish ${name} in ${sectionName}`);
  return found;
}

// Every key the shape allows, and no other (D-184).
const allowedKeys = [
  "@context",
  "@type",
  "name",
  "url",
  "sameAs",
  "address",
  "addressLocality",
  "addressCountry",
  "openingHoursSpecification",
  "dayOfWeek",
  "opens",
  "closes",
  "hasMenu",
  "hasMenuSection",
  "hasMenuItem",
  "description",
  "offers",
  "price",
  "priceCurrency",
  "nutrition",
  "calories",
];

describe("the restaurant and its menu (Spec 3.1, D-184)", () => {
  it("names the restaurant with its permanent URL, its site, its city and country, and the menu with the page's own URL", () => {
    const menuId = dinner().menu.id;
    const root = graph(view(), restaurant, menuUrl(origin, code, menuId));
    expect(root["@context"]).toBe("https://schema.org");
    expect(root["@type"]).toBe("Restaurant");
    expect(root.name).toBe("CI Diner (test restaurant, not real)");
    expect(root.url).toBe(`${origin}/m/${code}`);
    expect(root.sameAs).toBe("https://ci-diner.example");
    expect(root.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Reading",
      addressCountry: "US",
    });
    expect(root.hasMenu["@type"]).toBe("Menu");
    expect(root.hasMenu.name).toBe("Dinner");
    expect(root.hasMenu.url).toBe(`${origin}/m/${code}/${menuId}`);
  });

  it("leaves out the site and the city when the restaurant has none", () => {
    const root = graph(view(), { ...restaurant, website: null, city: null });
    expect("sameAs" in root).toBe(false);
    expect(root.address).toEqual({
      "@type": "PostalAddress",
      addressCountry: "US",
    });
  });

  it("writes the week in Google's forms: a closed day, two ranges, a run, a night past midnight, and a day open around the clock", () => {
    const spec = (dayOfWeek: string, opens: string, closes: string) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek,
      opens,
      closes,
    });
    expect(graph().openingHoursSpecification).toEqual([
      spec("Monday", "00:00", "00:00"),
      spec("Tuesday", "11:00", "14:00"),
      spec("Tuesday", "17:00", "21:00"),
      spec("Wednesday", "11:00", "21:00"),
      spec("Thursday", "11:00", "21:00"),
      spec("Friday", "11:00", "21:00"),
      spec("Saturday", "17:00", "02:00"),
      spec("Sunday", "00:00", "23:59"),
    ]);
    // A stored around-the-clock range at any time reads the same way.
    const noon = graph(view(), {
      ...restaurant,
      hours: { ...hours, sun: [{ open: "12:00", close: "12:00" }] },
    });
    expect(noon.openingHoursSpecification?.at(-1)).toEqual(
      spec("Sunday", "00:00", "23:59"),
    );
    expect(
      "openingHoursSpecification" in
        graph(view(), { ...restaurant, hours: null }),
    ).toBe(false);
  });
});

describe("the sections and dishes (D-184)", () => {
  it("lists the shown sections and dishes in page order and leaves out what the page hides", () => {
    const root = graph();
    expect(root.hasMenu.hasMenuSection?.map((s) => s["@type"])).toEqual([
      "MenuSection",
      "MenuSection",
    ]);
    expect(root.hasMenu.hasMenuSection?.map((s) => s.name)).toEqual([
      "Starters",
      "Mains",
    ]);
    expect(section(root, "Starters").hasMenuItem.map((i) => i.name)).toEqual([
      "Soup of the day",
      "House salad",
    ]);
    expect(section(root, "Mains").hasMenuItem.map((i) => i.name)).toEqual([
      "Soup of the day",
    ]);
    expect(item(root, "Starters", "House salad")["@type"]).toBe("MenuItem");
    const text = serializeJsonLd(root);
    expect(text).not.toContain("Garlic bread");
    expect(text).not.toContain("Desserts");
  });

  it("carries a dish's description when it has one, and no key when it has none", () => {
    const snapshot = dinner();
    const salad = snapshot.sections[0]?.items[1];
    if (!salad) throw new Error("no salad");
    salad.description = "Greens, tomato, and cucumber.";
    const root = graph(view(snapshot));
    expect(item(root, "Starters", "House salad").description).toBe(
      "Greens, tomato, and cucumber.",
    );
    expect("description" in item(root, "Starters", "Soup of the day")).toBe(
      false,
    );
  });

  it("gives each price as an Offer in dollars: one per size, one for one price, none for market price or a blank price", () => {
    const root = graph(withBread());
    expect(item(root, "Starters", "Soup of the day").offers).toEqual([
      { "@type": "Offer", name: "Cup", price: "5.00", priceCurrency: "USD" },
      { "@type": "Offer", name: "Bowl", price: "8.00", priceCurrency: "USD" },
    ]);
    expect(item(root, "Starters", "House salad").offers).toEqual([
      { "@type": "Offer", price: "9.00", priceCurrency: "USD" },
    ]);
    expect("offers" in item(root, "Starters", "Garlic bread")).toBe(false);
    expect("offers" in item(root, "Mains", "Soup of the day")).toBe(false);
  });

  it("carries calories only as one number on a dish at one price or market price, in the page's words (Q-110)", () => {
    const root = graph(withBread());
    expect(item(root, "Starters", "House salad").nutrition).toEqual({
      "@type": "NutritionInformation",
      calories: "320 calories",
    });
    expect(item(root, "Starters", "Garlic bread").nutrition).toEqual({
      "@type": "NutritionInformation",
      calories: "410 calories",
    });
    // Priced by size: the calories sit on each size and stay on the page.
    expect("nutrition" in item(root, "Starters", "Soup of the day")).toBe(
      false,
    );
    // No calories at all.
    expect("nutrition" in item(root, "Mains", "Soup of the day")).toBe(false);
    // A range is not one number.
    const snapshot = dinner();
    const salad = snapshot.sections[0]?.items[1];
    if (!salad || salad.price.kind !== "one") throw new Error("no salad");
    salad.price.calories_high = 400;
    expect(
      "nutrition" in item(graph(view(snapshot)), "Starters", "House salad"),
    ).toBe(false);
  });

  it("holds no allergen, tag, option, availability, or schedule words, and no key outside the shape", () => {
    const root = graph(withBread());
    const text = serializeJsonLd(root);
    for (const word of [
      en.allergens.contains,
      "milk",
      "wheat",
      "celery",
      en.allergens.checkedNone,
      en.allergens.notConfirmed,
      en.dietary.names.vegetarian,
      en.dietary.names["made-without-gluten"],
      "Choose a dressing",
      "Ranch",
      "Vinaigrette",
      "Buttered roll",
      en.availability.soldOut,
      "Every day",
      en.menu.cookedToOrder,
      en.allergens.confirmedAll,
    ]) {
      expect(text, `the markup never says ${word}`).not.toContain(word);
    }
    for (const key of snapshotKeys(root)) {
      expect(allowedKeys, `the key ${key} is one the shape allows`).toContain(
        key,
      );
    }
  });

  it("carries the menu's name and URL alone when no dish shows (D-177)", () => {
    const snapshot = dinner();
    const states = new Map(
      [...ciStates(snapshot)].map(([id]) => [
        id,
        { ...available, available: false },
      ]),
    );
    const root = graph(view(snapshot, states));
    expect(root.hasMenu).toEqual({
      "@type": "Menu",
      name: "Dinner",
      url: `${origin}/m/${code}`,
    });
  });
});

describe("the script's text", () => {
  it("is the graph as JSON, read back unchanged", () => {
    const root = graph();
    const text = serializeJsonLd(root);
    expect(text).toBe(JSON.stringify(root));
    expect(JSON.parse(text)).toEqual(root);
  });

  it("writes every less-than sign as its escape, so owner text can never close the script", () => {
    const snapshot = dinner();
    // The states by the fixture's names, before the rename.
    const states = ciStates(snapshot);
    const salad = snapshot.sections[0]?.items[1];
    if (!salad) throw new Error("no salad");
    salad.name = "House salad</script><script>alert(1)</script>";
    salad.description = "Greens <b>and</b> more";
    const root = graph(view(snapshot, states), {
      ...restaurant,
      name: "<CI Diner>",
    });
    const text = serializeJsonLd(root);
    expect(text).not.toContain("<");
    expect(text).toContain("\\u003c/script>");
    expect(text).toContain("\\u003cCI Diner>");
    expect(JSON.parse(text)).toEqual(root);
    expect(
      item(JSON.parse(text) as MenuJsonLd, "Starters", salad.name).name,
    ).toBe(salad.name);
  });
});
