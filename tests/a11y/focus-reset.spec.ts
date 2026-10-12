import { expect, test } from "@playwright/test";
import { expectFocusResetThenSkipLink } from "./checks";

// D-97: a client-side path change resets focus to the top of the document,
// so the next Tab reaches the skip link, as after a full page load. The
// sign-in page's site link to the home page is a client-side navigation
// once the page is hydrated.
test("after a client-side page change, the next Tab reaches the skip link", async ({
  page,
}) => {
  const response = await page.goto("/app/sign-in");
  expect(response?.status()).toBe(200);
  await page.waitForLoadState("networkidle");

  await page.locator('header a[href="/"]').click();
  await page.waitForURL((url) => url.pathname === "/");

  await expectFocusResetThenSkipLink(page);
});
