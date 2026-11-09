import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { pageTitle } from "@/copy/title";
import type { Availability } from "@/domain/availability";
import type { OwnerChoiceList } from "@/domain/choices";
import type { OwnerDishDetail } from "@/domain/dish";
import type { PageNavItem } from "@/ui/PageNav";
import { groupIds } from "../allergens/target";
import {
  CHOICE_LISTS_HEADING_ID,
  type ChoiceStrings,
} from "../choices/choice-words";
import { counted } from "../editing/list-words";
import {
  restaurantDishPagePath,
  restaurantDishPath,
  type DishPageSlug,
} from "../paths";
import type { DishStrings } from "./dish-words";
import type { ShowingNow } from "./schedule-words";

// The dish's pages (D-222, D-225): one config for the one thing, read by
// the page nav, the frame, and the routes. A page is added or taken away
// as one entry here. General is the dish's own address and is named for
// the dish; each other page is named by the heading its first group had on
// the one long page, so a nav item, an h1, and a title's first part are the
// same words. How a page saves (D-223, D-229) is one field per entry: a
// page of boxes and radios saves by one named press, and a page of typed
// fields and lists saves as the owner goes (D-111). Pure: no React, no
// network.

export const DISH_PAGE_KEYS = [
  "general",
  "allergens",
  "tags",
  "availability",
  "choices",
] as const;
export type DishPageKey = (typeof DISH_PAGE_KEYS)[number];
export type DishSubPageKey = DishPageSlug;

// How each page saves (D-223): by a press on the page's one Save, or as
// the owner goes. The three press pages render one form each with Save at
// its foot; the two as-you-go pages render the saved status. A page moves
// from one to the other as a change here and in its own hook, nothing
// else.
export type DishPageSaving = "press" | "as-you-go";

export const DISH_PAGE_SAVING: Readonly<Record<DishPageKey, DishPageSaving>> = {
  general: "as-you-go",
  allergens: "press",
  tags: "press",
  availability: "press",
  choices: "as-you-go",
};

export function dishPageSaving(key: DishPageKey): DishPageSaving {
  return DISH_PAGE_SAVING[key];
}

// The id a sub page's h1 carries (D-225): the first group on each page
// labels itself by its heading, and on its own page that heading is the
// h1, so the groups' aria-labelledby and every selector on these ids keep
// working. General's h1 is the dish's name and carries none.
export const DISH_PAGE_HEADING_IDS: Readonly<Record<DishSubPageKey, string>> = {
  allergens: groupIds("dish").heading,
  tags: "dish-tags-heading",
  availability: "dish-availability-heading",
  choices: CHOICE_LISTS_HEADING_ID,
};

export function dishPageHeadingId(key: DishPageKey): string | undefined {
  return key === "general" ? undefined : DISH_PAGE_HEADING_IDS[key];
}

export function dishPagePath(
  code: string,
  dishId: string,
  key: DishPageKey,
): string {
  return key === "general"
    ? restaurantDishPath(code, dishId)
    : restaurantDishPagePath(code, dishId, key);
}

export function dishPageName(
  key: DishPageKey,
  strings: DishStrings,
  choices: ChoiceStrings,
): string {
  switch (key) {
    case "general":
      return strings.pages.general;
    case "allergens":
      return strings.allergens.heading;
    case "tags":
      return strings.tags.heading;
    case "availability":
      return strings.availability.heading;
    case "choices":
      return choices.heading;
  }
}

// Where each page stands, for the words beside its name in the nav: the
// check, how many tags, the availability the server decided and whether a
// schedule is set, and how many choice lists.
export type DishPageState = {
  checked: boolean;
  tags: number;
  availability: Availability;
  scheduled: boolean;
  lists: number;
};

export function dishPageState(
  dish: Pick<OwnerDishDetail, "check" | "tags" | "schedule">,
  lists: readonly OwnerChoiceList[],
  showing: ShowingNow,
): DishPageState {
  return {
    checked: dish.check !== null,
    tags: dish.tags.length,
    availability: showing.state,
    scheduled: dish.schedule !== null,
    lists: lists.length,
  };
}

function availabilityChoice(
  availability: Availability,
  strings: DishStrings["availability"],
): string {
  switch (availability) {
    case "available":
      return strings.available;
    case "sold-out":
      return strings.soldOut;
    case "off":
      return strings.off;
  }
}

// The state line beside a page's name, or null for General, which has
// none. Allergens says whether the list is confirmed, in the words the
// nudge needs (D-222); the counts say none or how many; Availability says
// the chosen radio's words, then whether a schedule is set.
export function dishPageStateLine(
  key: DishPageKey,
  state: DishPageState,
  strings: DishStrings,
  choices: ChoiceStrings,
): string | null {
  const words = strings.pages.state;
  switch (key) {
    case "general":
      return null;
    case "allergens":
      return state.checked
        ? words.allergensConfirmed
        : words.allergensNotConfirmed;
    case "tags":
      return state.tags === 0
        ? words.none
        : counted(words.tagCount, state.tags);
    case "availability":
      return fill(words.availability, {
        choice: availabilityChoice(state.availability, strings.availability),
        schedule: state.scheduled ? words.scheduleSet : words.scheduleNone,
      });
    case "choices":
      return state.lists === 0
        ? words.none
        : counted(choices.lists.count, state.lists);
  }
}

// The five items in D-222's order, the current one marked.
export function dishPageNavItems(
  code: string,
  dishId: string,
  current: DishPageKey,
  state: DishPageState,
  strings: DishStrings,
  choices: ChoiceStrings,
): PageNavItem[] {
  return DISH_PAGE_KEYS.map((key) => ({
    href: dishPagePath(code, dishId, key),
    name: dishPageName(key, strings, choices),
    state: dishPageStateLine(key, state, strings, choices),
    current: key === current,
  }));
}

// The title (D-113, D-143, D-225): General is the dish inside its section
// and its menu; a sub page is the page inside the dish, the section, and
// the menu, so the page is heard first.
export function dishPageTitle(
  copy: Copy,
  key: DishPageKey,
  names: { dish: string; section: string; menu: string; restaurant: string },
): string {
  if (key === "general") {
    return pageTitle(copy, names.dish, names.restaurant, [
      names.section,
      names.menu,
    ]);
  }
  return pageTitle(
    copy,
    dishPageName(key, copy.owner.dish, copy.owner.choices),
    names.restaurant,
    [names.dish, names.section, names.menu],
  );
}
