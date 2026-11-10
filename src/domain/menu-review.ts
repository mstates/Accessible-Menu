import type { MenuDraft, MenuSnapshot } from "./snapshot";

// The review before Publish (D-224, Q-150): the draft, as menu_snapshot()
// builds it, against what is published, both in the v1 shape snapshot.ts
// describes. It says what a Publish would change, as counts, and it is the
// one reading of whether anything changed on the Publishing page, so the
// page's state sentence, its nav line, and its review can never disagree.
//
// Changed is the documents' deep inequality itself, the value
// menu_publish_states() compares in SQL: object keys in any order, arrays
// in order. Equal documents return at once with nothing counted, so no rule
// can speak about an unchanged menu. Unequal documents always carry a line:
// the rules below, and, should none of them fire, `other`, so a changed
// menu never reads as unchanged. Between two documents the database built,
// `other` never shows: the rules are exact when section ids are unique and
// dish ids are unique across the menu, which the primary keys give. A
// published document the v1 reader refuses is the one real case of it:
// nothing can be counted, and Publish is the remedy.
//
// The rules, by id, over the whole menu. A section is added or removed by
// its id, changed when anything of its own differs (every key but its
// dishes: its name, its note, its choice lists with their order, leads,
// and options), and the sections are reordered when those in both
// documents come in a different order. A dish is added or removed by its
// id wherever it sits, changed when its own object differs (every key, so
// sizes, tags, allergens, lists, and options, and any key a later shape
// adds), moved when it sits under a different section, and a section's
// dishes are reordered when those in it in both documents come in a
// different order. A dish that moved and changed counts in both.
// Pure: no React, no network.

export type MenuReview =
  // Nothing is published, so there is nothing to compare with: what a
  // first Publish would show.
  | { kind: "first"; sections: number; dishes: number }
  | {
      kind: "since";
      changed: boolean;
      menuRenamed: boolean;
      dishes: {
        added: number;
        changed: number;
        moved: number;
        removed: number;
        reordered: boolean;
      };
      sections: {
        added: number;
        changed: number;
        removed: number;
        reordered: boolean;
      };
      // The documents differ and no rule above says how.
      other: boolean;
    };

type Since = Extract<MenuReview, { kind: "since" }>;
type DraftSection = MenuDraft["sections"][number];

// What is published, as the review takes it: the snapshot, nothing while
// the menu is not published, or a published document the v1 reader refuses.
export type PublishedSide = MenuSnapshot | "unreadable" | null;

// Two JSON values with the same content: an object's keys in any order, an
// array's entries in order, as jsonb compares them.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => same(entry, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && same(left[key], right[key]),
    )
  );
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// A section without its dishes: what a change to the section itself is
// read from.
function own(section: DraftSection): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(section).filter(([key]) => key !== "items"),
  );
}

// Every dish of a document by its id, with the section it sits under.
function placed(
  document: MenuDraft,
): Map<string, { dish: DraftSection["items"][number]; section: string }> {
  return new Map(
    document.sections.flatMap((section) =>
      section.items.map((dish) => [dish.id, { dish, section: section.id }]),
    ),
  );
}

function since(changed: boolean, other: boolean): Since {
  return {
    kind: "since",
    changed,
    menuRenamed: false,
    dishes: { added: 0, changed: 0, moved: 0, removed: 0, reordered: false },
    sections: { added: 0, changed: 0, removed: 0, reordered: false },
    other,
  };
}

