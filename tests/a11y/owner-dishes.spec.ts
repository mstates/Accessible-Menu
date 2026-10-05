import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  open,
  pageChecks,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { expectBurstKeepsEveryName, expectRowHeadings } from "./owner-lists";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// A section's own page and its dishes (D-128), signed in as the test owner
// (D-100), on the dishes the data file gave the test restaurant: one section
// with at least three, one with none. The gate never writes and never types
// into a field that saves when it is left (D-108, D-111, D-115): every test
// here runs behind the write guard. Most only read. One presses Enter and
// Tab in a name it does not change, and the guard proves nothing was sent.
// Three press a button that saves and say they expect a write: a Move down
// twice, and the section's move to another menu once. The guard answers
// each inside the browser as an action the server does not know, which is
// how the failed state is reached. One test types: three names into the add
// field, each with Enter, without waiting; an add field sends nothing until
// Enter, and the guard answers what Enter sends (D-125). Real saves and the
// "Saved." they say (D-118), an add or a delete that lands, Undo with
// something to undo, a taken name, and a section that really moves are
// covered by the unit tests, by the boundary scripts, and by hand.
//
// A section's page is named by its id, which the setup finds and writes
// down, so every path here is read when a test runs, never when this file
// loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.dishes;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;

guardWrites();

function dishesPath(): string {
  return restaurantSectionPath(code, ownerFixture().withDishes.id);
}

function emptyPath(): string {
  return restaurantSectionPath(code, ownerFixture().emptySection.id);
}

test.describe("a section's page, with dishes", () => {
  pageChecks(dishesPath);
});

test.describe("a section's page, with no dishes", () => {
  pageChecks(emptyPath);
});

function rows(page: Page) {
  return page.locator("main ul > li");
}

function savedStatus(page: Page) {
  return page.locator('main [role="status"]');
}

function log(page: Page) {
  return page.locator('main [role="log"]');
}

function rowButton(page: Page, action: string, dish: string) {
  return page.getByRole("button", {
    name: fill(strings.rowAction, { action, dish }),
    exact: true,
  });
}

function nameField(page: Page, dish: string) {
  return page.getByRole("textbox", {
    name: `${strings.nameLabel} ${fill(strings.labelFor, { dish })}`,
    exact: true,
  });
}

// The breadcrumb above the h1 (D-128).
function breadcrumb(page: Page) {
  return page
    .locator("main")
    .getByRole("navigation", { name: en.ui.breadcrumb, exact: true });
}

function moveButton(page: Page) {
  return page.getByRole("button", { name: strings.move.submit, exact: true });
}

// The Select's trigger. React Aria names it by its label and its value.
function moveSelect(page: Page) {
  return page.getByRole("button", { name: new RegExp(strings.move.label) });
}

// The dishes in the order the page shows them, by the value of each name
// field.
async function dishNames(page: Page): Promise<string[]> {
  return rows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// The list is ready to press once the page has hydrated.
async function openDishes(page: Page): Promise<string[]> {
  await open(page, dishesPath());
  await page.waitForLoadState("networkidle");
  const names = await dishNames(page);
  expect(
    names.length,
    "the test section has three dishes",
  ).toBeGreaterThanOrEqual(3);
  return names;
}

function movedDownFailure(dish: string): string {
  return `${fill(strings.notMoved, { dish })} ${editing.problems.outOfDate}`;
}

test("a section's page is named for its section, its title names its menu, the breadcrumb leads back, and the nav marks Menus as the part it sits in", async ({
  page,
}) => {
  const { withSections, withDishes } = ownerFixture();
  await open(page, dishesPath());
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(
    pageTitle(en, withDishes.name, name, withSections.name),
  );
  await expect(page.locator("main h1")).toHaveText(withDishes.name);

  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  await expect(restaurantNav).toHaveCount(1);
  const marked = restaurantNav.locator("a[aria-current]");
  await expect(marked).toHaveCount(1);
  await expect(
    marked,
    "Menus is the current part of the nav, not the current page",
  ).toHaveAttribute("aria-current", "true");
  await expect(marked).toHaveText(nav.menus);
  await expect(marked).toHaveAttribute("href", menusPath);
  await expect(
    page.locator('a[aria-current="page"]'),
    "no link points to this page, so none says it is the current page",
  ).toHaveCount(0);

  const trail = breadcrumb(page);
  await expect(trail).toHaveCount(1);
  await expect(trail.locator("ol > li")).toHaveCount(3);
  const links = trail.getByRole("link");
  await expect(links, "Menus, then the menu").toHaveText([
    nav.menus,
    withSections.name,
  ]);
  await expect(links.nth(0)).toHaveAttribute("href", menusPath);
  await expect(links.nth(1)).toHaveAttribute(
    "href",
    restaurantMenuPath(code, withSections.id),
  );
  await expect(
    trail.locator('[aria-current="page"]'),
    "the page itself is last, and is not a link",
  ).toHaveText(withDishes.name);
  expect(
    await trail.evaluate((element) => {
      const h1 = document.querySelector("main h1");
      return (
        h1 !== null &&
        Boolean(
          element.compareDocumentPosition(h1) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    }),
    "the breadcrumb comes before the h1",
  ).toBe(true);
});

test("every field and button names its dish, and no two controls share a name", async ({
  page,
}) => {
  const names = await openDishes(page);
  for (const dish of names) {
    await expect(nameField(page, dish)).toHaveCount(1);
    for (const label of [strings.moveUp, strings.moveDown, strings.remove]) {
      await expect(rowButton(page, label, dish)).toHaveCount(1);
    }
  }
  await expect(
    rows(page).getByRole("link"),
    "a dish has no page of its own yet, so its row has no link",
  ).toHaveCount(0);

  const snapshot = await page.locator("main").ariaSnapshot();
  const controls = [
    ...snapshot.matchAll(/- (?:textbox|button) "([^"]*)"/g),
  ].map((match) => match[1] ?? "");
  expect(
    controls.length,
    "every row's field and three buttons, the add field and button, Undo, and the move's Select and button",
  ).toBe(names.length * 4 + 5);
  expect(new Set(controls).size, "no two controls share a name").toBe(
    controls.length,
  );
});

test("the first row cannot move up, the last cannot move down, and both buttons still take focus", async ({
  page,
}) => {
  const names = await openDishes(page);
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
  const names = await openDishes(page);
  const first = names[0] ?? "";
  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { dish: first }),
  );
  expect(await dishNames(page)).toEqual(names);
});

