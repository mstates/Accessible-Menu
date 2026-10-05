// Owner screens name the restaurant in the path by its code (D-89). These are
// owner paths, not menu URLs; the menu URL builder lives in src/domain.

export type DetailsNotice = { created: true } | { saved: number };

export const dashboardPath = "/app";

export function restaurantNewPath(): string {
  return "/app/restaurants/new";
}

export function restaurantDetailsPath(
  code: string,
  notice?: DetailsNotice,
): string {
  const base = `/app/restaurants/${code}/details`;
  if (!notice) return base;
  return "created" in notice
    ? `${base}?created=1`
    : `${base}?saved=${notice.saved}`;
}

export function restaurantMenusPath(code: string): string {
  return `/app/restaurants/${code}/menus`;
}

// One menu's own page, where its sections are edited (D-122). The menu is
// named by its id: an owner path, never printed or shared with a diner.
export function restaurantMenuPath(code: string, menuId: string): string {
  return `${restaurantMenusPath(code)}/${menuId}`;
}

// One section's own page, where its dishes are edited (D-128). The section
// is named by its id, and the address does not name its menu, so the page
// stays where it is when the section moves to another menu (D-129).
export function restaurantSectionPath(code: string, sectionId: string): string {
  return `/app/restaurants/${code}/sections/${sectionId}`;
}

// The id an error summary links to for a field name. Dots become dashes so
// hours.mon.0.open stays a valid id.
export function fieldId(name: string): string {
  return `field-${name.replace(/\./g, "-")}`;
}
