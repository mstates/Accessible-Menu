import { cache } from "react";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { cachedForRestaurant } from "@/core/cache";
import { menuOrigin } from "@/core/config";
import {
  createSupabaseDinerClient,
  readPublished,
  type PublishedRead,
} from "@/core/supabase/diner";
import { restaurantAllergenNote } from "@/domain/allergens";
import {
  timedDishes,
  visibleMenu,
  type DinerCopy,
  type DinerMenuView,
  type DishState,
} from "@/domain/diner";
import { hoursSentences } from "@/domain/hours";
import {
  isMenuCode,
  menuPath,
  menuUrl,
  normalizeMenuCode,
  resolveMenuPath,
} from "@/domain/menu-url";
import { lifetimeSeconds, nextTimedChange } from "@/domain/timed";

// What the diner routes load (the diner page task): the path through the
// one resolver (D-88), the restaurant's published data through the cached
// read under its tag (core/cache), and the page as of now from the view
// model (domain/diner.ts). Memoized per request, so generateMetadata and
// the page share one read and one clock.

// The words the view model and the hours builder read, from the one copy
// object; the schedule's singular day names are the shared ones.
export const dinerCopy: DinerCopy = {
  allergens: en.allergens,
  dietary: en.dietary,
  money: en.money,
  calories: en.calories,
  time: en.time,
  schedule: { ...en.schedule, day: en.days },
  marketPrice: en.menu.marketPrice,
  soldOut: en.availability.soldOut,
};

export type MenuLink = {
  id: string;
  name: string;
  href: string;
  current: boolean;
};

export type MenuPageData = {
  code: string;
  restaurant: {
    name: string;
    website: string | null;
    hoursLines: string[];
    note: string[];
  };
  menus: MenuLink[];
  menu: DinerMenuView;
  title: string;
  canonical: string;
  // Seconds until the page next changes on its own, or null for none.
  lifetime: number | null;
};

export type DinerPageData =
  | { kind: "not-found" }
  // A known code with no menu diners can read (Q-84, Q-31).
  | { kind: "unavailable"; code: string; name: string }
  // A menu id that is not one of the restaurant's published menus.
  | { kind: "menu-unavailable"; code: string; name: string }
  | { kind: "menu"; page: MenuPageData };

// The published data behind a code, read once per request and kept under
// the restaurant's tag between requests.
export const loadPublished = cache(
  async (code: string): Promise<PublishedRead> =>
    cachedForRestaurant(code, () =>
      readPublished(createSupabaseDinerClient(), code),
    ),
);

// The name behind a code for the statement and feedback stubs: any kind
// with a name, since a card that leads to no menu still carries them.
export async function loadRestaurantName(
  rawCode: string,
): Promise<{ code: string; name: string } | null> {
  const code = normalizeMenuCode(rawCode);
  if (!isMenuCode(code)) return null;
  const read = await loadPublished(code);
  if (read.kind === "unknown") return null;
  const name = read.kind === "menu" ? read.restaurant.name : read.name;
  return { code, name };
}

export const loadDinerPage = cache(
  async (segments: readonly string[]): Promise<DinerPageData> => {
    const resolved = resolveMenuPath(segments);
    if (resolved.kind === "unknown") return { kind: "not-found" };
    const { code, menuId } = resolved;
    const read = await loadPublished(code);
    if (read.kind === "unknown") return { kind: "not-found" };
    if (read.kind === "unavailable") {
      return { kind: "unavailable", code, name: read.name };
    }
    const { restaurant, menus } = read;
    const current =
      menuId === null ? menus[0] : menus.find((menu) => menu.id === menuId);
    if (!current) {
      return { kind: "menu-unavailable", code, name: restaurant.name };
    }
    const now = new Date();
    const states = new Map<string, DishState>(
      (read.states[current.id] ?? []).map((state) => [
        state.id,
        {
          available: state.available,
          soldOutAt: state.soldOutAt,
          schedule: state.schedule,
        },
      ]),
    );
    const menu = visibleMenu({
      snapshot: current.snapshot,
      states,
      now,
      hours: restaurant.hours,
      zone: restaurant.timezone,
      copy: dinerCopy,
      lang: en.lang,
    });
    const first = menus[0];
    const links: MenuLink[] = menus.map((entry) => ({
      id: entry.id,
      name: entry.snapshot.menu.name,
      href: menuPath(code, entry.id),
      current: entry.id === current.id,
    }));
    return {
      kind: "menu",
      page: {
        code,
        restaurant: {
          name: restaurant.name,
          website: restaurant.website,
          hoursLines: restaurant.hours
            ? hoursSentences(
                restaurant.hours,
                {
                  ...en.menu.hours,
                  days: en.days,
                },
                en.time,
                en.lang,
              )
            : [],
          note: restaurantAllergenNote(
            {
              allergenNote: restaurant.allergenNote,
              prepNotes: restaurant.prepNotes,
            },
            en.allergens,
          ),
        },
        menus: links,
        menu,
        title:
          menus.length > 1
            ? fill(en.menu.menuTitle, {
                menu: menu.name,
                restaurant: restaurant.name,
              })
            : fill(en.menu.title, { restaurant: restaurant.name }),
        // The bare code on the first menu's pages, the id URL on the others.
        canonical:
          first && current.id === first.id
            ? menuUrl(menuOrigin.origin, code)
            : menuUrl(menuOrigin.origin, code, current.id),
        lifetime: lifetimeSeconds(
          now,
          nextTimedChange({
            now,
            zone: restaurant.timezone,
            hours: restaurant.hours,
            dishes: timedDishes(current.snapshot, states),
          }),
        ),
      },
    };
  },
);
