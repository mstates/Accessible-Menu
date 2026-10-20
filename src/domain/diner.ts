import {
  allergenSentence,
  confirmationLine,
  type AllergenCopy,
  type AllergenSentence,
  type ConfirmationLine,
} from "./allergens";
import { availabilityAt } from "./availability";
import {
  caloriesOf,
  caloriesWords,
  type Calories,
  type CaloriesCopy,
} from "./calories";
import { optionSentence, type OptionReading } from "./choices";
import { todayIn } from "./date";
import {
  dietarySentence,
  type DietaryCopy,
  type DietarySentence,
} from "./dietary";
import type { Hours } from "./hours";
import {
  displayAmount,
  spokenAmount,
  type MoneyCopy,
  type PriceText,
} from "./money";
import {
  scheduleSentence,
  showingAt,
  type Schedule,
  type ScheduleCopy,
} from "./schedule";
import type {
  MenuSnapshot,
  SnapshotChoiceList,
  SnapshotItem,
  SnapshotSection,
} from "./snapshot";
import type { TimeCopy } from "./time";
import type { TimedDish } from "./timed";
import type { AllergenId, DietaryTagId } from "./types";

// What a diner page shows at one moment (Spec 3.1, 3.2, 3.4): the published
// snapshot (D-82, D-170) read against each dish's live state (D-84, D-159,
// D-160) and the clock, with every sentence from the one builder that owns
// it (module rule 8). The section list's counts, the sections, the
// confirmation line, and the notices come from the same pass, so they
// agree with what the page shows and change together at each timed end
// (domain/timed.ts). Pure: no React, no network.

// A dish's live state, read by its id from published_item_states; a dish
// with no row shows as available with no schedule, since it was published
// and hiding it on a missing row would be the worse failure (Q-89,
// defaulted).
export type DishState = {
  available: boolean;
  soldOutAt: string | null;
  schedule: Schedule | null;
};

const availableState: DishState = {
  available: true,
  soldOutAt: null,
  schedule: null,
};

// Q-74: a section's lists are repeated inside every dish of the section
// while they hold this many options or fewer in all; past it each list
// renders once under the heading with one in-page link inside each dish.
// Chosen by ear on a real kids section; one number to change.
export const SECTION_LISTS_REPEAT_UP_TO = 4;

export type DinerCopy = {
  allergens: AllergenCopy;
  dietary: DietaryCopy;
  money: MoneyCopy;
  calories: CaloriesCopy;
  time: TimeCopy;
  schedule: ScheduleCopy;
  marketPrice: string;
  soldOut: string;
};

// An option as its line reads (D-166, D-182): its words (name, added price,
// calories) then its own allergen sentence, the two forms optionSentence()
// builds, the numerals for the eye and the words for a screen reader, the
// same string when nothing in it has a spoken form. One run, so one stop.
export type DinerOption = {
  id: string;
  name: string;
  line: PriceText;
  // The major allergens the line's sentence names, in its order, for the
  // icon row under it when the owner turned icons on (D-189); empty for the
  // other two sentences. From the same call as the words (rule 8).
  allergenIcons: AllergenId[];
};

export type DinerChoiceList = {
  id: string;
  lead: string;
  options: DinerOption[];
};

// A price as a number, for the menu page's markup (D-184): one per size,
// one for one price with an amount, none for market price or a blank price.
export type DinerOffer = { size: string | null; cents: number };

