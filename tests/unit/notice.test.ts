import { describe, expect, it } from "vitest";
import {
  clearedNoticeCookie,
  DASHBOARD_NOTICES,
  DETAILS_NOTICES,
  DISH_NOTICES,
  NOTICE_COOKIE,
  noticeCookie,
  readNotice,
  SIGN_IN_NOTICES,
} from "../../src/core/notice";
import {
  dashboardPath,
  restaurantDetailsPath,
  restaurantDishPagePath,
  signInPath,
} from "../../src/features/owner/paths";

// The one-time notice a page load carries as its result (D-211, D-219):
// the sender writes the cookie, the page reads it, and the banner clears it
// once shown.
const details = restaurantDetailsPath("12345678");

// A cookie string as a browser reads it: the pair, then each attribute.
function parts(cookie: string) {
  const [pair = "", ...attributes] = cookie
    .split(";")
    .map((part) => part.trim());
  return { pair, attributes };
}

describe("the notice cookie (D-211, D-219)", () => {
  it("holds the result's key, for a minute at most, same-site, on the page's path, readable by the page that clears it", () => {
    const { pair, attributes } = parts(noticeCookie("details-saved", details));
    expect(pair).toBe(`${NOTICE_COOKIE}=details-saved`);
    expect(pair).toBe("notice=details-saved");
    expect(attributes).toEqual([
      "Path=/app/restaurants/12345678/details",
      "Max-Age=60",
      "SameSite=Lax",
    ]);
    const lower = attributes.map((attribute) => attribute.toLowerCase());
    expect(lower.some((a) => a.startsWith("httponly"))).toBe(false);
    expect(lower.some((a) => a.startsWith("domain"))).toBe(false);
    expect(lower.some((a) => a.startsWith("expires"))).toBe(false);
    expect(lower.some((a) => a.startsWith("secure"))).toBe(false);
  });

  it("is written for each page the results are for", () => {
    expect(noticeCookie("checkout-success", dashboardPath)).toBe(
      "notice=checkout-success; Path=/app; Max-Age=60; SameSite=Lax",
    );
    expect(noticeCookie("sign-in-link", signInPath)).toBe(
      "notice=sign-in-link; Path=/app/sign-in; Max-Age=60; SameSite=Lax",
    );
    const dish = "0b2f0a9e-1111-4222-8333-444455556666";
    expect(
      noticeCookie(
        "allergens-saved",
        restaurantDishPagePath("12345678", dish, "allergens"),
      ),
    ).toBe(
      `notice=allergens-saved; Path=/app/restaurants/12345678/dishes/${dish}/allergens; Max-Age=60; SameSite=Lax`,
    );
  });

  it("takes only a path, so nothing else reaches the cookie string", () => {
    expect(() => noticeCookie("details-saved", "/app; Path=/")).toThrow();
    expect(() => noticeCookie("details-saved", "")).toThrow();
    expect(() => noticeCookie("details-saved", "app")).toThrow();
    expect(() => noticeCookie("details-saved", "/app sign-in")).toThrow();
    expect(() => noticeCookie("details-saved", "/app//sign-in")).toThrow();
    expect(() => noticeCookie("details-saved", "/app?x=1")).toThrow();
    expect(() => clearedNoticeCookie("/app, Max-Age=999")).toThrow();
  });

  it("is cleared under the same name and path, at once", () => {
    const { pair, attributes } = parts(clearedNoticeCookie(details));
    expect(pair).toBe(`${NOTICE_COOKIE}=`);
    expect(attributes).toEqual([
      "Path=/app/restaurants/12345678/details",
      "Max-Age=0",
      "SameSite=Lax",
    ]);
    expect(clearedNoticeCookie(dashboardPath)).toBe(
      "notice=; Path=/app; Max-Age=0; SameSite=Lax",
    );
  });

  it("names each page's results", () => {
    expect(DETAILS_NOTICES).toEqual(["details-saved"]);
    expect(DASHBOARD_NOTICES).toEqual([
      "checkout-success",
      "checkout-cancel",
      "checkout-missing",
    ]);
    expect(SIGN_IN_NOTICES).toEqual(["sign-in-link", "sign-in-google"]);
    expect(DISH_NOTICES).toEqual([
      "allergens-saved",
      "tags-saved",
      "availability-saved",
    ]);
  });
});

describe("the notice's read, of a Cookie header or document.cookie", () => {
  it("finds the page's result among the other cookies, spaced or not", () => {
    expect(readNotice("notice=details-saved", DETAILS_NOTICES)).toBe(
      "details-saved",
    );
    expect(
      readNotice(
        "sb-auth=abc; notice=checkout-cancel; other=2",
        DASHBOARD_NOTICES,
      ),
    ).toBe("checkout-cancel");
    expect(
      readNotice("sb-auth=abc;notice=sign-in-google", SIGN_IN_NOTICES),
    ).toBe("sign-in-google");
  });

  it("reads nothing from no cookie, an empty value, or a value that is not a key", () => {
    expect(readNotice(undefined, DETAILS_NOTICES)).toBe(null);
    expect(readNotice(null, DETAILS_NOTICES)).toBe(null);
    expect(readNotice("", DETAILS_NOTICES)).toBe(null);
    expect(readNotice("sb-auth=abc; other=2", DETAILS_NOTICES)).toBe(null);
    expect(readNotice("notice=", DETAILS_NOTICES)).toBe(null);
    expect(readNotice("notice=details-saved2", DETAILS_NOTICES)).toBe(null);
    expect(readNotice("notice=details-saved ", DETAILS_NOTICES)).toBe(
      "details-saved",
    );
    expect(readNotice("not-notice=details-saved", DETAILS_NOTICES)).toBe(null);
    expect(readNotice("notice=1", DETAILS_NOTICES)).toBe(null);
  });

  it("passes over a result that is another page's", () => {
    // A dashboard notice, Path /app, is sent to the sign-in page and to
    // Details too.
    expect(readNotice("notice=checkout-success", SIGN_IN_NOTICES)).toBe(null);
    expect(readNotice("notice=checkout-success", DETAILS_NOTICES)).toBe(null);
    expect(readNotice("notice=sign-in-link", DASHBOARD_NOTICES)).toBe(null);
  });

  it("finds the page's own among two notices, whichever comes first", () => {
    const own = "notice=sign-in-link";
    const stray = "notice=checkout-success";
    expect(readNotice(`${own}; ${stray}`, SIGN_IN_NOTICES)).toBe(
      "sign-in-link",
    );
    expect(readNotice(`${stray}; ${own}`, SIGN_IN_NOTICES)).toBe(
      "sign-in-link",
    );
    expect(
      readNotice(`sb-auth=abc; ${stray}; ${own}; other=2`, SIGN_IN_NOTICES),
    ).toBe("sign-in-link");
    expect(readNotice(`${stray}; notice=details-saved`, DETAILS_NOTICES)).toBe(
      "details-saved",
    );
  });

  it("takes the first of the page's own keys when two are there", () => {
    expect(
      readNotice(
        "notice=checkout-cancel; notice=checkout-success",
        DASHBOARD_NOTICES,
      ),
    ).toBe("checkout-cancel");
  });
});
