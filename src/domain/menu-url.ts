// The one place that writes a menu URL (D-86, D-88), and the one resolver
// every incoming menu path goes through. Every menu, statement, and feedback
// path comes from here, and tests/unit/url-guard.test.ts fails the build if
// any other file under app/ or src/ writes the menu prefix. Pure: no React,
// no network.

// Eight digits, never starting with 0 (D-86). A later migration can widen
// the database check; this pattern moves with it.
export const MENU_CODE_PATTERN = /^[1-9][0-9]{7}$/;

// A menu's id as its page's second segment: the uuid, lowercase (the diner
// page task, Michael at the plan's tabs). Never the menu's name, which
// changes; the id never does.
export const MENU_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeMenuCode(value: string): string {
  return value.trim().toLowerCase();
}

export function isMenuCode(value: string): boolean {
  return MENU_CODE_PATTERN.test(value);
}

// The bare code shows the restaurant's first menu; every published menu,
// the first included, also answers at the code and its id. The switcher
// links every menu by its id, so a saved link keeps showing the same menu
// when the order changes (Q-79).
export function menuPath(code: string, menuId?: string): string {
  return menuId === undefined ? `/m/${code}` : `/m/${code}/${menuId}`;
}

export function statementPath(code: string): string {
  return `/a11y/${code}`;
}

export function feedbackPath(code: string): string {
  return `/feedback/${code}`;
}

export function menuUrl(origin: string, code: string, menuId?: string): string {
  return `${origin}${menuPath(code, menuId)}`;
}

export type MenuPathResolution =
  { kind: "menu"; code: string; menuId: string | null } | { kind: "unknown" };

// Every path under the menu prefix, as its raw segments (D-88). Today the
// first segment is the bare code and the second, when there is one, a
// menu's id; anything else is unknown, and the route answers 404. A later
// shape with words before the code, such as golden-dragon-reading-pa-
// 47293158, lands here alone: the code is read from the end of the first
// segment, the bare code keeps rendering with no redirect, and the route
// does not change.
export function resolveMenuPath(
  segments: readonly string[],
): MenuPathResolution {
  const [first, second, ...rest] = segments;
  if (first === undefined || rest.length > 0) return { kind: "unknown" };
  const code = normalizeMenuCode(first);
  if (!isMenuCode(code)) return { kind: "unknown" };
  if (second === undefined) return { kind: "menu", code, menuId: null };
  const menuId = second.trim().toLowerCase();
  if (!MENU_ID_PATTERN.test(menuId)) return { kind: "unknown" };
  return { kind: "menu", code, menuId };
}

// A menu origin is an https origin and nothing more: no path, no query, no
// hash, no trailing slash. Anything else is null.
export function parseMenuOrigin(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return url.origin === value ? value : null;
}

export type MenuOriginEnv = {
  MENU_ORIGIN?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
};

export type MenuOriginResult =
  | { ok: true; origin: string; permanent: boolean }
  | { ok: false; reason: "invalid" | "missing-in-production" };

// The one rule for where the menu origin comes from (D-88). MENU_ORIGIN
// when set, and it must be valid wherever it is set. Production has no
// fallback: a printed code must never point at a deployment URL. Previews
// fall back to their own Vercel URL, local dev to localhost.
export function resolveMenuOrigin(env: MenuOriginEnv): MenuOriginResult {
  if (env.MENU_ORIGIN !== undefined && env.MENU_ORIGIN !== "") {
    const origin = parseMenuOrigin(env.MENU_ORIGIN);
    if (!origin) return { ok: false, reason: "invalid" };
    return { ok: true, origin, permanent: true };
  }
  if (env.VERCEL_ENV === "production") {
    return { ok: false, reason: "missing-in-production" };
  }
  if (env.VERCEL_URL) {
    return { ok: true, origin: `https://${env.VERCEL_URL}`, permanent: false };
  }
  return { ok: true, origin: "http://localhost:3000", permanent: false };
}
