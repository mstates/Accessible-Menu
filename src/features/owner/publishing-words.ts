import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { formatDate } from "@/domain/date";
import type { MenuPublishState, PublishBlocker } from "@/domain/menu";
import type { MenuReview, Unconfirmed } from "@/domain/menu-review";
import { zonedDay } from "@/domain/timezones";
import { placeIn, type ChoiceStrings } from "./choices/choice-words";
import { counted } from "./editing/list-words";
import {
  restaurantChoiceListPath,
  restaurantDishPagePath,
  restaurantDishPath,
  restaurantMenuPath,
} from "./paths";

// Every sentence Publish shows or says (D-82, migration 12), built in one
// place from copy: the menu's state on its Publishing page and on the Menus
// list, the review of what changed since the last publish and of the
// allergen lists not confirmed (D-224), what blocks Publish, why a press
// did not land, and the dashboard's summary of a restaurant's menus. Pure:
// no React, no network.

export type PublishingStrings = Copy["owner"]["publishing"];
type EditingStrings = Copy["owner"]["editing"];

// Why a press did not land. The first group comes back from the server;
// the last two are what the browser makes of a call that never got an
// answer.
export type PublishFailure =
  | { kind: "signed-out" }
  // The menu is no longer here, or is no longer this owner's.
  | { kind: "gone" }
  | { kind: "parent-gone" }
  // A size with no name or no price blocks it (D-139, D-144), and so does
  // a menu with no dishes (D-177); the list names each one, read back after
  // the refusal.
  | { kind: "blocked"; blockers: PublishBlocker[] }
  // The draft is not the one the page reviewed (D-224): an edit landed
  // after the page loaded, so nothing was published.
  | { kind: "moved" }
  | { kind: "failed" }
  | { kind: "unreachable" }
  | { kind: "out-of-date" };

// "October 11, 2026", the day the menu was published, in the restaurant's
// time zone, the way the allergen check's stamp names its day (D-149).
export function publishedOn(
  at: string,
  timeZone: string,
  lang: string,
): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return formatDate(zonedDay(timeZone, when).day, lang);
}

// The one state sentence on the menu's page: not published; published with
// nothing changed since; or published with changes not published yet.
export function stateSentence(
  strings: PublishingStrings,
  state: MenuPublishState,
  timeZone: string,
  lang: string,
): string {
  if (!state.published || state.publishedAt === null) {
    return strings.state.notPublished;
  }
  const date = publishedOn(state.publishedAt, timeZone, lang);
  return fill(state.changed ? strings.state.changed : strings.state.published, {
    date,
  });
}

// "Soup of the day in Starters has a size with no name.", or, for a menu
// with no dishes, "Lunch has no dishes." (D-177), named by the menu since
// the row names nothing.
export function blockerSentence(
  strings: PublishingStrings,
  blocker: PublishBlocker,
  menu: string,
): string {
  if (blocker.kind === "no-dishes") {
    return fill(strings.problems.noDishes, { menu });
  }
  const template =
    blocker.kind === "size-unnamed"
      ? strings.problems.sizeUnnamed
      : strings.problems.sizeUnpriced;
  return fill(template, { dish: blocker.dish, section: blocker.section });
}

// What a press that did not land says, once: "Dinner was not published.
// Soup of the day has a size with no name. Name it or remove it, then
// publish again.", or "Lunch was not published. It has no dishes. Add a
// dish, then publish again." (D-177).
export function refusedSentence(
  strings: PublishingStrings,
  editing: EditingStrings,
  menu: string,
  action: "publish" | "unpublish",
  failure: PublishFailure,
): string {
  const refused = strings.refused;
  if (action === "unpublish") {
    switch (failure.kind) {
      case "gone":
      case "parent-gone":
        return fill(refused.notUnpublishedGone, { menu });
      case "signed-out":
        return `${fill(refused.notUnpublished, { menu })} ${editing.problems.signedOut}`;
      case "unreachable":
        return `${fill(refused.notUnpublished, { menu })} ${editing.problems.unreachable}`;
      case "out-of-date":
        return `${fill(refused.notUnpublished, { menu })} ${editing.problems.outOfDate}`;
      default:
        return `${fill(refused.notUnpublished, { menu })} ${editing.problems.failed}`;
    }
  }
  switch (failure.kind) {
    case "blocked": {
      const first = failure.blockers[0];
      if (!first)
        return `${fill(refused.notPublished, { menu })} ${editing.problems.failed}`;
      if (first.kind === "no-dishes") return fill(refused.noDishes, { menu });
      const template =
        first.kind === "size-unnamed"
          ? refused.sizeUnnamed
          : refused.sizeUnpriced;
      return fill(template, { menu, dish: first.dish });
    }
    case "moved":
      return fill(refused.moved, { menu });
    case "gone":
    case "parent-gone":
      return fill(refused.gone, { menu });
    case "signed-out":
      return `${fill(refused.notPublished, { menu })} ${editing.problems.signedOut}`;
    case "unreachable":
      return `${fill(refused.notPublished, { menu })} ${editing.problems.unreachable}`;
    case "out-of-date":
      return `${fill(refused.notPublished, { menu })} ${editing.problems.outOfDate}`;
    case "failed":
      return `${fill(refused.notPublished, { menu })} ${editing.problems.failed}`;
  }
}

