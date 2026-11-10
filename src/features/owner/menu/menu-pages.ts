import type { Copy } from "@/copy";
import { pageTitle } from "@/copy/title";
import type { MenuPublishState, OwnerMenu } from "@/domain/menu";
import type { MenuReview } from "@/domain/menu-review";
import type { PageNavItem } from "@/ui/PageNav";
import {
  restaurantMenuPagePath,
  restaurantMenuPath,
  type MenuPageSlug,
} from "../paths";
import type { PublishingStrings } from "../publishing-words";

// The menu's pages (D-224): one config for the one thing, read by the page
// nav, the frame, and the routes, in the dish's shape (dish-pages.ts). A
// page is added or taken away as one entry here: a General page arrives
// with served hours as one more. Sections is the menu's own address and is
// named for the menu; Publishing is named by its own words, so its nav
// item, its h1, and the first part of its title are the same. How a page
// saves (D-223) is one field per entry: the sections list saves as the
// owner goes (D-111), and Publishing acts by a press (D-231). Pure: no
// React, no network.

export const MENU_PAGE_KEYS = ["sections", "publishing"] as const;
export type MenuPageKey = (typeof MENU_PAGE_KEYS)[number];
export type MenuSubPageKey = MenuPageSlug;

type PageStrings = Copy["owner"]["menuPages"];

export type MenuPageSaving = "press" | "as-you-go";

export const MENU_PAGE_SAVING: Readonly<Record<MenuPageKey, MenuPageSaving>> = {
  sections: "as-you-go",
  publishing: "press",
};

export function menuPageSaving(key: MenuPageKey): MenuPageSaving {
  return MENU_PAGE_SAVING[key];
}

// The id a sub page's h1 carries (D-225): where the flash's dismiss button
// sends focus, and what the page's first group sits under. Sections' h1 is
// the menu's name and carries none.
export const MENU_PAGE_HEADING_IDS: Readonly<Record<MenuSubPageKey, string>> = {
  publishing: "menu-publishing-heading",
};

export function menuPageHeadingId(key: MenuPageKey): string | undefined {
  return key === "sections" ? undefined : MENU_PAGE_HEADING_IDS[key];
}

export function menuPagePath(
  code: string,
  menuId: string,
  key: MenuPageKey,
): string {
  return key === "sections"
    ? restaurantMenuPath(code, menuId)
    : restaurantMenuPagePath(code, menuId, key);
}

export function menuPageName(
  key: MenuPageKey,
  pages: PageStrings,
  publishing: PublishingStrings,
): string {
  switch (key) {
    case "sections":
      return pages.sections;
    case "publishing":
      return publishing.heading;
  }
}

// Where the menu stands, for the words beside Publishing's name in the
// nav: whether it is published, and whether the draft differs from what
// was published.
export type MenuPageState = { published: boolean; changed: boolean };

export function menuPageState(
  state: Pick<MenuPublishState, "published" | "changed">,
): MenuPageState {
  return { published: state.published, changed: state.changed === true };
}

// The state line beside a page's name, or null for Sections, which has
// none, as a dish's General has none.
export function menuPageStateLine(
  key: MenuPageKey,
  state: MenuPageState,
  pages: PageStrings,
): string | null {
  if (key === "sections") return null;
  if (!state.published) return pages.state.notPublished;
  return state.changed ? pages.state.changed : pages.state.published;
}

// The two items in D-224's order, the current one marked.
export function menuPageNavItems(
  code: string,
  menuId: string,
  current: MenuPageKey,
  state: MenuPageState,
  pages: PageStrings,
  publishing: PublishingStrings,
): PageNavItem[] {
  return MENU_PAGE_KEYS.map((key) => ({
    href: menuPagePath(code, menuId, key),
    name: menuPageName(key, pages, publishing),
    state: menuPageStateLine(key, state, pages),
    current: key === current,
  }));
}

// The title (D-113, D-225): Sections is the menu inside its restaurant, as
// the menu's page has always been; Publishing is the page inside the menu,
// so the page is heard first.
export function menuPageTitle(
  copy: Copy,
  key: MenuPageKey,
  names: { menu: string; restaurant: string },
): string {
  if (key === "sections") {
    return pageTitle(copy, names.menu, names.restaurant);
  }
  return pageTitle(
    copy,
    menuPageName(key, copy.owner.menuPages, copy.owner.publishing),
    names.restaurant,
    [names.menu],
  );
}

// The Publishing page's own reading of the menu's state (D-224): from the
// one row it read for what is published and from the review it made of the
// two documents, never from menu_publish_states(), which is another read at
// another instant. So the state sentence, the nav's line, and the review on
// that page cannot disagree. A published document the reader refuses reads
// as published and changed, through the review (Michael, November 10,
// 2026).
export function publishingState(
  menu: OwnerMenu,
  published: { publishedAt: string } | null,
  review: MenuReview,
): MenuPublishState {
  if (published === null) {
    return {
      id: menu.id,
      name: menu.name,
      published: false,
      publishedAt: null,
      changed: null,
    };
  }
  return {
    id: menu.id,
    name: menu.name,
    published: true,
    publishedAt: published.publishedAt,
    changed: review.kind === "first" ? true : review.changed,
  };
}
