import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  dashboardPath,
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// Publish and Unpublish with the presses landing for real against the
// stand-in (D-82, migration 12), which seeds Dinner, Drinks, and Brunch
// published as CI Diner's data file does: a rename on the same page turning
// the state into changes not published yet and the dashboard saying so,
// Publish said once and the state read back, Unpublish, Publish again, a
// blank size added on the dish's page blocking Publish with the sentence
// said once and nothing written, and a menu with no dishes blocked by the
// menu (D-177), and the Menus list's line under each name following a
// rename, Unpublish, and Publish the next time the list is read (Q-115).
// The gate cannot land a press, so this runs here. Each check leaves the
// stand-in as it found it: Dinner published with nothing changed since, its
// first section with its name, the soup with its two sizes, Lunch not
// published.

const { code } = ownerEnv();
const strings = en.owner.publishing;
const editing = en.owner.editing;
const dish = en.owner.dish;
const saved = editing.fieldSaved;

async function openMenu(page: Page): Promise<void> {
  await page.goto(restaurantMenuPath(code, ownerFixture().withSections.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

function group(page: Page) {
  return page.getByRole("region", { name: strings.heading, exact: true });
}

function button(page: Page, name: string) {
  return group(page).getByRole("button", { name, exact: true });
}

function status(page: Page) {
  return page.locator('main [role="status"]');
}

// The first section's name field. The Publishing region lists what blocks
// Publish in a list of its own (D-171, D-177), so a list inside a section
// is left out.
function firstSectionName(page: Page) {
  return page
    .locator("main ul:not(section ul) > li")
    .first()
    .locator('input[id$="-name"]');
}

const list = new Intl.ListFormat("en", { type: "conjunction" });
const publishedNow = /^Published on .+\. Nothing has changed since\.$/;
const changedNow =
  /^Published on .+\. Changes since then are not published yet\.$/;

async function renameFirstSection(page: Page, to: string): Promise<void> {
  const before = await said(page, saved);
  await firstSectionName(page).fill(to);
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(before + 1);
}

// The Menus list, read fresh (the server reads it on every render).
async function openMenus(page: Page): Promise<void> {
  await page.goto(restaurantMenusPath(code));
  await page.waitForLoadState("networkidle");
}

// The line under a menu's name on the Menus list (Q-115): the one paragraph
// in the row whose heading is the menu's name.
function menuLine(page: Page, menu: string) {
  return page
    .locator("main ul > li")
    .filter({
      has: page.getByRole("heading", { level: 2, name: menu, exact: true }),
    })
    .locator("p");
}

test("a rename makes changes not published yet, Publish is said once and clears that, Unpublish takes the menu back, and Publish again", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await openMenu(page);
  await expect(group(page).getByText(publishedNow)).toBeVisible();
  await expect(button(page, strings.unpublish)).toBeVisible();

  const original = await firstSectionName(page).inputValue();
  await renameFirstSection(page, `${original} renamed`);
  await expect(group(page).getByText(changedNow)).toBeVisible();

  // Dinner, Drinks, and Brunch are published, as the data file leaves CI
  // Diner.
  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText(
      fill(strings.summary.published.other, {
        names: list.format([withSections.name, "Drinks", "Brunch"]),
      }),
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      fill(strings.summary.changed.one, { names: withSections.name }),
      { exact: true },
    ),
  ).toBeVisible();

  await openMenu(page);
  await button(page, strings.publish).click();
  await expect.poll(() => said(page, strings.spoken.published)).toBe(1);
  await expect(group(page).getByText(publishedNow)).toBeVisible();
  await expect(
    button(page, strings.publish),
    "focus stays on Publish",
  ).toBeFocused();

  await button(page, strings.unpublish).click();
  await expect.poll(() => said(page, strings.spoken.unpublished)).toBe(1);
  await expect(group(page).getByText(strings.state.notPublished)).toBeVisible();
  await expect(button(page, strings.unpublish)).toHaveCount(0);
  await expect(
    button(page, strings.publish),
    "focus stays in the group, on Publish, once Unpublish has gone",
  ).toBeFocused();

  // Drinks and Brunch stay published on their own.
  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText(
      fill(strings.summary.published.other, {
        names: list.format(["Drinks", "Brunch"]),
      }),
      { exact: true },
    ),
  ).toBeVisible();

  // As it was: the name back, then published with nothing changed since.
  await openMenu(page);
  await renameFirstSection(page, original);
  await button(page, strings.publish).click();
  await expect.poll(() => said(page, strings.spoken.published)).toBe(1);
  await expect(group(page).getByText(publishedNow)).toBeVisible();
  await expect(button(page, strings.unpublish)).toBeVisible();
});

