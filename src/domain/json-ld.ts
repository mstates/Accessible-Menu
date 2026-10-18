import { caloriesWords, type Calories, type CaloriesCopy } from "./calories";
import type { DinerDish, DinerMenuView } from "./diner";
import { DAY_KEYS, isOpenAllDay, type DayKey, type Hours } from "./hours";
import { priceInputText } from "./money";

// The schema.org markup every menu page carries as one application/ld+json
// script (Spec 3.1, D-184): a Restaurant with its permanent menu URL, the
// owner's site, its city and country, and its opening hours, holding the
// Menu the page shows with its sections and its dishes, their prices, and
// their calories, built from the same view model the page renders (rule
// 8), so the markup and the page never disagree. Nothing else: no
// allergens, since the sentence a person confirmed is the only form they
// take; no dietary tags (Q-108); no choice lists or options; no sold-out
// state, no specials, no notes. Data only; nothing executes. The two
// unavailable pages and the not-found page carry no script. The types are
// written by hand here, since schema.org's own typings would be a
// dependency for a dozen keys (rule 12). Pure: no React, no network.

const CONTEXT = "https://schema.org";
const CURRENCY = "USD";

// schema.org's day names: vocabulary a search engine reads in English
// whatever the page's language, so they are not copy and never come from
// src/copy.
const SCHEMA_DAYS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

// Google's forms for opening hours (its structured data guide for local
// businesses): a day open around the clock is 00:00 to 23:59, a closed day
// is 00:00 to 00:00, and a range past midnight keeps its times, the close
// read as the next day. Our stored around-the-clock range opens and closes
// at the same time (hours.ts), which Google would read as closed, so it is
// translated here.
const ALL_DAY = { opens: "00:00", closes: "23:59" };
const CLOSED = { opens: "00:00", closes: "00:00" };

export type JsonLdOffer = {
  "@type": "Offer";
  // The size's name, for a dish priced by size.
  name?: string;
  // Dollars and cents with two decimals, as the owner's field shows them.
  price: string;
  priceCurrency: typeof CURRENCY;
};

export type JsonLdNutrition = {
  "@type": "NutritionInformation";
  calories: string;
};

export type JsonLdMenuItem = {
  "@type": "MenuItem";
  name: string;
  description?: string;
  offers?: JsonLdOffer[];
  nutrition?: JsonLdNutrition;
};

export type JsonLdMenuSection = {
  "@type": "MenuSection";
  name: string;
  hasMenuItem: JsonLdMenuItem[];
};

export type JsonLdMenu = {
  "@type": "Menu";
  name: string;
  url: string;
  // Absent when no section shows (D-177).
  hasMenuSection?: JsonLdMenuSection[];
};

export type JsonLdAddress = {
  "@type": "PostalAddress";
  addressLocality?: string;
  addressCountry: string;
};

export type JsonLdOpeningHours = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
};

export type MenuJsonLd = {
  "@context": typeof CONTEXT;
  "@type": "Restaurant";
  name: string;
  // The permanent menu URL (D-88).
  url: string;
  // The owner's own site, when given.
  sameAs?: string;
  address: JsonLdAddress;
  openingHoursSpecification?: JsonLdOpeningHours[];
  hasMenu: JsonLdMenu;
};

export type MenuJsonLdRestaurant = {
  name: string;
  website: string | null;
  city: string | null;
  country: string;
  hours: Hours | null;
};

export type MenuJsonLdInputs = {
  restaurant: MenuJsonLdRestaurant;
  // The permanent menu URL, the bare code, and the page's own URL, its
  // canonical link, both from menu-url.ts.
  urls: { restaurant: string; menu: string };
  menu: DinerMenuView;
  copy: CaloriesCopy;
  lang: string;
};

// One entry per day and range, Monday first, in Google's forms above.
function openingHours(hours: Hours): JsonLdOpeningHours[] {
  return DAY_KEYS.flatMap((key) => {
    const ranges = hours[key];
    const times =
      ranges.length === 0
        ? [CLOSED]
        : isOpenAllDay(ranges)
          ? [ALL_DAY]
          : ranges.map((range) => ({ opens: range.open, closes: range.close }));
    return times.map((time) => ({
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: SCHEMA_DAYS[key],
      ...time,
    }));
  });
}

// NutritionInformation's calories is one amount with its unit, so only a
// dish with one calorie number carries it (Q-110): a dish priced by size
// keeps its calories on each size, and a range stays in the page's words.
// The words are the page's own, from the one builder (rule 8).
function nutrition(
  calories: Calories | null,
  copy: CaloriesCopy,
  lang: string,
): JsonLdNutrition | null {
  if (calories === null || calories.high !== null) return null;
  return {
    "@type": "NutritionInformation",
    calories: caloriesWords(calories, copy, lang),
  };
}

function menuItem(
  dish: DinerDish,
  copy: CaloriesCopy,
  lang: string,
): JsonLdMenuItem {
  const item: JsonLdMenuItem = { "@type": "MenuItem", name: dish.name };
  if (dish.description !== null) item.description = dish.description;
  if (dish.offers.length > 0) {
    item.offers = dish.offers.map((offer) => ({
      "@type": "Offer",
      ...(offer.size === null ? {} : { name: offer.size }),
      price: priceInputText(offer.cents),
      priceCurrency: CURRENCY,
    }));
  }
  const energy = nutrition(dish.calories, copy, lang);
  if (energy) item.nutrition = energy;
  return item;
}

// The graph for one menu page. Every value that is absent is an absent key,
// never null or an empty list, so the markup says only what the page shows.
export function menuJsonLd(inputs: MenuJsonLdInputs): MenuJsonLd {
  const { restaurant, urls, menu, copy, lang } = inputs;
  const sections = menu.sections.map((section) => ({
    "@type": "MenuSection" as const,
    name: section.name,
    hasMenuItem: section.dishes.map((dish) => menuItem(dish, copy, lang)),
  }));
  return {
    "@context": CONTEXT,
    "@type": "Restaurant",
    name: restaurant.name,
    url: urls.restaurant,
    ...(restaurant.website === null ? {} : { sameAs: restaurant.website }),
    address: {
      "@type": "PostalAddress",
      ...(restaurant.city === null ? {} : { addressLocality: restaurant.city }),
      addressCountry: restaurant.country,
    },
    ...(restaurant.hours === null
      ? {}
      : { openingHoursSpecification: openingHours(restaurant.hours) }),
    hasMenu: {
      "@type": "Menu",
      name: menu.name,
      url: urls.menu,
      ...(sections.length === 0 ? {} : { hasMenuSection: sections }),
    },
  };
}

// The script's text: the graph as JSON with every less-than sign written
// as its JSON escape, so a name or a description an owner typed can never
// close the script or open a tag inside it. JSON reads the escape back as
// the character, so the data is unchanged.
export function serializeJsonLd(graph: MenuJsonLd): string {
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
