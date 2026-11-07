// The one-time notice a page load carries as its result (D-211, D-219): a
// Details save that landed, the return from Checkout, a restaurant the
// trial could not find, a sign-in that failed before the page loaded. Every
// one is a real page load, so the result travels in a cookie, never in the
// address: whoever sends the load writes it (a route handler on the server,
// or the form in the browser just before it loads the page), the page reads
// it and renders the flash, and the banner clears it once shown, so a
// refresh or Back shows nothing.
//
// A form writes it, not a Server Action: a cookie set inside an action
// marks the page revalidated (Next 16.4.3), and the action's response would
// then carry a render of the page that reads the cookie and clears it in
// the old document, before the load it was meant for.
//
// One cookie name for every page, its value the result's key and its Path
// the page the result is for, kept a minute at most, for a load that never
// comes. It says only what happened, so it is not HttpOnly: the banner
// clears it from the page. No Secure, since the local stand-in is plain
// http; it carries nothing to protect.
//
// The page reads the raw Cookie header, not cookies(): a cookie whose Path
// is /app is also sent to /app/sign-in and to a restaurant's Details, and
// Next's parser keeps only the last pair of a name, so a stray dashboard
// notice would shadow the sign-in's or Details' own. The reader takes the
// first pair whose value is one of the page's keys, in a Cookie header or
// in document.cookie alike, which share one shape.

export const NOTICE_COOKIE = "notice";
export const NOTICE_MAX_AGE_SECONDS = 60;

export const DETAILS_NOTICES = ["details-saved"] as const;
export const DASHBOARD_NOTICES = [
  "checkout-success",
  "checkout-cancel",
  "checkout-missing",
] as const;
export const SIGN_IN_NOTICES = ["sign-in-link", "sign-in-google"] as const;

export type DetailsNotice = (typeof DETAILS_NOTICES)[number];
export type DashboardNotice = (typeof DASHBOARD_NOTICES)[number];
export type SignInNotice = (typeof SIGN_IN_NOTICES)[number];
export type NoticeKey = DetailsNotice | DashboardNotice | SignInNotice;

// A page's path, checked before it goes into a cookie string, so nothing
// but a path can add an attribute.
const pathShape = /^\/[A-Za-z0-9/_-]*$/;

function checkedPath(path: string): string {
  if (!pathShape.test(path) || path.includes("//")) {
    throw new Error("the notice takes the path of the page it is for");
  }
  return path;
}

function attributes(path: string, maxAgeSeconds: number): string {
  return `Path=${checkedPath(path)}; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

// What the sender writes: a Set-Cookie header on the server, or
// document.cookie in the browser just before it loads the page.
export function noticeCookie(key: NoticeKey, path: string): string {
  return `${NOTICE_COOKIE}=${key}; ${attributes(path, NOTICE_MAX_AGE_SECONDS)}`;
}

// What the banner writes to document.cookie once it shows.
export function clearedNoticeCookie(path: string): string {
  return `${NOTICE_COOKIE}=; ${attributes(path, 0)}`;
}

// The page's read of its Cookie header, and the banner's of document.cookie:
// the first notice whose value is one of the page's keys.
export function readNotice<Key extends NoticeKey>(
  cookies: string | null | undefined,
  keys: readonly Key[],
): Key | null {
  if (!cookies) return null;
  const prefix = `${NOTICE_COOKIE}=`;
  for (const part of cookies.split(";")) {
    const pair = part.trim();
    if (!pair.startsWith(prefix)) continue;
    const value = pair.slice(prefix.length);
    const found = keys.find((key) => key === value);
    if (found !== undefined) return found;
  }
  return null;
}