// The list has no live update: a change on the menu's page shows on the
// list the next time the list is read, and not before.
test("the Menus list says each menu's state under its name, and follows a rename, Unpublish, and Publish the next time it is read", async ({
  page,
}) => {
  const { withSections, empty } = ownerFixture();
  await openMenus(page);
  await expect(menuLine(page, withSections.name)).toHaveText(publishedNow);
  await expect(menuLine(page, empty.name)).toHaveText(
    strings.state.notPublished,
  );

  await openMenu(page);
  const original = await firstSectionName(page).inputValue();
  await renameFirstSection(page, `${original} renamed`);
  await openMenus(page);
  await expect(
    menuLine(page, withSections.name),
    "a change shows on the next read of the list",
  ).toHaveText(changedNow);

  await openMenu(page);
  await renameFirstSection(page, original);
  await button(page, strings.unpublish).click();
  await expect.poll(() => said(page, strings.spoken.unpublished)).toBe(1);
  await openMenus(page);
  await expect(menuLine(page, withSections.name)).toHaveText(
    strings.state.notPublished,
  );
  await expect(
    menuLine(page, "Drinks"),
    "the other published menus keep their line",
  ).toHaveText(publishedNow);

  // As it was.
  await openMenu(page);
  await button(page, strings.publish).click();
  await expect.poll(() => said(page, strings.spoken.published)).toBe(1);
  await openMenus(page);
  await expect(menuLine(page, withSections.name)).toHaveText(publishedNow);
  await expect(menuLine(page, empty.name)).toHaveText(
    strings.state.notPublished,
  );
});

test("a menu with no dishes blocks Publish: the page names the menu, the press is refused once with nothing written, and the status shows the sentence with no Try again (D-177)", async ({
  page,
}) => {
  const { empty } = ownerFixture();
  const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const writesSoFar = async () =>
    ((await (await fetch(`${standin}/__test/writes`)).json()) as unknown[])
      .length;

  await page.goto(restaurantMenuPath(code, empty.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  try {
    await expect(
      group(page).getByText(strings.state.notPublished),
    ).toBeVisible();
    await expect(group(page).getByText(strings.waitingLead)).toBeVisible();
    await expect(group(page).getByRole("listitem")).toHaveText([
      fill(strings.problems.noDishes, { menu: empty.name }),
    ]);

    const before = await writesSoFar();
    await button(page, strings.publish).click();
    const refused = fill(strings.refused.noDishes, { menu: empty.name });
    await expect.poll(() => said(page, refused)).toBe(1);
    await expect(status(page)).toHaveText(refused);
    await expect(
      page.getByRole("button", { name: editing.tryAgain, exact: true }),
    ).toHaveCount(0);
    await expect(
      group(page).getByText(strings.state.notPublished),
    ).toBeVisible();
    expect(await said(page, strings.spoken.published)).toBe(0);
    expect(
      (await writesSoFar()) - before,
      "the press reached the stand-in once and wrote nothing",
    ).toBe(1);
    // The problems read back after the refusal: the list still names the menu.
    await expect(group(page).getByRole("listitem")).toHaveText([
      fill(strings.problems.noDishes, { menu: empty.name }),
    ]);
  } finally {
    // On a build that still publishes an empty menu, put it back as the
    // owner setup needs it: not published.
    if ((await button(page, strings.unpublish).count()) > 0) {
      await button(page, strings.unpublish).click();
      await expect.poll(() => said(page, strings.spoken.unpublished)).toBe(1);
    }
  }
});

test("a size with no name blocks Publish: the page names it, the press is refused once with nothing written, and the status shows the sentence with no Try again", async ({
  page,
}) => {
  const { withSections, withDishes, dishes } = ownerFixture();
  const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const writesSoFar = async () =>
    ((await (await fetch(`${standin}/__test/writes`)).json()) as unknown[])
      .length;

  await page.goto(restaurantDishPath(code, dishes.sizes.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  await page
    .getByRole("button", { name: dish.price.addSize, exact: true })
    .click();
  const added = fill(dish.price.sizeAdded, {
    count: fill(dish.price.sizeCount.other, { count: 3 }),
  });
  await expect.poll(() => said(page, added)).toBe(1);

  await openMenu(page);
  const blocker = fill(strings.problems.sizeUnnamed, {
    dish: dishes.sizes.name,
    section: withDishes.name,
  });
  await expect(
    group(page).getByText(changedNow),
    "a blank size is a change not published yet",
  ).toBeVisible();
  await expect(group(page).getByText(strings.waitingLead)).toBeVisible();
  await expect(group(page).getByRole("listitem")).toHaveText([blocker]);

  const before = await writesSoFar();
  await button(page, strings.publish).click();
  const refused = fill(strings.refused.sizeUnnamed, {
    menu: withSections.name,
    dish: dishes.sizes.name,
  });
  await expect.poll(() => said(page, refused)).toBe(1);
  await expect(status(page)).toHaveText(refused);
  await expect(
    page.getByRole("button", { name: editing.tryAgain, exact: true }),
  ).toHaveCount(0);
  await expect(group(page).getByText(changedNow)).toBeVisible();
  expect(await said(page, strings.spoken.published)).toBe(0);
  expect(
    (await writesSoFar()) - before,
    "the press reached the stand-in once and wrote nothing",
  ).toBe(1);

  // As it was.
  await page.goto(restaurantDishPath(code, dishes.sizes.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  const unnamed = fill(dish.price.unnamedSize, { position: 3 });
  await page
    .getByRole("button", {
      name: fill(dish.price.sizeAction, {
        action: dish.price.removeSize,
        size: unnamed,
      }),
      exact: true,
    })
    .click();
  await expect
    .poll(() => said(page, fill(dish.price.sizeRemoved, { size: unnamed })))
    .toBe(1);
  await openMenu(page);
  await expect(group(page).getByText(strings.waitingLead)).toHaveCount(0);
  await expect(group(page).getByText(publishedNow)).toBeVisible();
});
