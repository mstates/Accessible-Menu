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

// A dish's pages under their page nav (D-222, D-225), with saves that land
// for real against the stand-in: each sub page arrives with its title and
// its h1, and the state line beside each nav item follows a save on that
// page and comes back when the save is undone, since every save ends with
// a refresh of the page's server parts. The gate reads the lines as the
// data file set them; this reads them change. Each check leaves the
// stand-in as it found it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const choices = en.owner.choices;
const state = strings.pages.state;
const editing = en.owner.editing;
const saved = editing.fieldSaved;

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
  await hearLog(page);
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

test("the Allergens line reads Confirmed once the check lands and Not confirmed yet once it is undone", async ({
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
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(navLink(page, "market", confirmed)).toHaveCount(1);
  await expect(navLink(page, "market", confirmed)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectNoMissingIds(page);

  await page.getByText(allergens.checkLabel, { exact: true }).click();
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(navLink(page, "market", notConfirmed)).toHaveCount(1);
});

test("the Dietary tags line counts a tag once it lands and reads None once it is undone", async ({
  page,
}) => {
  const vegan = en.dietary.names.vegan;
  await openDishPage(page, "market", "tags");
  await expectArrival(page, "market", strings.tags.heading);
  const none = `${strings.tags.heading} ${state.none}`;
  const one = `${strings.tags.heading} ${fill(state.tagCount.one, { count: 1 })}`;
  await expect(navLink(page, "market", none)).toHaveCount(1);

  await page.getByText(vegan, { exact: true }).click();
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(navLink(page, "market", one)).toHaveCount(1);
  await expectNoMissingIds(page);

  await page.getByText(vegan, { exact: true }).click();
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(navLink(page, "market", none)).toHaveCount(1);
});

test("the Availability line reads the chosen words once a choice lands and Available once it is put back", async ({
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
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(navLink(page, "one", line(availability.soldOut))).toHaveCount(1);
  await expectNoMissingIds(page);

  await page.getByText(availability.available, { exact: true }).click();
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(navLink(page, "one", line(availability.available))).toHaveCount(
    1,
  );
});

test("the Choice lists line counts a list once it is added and reads None once it is deleted", async ({
  page,
}) => {
  const lead = "Choose a sauce";
  await openDishPage(page, "market", "choices");
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
