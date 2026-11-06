import { isMenuCode } from "@/domain/menu-url";
import { restaurantDetailsPath } from "./paths";

// The one-time notice a Details save leaves for the page it loads (D-211,
// Q-141). A save that lands loads Details again as a new document, so the
// result travels in a cookie, never in the address: the form writes it just
// before the load, the page reads it and renders the success banner, and
// the banner clears it once shown, so a refresh or Back shows nothing.
//
// The form writes it, not the server action: a cookie set inside an action
// marks the page revalidated (Next 16.4.3), and the action's response would
// then carry a render of Details that reads the cookie and clears it in the
// old document, before the load it was meant for.
//
// Scoped to the one restaurant's Details by its path, and kept a minute at
// most, for a load that never comes. It says only that a save landed, so it
// is not HttpOnly: the banner clears it from the page. No Secure, since the
// local stand-in is plain http; it carries nothing to protect.

export const SAVED_NOTICE = {
  name: "details-saved",
  value: "1",
  maxAgeSeconds: 60,
} as const;

// The Details heading, where focus goes when the banner is dismissed.
export const DETAILS_HEADING_ID = "details-heading";

// The code is checked before it goes into a cookie string, so nothing but
// a restaurant's code can add an attribute.
export function savedNoticePath(code: string): string {
  if (!isMenuCode(code)) {
    throw new Error("the saved notice takes a restaurant's code");
  }
  return restaurantDetailsPath(code);
}

function attributes(code: string, maxAgeSeconds: number): string {
  return `Path=${savedNoticePath(code)}; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

// What the form writes to document.cookie just before it loads Details.
export function savedNoticeCookie(code: string): string {
  return `${SAVED_NOTICE.name}=${SAVED_NOTICE.value}; ${attributes(code, SAVED_NOTICE.maxAgeSeconds)}`;
}

// What the banner writes to document.cookie once it shows.
export function clearedSavedNoticeCookie(code: string): string {
  return `${SAVED_NOTICE.name}=; ${attributes(code, 0)}`;
}

// The page's read, of the value Next's cookies() hands over.
export function readSavedNotice(value: string | undefined): boolean {
  return value === SAVED_NOTICE.value;
}

// The banner's read, of document.cookie in the browser.
export function hasSavedNotice(documentCookie: string): boolean {
  const pair = `${SAVED_NOTICE.name}=${SAVED_NOTICE.value}`;
  return documentCookie.split(";").some((part) => part.trim() === pair);
}
