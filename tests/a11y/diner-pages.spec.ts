import { expect, test } from "@playwright/test";
import { open, pageChecks } from "./checks";
import { pages } from "./pages";

// Every public page, scanned signed out. The checks live in checks.ts and
// are shared with the owner pages.
for (const path of pages) {
  test.describe(path, () => {
    pageChecks(path);
  });
}

// Sign-in is an owner page reachable signed out, so it carries the empty
// status region every owner page has (D-106).
test("the sign-in page carries an empty status region", async ({ page }) => {
  await open(page, "/app/sign-in");
  const region = page.locator('header [role="status"]');
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText("");
});
