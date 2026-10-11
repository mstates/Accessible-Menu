import type { SameNamedOption } from "@/core/supabase/choices";
import type { NamedDish, SameNamedDish } from "@/core/supabase/dishes";
import type { NamedSection } from "@/core/supabase/sections";
import { sameAllergenLists, type AllergenLists } from "@/domain/allergens";
import type { OwnerMenu } from "@/domain/menu";
import type { SameNamedPlace } from "./allergen-words";

// The same-named places an allergen check names (D-129, grown to options
// by D-166): the live dishes and options elsewhere in the restaurant with
// the subject's name whose lists differ from the subject's as a diner
// reads them, or which are not checked. Where each one is comes from the
// reads the page already made: a dish sits in a section of a menu; an
// option sits in a list under a dish or a section, said as "{lead} for
// {home}" in the section's place, and the home's menu after it. A place
// whose chain is broken, a deleted section, menu, or home, is left out.
// Pure: no React, no network.

export type PlaceContext = {
  sections: readonly NamedSection[];
  menus: readonly OwnerMenu[];
  // The dishes that are homes of the options' lists, by id.
  dishes: readonly NamedDish[];
  // "{lead} for {home}".
  placeIn: (lead: string, home: string) => string;
};

function reasonOf(
  reviewed: boolean,
  lists: AllergenLists,
  own: AllergenLists,
): SameNamedPlace["reason"] | null {
  if (!reviewed) return "unchecked";
  return sameAllergenLists(lists, own) ? null : "different";
}

// Where a section is: its name and its live menu's, or null.
function sectionPlace(
  sectionId: string,
  context: PlaceContext,
): { section: string; menu: string } | null {
  const section = context.sections.find((entry) => entry.id === sectionId);
  const menu = section
    ? context.menus.find((entry) => entry.id === section.menuId)
    : undefined;
  return section && menu ? { section: section.name, menu: menu.name } : null;
}

export function dishPlaces(
  namesakes: readonly SameNamedDish[],
  own: AllergenLists,
  context: PlaceContext,
): SameNamedPlace[] {
  return namesakes.flatMap((other) => {
    const where = sectionPlace(other.sectionId, context);
    if (!where) return [];
    const lists = { allergens: other.allergens, others: other.otherAllergens };
    const reason = reasonOf(other.reviewed, lists, own);
    if (!reason) return [];
    return [
      {
        kind: "dish" as const,
        id: other.id,
        name: other.name,
        section: where.section,
        menu: where.menu,
        lists,
        reviewed: other.reviewed,
        reason,
      },
    ];
  });
}

export function optionPlaces(
  namesakes: readonly SameNamedOption[],
  own: AllergenLists,
  context: PlaceContext,
): SameNamedPlace[] {
  return namesakes.flatMap((other) => {
    let home: string | null = null;
    let menu: string | null = null;
    if (other.home.kind === "dish") {
      const dish = context.dishes.find((entry) => entry.id === other.home.id);
      const where = dish ? sectionPlace(dish.sectionId, context) : null;
      if (dish && where) {
        home = dish.name;
        menu = where.menu;
      }
    } else {
      const where = sectionPlace(other.home.id, context);
      if (where) {
        home = where.section;
        menu = where.menu;
      }
    }
    if (home === null || menu === null) return [];
    const lists = { allergens: other.allergens, others: other.otherAllergens };
    const reason = reasonOf(other.reviewed, lists, own);
    if (!reason) return [];
    return [
      {
        kind: "option" as const,
        id: other.id,
        name: other.name,
        section: context.placeIn(other.lead, home),
        menu,
        lists,
        reviewed: other.reviewed,
        reason,
      },
    ];
  });
}