export type DinerDish = {
  id: string;
  name: string;
  description: string | null;
  note: string | null;
  price: PriceText | null;
  // The same price and calories as numbers, for the markup, so it can never
  // disagree with the words above (rule 8). The calories are the dish's own,
  // for one price or market price; a dish priced by size has none here,
  // since its calories sit on each size and stay in the page's words.
  offers: DinerOffer[];
  calories: Calories | null;
  allergen: AllergenSentence;
  dietary: DietarySentence | null;
  // The ids behind the two lines above, for the icon rows under them when
  // the owner turned icons on (D-189): the sentence's major allergens in
  // its order, empty for the other two sentences, and the diet line's tags.
  // From the same calls as the words, so a row can never disagree with its
  // line (rule 8).
  allergenIcons: AllergenId[];
  dietaryIcons: DietaryTagId[];
  cookedToOrder: boolean;
  soldOut: boolean;
  // The special's days and hours in words, when the dish is a special.
  special: string | null;
  lists: DinerChoiceList[];
};

export type DinerSection = {
  id: string;
  name: string;
  note: string | null;
  lists: DinerChoiceList[];
  // Whether the section's lists repeat inside each dish (Q-74).
  repeatLists: boolean;
  dishes: DinerDish[];
};

export type DinerNotices = { calories: boolean; cookedToOrder: boolean };

// The strings menuNaming() reads. The locale's menu copy satisfies it.
export type MenuNamingCopy = {
  title: string;
  menuTitle: string;
  menuName: string;
  menuWord: string;
};

export type MenuNaming = { title: string; line: string | null };

// The menu's words in the page title and under the restaurant's name
// (Q-97, D-81): the name with the word "menu" added once, so "Dinner" reads
// "Dinner menu" and "Kids Menu" stays as it is, in the title as "{words},
// {restaurant}" whatever the number of menus, and as the line where the
// switcher would sit when one menu is published. A name that is only the
// word, in any case and with any outer space, is no name: the restaurant's
// title alone and no line. One builder, so the title and the line never
// differ, and the word is never doubled.
export function menuNaming(
  menu: string,
  restaurant: string,
  copy: MenuNamingCopy,
): MenuNaming {
  const name = menu.trim();
  const word = copy.menuWord.trim().toLowerCase();
  if (name.toLowerCase() === word) {
    return {
      title: copy.title.replace("{restaurant}", () => restaurant),
      line: null,
    };
  }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const endsWithWord = new RegExp(`(^|\\s)${escaped}$`, "i").test(name);
  const words = endsWithWord
    ? name
    : copy.menuName.replace("{menu}", () => name);
  return {
    title: copy.menuTitle
      .replace("{menu}", () => words)
      .replace("{restaurant}", () => restaurant),
    line: words,
  };
}

export type DinerMenuView = {
  id: string;
  name: string;
  sections: DinerSection[];
  // Null when no dish shows (D-177): the page then says nothing about
  // allergens and renders one line where its sections would be.
  confirmation: ConfirmationLine | null;
  notices: DinerNotices;
};

type Allergens = SnapshotItem["allergens"];

// A dish's or an option's allergens as the builders read them: the lists
// when a person checked them, nothing and unreviewed when not.
function readingOf(
  allergens: Allergens,
): Pick<OptionReading, "allergens" | "customAllergens" | "allergensReviewed"> {
  return allergens.checked
    ? {
        allergens: allergens.major,
        customAllergens: allergens.other,
        allergensReviewed: true,
      }
    : { allergens: [], customAllergens: [], allergensReviewed: false };
}

function sentenceOf(
  allergens: Allergens,
  copy: AllergenCopy,
): AllergenSentence {
  return allergenSentence(readingOf(allergens), copy);
}

function withCalories(
  text: PriceText,
  low: number | null,
  high: number | null,
  copy: DinerCopy,
  lang: string,
): PriceText {
  const calories = caloriesOf(low, high);
  if (!calories) return text;
  const words = caloriesWords(calories, copy.calories, lang);
  return {
    display: text.display === "" ? words : `${text.display}, ${words}`,
    spoken: text.spoken === "" ? words : `${text.spoken}, ${words}`,
  };
}

