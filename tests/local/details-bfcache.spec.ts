import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { restaurantDetailsPath } from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";
import { savedBanner, setSavedNotice } from "../a11y/saved-banner";

// The success banner and the back-forward cache (D-211, Michael at the
// plan's approval). A page restored from that cache comes back as it was
// left, banner and all, without loading or running the page's code again,
// so the banner hides itself on a pageshow that says the page was
// persisted, and a Back from an unrelated full load never shows it again.
//
// Reaching that cache from Playwright takes two changes, both here and
// neither in the app, measured on November 6, 2026 (Playwright 1.64.1):
// Playwright starts Chromium with --disable-back-forward-cache, and its
// headless shell kept no page even without the switch, so this file runs
// the full Chromium with the switch left out; and Chromium keeps no page
// served with Cache-Control: no-store, which Next sends for every dynamic
// page, Details included (the navigation entry's notRestoredReasons said
// "response-cache-control-no-store"), so a route serves Details' document
// without it. Playwright's WebKit and Firefox restored no page at all, the
// static home page included, so Safari is heard by hand. These options
// start a worker of their own, so they live at the top of their own file.
test.use({
  channel: "chromium",
  launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
});

const { code } = ownerEnv();
const details = restaurantDetailsPath(code);

type Restores = { __restored: boolean[] };

test("a Details page restored from the back-forward cache after a full load elsewhere hides its banner (D-211)", async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === details,
    async (route) => {
      const request = route.request();
      if (request.method() !== "GET" || request.headers()["rsc"]) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "cache-control": "private, max-age=0",
        },
      });
    },
  );
  // Each pageshow, and whether it came from the cache: a restore keeps this
  // page's window, so a second entry, true, can only be a restore.
  await page.addInitScript(() => {
    const w = window as unknown as Restores;
    w.__restored = [];
    addEventListener("pageshow", (event) => w.__restored.push(event.persisted));
  });
  await setSavedNotice(page, code);

  await page.goto(details);
  await page.waitForLoadState("networkidle");
  const banner = savedBanner(page);
  await expect(banner).toHaveCount(1);

  // A full load elsewhere, as a typed address is, then Back from the page
  // itself: Playwright's goBack waits for a load a restore never fires.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => history.back());
  await expect
    .poll(() => page.evaluate(() => location.pathname).catch(() => ""))
    .toBe(details);
  await expect
    .poll(
      () =>
        page
          .evaluate(() => (window as unknown as Restores).__restored)
          .catch(() => []),
      { message: "Details came back from the back-forward cache" },
    )
    .toEqual([false, true]);
  await expect(page.locator("main h1")).toHaveText(
    en.owner.restaurants.details.heading,
  );
  await expect(banner, "restored, the banner hides itself").toHaveCount(0);
  // The served autofocus left focus on the dismiss button when the page was
  // left (D-214), so the restore sends it to the heading, never to the body.
  await expect(
    page.locator("main h1"),
    "restored, focus that was in the banner goes to the heading",
  ).toBeFocused();
});
