import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { restaurantDetailsPath } from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";
import { savedBanner } from "../a11y/saved-banner";

// Save details that lands, on the stand-in (D-211, Q-141). The gate cannot
// land a save (D-108), so the save itself is checked here: it ends in a
// real load of Details, a new document read from the top, never a client
// navigation; the address carries nothing; the success banner is there and
// its dismiss button is the active element, focused by the served autofocus
// as the page loads (D-214); the banner is main's first element child,
// above the heading, and reads its heading, its dismiss button, then its
// words (D-215); and a refresh shows no banner. The gate pins the banner's
// arrival from the cookie (tests/a11y/owner-pages.spec.ts).

const { code } = ownerEnv();
const details = restaurantDetailsPath(code);
const strings = en.owner.restaurants.details;

test("Save details that lands loads Details as a new document at the top, with the success banner first in main above the heading, reading its heading, its dismiss button, then its words, the dismiss button the active element, and nothing in the address, and a refresh shows no banner (D-211, D-214, D-215)", async ({
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
    if (request.method() === "POST" && url.pathname === details) posts += 1;
  });

  await page.goto(details);
  await page.waitForLoadState("networkidle");
  const banner = savedBanner(page);
  await expect(banner).toHaveCount(0);
  const before = await page.evaluate(() => performance.timeOrigin);
  const save = page.getByRole("button", { name: strings.submit, exact: true });
  await save.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => window.scrollY),
    "Save details sits below the fold, so the top is somewhere to come back to",
  ).toBeGreaterThan(0);
  await save.click();

  await expect(banner, "the banner arrives with the new page").toHaveCount(1, {
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
    scrollY: window.scrollY,
  }));
  expect(
    after.origin,
    "a new document, not a client navigation",
  ).toBeGreaterThan(before);
  expect(
    after.type,
    "a navigation, not a reload, so the browser restores no scroll",
  ).toBe("navigate");
  expect(after.search, "nothing in the address").toBe("");
  expect(after.scrollY, "the new page starts at the top").toBe(0);
  await expect(
    banner.getByRole("button", { name: en.ui.banner.dismiss, exact: true }),
    "after the real load the dismiss button is the active element",
  ).toBeFocused();
  const place = await banner.evaluate((section) => {
    const main = section.closest("main");
    return {
      firstInMain: main?.firstElementChild === section,
      aboveHeading: section.nextElementSibling?.tagName === "H1",
      order: [...section.children].map((child) =>
        child.getAttribute("role") === "alert"
          ? "alert"
          : child.tagName.toLowerCase(),
      ),
    };
  });
  expect(place.firstInMain, "the banner is main's first element child").toBe(
    true,
  );
  expect(place.aboveHeading, "the heading comes right after the banner").toBe(
    true,
  );
  expect(
    place.order,
    "the banner reads its heading, its dismiss button, then its words",
  ).toEqual(["h2", "button", "svg", "alert"]);
  expect(documents, "the first load, then the save's load of Details").toEqual([
    details,
    details,
  ]);
  expect(posts, "one save was sent").toBe(1);
  await expect(banner.getByText(strings.saved, { exact: true })).toBeVisible();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1")).toHaveText(strings.heading);
  await expect(banner, "a refresh shows no banner").toHaveCount(0);
});
