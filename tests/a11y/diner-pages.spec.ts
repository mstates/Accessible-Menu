import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { menuPath } from "../../src/domain/menu-url";
import { expectFocusResetThenSkipLink, open, pageChecks } from "./checks";
import { pages } from "./pages";

// Every public page, scanned signed out. The checks live in checks.ts and
// are shared with the owner pages.
for (const path of pages) {
  test.describe(path, () => {
    pageChecks(path);
  });
}

// A menu page carries its permanent address as its canonical link, from
// the one builder (D-88): an https origin or the preview's own, and the
// menu path. The demo answers to its Phase 0 name until the diner page task
// reads real data.
test("the demo menu carries a canonical link to its menu path", async ({
  page,
}) => {
  await open(page, menuPath("demo"));
  const href = await page
    .locator('head link[rel="canonical"]')
    .getAttribute("href");
  expect(href).not.toBeNull();
  const canonical = new URL(href ?? "");
  expect(canonical.pathname).toBe(menuPath("demo"));
  expect(canonical.search).toBe("");
  expect(canonical.hash).toBe("");
});

// Sign-in is an owner page reachable signed out, so it carries the empty
// status region every owner page has (D-106).
test("the sign-in page carries an empty status region", async ({ page }) => {
  await open(page, "/app/sign-in");
  const region = page.locator('header [role="status"]');
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText("");
});

// D-110: a sign-in that failed before the page loaded takes focus once. The
// query value repeats, so each arrival is keyed by its render: a reload, with
// the query stripped, and Back, replaying the same render, read nothing, and
// a second arrival is read again.
const signInFailures = [
  ["link", en.owner.signIn.failures.link],
  ["google", en.owner.signIn.failures.google],
] as const;

test("a sign-in failure takes focus on arrival, once for each arrival", async ({
  page,
}) => {
  for (const [value, text] of signInFailures) {
    const path = `/app/sign-in?error=${value}`;
    const message = page.getByText(text, { exact: true });
    await open(page, path);
    await expect(message).toBeFocused();
    await page.reload();
    await expect(message).toHaveCount(0);
    await open(page, path);
    await expect(message, "a second arrival is read again").toBeFocused();
  }
});

test("a sign-in failure is not read again on Back", async ({ page }) => {
  const message = page.getByText(en.owner.signIn.failures.link, {
    exact: true,
  });
  await open(page, "/app/sign-in?error=link");
  await expect(message).toBeFocused();
  await page.locator('header a[href="/"]').click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/app/sign-in");
  await expect(message).toHaveCount(0);
  await expectFocusResetThenSkipLink(page);
});
