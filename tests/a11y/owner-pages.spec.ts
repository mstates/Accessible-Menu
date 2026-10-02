import { test } from "@playwright/test";
import {
  dashboardPath,
  restaurantDetailsPath,
} from "../../src/features/owner/paths";
import { expectFocusResetThenSkipLink, open, pageChecks } from "./checks";
import { ownerEnv } from "./owner-env";
import { ownerPages } from "./pages";

// Owner screens, signed in as the test owner (D-100), with the session from
// owner.setup.ts. These checks load pages, press Tab, run axe, and inject a
// style. They never submit a form and never create or save anything; the
// trial button is tabbed over, never pressed.

const { code } = ownerEnv();

for (const path of ownerPages(code)) {
  test.describe(path, () => {
    pageChecks(path);
  });
}

// D-97, signed in: the dashboard's details link is a client-side navigation.
test("signed in, after following Edit details, the next Tab reaches the skip link", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  await page.locator(`main a[href="${restaurantDetailsPath(code)}"]`).click();
  await page.waitForURL(`**${restaurantDetailsPath(code)}`);
  await expectFocusResetThenSkipLink(page);
});
