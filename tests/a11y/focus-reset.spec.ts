import { expect, test } from "@playwright/test";

// D-97: a client-side path change resets focus to the top of the document,
// so the next Tab reaches the skip link, as after a full page load. The home
// page's sample link is a client-side navigation once the page is hydrated.
test("after a client-side page change, the next Tab reaches the skip link", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await page.waitForLoadState("networkidle");

  await page.locator('main a[href="/m/demo"]').click();
  await page.waitForURL(/\/m\/demo$/);

  // The reset happened: the empty element at the start of the body has focus.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.hasAttribute("data-focus-reset") ?? false,
      ),
    )
    .toBe(true);

  await page.keyboard.press("Tab");
  const href = await page.evaluate(() =>
    document.activeElement?.getAttribute("href"),
  );
  expect(href, "the first Tab after a page change is the skip link").toBe(
    "#main",
  );
});