// The price as a diner reads it (Q-6, D-139, D-167): one price with its
// calories beside it, each size with its price and calories ("Cup $5, 180
// calories. Bowl $8, 290 calories."), or "Market price"; null when there
// is nothing to show, as for a blank one price or no size.
export function dishPriceWords(
  price: SnapshotItem["price"],
  copy: DinerCopy,
  lang: string,
): PriceText | null {
  switch (price.kind) {
    case "one": {
      const base: PriceText =
        price.price_cents === null
          ? { display: "", spoken: "" }
          : {
              display: displayAmount(price.price_cents),
              spoken: spokenAmount(price.price_cents, copy.money),
            };
      const text = withCalories(
        base,
        price.calories_low,
        price.calories_high,
        copy,
        lang,
      );
      return text.display === "" ? null : text;
    }
    case "sizes": {
      if (price.sizes.length === 0) return null;
      const parts = price.sizes.map((size) =>
        withCalories(
          {
            display: `${size.name} ${displayAmount(size.price_cents)}`,
            spoken: `${size.name}, ${spokenAmount(size.price_cents, copy.money)}`,
          },
          size.calories_low,
          size.calories_high,
          copy,
          lang,
        ),
      );
      return {
        display: parts.map((part) => `${part.display}.`).join(" "),
        spoken: parts.map((part) => `${part.spoken}.`).join(" "),
      };
    }
    case "market":
      return withCalories(
        { display: copy.marketPrice, spoken: copy.marketPrice },
        price.calories_low,
        price.calories_high,
        copy,
        lang,
      );
  }
}

// The numbers behind the words (D-184), from the one price the words come
// from: an offer for one price with an amount, one per size, none for
// market price or a blank price; the dish's own calories for one price or
// market price, and null for a dish priced by size.
function dishNumbers(price: SnapshotItem["price"]): {
  offers: DinerOffer[];
  calories: Calories | null;
} {
  switch (price.kind) {
    case "one":
      return {
        offers:
          price.price_cents === null
            ? []
            : [{ size: null, cents: price.price_cents }],
        calories: caloriesOf(price.calories_low, price.calories_high),
      };
    case "sizes":
      return {
        offers: price.sizes.map((size) => ({
          size: size.name,
          cents: size.price_cents,
        })),
        calories: null,
      };
    case "market":
      return {
        offers: [],
        calories: caloriesOf(price.calories_low, price.calories_high),
      };
  }
}

// A list as the page draws it: its lead, and each option's one line in
// both forms (D-182).
function listView(
  list: SnapshotChoiceList,
  copy: DinerCopy,
  lang: string,
): DinerChoiceList {
  return {
    id: list.id,
    lead: list.lead,
    options: list.options.map((option) => {
      const { display, spoken, allergen } = optionSentence(
        {
          name: option.name,
          addedPriceCents: option.added_price_cents,
          calories: caloriesOf(option.calories_low, option.calories_high),
          ...readingOf(option.allergens),
        },
        copy,
        lang,
      );
      return {
        id: option.id,
        name: option.name,
        line: { display, spoken },
        allergenIcons: allergen.kind === "contains" ? allergen.allergens : [],
      };
    }),
  };
}

function uncheckedOptions(lists: readonly SnapshotChoiceList[]): number {
  return lists
    .flatMap((list) => list.options)
    .filter((option) => !option.allergens.checked).length;
}

function listsShowCalories(lists: readonly SnapshotChoiceList[]): boolean {
  return lists.some((list) =>
    list.options.some((option) => option.calories_low !== null),
  );
}

function priceShowsCalories(price: SnapshotItem["price"]): boolean {
  if (price.kind === "sizes") {
    return price.sizes.some((size) => size.calories_low !== null);
  }
  return price.calories_low !== null;
}

export type VisibleMenuInputs = {
  snapshot: MenuSnapshot;
  states: ReadonlyMap<string, DishState>;
  now: Date;
  hours: Hours | null;
  zone: string;
  copy: DinerCopy;
  lang: string;
};

