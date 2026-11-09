import { expect, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { flashBanner } from "../a11y/saved-banner";

// The three dish pages that save by one press (D-223, D-229), on the
// stand-in, where a save lands for real. Shared by the local specs.

// Presses the page's Save and waits for the save to land: the page loads
// again as a new document, read from the top, with the success flash
// carrying the page's words and its dismiss button the active element
// (D-211, D-214, D-219). The new document's load is awaited from before
// the press: an earlier save's flash may still be on the page, so a banner
// alone does not tell the new document from the old. The log, when the
// page has one, is the new document's, so a spec that listens to it
// attaches again after this.
export async function saveAndLand(
  page: Page,
  submit: string,
  words: string,
): Promise<void> {
  const before = await page.evaluate(() => performance.timeOrigin);
  const loaded = page.waitForEvent("load", { timeout: 10_000 });
  await page.getByRole("button", { name: submit, exact: true }).click();
  await loaded;
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => performance.timeOrigin),
    "a new document, not a client navigation",
  ).toBeGreaterThan(before);
  const banner = flashBanner(page, "success");
  await expect(banner, "the flash arrives with the new page").toHaveCount(1);
  await expect(banner.getByRole("alert")).toHaveText(words);
  await expect(
    banner.getByRole("button", { name: en.ui.banner.dismiss, exact: true }),
    "the dismiss button is the active element",
  ).toBeFocused();
}

// The summary of the problems a Save found, or of the failure the server
// answered (D-229): a box named by its heading that takes focus.
export function summary(page: Page) {
  return page.locator('main [tabindex="-1"]').filter({
    has: page.getByRole("heading", {
      level: 2,
      name: en.owner.dish.form.summary,
      exact: true,
    }),
  });
}

// Presses the page's Save expecting it to stay, with the words in the
// summary and the summary focused. An earlier save's flash may still be on
// the page; no new one joins it.
export async function saveAndFail(
  page: Page,
  submit: string,
  words: string,
): Promise<void> {
  const flashes = await flashBanner(page, "success").count();
  await page.getByRole("button", { name: submit, exact: true }).click();
  const box = summary(page);
  await expect(box.getByText(words, { exact: true })).toHaveCount(1);
  await expect(box, "the summary takes focus").toBeFocused();
  await expect(flashBanner(page, "success")).toHaveCount(flashes);
}