export function reviewMenu(
  draft: MenuDraft,
  published: PublishedSide,
): MenuReview {
  if (published === null) {
    return {
      kind: "first",
      sections: draft.sections.length,
      dishes: draft.sections.reduce(
        (sum, section) => sum + section.items.length,
        0,
      ),
    };
  }
  if (published === "unreadable") return since(true, true);
  if (same(draft, published)) return since(false, false);

  const review = since(true, false);
  review.menuRenamed = !same(draft.menu, published.menu);

  const sectionsBefore = new Map(
    published.sections.map((section) => [section.id, section]),
  );
  const sectionsAfter = new Map(
    draft.sections.map((section) => [section.id, section]),
  );
  for (const section of draft.sections) {
    const was = sectionsBefore.get(section.id);
    if (was === undefined) review.sections.added += 1;
    else if (!same(own(section), own(was))) review.sections.changed += 1;
  }
  review.sections.removed = published.sections.filter(
    (section) => !sectionsAfter.has(section.id),
  ).length;
  review.sections.reordered = !sameOrder(
    draft.sections
      .filter((section) => sectionsBefore.has(section.id))
      .map((section) => section.id),
    published.sections
      .filter((section) => sectionsAfter.has(section.id))
      .map((section) => section.id),
  );

  const dishesBefore = placed(published);
  const dishesAfter = placed(draft);
  for (const [id, now] of dishesAfter) {
    const was = dishesBefore.get(id);
    if (was === undefined) {
      review.dishes.added += 1;
      continue;
    }
    if (!same(now.dish, was.dish)) review.dishes.changed += 1;
    if (now.section !== was.section) review.dishes.moved += 1;
  }
  for (const id of dishesBefore.keys()) {
    if (!dishesAfter.has(id)) review.dishes.removed += 1;
  }
  // The dishes that sit under one section in both documents, in the order
  // each document gives them.
  const stayed = (document: MenuDraft, sectionId: string): string[] =>
    (document.sections.find((section) => section.id === sectionId)?.items ?? [])
      .filter(
        (dish) =>
          dishesBefore.get(dish.id)?.section === sectionId &&
          dishesAfter.get(dish.id)?.section === sectionId,
      )
      .map((dish) => dish.id);
  review.dishes.reordered = draft.sections.some(
    (section) =>
      sectionsBefore.has(section.id) &&
      !sameOrder(stayed(draft, section.id), stayed(published, section.id)),
  );

  const { dishes, sections } = review;
  review.other = !(
    review.menuRenamed ||
    dishes.added > 0 ||
    dishes.changed > 0 ||
    dishes.moved > 0 ||
    dishes.removed > 0 ||
    dishes.reordered ||
    sections.added > 0 ||
    sections.changed > 0 ||
    sections.removed > 0 ||
    sections.reordered
  );
  return review;
}

// The dishes and the options whose allergen list is not checked (D-224,
// D-166), from the draft, where each carries the same fact, in the order
// the menu gives them: a dish with its section, an option with its list
// and the list's home, the section or the dish it hangs under. Whether the
// draft holds any dish, and any option, decides what the page may say when
// nothing is left unconfirmed: a menu with no dishes never reads as all
// confirmed (D-177).
export type UnconfirmedDish = { id: string; name: string; section: string };

export type UnconfirmedOption = {
  id: string;
  name: string;
  listId: string;
  lead: string;
  home: string;
};

export type Unconfirmed = {
  dishes: UnconfirmedDish[];
  options: UnconfirmedOption[];
  holdsDishes: boolean;
  holdsOptions: boolean;
};

export function unconfirmedIn(draft: MenuDraft): Unconfirmed {
  const found: Unconfirmed = {
    dishes: [],
    options: [],
    holdsDishes: false,
    holdsOptions: false,
  };
  const options = (lists: DraftSection["choice_lists"], home: string): void => {
    for (const list of lists) {
      for (const option of list.options) {
        found.holdsOptions = true;
        if (option.allergens.checked) continue;
        found.options.push({
          id: option.id,
          name: option.name,
          listId: list.id,
          lead: list.lead,
          home,
        });
      }
    }
  };
  for (const section of draft.sections) {
    options(section.choice_lists, section.name);
    for (const dish of section.items) {
      found.holdsDishes = true;
      if (!dish.allergens.checked) {
        found.dishes.push({
          id: dish.id,
          name: dish.name,
          section: section.name,
        });
      }
      options(dish.choice_lists, dish.name);
    }
  }
  return found;
}
