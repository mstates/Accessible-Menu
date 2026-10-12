import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { formatDate } from "@/domain/date";
import type { MenuPublishState, PublishBlocker } from "@/domain/menu";
import { zonedDay } from "@/domain/timezones";

// Every sentence Publish shows or says (D-82, migration 12), built in one
// place from copy: the menu's state on its own page, what blocks Publish,
// why a press did not land, and the dashboard's summary of a restaurant's
// menus. Pure: no React, no network.

export type PublishingStrings = Copy["owner"]["publishing"];
type EditingStrings = Copy["owner"]["editing"];

// Why a press did not land. The first group comes back from the server;
// the last two are what the browser makes of a call that never got an
// answer (useEditing).
export type PublishFailure =
  | { kind: "signed-out" }
  // The menu is no longer here, or is no longer this owner's.
  | { kind: "gone" }
  | { kind: "parent-gone" }
  // A size with no name or no price blocks it (D-139, D-144); the list
  // names each one, read back after the refusal.
  | { kind: "blocked"; blockers: PublishBlocker[] }
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

// "Soup of the day in Starters has a size with no name."
export function blockerSentence(
  strings: PublishingStrings,
  blocker: PublishBlocker,
): string {
  const template =
    blocker.kind === "size-unnamed"
      ? strings.problems.sizeUnnamed
      : strings.problems.sizeUnpriced;
  return fill(template, { dish: blocker.dish, section: blocker.section });
}

// What a press that did not land says, once: "Dinner was not published.
// Soup of the day has a size with no name. Name it or remove it, then
// publish again."
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
      const template =
        first.kind === "size-unnamed"
          ? refused.sizeUnnamed
          : refused.sizeUnpriced;
      return fill(template, { menu, dish: first.dish });
    }
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
