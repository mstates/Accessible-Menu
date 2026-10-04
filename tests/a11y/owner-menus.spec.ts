import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantDetailsPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  open,
} from "./checks";
import { ownerEnv } from "./owner-env";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// The menus list, signed in as the test owner (D-100), on the three menus
// the test restaurant was given by hand. The gate never writes and never
// types into a field that saves (D-108, D-111, D-115): every test here runs
// behind the write guard. Most only read. Two press a Move button and say
// they expect a write; the guard answers it inside the browser as an action
// the server does not know, which is how the failed state is reached.
// Typing, real saves, add, delete, Undo with something to undo, and a name
// that is taken are covered by the unit tests and by hand. The shared page
// checks for this page run from owner-pages.spec.ts.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const details = restaurantDetailsPath(code);
const strings = en.owner.menus;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;

guardWrites();

function rows(page: Page) {
  return page.locator("main ul > li");
}

function savedStatus(page: Page) {
  return page.locator('main [role="status"]');
}

function log(page: Page) {
  return page.locator('main [role="log"]');
}

function rowButton(page: Page, action: string, menu: string) {
  return page.getByRole("button", {
    name: fill(strings.rowAction, { action, menu }),
    exact: true,
  });
}

// The menus in the order the page shows them, by the value of each name
// field.
async function menuNames(page: Page): Promise<string[]> {
  return rows(page)
    .getByRole("textbox")
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// The list is ready to press once the page has hydrated.
async function openMenus(page: Page): Promise<string[]> {
  await open(page, menusPath);
  await page.waitForLoadState("networkidle");
  const names = await menuNames(page);
  expect(
    names.length,
    "the test restaurant has three menus",
  ).toBeGreaterThanOrEqual(3);
  return names;
}

function movedDownFailure(menu: string): string {
  return `${fill(strings.notMoved, { menu })} ${editing.problems.outOfDate}`;
}

test("the menus page is named for itself, and the nav marks Menus as the current page", async ({
  page,
}) => {
  await open(page, menusPath);
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, strings.title, name));
  await expect(page.locator("main h1")).toHaveText(strings.heading);
  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  await expect(restaurantNav).toHaveCount(1);
  const current = restaurantNav.locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(nav.menus);
  await expect(current).toHaveAttribute("href", menusPath);
  await expect(restaurantNav.locator(`a[href="${details}"]`)).toHaveText(
    nav.details,
  );
});

test("every field and button names its menu, and no two controls share a name", async ({
  page,
}) => {
  const names = await openMenus(page);
  for (const menu of names) {
    await expect(
      page.getByRole("textbox", {
        name: `${strings.nameLabel} ${fill(strings.nameFor, { menu })}`,
        exact: true,
      }),
    ).toHaveCount(1);
    for (const label of [strings.moveUp, strings.moveDown, strings.remove]) {
      await expect(rowButton(page, label, menu)).toHaveCount(1);
    }
  }

  const snapshot = await page.locator("main").ariaSnapshot();
  const controls = [
    ...snapshot.matchAll(/- (?:textbox|button) "([^"]*)"/g),
  ].map((match) => match[1] ?? "");
  expect(
    controls.length,
    "every row's field and three buttons, the add field and button, and Undo",
  ).toBe(names.length * 4 + 3);
  expect(new Set(controls).size, "no two controls share a name").toBe(
    controls.length,
  );
});

test("the first row cannot move up, the last cannot move down, and both buttons still take focus", async ({
  page,
}) => {
  const names = await openMenus(page);
  const first = names[0] ?? "";
  const middle = names[1] ?? "";
  const last = names[names.length - 1] ?? "";
  const edges = [
    rowButton(page, strings.moveUp, first),
    rowButton(page, strings.moveDown, last),
  ];
  for (const button of edges) {
    await expect(button).toHaveAttribute("aria-disabled", "true");
    expect(
      await button.evaluate((element) => element.hasAttribute("disabled")),
      "an edge button is dimmed, not removed from the tab order",
    ).toBe(false);
    await button.focus();
    await expect(button).toBeFocused();
  }
  for (const label of [strings.moveUp, strings.moveDown]) {
    await expect(rowButton(page, label, middle)).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }
});

test("pressing Move up on the first row sends nothing and says it is already first", async ({
  page,
}) => {
  const names = await openMenus(page);
  const first = names[0] ?? "";
  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { menu: first }),
  );
  expect(await menuNames(page)).toEqual(names);
});

test("the saved status is never spoken, the log is polite and empty, and Undo starts with nothing to undo", async ({
  page,
}) => {
  await openMenus(page);
  const status = savedStatus(page);
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute("aria-live", "off");
  await expect(status).toHaveText(editing.saved);

  const region = log(page);
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveText("");

  const undo = page.getByRole("button", { name: editing.undo, exact: true });
  await expect(undo).toHaveCount(1);
  await expect(undo).toHaveAttribute("aria-disabled", "true");
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(region).toHaveText(editing.nothingToUndo);
  await expect(undo).toBeFocused();
});

// The one way the gate sees a failed save: the press is real, and the guard
// answers it as an action the server does not know (Q-41).
test("a move the server cannot take goes back, is said once, and keeps focus on its button", async ({
  page,
}) => {
  const writes = expectWrites(page);
  const names = await openMenus(page);
  const menu = names[0] ?? "";
  const down = rowButton(page, strings.moveDown, menu);
  await down.focus();
  await page.keyboard.press("Enter");

  const failure = movedDownFailure(menu);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await menuNames(page), "the list is back in its order").toEqual(names);
  await expect(
    log(page).getByText(
      fill(strings.movedDown, { menu, position: 2, total: names.length }),
      { exact: true },
    ),
    "the move was said when it was made",
  ).toHaveCount(1);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(down, "focus is on the button that was pressed").toBeFocused();
  await expect(
    page.getByRole("button", { name: editing.reload, exact: true }),
    "a page that is out of date offers Reload",
  ).toHaveCount(1);
  expect(
    writes.answered.length,
    "the save was sent and answered in the browser",
  ).toBeGreaterThan(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test("a link pressed while a save is on its way waits, and stays when the save fails", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const names = await openMenus(page);
  const menu = names[0] ?? "";
  const name = await restaurantName(page);
  await rowButton(page, strings.moveDown, menu).focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the save is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(savedStatus(page)).toHaveText(editing.saving);

  const link = page
    .getByRole("navigation", { name, exact: true })
    .locator(`a[href="${details}"]`);
  await link.click();
  await expect(savedStatus(page), "the link waits for the save").toHaveText(
    editing.saving,
  );
  expect(new URL(page.url()).pathname).toBe(menusPath);

  writes.release();
  const failure = movedDownFailure(menu);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(
    new URL(page.url()).pathname,
    "the page stays, so the failure is not left behind",
  ).toBe(menusPath);
  await expect(page.locator("main h1")).toHaveText(strings.heading);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(link, "focus stays on the link").toBeFocused();
  await expect(page.locator('header [role="status"]')).toHaveText("");
});