// It types nothing, so nothing may be sent or said; the write guard is the
// proof that nothing was sent. The dimmed Move up after it says one
// sentence at once, so the log is read after the commit has run.
test("Enter and Tab on an unchanged name send nothing and say nothing", async ({
  page,
}) => {
  const names = await openDishes(page);
  const first = names[0] ?? "";
  const middle = names[1] ?? "";
  const field = nameField(page, middle);
  await field.focus();
  await page.keyboard.press("Enter");
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(field).not.toBeFocused();

  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { dish: first }),
  );
  await expect(savedStatus(page)).toHaveText(editing.saved);
  expect(await dishNames(page)).toEqual(names);
});

test("the saved status is never spoken, the log is polite, empty, and kept out of a dialog's reach, and Undo starts with nothing to undo", async ({
  page,
}) => {
  await openDishes(page);
  const status = savedStatus(page);
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute("aria-live", "off");
  await expect(status).toHaveText(editing.saved);

  const region = log(page);
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveAttribute("data-react-aria-top-layer", "true");
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
  const names = await openDishes(page);
  const dish = names[0] ?? "";
  const down = rowButton(page, strings.moveDown, dish);
  await down.focus();
  await page.keyboard.press("Enter");

  const failure = movedDownFailure(dish);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await dishNames(page), "the list is back in its order").toEqual(names);
  await expect(
    log(page).getByText(
      fill(strings.movedDown, { dish, position: 2, total: names.length }),
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

test("a breadcrumb link pressed while a save is on its way waits, and stays when the save fails", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { withSections, withDishes } = ownerFixture();
  const here = dishesPath();
  const names = await openDishes(page);
  const dish = names[0] ?? "";
  await rowButton(page, strings.moveDown, dish).focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the save is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(savedStatus(page)).toHaveText(editing.saving);

  const link = breadcrumb(page).getByRole("link", {
    name: withSections.name,
    exact: true,
  });
  await link.click();
  await expect(savedStatus(page), "the link waits for the save").toHaveText(
    editing.saving,
  );
  expect(new URL(page.url()).pathname).toBe(here);

  writes.release();
  const failure = movedDownFailure(dish);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(
    new URL(page.url()).pathname,
    "the page stays, so the failure is not left behind",
  ).toBe(here);
  await expect(page.locator("main h1")).toHaveText(withDishes.name);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(link, "focus stays on the link").toBeFocused();
  await expect(page.locator('header [role="status"]')).toHaveText("");
});

test("a section with no dishes says so, and still has the add field, the status, and a dimmed Undo", async ({
  page,
}) => {
  const { emptySection } = ownerFixture();
  await open(page, emptyPath());
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1")).toHaveText(emptySection.name);
  await expect(rows(page)).toHaveCount(0);
  await expect(
    page.locator("main").getByText(strings.none, { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: strings.newLabel, exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: strings.add, exact: true }),
  ).toHaveCount(1);
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expect(
    page.getByRole("button", { name: editing.undo, exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
});

test("both section pages carry an empty status region in the header", async ({
  page,
}) => {
  for (const path of [dishesPath(), emptyPath()]) {
    await open(page, path);
    await expect(page.locator('header [role="status"]')).toHaveCount(1);
    await expect(page.locator('header [role="status"]')).toHaveText("");
  }
});

// The section in the path is user input. Neither of these reaches a query
// for dishes: the first is not an id at all, and the second names no
// section of this restaurant, which is also what a deleted section's id
// gets, and a section of a deleted menu.
test("a section id that is not an id, and one that matches no section, get the 404 page", async ({
  page,
}) => {
  const paths = [
    restaurantSectionPath(code, "not-a-section"),
    restaurantSectionPath(code, "00000000-0000-4000-8000-000000000000"),
  ];
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} is not a page`).toBe(404);
    await expect(page).toHaveTitle(pageTitle(en, en.notFound.title));
  }
});

// D-128: every row has a visible heading with its saved name. The page's
// one other level 2 heading names the section's move, after the list.
test("every dish's row has one heading, its saved name, and the move has its own after the list", async ({
  page,
}) => {
  await expectRowHeadings(page, dishesPath());
  const names = await dishNames(page);
  await expect(
    page.locator("main").getByRole("heading", { level: 2 }),
  ).toHaveText([...names, strings.move.heading]);
});

test("three dishes added with Enter without waiting each stay on the page, are sent in turn, and are said once", async ({
  page,
}) => {
  await expectBurstKeepsEveryName(page, dishesPath(), {
    newLabel: strings.newLabel,
    removeName: (dish) =>
      fill(strings.rowAction, { action: editing.removeUnsaved, dish }),
    notAdded: (dish) => fill(strings.notAdded, { dish }),
    removed: (dish) => fill(strings.removed, { dish }),
  });
});

// The menus the test restaurant has, in order, read from its Menus page.
async function menuNames(page: Page): Promise<string[]> {
  await open(page, menusPath);
  return rows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// D-129: the section moves to another menu of its restaurant, from its own
// page. Choosing a menu sends nothing; only the button does.
test("the move lists every other menu and not the section's own, and choosing one sends nothing", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  const all = await menuNames(page);
  const others = all.filter((menu) => menu !== withSections.name);
  expect(others.length, "the test restaurant has other menus").toBeGreaterThan(
    0,
  );

  await openDishes(page);
  const select = moveSelect(page);
  await expect(select).toHaveCount(1);
  await expect(select).toContainText(strings.move.placeholder);
  await select.focus();
  await page.keyboard.press("Enter");
  const options = page.getByRole("option");
  await expect(options, "the other menus, in the order Menus shows").toHaveText(
    others,
  );
  await expectNoAxeViolations(page);
  await page.keyboard.press("Enter");
  await expect(options).toHaveCount(0);
  await expect(select, "the first menu is chosen").toContainText(
    others[0] ?? "",
  );
  await expect(select, "and focus is back on the Select").toBeFocused();
  await expect(savedStatus(page), "choosing sent nothing").toHaveText(
    editing.saved,
  );
  await expect(log(page), "and said nothing").toHaveText("");
});

test("Move section with no menu chosen says to choose one, and sends nothing", async ({
  page,
}) => {
  await openDishes(page);
  const button = moveButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(strings.move.choose);
  await expect(
    page.locator("main").getByText(strings.move.choose, { exact: true }),
    "the sentence shows on the page, under the Select, and is in the log",
  ).toHaveCount(2);
  await expect(button, "focus stays on the button").toBeFocused();
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expectNoAxeViolations(page);
});

test("a move the server cannot take is said once, keeps focus on its button, and leaves the breadcrumb as it was", async ({
  page,
}) => {
  const writes = expectWrites(page);
  const { withSections, withDishes } = ownerFixture();
  await openDishes(page);
  const select = moveSelect(page);
  await select.focus();
  await page.keyboard.press("Enter");
  const target =
    (await page.getByRole("option").first().textContent())?.trim() ?? "";
  await page.keyboard.press("Enter");
  await expect(select).toContainText(target);

  const button = moveButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  const failure = `${fill(strings.move.notMoved, {
    section: withDishes.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(button, "focus is on the button that was pressed").toBeFocused();
  await expect(
    breadcrumb(page).getByRole("link"),
    "the section is where it was",
  ).toHaveText([nav.menus, withSections.name]);
  expect(
    writes.answered.length,
    "the move was sent and answered in the browser",
  ).toBeGreaterThan(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
