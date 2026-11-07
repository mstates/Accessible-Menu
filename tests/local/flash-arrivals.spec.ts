import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { noticeCookie } from "../../src/core/notice";
import { dashboardPath } from "../../src/features/owner/paths";
import { expectFlashArrival, flashBanner } from "../a11y/saved-banner";

// The dashboard's results, on the stand-in (D-219). Stripe returns the
// owner to /app/checkout?result=success or cancel, a route handler that
// sets the notice cookie for the signed-in owner and sends the browser on
// to the dashboard with a 303, a real load with nothing in the address,
// where the flash arrives as Details' save does (D-211, D-214 to D-216);
// a result it does not know sets nothing. And a Start trial whose
// restaurant the owner's client cannot find ends the same way: the action
// returns its failure, the form writes the cookie and loads the dashboard
// again, a new document with the error flash. The gate pins the flashes'
// arrival from the cookie (tests/a11y/owner-pages.spec.ts); Stripe itself
// is never reached (D-108).

const results = [
  ["cancel", "info", en.owner.billing.checkoutCancel],
  ["success", "success", en.owner.billing.checkoutSuccess],
] as const;

test("Stripe's return lands on the dashboard as a new document with the result's flash and nothing in the address, a result it does not know with no flash, and the route answers a 303 carrying the cookie (D-219)", async ({
  page,
}) => {
  for (const [result, kind, words] of results) {
    const response = await page.goto(`/app/checkout?result=${result}`);
    if (!response) throw new Error("the return returned no response");
    expect(response.status(), "the dashboard is a real page").toBe(200);
    expect(new URL(page.url()).pathname).toBe(dashboardPath);
    await expectFlashArrival(page, response, { kind, words });
  }

  await page.goto("/app/checkout?result=missing");
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe(dashboardPath);
  await expect(page.locator("main h1")).toHaveText(en.owner.heading);
  await expect(
    page.locator("main").getByRole("alert"),
    "a result the route does not know shows no flash",
  ).toHaveCount(0);

  // The hop itself, by request with the owner's cookies: the 303 to the
  // dashboard, clean, with the cookie as the one builder writes it.
  const hop = await page.request.get("/app/checkout?result=cancel", {
    maxRedirects: 0,
  });
  expect(hop.status()).toBe(303);
  expect(new URL(hop.headers()["location"] ?? "", page.url()).pathname).toBe(
    dashboardPath,
  );
  expect(new URL(hop.headers()["location"] ?? "", page.url()).search).toBe("");
  const setCookies = hop
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);
  expect(setCookies).toContain(noticeCookie("checkout-cancel", dashboardPath));
  // The request stored that cookie in the page's jar, so the dashboard
  // consumes it here, and the next test starts clean.
  await page.goto(dashboardPath);
  await expect(flashBanner(page, "info")).toHaveCount(1);
});

test("a Start trial whose restaurant cannot be found loads the dashboard again as a new document with the error flash, its dismiss button the active element, and nothing in the address (D-219)", async ({
  page,
}) => {
  const documents: string[] = [];
  let posts = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.isNavigationRequest() &&
      request.resourceType() === "document"
    ) {
      documents.push(`${url.pathname}${url.search}`);
    }
    if (request.method() === "POST" && url.pathname === dashboardPath) {
      posts += 1;
    }
  });

  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  const trial = page
    .getByRole("button", { name: en.owner.billing.startTrial })
    .first();
  await expect(trial).toHaveCount(1);
  // The restaurant the form names is swapped for one the owner's client
  // will not find, as a form from before a restaurant went away would.
  await page
    .locator('form:has(button) input[name="restaurant"]')
    .first()
    .evaluate((input) => {
      (input as HTMLInputElement).value =
        "00000000-0000-4000-8000-000000000000";
    });
  const before = await page.evaluate(() => performance.timeOrigin);
  await trial.click();

  const banner = flashBanner(page, "critical");
  await expect(banner, "the flash arrives with the new page").toHaveCount(1, {
    timeout: 10_000,
  });
  await page.waitForLoadState("networkidle");
  const after = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    type: (
      performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined
    )?.type,
    search: location.search,
    pathname: location.pathname,
  }));
  expect(
    after.origin,
    "a new document, not a client navigation",
  ).toBeGreaterThan(before);
  expect(after.type, "a navigation, not a reload").toBe("navigate");
  expect(after.pathname).toBe(dashboardPath);
  expect(after.search, "nothing in the address").toBe("");
  await expect(
    banner.getByRole("button", { name: en.ui.banner.dismiss, exact: true }),
    "after the real load the dismiss button is the active element",
  ).toBeFocused();
  const alert = banner.getByRole("alert");
  await expect(alert).toHaveText(en.owner.billing.restaurantMissing);
  await expect(alert).toHaveAttribute("aria-atomic", "true");
  await expect(
    banner.getByRole("heading", {
      level: 2,
      name: en.ui.banner.critical,
      exact: true,
    }),
  ).toHaveCount(1);
  expect(documents, "the first load, then the failure's load").toEqual([
    dashboardPath,
    dashboardPath,
  ]);
  expect(posts, "one trial was sent").toBe(1);
});
