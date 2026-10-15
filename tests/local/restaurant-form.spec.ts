import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { timeFieldLabel } from "../../src/features/owner/form-data";
import { fieldId, restaurantDetailsPath } from "../../src/features/owner/paths";
import { expectLandedOutline, tabTo } from "../a11y/checks";
import { ownerEnv } from "../a11y/owner-env";

// The restaurant form's two focus targets (Q-100): the error summary, which
// takes focus when a save comes back with errors, and a day's fieldset,
// where the summary's link for a day-level error lands. The gate never gets
// an answer with errors, since its saves are answered in the browser (D-108),
// so they are checked here. A range that opens and closes at the same time
// is refused for its day, and nothing is written.
const { code } = ownerEnv();
const strings = en.owner.restaurants;
const monday = strings.days.mon;

test("a save with errors sent from the keyboard focuses the error summary, and its link to a day lands on that day; each shows the focus ring", async ({
  page,
}) => {
  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  const opens = page.getByRole("textbox", {
    name: timeFieldLabel(strings.fields, monday, 0, "open"),
    exact: true,
  });
  const closes = page.getByRole("textbox", {
    name: timeFieldLabel(strings.fields, monday, 0, "close"),
    exact: true,
  });
  await opens.fill("9 am");
  await closes.fill("9 am");
  await closes.press("Enter");

  const summary = page.locator("main div[tabindex='-1']").filter({
    has: page.getByRole("heading", { name: strings.errors.summary }),
  });
  await expect(summary).toBeFocused();
  await expectLandedOutline(page);

  const link = summary.getByRole("link");
  await expect(link).toHaveCount(1);
  await tabTo(page, link);
  await page.keyboard.press("Enter");
  await expect(page.locator(`#${fieldId("hours.mon")}`)).toBeFocused();
  await expectLandedOutline(page);
});
