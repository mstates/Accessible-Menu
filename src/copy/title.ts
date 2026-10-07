import type { Copy } from "./index";

// Every owner page title has one shape (D-104): the page, then the
// restaurant when the page belongs to one, then the site name, joined by the
// one separator in copy. The title is the first thing a screen reader says on
// arrival, so the page comes first. A page that sits inside others names them
// right after itself, nearest first (D-128): a section inside its menu,
// "Starters, Dinner, Test Bistro, Accessible Menu", and a dish inside its
// section and its menu, "Soup of the day, Starters, Dinner, Test Bistro,
// Accessible Menu".
export function pageTitle(
  copy: Copy,
  page: string,
  restaurant?: string,
  inside?: string | readonly string[],
): string {
  const within =
    inside === undefined ? [] : typeof inside === "string" ? [inside] : inside;
  const parts = restaurant
    ? [page, ...within, restaurant, copy.site.name]
    : [page, copy.site.name];
  return parts.join(copy.site.titleSeparator);
}
