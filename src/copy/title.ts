import type { Copy } from "./index";

// Every owner page title has one shape (D-104): the page, then the
// restaurant when the page belongs to one, then the site name, joined by the
// one separator in copy. The title is the first thing a screen reader says on
// arrival, so the page comes first. A page that sits inside another, a
// section inside its menu, names that one right after itself (D-128):
// "Starters, Dinner, Test Bistro, Accessible Menu".
export function pageTitle(
  copy: Copy,
  page: string,
  restaurant?: string,
  inside?: string,
): string {
  const parts = restaurant
    ? [page, ...(inside ? [inside] : []), restaurant, copy.site.name]
    : [page, copy.site.name];
  return parts.join(copy.site.titleSeparator);
}
