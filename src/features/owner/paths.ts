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

// The id an error summary links to for a field name. Dots become dashes so
// hours.mon.0.open stays a valid id.
export function fieldId(name: string): string {
  return `field-${name.replace(/\./g, "-")}`;
}
