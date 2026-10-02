import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { pageTitle } from "../../src/copy/title";
import {
  dashboardPath,
  restaurantDetailsPath,
  restaurantNewPath,
} from "../../src/features/owner/paths";
import {
  expectFocusResetThenSkipLink,
  expectKeyboardWalk,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectRootAtLargest,
  open,
  pageChecks,
  setLargestText,
} from "./checks";
import { ownerEnv } from "./owner-env";
import { ownerPages } from "./pages";

// Owner screens, signed in as the test owner (D-100), with the session from
// owner.setup.ts. The gate never sends a write (D-108): these checks load
// pages, press Tab, run axe, inject a style, and follow links. The one test
// that presses Save answers every request that is not a GET inside the
// browser, so nothing reaches the server. The trial button is tabbed over,
// never pressed.

const { code } = ownerEnv();
const details = restaurantDetailsPath(code);
const strings = en.owner.restaurants;

for (const path of ownerPages(code)) {
  test.describe(path, () => {
    pageChecks(path);
  });
}

// The restaurant's name, as the details page's h1 shows it.
async function restaurantName(page: Page): Promise<string> {
  return (await page.locator("main h1").first().textContent())?.trim() ?? "";
}

function statusRegion(page: Page) {
  return page.locator('header [role="status"]');
}

// What Next's route announcer last said, from its open shadow root.
function announcerText(page: Page) {
  return page.evaluate(
    () =>
      document
        .querySelector("next-route-announcer")
        ?.shadowRoot?.querySelector("#__next-route-announcer__")?.textContent ??
      "",
  );
}

// Holds the client-side navigation request for one path (a GET carrying the
// RSC header and no prefetch header) until the returned function is called.
// Prefetches pass, so the link is as ready as it would be for an owner.
async function holdNavigation(page: Page, path: string) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const request = route.request();
      const headers = request.headers();
      if (
        request.method() === "GET" &&
        headers["rsc"] === "1" &&
        !headers["next-router-prefetch"]
      ) {
        await held;
      }
      await route.continue();
    },
  );
  return () => release();
}

// D-108: every request that is not a GET is answered inside the browser
// with the response Next gives for an action it does not know, the case a
// save from before a deploy meets (Q-41). None is passed to the network, so
// if Next's response ever changes shape the error page fails to appear and
// the test fails; it never writes.
async function answerWritesInBrowser(page: Page) {
  const attempted: string[] = [];
  const answered: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") attempted.push(request.url());
  });
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.continue();
      return;
    }
    answered.push(request.url());
    await route.fulfill({
      status: 404,
      headers: { "x-nextjs-action-not-found": "1" },
      body: "",
    });
  });
  return { attempted, answered };
}

// Saves the details form by pressing Enter in its first field, as an owner
// can. The Save button never takes focus, so React Aria makes no pending
// announcement: that announcement names the button by its id and stays in
// React Aria's hidden log for seven seconds, longer than the button lives
// once the error page replaces the form.
async function saveIntoTheErrorPage(page: Page) {
  await open(page, details);
  await page.getByRole("textbox", { name: strings.fields.name }).press("Enter");
  const heading = page.getByRole("heading", {
    level: 1,
    name: en.owner.error.heading,
  });
  await expect(heading, "focus moves to the error heading").toBeFocused();
}

test("every owner page carries an empty status region", async ({ page }) => {
  for (const path of ownerPages(code)) {
    await open(page, path);
    await expect(statusRegion(page)).toHaveCount(1);
    await expect(statusRegion(page)).toHaveText("");
  }
});

test("owner titles name the page, then the restaurant, then the site", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await expect(page).toHaveTitle(pageTitle(en, en.owner.title));
  await open(page, restaurantNewPath());
  await expect(page).toHaveTitle(pageTitle(en, strings.new.title));
  await open(page, details);
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, strings.details.title, name));
  await open(page, restaurantDetailsPath(code, { created: true }));
  await expect(page).toHaveTitle(
    pageTitle(en, strings.details.createdTitle, name),
  );
});

