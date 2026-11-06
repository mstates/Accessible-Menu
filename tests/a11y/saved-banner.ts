import { test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import {
  SAVED_NOTICE,
  savedNoticePath,
} from "../../src/features/owner/saved-notice";

// The success banner after a Details save (D-211), shared by the gate and
// the local specs: a region named by its type.
export function savedBanner(page: Page) {
  return page.getByRole("region", {
    name: en.ui.banner.success,
    exact: true,
  });
}

// The cookie a Details save leaves for the page it loads (D-211), for a
// test that reaches the banner without landing a save, as the gate must
// (D-108). The name and path are the ones the banner clears, and the
// domain is the run's own host.
export async function setSavedNotice(page: Page, code: string) {
  const base = test.info().project.use.baseURL;
  if (!base) throw new Error("the saved notice needs the run's baseURL");
  await page.context().addCookies([
    {
      name: SAVED_NOTICE.name,
      value: SAVED_NOTICE.value,
      domain: new URL(base).hostname,
      path: savedNoticePath(code),
      sameSite: "Lax",
    },
  ]);
}
