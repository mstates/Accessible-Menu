import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { menuPath } from "../../src/domain/menu-url";
import { signInPath } from "../../src/features/owner/paths";
import {
  expectFocusResetThenSkipLink,
  expectLandedOutline,
  open,
  pageChecks,
  tabTo,
} from "./checks";
import { dinnerSnapshot, menuCode, pages } from "./pages";
import { expectFlashArrival, flashBanner, setNotice } from "./saved-banner";

// Every public page, scanned signed out. The checks live in checks.ts and
// are shared with the owner pages. The Dinner page's snapshot follows the
// clock (D-194).
for (const path of pages) {
  test.describe(path, () => {
    pageChecks(
      path,
      path === menuPath(menuCode) ? { snapshot: dinnerSnapshot } : {},
    );
  });
}

// The sign-in page as a failed link leaves it (D-219): the flash above the
// heading, from the cookie the auth callback sets, which the gate sets
// itself since no link of its own can fail (D-108). The same checks as
// the sign-in page; its snapshot replaces the ?error=link arrival's.
test.describe(`${signInPath} after a failed link`, () => {
  pageChecks(signInPath, {
    snapshot: "app-sign-in-error-link",
    prepare: (page) => setNotice(page, "sign-in-link", signInPath),
  });
});

// Sign-in is an owner page reachable signed out, so it carries the empty
// status region every owner page has (D-106).
test("the sign-in page carries an empty status region", async ({ page }) => {
  await open(page, signInPath);
  const region = page.locator('header [role="status"]');
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText("");
});

// D-219: a sign-in that failed before the page loaded, an expired link or
// Google not finishing, arrives as the flash Details' save has (D-211,
// D-214 to D-216): the cookie the auth callback or the Google form leaves,
// which the gate sets itself (D-108). Both are errors, so the kind's word,
// Error, names the region and its heading. The cookie is cleared as the
// flash shows, so a reload and Back show no banner, no alert, and nothing
// focused.
const signInFailures = [
  ["sign-in-link", en.owner.signIn.failures.link],
  ["sign-in-google", en.owner.signIn.failures.google],
] as const;

test(
  "after a failed sign-in, the page arrives with the error flash first in main, above its heading, its dismiss button focused by the served autofocus and its words in one atomic alert; dismiss sends focus to the heading, and a reload or Back shows no banner, no alert, and nothing focused (D-219)",
  { tag: "@saved-banner" },
  async ({ page }) => {
    const heading = page.locator("main h1");
    const alerts = page.locator("main").getByRole("alert");
    for (const [key, words] of signInFailures) {
      await setNotice(page, key, signInPath);
      const response = await open(page, signInPath);
      await expectFlashArrival(page, response, { kind: "critical", words });
    }

    const banner = flashBanner(page, "critical");
    const dismiss = banner.getByRole("button", {
      name: en.ui.banner.dismiss,
      exact: true,
    });
    await tabTo(page, dismiss);
    await page.keyboard.press("Enter");
    await expect(banner, "dismissed, the banner goes").toHaveCount(0);
    await expect(alerts, "dismissed, no alert is left").toHaveCount(0);
    await expect(heading, "focus moves to the heading").toBeFocused();
    await expectLandedOutline(page);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(heading).toHaveText(en.owner.signIn.heading);
    await expect(banner, "a reload shows no banner").toHaveCount(0);
    await expect(alerts, "a reload shows no alert").toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement === document.body),
      "after a reload nothing is focused",
    ).toBe(true);

    await setNotice(page, "sign-in-link", signInPath);
    await open(page, signInPath);
    await page.waitForLoadState("networkidle");
    await expect(banner).toHaveCount(1);
    await page.locator('header a[href="/"]').click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goBack();
    await page.waitForURL((url) => url.pathname === signInPath);
    await expect(heading).toHaveText(en.owner.signIn.heading);
    await expect(banner, "Back shows no banner").toHaveCount(0);
    await expect(alerts, "Back shows no alert").toHaveCount(0);
    await expectFocusResetThenSkipLink(page);
  },
);