test("the restaurant nav is named for it and marks Details as the current page", async ({
  page,
}) => {
  await open(page, details);
  const name = await restaurantName(page);
  const nav = page.getByRole("navigation", { name, exact: true });
  await expect(nav).toHaveCount(1);
  const current = nav.locator('a[aria-current="page"]');
  await expect(current).toHaveText(strings.nav.details);
  await expect(current).toHaveAttribute("href", details);
});

test("a saved result takes focus on arrival and is not read again on reload or Back", async ({
  page,
}) => {
  const message = page.getByText(strings.details.saved, { exact: true });
  await open(page, restaurantDetailsPath(code, { saved: 1 }));
  await expect(message).toBeFocused();
  await page.reload();
  await expect(message).toHaveCount(0);

  await open(page, restaurantDetailsPath(code, { saved: 2 }));
  await expect(message).toBeFocused();
  await page.locator(`main a[href="${dashboardPath}"]`).click();
  await page.waitForURL(`**${dashboardPath}`);
  await page.goBack();
  await page.waitForURL(`**${details}`);
  await expect(message).toHaveCount(0);
  await expectFocusResetThenSkipLink(page);
});

// D-97, signed in: the dashboard's details link is a client-side navigation.
test("signed in, after following Edit details, the next Tab reaches the skip link and the page is announced", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  await page.locator(`main a[href="${details}"]`).click();
  await page.waitForURL(`**${details}`);
  await expectFocusResetThenSkipLink(page);
  const name = await restaurantName(page);
  await expect.poll(() => announcerText(page)).toContain(name);
});

// D-106: the loading state comes from the link. The old page stays until the
// new one commits; the region says the word only after a second.
test("a pending link says Loading after a second, then the arriving page is announced", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  const release = await holdNavigation(page, details);
  const link = page.locator(`main a[href="${details}"]`);
  const clickedAt = Date.now();
  await link.click();
  await expect(statusRegion(page)).toHaveText(en.ui.loading, {
    timeout: 10_000,
  });
  expect(
    Date.now() - clickedAt,
    "nothing is said before the link has been pending for a second",
  ).toBeGreaterThanOrEqual(1000);
  await expect(link, "focus stays on the pending link").toBeFocused();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  release();
  await page.waitForURL(`**${details}`);
  await expect(statusRegion(page)).toHaveText("");
  await expectFocusResetThenSkipLink(page);
  const name = await restaurantName(page);
  await expect.poll(() => announcerText(page)).toContain(name);
});

test("at the largest phone text size, the pending state does not scroll sideways", async ({
  page,
}) => {
  await setLargestText(page);
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  const release = await holdNavigation(page, details);
  await page.locator(`main a[href="${details}"]`).click();
  await expect(statusRegion(page)).toHaveText(en.ui.loading, {
    timeout: 10_000,
  });
  await expectRootAtLargest(page);
  await expectNoHorizontalScroll(page);
  release();
  await page.waitForURL(`**${details}`);
});

test("a save the server cannot take lands on the focused error page", async ({
  page,
}) => {
  const writes = await answerWritesInBrowser(page);
  await saveIntoTheErrorPage(page);
  expect(
    writes.answered.length,
    "the save was sent and answered in the browser",
  ).toBeGreaterThan(0);
  expect(
    writes.attempted,
    "every request that was not a GET was answered by the route",
  ).toEqual(writes.answered);
  await expect(page).toHaveTitle(pageTitle(en, en.owner.error.title));
  await expect(statusRegion(page)).toHaveText("");
  await expectNoAxeViolations(page);
  await expectKeyboardWalk(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: en.owner.error.reload }).click();
  await page.waitForURL(`**${details}`);
  await expect(page.locator("main h1")).not.toHaveText(en.owner.error.heading);
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, strings.details.title, name));
});

test("at the largest phone text size, the error page does not scroll sideways", async ({
  page,
}) => {
  await answerWritesInBrowser(page);
  await setLargestText(page);
  await saveIntoTheErrorPage(page);
  await expectRootAtLargest(page);
  await expectNoHorizontalScroll(page);
});
