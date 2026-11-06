import { describe, expect, it } from "vitest";
import { restaurantDetailsPath } from "../../src/features/owner/paths";
import {
  clearedSavedNoticeCookie,
  hasSavedNotice,
  readSavedNotice,
  SAVED_NOTICE,
  savedNoticeCookie,
  savedNoticePath,
} from "../../src/features/owner/saved-notice";

// The one-time notice a Details save leaves for the page it loads (D-211,
// Q-141): the form writes the cookie, the page reads it, and the banner
// clears it once shown.
const code = "12345678";

// A cookie string as a browser reads it: the pair, then each attribute.
function parts(cookie: string) {
  const [pair = "", ...attributes] = cookie
    .split(";")
    .map((part) => part.trim());
  return { pair, attributes };
}

describe("the saved notice's cookie (D-211)", () => {
  it("is scoped to the one restaurant's Details, by the path the one builder gives", () => {
    expect(savedNoticePath(code)).toBe(restaurantDetailsPath(code));
    expect(savedNoticePath(code)).toBe("/app/restaurants/12345678/details");
  });

  it("takes only a restaurant's code, so nothing else reaches the cookie string", () => {
    expect(() => savedNoticePath("1234; Path=/")).toThrow();
    expect(() => savedNoticePath("")).toThrow();
    expect(() => savedNoticeCookie("12345678; Max-Age=999")).toThrow();
  });

  it("is written for a minute at most, same-site, and readable by the page that clears it", () => {
    const { pair, attributes } = parts(savedNoticeCookie(code));
    expect(pair).toBe(`${SAVED_NOTICE.name}=${SAVED_NOTICE.value}`);
    expect(pair).toBe("details-saved=1");
    expect(attributes).toEqual([
      "Path=/app/restaurants/12345678/details",
      "Max-Age=60",
      "SameSite=Lax",
    ]);
    const lower = attributes.map((attribute) => attribute.toLowerCase());
    expect(lower.some((a) => a.startsWith("httponly"))).toBe(false);
    expect(lower.some((a) => a.startsWith("domain"))).toBe(false);
    expect(lower.some((a) => a.startsWith("expires"))).toBe(false);
  });

  it("is cleared under the same name and path, at once", () => {
    const { pair, attributes } = parts(clearedSavedNoticeCookie(code));
    expect(pair).toBe(`${SAVED_NOTICE.name}=`);
    expect(attributes).toEqual([
      "Path=/app/restaurants/12345678/details",
      "Max-Age=0",
      "SameSite=Lax",
    ]);
  });

  it("is read by the page from the cookie's value alone", () => {
    expect(readSavedNotice(SAVED_NOTICE.value)).toBe(true);
    expect(readSavedNotice(undefined)).toBe(false);
    expect(readSavedNotice("")).toBe(false);
    expect(readSavedNotice("0")).toBe(false);
    expect(readSavedNotice("1 ")).toBe(false);
  });

  it("is read by the banner from document.cookie, among the other cookies there", () => {
    expect(hasSavedNotice("")).toBe(false);
    expect(hasSavedNotice("details-saved=1")).toBe(true);
    expect(hasSavedNotice("sb-auth=abc; details-saved=1; other=2")).toBe(true);
    expect(hasSavedNotice("sb-auth=abc;details-saved=1")).toBe(true);
    expect(hasSavedNotice("sb-auth=abc; other=2")).toBe(false);
    expect(hasSavedNotice("details-saved=")).toBe(false);
    expect(hasSavedNotice("details-saved=10")).toBe(false);
    expect(hasSavedNotice("not-details-saved=1")).toBe(false);
  });
});
