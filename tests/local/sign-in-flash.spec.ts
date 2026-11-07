import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { signInPath } from "../../src/features/owner/paths";
import { expectFlashArrival, flashBanner } from "../a11y/saved-banner";

// A sign-in that fails before the page loads, on the stand-in (D-219): the
// auth callback's error branch, which Supabase takes when a link has
// expired (an otp error code) or Google did not finish (any other), sets
// the notice cookie and sends the browser to the sign-in page with a 303,
// a real load with nothing in the address, where the error flash arrives
// as Details' save does (D-211, D-214 to D-216); and so does a callback
// with no code. The gate pins the flash's arrival from the cookie
// (tests/a11y/diner-pages.spec.ts); the route's branches are pinned by
// request (tests/unit/auth-callback-route.test.ts). The exchange of a code
// cannot fail here, since the stand-in's token endpoint answers any code.
//
// Signed out: the sign-in page sends a signed-in owner to the dashboard.
test.use({ storageState: { cookies: [], origins: [] } });

const failures = [
  ["access_denied", "otp_expired", en.owner.signIn.failures.link],
  ["server_error", "unexpected_failure", en.owner.signIn.failures.google],
] as const;

test("a sign-in that fails at the callback lands on the sign-in page as a new document with the error flash, its dismiss button the active element, and nothing in the address; a refresh shows no banner (D-219)", async ({
  page,
}) => {
  for (const [error, code, words] of failures) {
    const response = await page.goto(
      `/auth/callback?error=${error}&error_code=${code}`,
    );
    if (!response) throw new Error("the callback returned no response");
    expect(response.status(), "the sign-in page is a real page").toBe(200);
    expect(new URL(page.url()).pathname).toBe(signInPath);
    await expectFlashArrival(page, response, { kind: "critical", words });
    const type = await page.evaluate(
      () =>
        (
          performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined
        )?.type,
    );
    expect(type, "a navigation, a new document").toBe("navigate");
  }

  const response = await page.goto("/auth/callback");
  if (!response) throw new Error("the callback returned no response");
  expect(new URL(page.url()).pathname).toBe(signInPath);
  await expectFlashArrival(page, response, {
    kind: "critical",
    words: en.owner.signIn.failures.link,
  });

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1")).toHaveText(en.owner.signIn.heading);
  await expect(
    flashBanner(page, "critical"),
    "a refresh shows no banner",
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.activeElement === document.body),
    "after a refresh nothing is focused",
  ).toBe(true);
});
