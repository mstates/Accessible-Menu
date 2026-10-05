import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantMenuPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  open,
  pageChecks,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// A menu's own page and its sections, signed in as the test owner (D-100),
// on the sections the test restaurant was given by hand: one menu with at
// least three, one with none. The gate never writes and never types into a
// field that saves (D-108, D-111, D-115): every test here runs behind the
// write guard. Most only read. One presses Enter and Tab in fields it does
// not change, and the guard proves nothing was sent; it does not press
// Enter in a note, since that would type a line break. Two press a Move
// button and say they expect a write; the guard answers it inside the
// browser as an action the server does not know, which is how the failed
// state is reached. Typing, real saves and the "Saved." they say (D-118),
// add, delete, Undo with something to undo, a name that is taken, and a
// note that is too long are covered by the unit tests and by hand.
//
// A menu's page is named by its id, which the setup finds and writes down,
// so every path here is read when a test runs, never when this file loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.sections;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;

guardWrites();

function sectionsPath(): string {
  return restaurantMenuPath(code, ownerFixture().withSections.id);
}

function emptyPath(): string {
  return restaurantMenuPath(code, ownerFixture().empty.id);
}

test.describe("a menu's page, with sections", () => {
  pageChecks(sectionsPath);
});

test.describe("a menu's page, with no sections", () => {
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

function rowButton(page: Page, action: string, section: string) {
  return page.getByRole("button", {
    name: fill(strings.rowAction, { action, section }),
    exact: true,
  });
}

function nameField(page: Page, section: string) {
  return page.getByRole("textbox", {
    name: `${strings.nameLabel} ${fill(strings.labelFor, { section })}`,
    exact: true,
  });
}

function noteField(page: Page, section: string) {
  return page.getByRole("textbox", {
    name: `${strings.noteLabel} ${fill(strings.labelFor, { section })}`,
    exact: true,
  });
}

function everyItemField(page: Page, section: string) {
  return page.getByRole("textbox", {
    name: `${strings.everyItemLabel} ${fill(strings.everyItemIn, { section })}`,
    exact: true,
  });
}

function backToMenus(page: Page) {
  return page
    .locator("main")
    .getByRole("link", { name: strings.backToMenus, exact: true });
}

// The sections in the order the page shows them, by the value of each name
// field.
async function sectionNames(page: Page): Promise<string[]> {
  return rows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// The list is ready to press once the page has hydrated.
async function openSections(page: Page): Promise<string[]> {
  await open(page, sectionsPath());
  await page.waitForLoadState("networkidle");
  const names = await sectionNames(page);
  expect(
    names.length,
    "the test menu has three sections",
  ).toBeGreaterThanOrEqual(3);
  return names;
}

function movedDownFailure(section: string): string {
  return `${fill(strings.notMoved, { section })} ${editing.problems.outOfDate}`;
}

test("a menu's page is named for its menu, the nav marks Menus as the part it sits in, and the way back is there", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await open(page, sectionsPath());
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, withSections.name, name));
  await expect(page.locator("main h1")).toHaveText(withSections.name);

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

  await expect(backToMenus(page)).toHaveCount(1);
  await expect(backToMenus(page)).toHaveAttribute("href", menusPath);
});

test("every field and button names its section, each hint is tied to its field, and no two controls share a name", async ({
  page,
}) => {
  const names = await openSections(page);
  for (const section of names) {
    const name = nameField(page, section);
    const note = noteField(page, section);
    const everyItem = everyItemField(page, section);
    await expect(name).toHaveCount(1);
    await expect(note).toHaveCount(1);
    await expect(everyItem).toHaveCount(1);
    await expect(note).toHaveAccessibleDescription(strings.noteHint);
    await expect(everyItem).toHaveAccessibleDescription(strings.everyItemHint);
    expect(
      await note.evaluate((element) => element.tagName),
      "the note takes several lines",
    ).toBe("TEXTAREA");
    for (const line of [name, everyItem]) {
      expect(
        await line.evaluate((element) => element.tagName),
        "the name and the every-dish line are one line each",
      ).toBe("INPUT");
    }
    for (const label of [strings.moveUp, strings.moveDown, strings.remove]) {
      await expect(rowButton(page, label, section)).toHaveCount(1);
    }
  }

  const snapshot = await page.locator("main").ariaSnapshot();
  const controls = [
    ...snapshot.matchAll(/- (?:textbox|button) "([^"]*)"/g),
  ].map((match) => match[1] ?? "");
  expect(
    controls.length,
    "every row's three fields and three buttons, the add field and button, and Undo",
  ).toBe(names.length * 6 + 3);
  expect(new Set(controls).size, "no two controls share a name").toBe(
    controls.length,
  );
});

