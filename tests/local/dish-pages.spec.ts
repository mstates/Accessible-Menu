import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantDishPagePath,
  type DishPageSlug,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { restaurantName } from "../a11y/pages";
import { saveAndLand } from "./save";

// A dish's pages under their page nav (D-222, D-225), with saves that land
// for real against the stand-in: each sub page arrives with its title and
// its h1, and the state line beside each nav item follows a save on that
// page and comes back when the save is undone. Allergens, Dietary tags,
// and Availability save by one press (D-223, D-229), which loads the page
// again with the flash, so the nav reads the new state from the new
// document; Choice lists saves as the owner goes, and refreshes the page's
// server parts. The gate reads the lines as the data file set them; this
// reads them change. Each check leaves the stand-in as it found it, so the
// checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const choices = en.owner.choices;
const state = strings.pages.state;

type Priced = "sizes" | "one" | "market";

async function openDishPage(
  page: Page,
  which: Priced,
  at: DishPageSlug,
): Promise<void> {
  await page.goto(
    restaurantDishPagePath(code, ownerFixture().dishes[which].id, at),
  );
  await page.waitForLoadState("networkidle");
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

// The page nav's link for one page, named by the page and its state.
function navLink(page: Page, which: Priced, name: string) {
  return page
    .locator("main")
    .getByRole("navigation", {
      name: ownerFixture().dishes[which].name,
      exact: true,
    })
    .getByRole("link", { name, exact: true });
}

async function expectArrival(
  page: Page,
  which: Priced,
  heading: string,
): Promise<void> {
  const { withSections, withDishes, dishes } = ownerFixture();
  const restaurant = await restaurantName(page);
  await expect(page).toHaveTitle(
    pageTitle(en, heading, restaurant, [
      dishes[which].name,
      withDishes.name,
      withSections.name,
    ]),
  );
  await expect(page.locator("main h1")).toHaveText(heading);
}

// The dialog's confirming button takes no pointer press for half a second
// after it opens (D-119), so the confirmation is pressed by key: Tab from
// Keep, once focus has reached it (D-136), then Enter.
async function confirmByKey(page: Page, dialog: ReturnType<Page["locator"]>) {
  await expect(
    dialog.getByRole("button", { name: choices.lists.keep, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: choices.lists.remove, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
}

test("the Allergens line reads Confirmed once the check is saved and Not confirmed yet once the uncheck is saved", async ({
  page,
}) => {
  const allergens = strings.allergens;
  await openDishPage(page, "market", "allergens");
  await expectArrival(page, "market", allergens.heading);
  const notConfirmed = `${allergens.heading} ${state.allergensNotConfirmed}`;
  const confirmed = `${allergens.heading} ${state.allergensConfirmed}`;
  await expect(navLink(page, "market", notConfirmed)).toHaveCount(1);
  await expect(navLink(page, "market", notConfirmed)).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByText(allergens.checkLabel, { exact: true }).click();
  await expect(
    navLink(page, "market", notConfirmed),
    "the line follows the saved check, not the tick",
  ).toHaveCount(1);
  await saveAndLand(page, allergens.submit, allergens.saved);
  await expectArrival(page, "market", allergens.heading);
  await expect(navLink(page, "market", confirmed)).toHaveCount(1);
  await expect(navLink(page, "market", confirmed)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectNoMissingIds(page);

  await page.getByText(allergens.checkLabel, { exact: true }).click();
  await saveAndLand(page, allergens.submit, allergens.saved);
  await expect(navLink(page, "market", notConfirmed)).toHaveCount(1);
});

test("the Dietary tags line counts a tag once it is saved and reads None once the untick is saved", async ({
  page,
}) => {
  const vegan = en.dietary.names.vegan;
  await openDishPage(page, "market", "tags");
  await expectArrival(page, "market", strings.tags.heading);
  const none = `${strings.tags.heading} ${state.none}`;
  const one = `${strings.tags.heading} ${fill(state.tagCount.one, { count: 1 })}`;
  await expect(navLink(page, "market", none)).toHaveCount(1);

  await page.getByText(vegan, { exact: true }).click();
  await expect(
    navLink(page, "market", none),
    "the line follows the saved tags, not the tick",
  ).toHaveCount(1);
  await saveAndLand(page, strings.tags.submit, strings.tags.saved);
  await expectArrival(page, "market", strings.tags.heading);
  await expect(navLink(page, "market", one)).toHaveCount(1);
  await expectNoMissingIds(page);

  await page.getByText(vegan, { exact: true }).click();
  await saveAndLand(page, strings.tags.submit, strings.tags.saved);
  await expect(navLink(page, "market", none)).toHaveCount(1);
});

test("the Availability line reads the chosen words once the choice is saved and Available once it is put back", async ({
  page,
}) => {
  const availability = strings.availability;
  await openDishPage(page, "one", "availability");
  await expectArrival(page, "one", availability.heading);
  const line = (choice: string) =>
    `${availability.heading} ${fill(state.availability, { choice, schedule: state.scheduleNone })}`;
  await expect(navLink(page, "one", line(availability.available))).toHaveCount(
    1,
  );

  await page.getByText(availability.soldOut, { exact: true }).click();
  await expect(
    navLink(page, "one", line(availability.available)),
    "the line follows the saved choice, not the radio",
  ).toHaveCount(1);
  await saveAndLand(page, availability.submit, availability.saved);
  await expectArrival(page, "one", availability.heading);
  await expect(navLink(page, "one", line(availability.soldOut))).toHaveCount(1);
  await expectNoMissingIds(page);

  await page.getByText(availability.available, { exact: true }).click();
  await saveAndLand(page, availability.submit, availability.saved);
  await expect(navLink(page, "one", line(availability.available))).toHaveCount(
    1,
  );
});

test("the Choice lists line counts a list once it is added and reads None once it is deleted", async ({
  page,
}) => {
  const lead = "Choose a sauce";
  await openDishPage(page, "market", "choices");
  await hearLog(page);
  await expectArrival(page, "market", choices.heading);
  const none = `${choices.heading} ${state.none}`;
  const one = `${choices.heading} ${fill(choices.lists.count.one, { count: 1 })}`;
  await expect(navLink(page, "market", none)).toHaveCount(1);

  await page
    .getByRole("textbox", { name: choices.lists.newLabel, exact: true })
    .fill(lead);
  await page.keyboard.press("Enter");
  const added = fill(choices.lists.added, {
    list: lead,
    count: fill(choices.lists.count.one, { count: 1 }),
  });
  await expect.poll(() => said(page, added)).toBe(1);
  await expect(navLink(page, "market", one)).toHaveCount(1);
  await expectNoMissingIds(page);

  // As it was: the list, holding no option, deleted through the dialog
  // that asks by its name alone (D-221), confirmed by key.
  await page
    .getByRole("button", {
      name: fill(choices.lists.rowAction, {
        action: choices.lists.remove,
        list: lead,
      }),
      exact: true,
    })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: fill(choices.lists.deleteAskEmpty, { list: lead }),
    exact: true,
  });
  await expect(dialog).toHaveCount(1);
  await confirmByKey(page, dialog);
  await expect
    .poll(() => said(page, fill(choices.lists.deleted, { list: lead })))
    .toBe(1);
  await expect(navLink(page, "market", none)).toHaveCount(1);
});

// The leave rule on a page that saves by a press (D-229): a change, then
// the page nav's General link, asks; Leave goes, and the change is gone
// when the page is opened again.
test("Leave on the dialog a page nav link opens with unsaved changes goes to the page, and the change is gone when the page is opened again", async ({
  page,
}) => {
  const vegan = en.dietary.names.vegan;
  const { dishes } = ownerFixture();
  const form = strings.form;
  await openDishPage(page, "market", "tags");
  await page.getByText(vegan, { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: vegan, exact: true }),
  ).toBeChecked();
  await navLink(page, "market", strings.pages.general).click();
  const dialog = page.getByRole("alertdialog", {
    name: form.leave.question,
    exact: true,
  });
  await expect(dialog).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: form.leave.keep, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: form.leave.leave, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main h1")).toHaveText(dishes.market.name);
  await expect(dialog).toHaveCount(0);

  await openDishPage(page, "market", "tags");
  await expect(
    page.getByRole("checkbox", { name: vegan, exact: true }),
    "the change was not saved",
  ).not.toBeChecked();
  await expect(
    navLink(page, "market", `${strings.tags.heading} ${state.none}`),
  ).toHaveCount(1);
});