// Every dish of the snapshot with its live state, for the timed ends.
export function timedDishes(
  snapshot: MenuSnapshot,
  states: ReadonlyMap<string, DishState>,
): TimedDish[] {
  return snapshot.sections.flatMap((section) =>
    section.items.map((dish) => states.get(dish.id) ?? availableState),
  );
}

// The page as of now. A dish shows when it is available or sold out today
// and, if it is a special, its schedule says it shows now (D-159, D-160);
// a dish off the menu, or outside its schedule, is hidden. A section with
// nothing to show is hidden whole, note and lists included, and leaves the
// section list, so the list never reads "Specials, 0 items" (Q-89,
// defaulted); it returns at the next timed end. When no dish shows at all,
// the view has no sections and no confirmation line (D-177): zero of zero
// is not every dish, and the page says so in one line instead.
export function visibleMenu(inputs: VisibleMenuInputs): DinerMenuView {
  const { snapshot, states, now, hours, zone, copy, lang } = inputs;
  const today = todayIn(zone, now);
  let shownDishes = 0;
  let unconfirmedDishes = 0;
  let unconfirmedOptions = 0;
  let calories = false;
  let cookedToOrder = false;

  const dishView = (dish: SnapshotItem): DinerDish | null => {
    const state = states.get(dish.id) ?? availableState;
    const availability = availabilityAt(state, now, hours, zone);
    if (availability.state === "off") return null;
    let special: string | null = null;
    if (state.schedule) {
      if (!showingAt(state.schedule, now, zone).showing) return null;
      special = scheduleSentence(
        state.schedule,
        today,
        lang,
        copy.schedule,
        copy.time,
      );
    }
    shownDishes += 1;
    if (!dish.allergens.checked) unconfirmedDishes += 1;
    unconfirmedOptions += uncheckedOptions(dish.choice_lists);
    calories ||= priceShowsCalories(dish.price);
    calories ||= listsShowCalories(dish.choice_lists);
    cookedToOrder ||= dish.cooked_to_order;
    const allergen = sentenceOf(dish.allergens, copy.allergens);
    const dietary = dietarySentence(dish.dietary_tags, copy.dietary);
    return {
      id: dish.id,
      name: dish.name,
      description: dish.description,
      note: dish.note,
      price: dishPriceWords(dish.price, copy, lang),
      ...dishNumbers(dish.price),
      allergen,
      dietary,
      allergenIcons: allergen.kind === "contains" ? allergen.allergens : [],
      dietaryIcons: dietary?.tags ?? [],
      cookedToOrder: dish.cooked_to_order,
      soldOut: availability.state === "sold-out",
      special,
      lists: dish.choice_lists.map((list) => listView(list, copy, lang)),
    };
  };

  const sectionView = (section: SnapshotSection): DinerSection | null => {
    const dishes = section.items.flatMap((dish) => {
      const view = dishView(dish);
      return view ? [view] : [];
    });
    if (dishes.length === 0) return null;
    unconfirmedOptions += uncheckedOptions(section.choice_lists);
    calories ||= listsShowCalories(section.choice_lists);
    const optionCount = section.choice_lists.reduce(
      (sum, list) => sum + list.options.length,
      0,
    );
    return {
      id: section.id,
      name: section.name,
      note: section.note,
      lists: section.choice_lists.map((list) => listView(list, copy, lang)),
      repeatLists: optionCount <= SECTION_LISTS_REPEAT_UP_TO,
      dishes,
    };
  };

  const sections = snapshot.sections.flatMap((section) => {
    const view = sectionView(section);
    return view ? [view] : [];
  });
  return {
    id: snapshot.menu.id,
    name: snapshot.menu.name,
    sections,
    confirmation: confirmationLine(
      {
        shown: shownDishes,
        dishes: unconfirmedDishes,
        options: unconfirmedOptions,
      },
      copy.allergens,
    ),
    notices: { calories, cookedToOrder },
  };
}