test("the first row cannot move up, the last cannot move down, and both buttons still take focus", async ({
  page,
}) => {
  const names = await openSections(page);
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
  const names = await openSections(page);
  const first = names[0] ?? "";
  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { section: first }),
  );
  expect(await sectionNames(page)).toEqual(names);
});

// It types nothing, so nothing may be sent or said; the write guard is the
// proof that nothing was sent. Enter commits a field of one line, so it is
// pressed in the name and in the every-dish line. In the note Enter is a
// line break, which would be typing, so the note is only left, with Tab.
// The dimmed Move up after it says one sentence at once, so the log is read
// after every commit has run.
test("Enter in an unchanged name and every-dish line, and Tab through an unchanged note, send nothing and say nothing", async ({
  page,
}) => {
  const names = await openSections(page);
  const first = names[0] ?? "";
  const middle = names[1] ?? "";
  const name = nameField(page, middle);
  const note = noteField(page, middle);
  const everyItem = everyItemField(page, middle);

  await name.focus();
  await page.keyboard.press("Enter");
  await expect(name).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(note, "the note comes after the name").toBeFocused();
  await page.keyboard.press("Tab");
  await expect(everyItem, "the every-dish line comes next").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(everyItem).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(everyItem).not.toBeFocused();

  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { section: first }),
  );
  await expect(savedStatus(page)).toHaveText(editing.saved);
  expect(await sectionNames(page)).toEqual(names);
});

test("the saved status is never spoken, the log is polite, empty, and kept out of a dialog's reach, and Undo starts with nothing to undo", async ({
  page,
}) => {
  await openSections(page);
  const status = savedStatus(page);
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute("aria-live", "off");
  await expect(status).toHaveText(editing.saved);

  const region = log(page);
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(
    region,
    "the mark React Aria leaves alone when a modal makes the page inert",
  ).toHaveAttribute("data-react-aria-top-layer", "true");
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
  const names = await openSections(page);
  const section = names[0] ?? "";
  const down = rowButton(page, strings.moveDown, section);
  await down.focus();
  await page.keyboard.press("Enter");

  const failure = movedDownFailure(section);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await sectionNames(page), "the list is back in its order").toEqual(
    names,
  );
  await expect(
    log(page).getByText(
      fill(strings.movedDown, {
        section,
        position: 2,
        total: names.length,
      }),
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

test("Back to Menus pressed while a save is on its way waits, and stays when the save fails", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { withSections } = ownerFixture();
  const here = sectionsPath();
  const names = await openSections(page);
  const section = names[0] ?? "";
  await rowButton(page, strings.moveDown, section).focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the save is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(savedStatus(page)).toHaveText(editing.saving);

  const link = backToMenus(page);
  await link.click();
  await expect(savedStatus(page), "the link waits for the save").toHaveText(
    editing.saving,
  );
  expect(new URL(page.url()).pathname).toBe(here);

  writes.release();
  const failure = movedDownFailure(section);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(
    new URL(page.url()).pathname,
    "the page stays, so the failure is not left behind",
  ).toBe(here);
  await expect(page.locator("main h1")).toHaveText(withSections.name);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(link, "focus stays on the link").toBeFocused();
  await expect(page.locator('header [role="status"]')).toHaveText("");
});

test("a menu with no sections says so, and still has the add field, the status, and a dimmed Undo", async ({
  page,
}) => {
  const { empty } = ownerFixture();
  await open(page, emptyPath());
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1")).toHaveText(empty.name);
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

test("both menu pages carry an empty status region in the header", async ({
  page,
}) => {
  for (const path of [sectionsPath(), emptyPath()]) {
    await open(page, path);
    await expect(page.locator('header [role="status"]')).toHaveCount(1);
    await expect(page.locator('header [role="status"]')).toHaveText("");
  }
});

// The menu in the path is user input. Neither of these reaches a query for
// sections: the first is not an id at all, and the second names no menu of
// this restaurant, which is also what a deleted menu's id gets.
test("a menu id that is not an id, and one that matches no menu, get the 404 page", async ({
  page,
}) => {
  const paths = [
    restaurantMenuPath(code, "not-a-menu"),
    restaurantMenuPath(code, "00000000-0000-4000-8000-000000000000"),
  ];
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} is not a page`).toBe(404);
    await expect(page).toHaveTitle(pageTitle(en, en.notFound.title));
  }
});