// The review's words (D-224): one sentence when there is nothing to list,
// a menu that is not published or one with nothing changed; or one sentence
// a kind of change, dishes first, then sections, then the menu's name. A
// changed review always carries a line: the last one stands for a
// difference no other names.
export type ReviewWords = { sentence: string } | { changes: string[] };

export function reviewWords(
  strings: PublishingStrings,
  review: MenuReview,
): ReviewWords {
  const words = strings.review;
  if (review.kind === "first") {
    return {
      sentence:
        review.dishes === 0
          ? words.firstEmpty
          : fill(words.first, {
              sections: counted(words.sectionCount, review.sections),
              dishes: counted(words.dishCount, review.dishes),
            }),
    };
  }
  if (!review.changed) return { sentence: words.none };
  const { dishes, sections } = review;
  const changes: string[] = [];
  const some = (template: { one: string; other: string }, count: number) => {
    if (count > 0) changes.push(counted(template, count));
  };
  some(words.dishesAdded, dishes.added);
  some(words.dishesChanged, dishes.changed);
  some(words.dishesMoved, dishes.moved);
  some(words.dishesRemoved, dishes.removed);
  if (dishes.reordered) changes.push(words.dishesReordered);
  some(words.sectionsAdded, sections.added);
  some(words.sectionsChanged, sections.changed);
  some(words.sectionsRemoved, sections.removed);
  if (sections.reordered) changes.push(words.sectionsReordered);
  if (review.menuRenamed) changes.push(words.menuRenamed);
  if (review.other || changes.length === 0) changes.push(words.other);
  return { changes };
}

// A line of the review that leads somewhere: where, and its words.
export type ReviewLink = { href: string; text: string };

// The allergen area's words (D-224, D-166): the dishes whose list is not
// checked, each a link to its Allergens page, then the options, each a link
// to its choice list's page, where its check is, under a lead that says
// what the list is, that the menu can still be published, and the sentence
// diners read with each one, which the caller takes from
// domain/allergens.ts (rule 8). With nothing left unconfirmed, one
// sentence: every dish, or every dish and every option when the menu holds
// any; and a menu with no dishes says so, never that all are confirmed
// (D-177).
export type UnconfirmedWords =
  { sentence: string } | { lead: string; links: ReviewLink[] };

export function unconfirmedWords(
  strings: PublishingStrings,
  choices: ChoiceStrings,
  unconfirmed: Unconfirmed,
  dinersRead: string,
  code: string,
): UnconfirmedWords {
  const words = strings.unconfirmed;
  const links: ReviewLink[] = [
    ...unconfirmed.dishes.map((dish) => ({
      href: restaurantDishPagePath(code, dish.id, "allergens"),
      text: fill(words.dish, { dish: dish.name, section: dish.section }),
    })),
    ...unconfirmed.options.map((option) => ({
      href: restaurantChoiceListPath(code, option.listId),
      text: fill(words.option, {
        option: option.name,
        place: placeIn(choices, option.lead, option.home),
      }),
    })),
  ];
  if (links.length > 0) {
    return {
      lead: fill(words.lead, { sentence: `"${dinersRead}"` }),
      links,
    };
  }
  if (!unconfirmed.holdsDishes) return { sentence: words.noDishes };
  return {
    sentence: unconfirmed.holdsOptions
      ? words.allDishesAndOptions
      : words.allDishes,
  };
}

// What Publish waits on, as a link to the page that fixes it (D-224): a
// size with no name or no price leads to its dish's General page, where
// sizes are, and a menu with no dishes to its Sections page.
export function blockerLink(
  strings: PublishingStrings,
  blocker: PublishBlocker,
  code: string,
  menu: { id: string; name: string },
): ReviewLink {
  return {
    href:
      blocker.kind === "no-dishes"
        ? restaurantMenuPath(code, menu.id)
        : restaurantDishPath(code, blocker.dishId),
    text: blockerSentence(strings, blocker, menu.name),
  };
}

// The dashboard's sentences for a restaurant's menus: nothing for a
// restaurant with no menu; "No menu is published yet."; or which menus are
// published, and, when any of them has changes not published yet, which.
// Names are joined the way the language joins a list: "Dinner, Lunch, and
// Drinks".
export function publishSummary(
  strings: PublishingStrings,
  states: readonly MenuPublishState[],
  lang: string,
): string[] {
  if (states.length === 0) return [];
  const published = states.filter((state) => state.published);
  if (published.length === 0) return [strings.summary.none];
  const list = new Intl.ListFormat(lang, { type: "conjunction" });
  const sentences = [
    fill(
      published.length === 1
        ? strings.summary.published.one
        : strings.summary.published.other,
      { names: list.format(published.map((state) => state.name)) },
    ),
  ];
  const changed = published.filter((state) => state.changed === true);
  if (changed.length > 0) {
    sentences.push(
      fill(
        changed.length === 1
          ? strings.summary.changed.one
          : strings.summary.changed.other,
        { names: list.format(changed.map((state) => state.name)) },
      ),
    );
  }
  return sentences;
}
