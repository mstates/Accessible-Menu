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
  expectFocusResetThenSkipLink,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  open,
  pageChecks,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { expectBurstKeepsEveryName, expectRowHeadings } from "./owner-lists";
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
// add, a delete that lands, Undo with something to undo, a name that is
// taken, and a note that is too long are covered by the unit tests and by
// hand. One test types: three names into the add field, each with Enter,
// without waiting. An add field sends nothing until Enter, and the guard
// answers what Enter sends, so nothing typed reaches the server (D-115,
// D-125).
//
// A section that holds dishes asks before it is deleted (D-119). The
// confirmation is opened, read, and left by Keep and by Escape without a
// write; one test confirms it by a key and one deletes a section with no
// dishes, and both say they expect a write, which the guard holds and then
// answers as a failure, so the section comes back. The dialog and its
// double-tap guard are one piece for every list, and its clock tests run on
// the menus page. Which section holds dishes and which holds none comes
// from the setup.
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

// The breadcrumb above the h1 (D-128), and its one link on a menu's page,
// the way back to Menus.
function breadcrumb(page: Page) {
  return page
    .locator("main")
    .getByRole("navigation", { name: en.ui.breadcrumb, exact: true });
}

function menusCrumb(page: Page) {
  return breadcrumb(page).getByRole("link", { name: nav.menus, exact: true });
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

test("a menu's page is named for its menu, the nav marks Menus as the part it sits in, and the breadcrumb is the way back", async ({
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

  await expect(breadcrumb(page)).toHaveCount(1);
  await expect(
    breadcrumb(page).getByRole("link"),
    "one level above a menu's page",
  ).toHaveCount(1);
  await expect(menusCrumb(page)).toHaveAttribute("href", menusPath);
  const here = breadcrumb(page).locator('[aria-current="page"]');
  await expect(here, "the page itself is last, and is not a link").toHaveText(
    withSections.name,
  );
  await expect(breadcrumb(page).locator("ol > li")).toHaveCount(2);
  expect(
    await breadcrumb(page).evaluate((trail) => {
      const h1 = document.querySelector("main h1");
      return (
        h1 !== null &&
        Boolean(
          trail.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    }),
    "the breadcrumb comes before the h1",
  ).toBe(true);
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

test("the breadcrumb's Menus link pressed while a save is on its way waits, and stays when the save fails", async ({
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

  const link = menusCrumb(page);
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

// The link from a section's row to its own page (D-128).
function dishesLink(page: Page, section: string) {
  return page.getByRole("link", {
    name: fill(strings.rowAction, { action: strings.editDishes, section }),
    exact: true,
  });
}

test("every row links to its section's own page, by a name that says which section", async ({
  page,
}) => {
  const { withDishes } = ownerFixture();
  const names = await openSections(page);
  const targets: string[] = [];
  for (const section of names) {
    const link = dishesLink(page, section);
    await expect(link).toHaveCount(1);
    await expect(link, "the visible words start the name").toHaveText(
      strings.editDishes,
    );
    targets.push((await link.getAttribute("href")) ?? "");
  }
  expect(new Set(targets).size, "each link goes to its own page").toBe(
    names.length,
  );

  const target = restaurantSectionPath(code, withDishes.id);
  const link = dishesLink(page, withDishes.name);
  await expect(link).toHaveAttribute("href", target);
  await link.click();
  await page.waitForURL(`**${target}`);
  await expectFocusResetThenSkipLink(page);
  await expect(page.locator("main h1")).toHaveText(withDishes.name);
});

// D-128: every row has a visible heading with its saved name.
test("every section's row has one heading, its saved name", async ({
  page,
}) => {
  await expectRowHeadings(page, sectionsPath());
});

test("three sections added with Enter without waiting each stay on the page, are sent in turn, and are said once", async ({
  page,
}) => {
  await expectBurstKeepsEveryName(page, sectionsPath(), {
    newLabel: strings.newLabel,
    removeName: (section) =>
      fill(strings.rowAction, { action: editing.removeUnsaved, section }),
    notAdded: (section) => fill(strings.notAdded, { section }),
    removed: (section) => fill(strings.removed, { section }),
  });
});

// What the confirmation asks, which is also its name (D-119): the section
// and the dishes that go with it.
function deleteQuestion(section: string, dishes: number): string {
  const counted = fill(
    dishes === 1 ? strings.dishCount.one : strings.dishCount.other,
    { count: dishes },
  );
  return fill(strings.deleteAsk, { section, dishes: counted });
}

// The confirmation and its two answers, scoped to the dialog: Playwright
// still finds the controls behind it by role, since its role engine does
// not know the page there is inert.
function confirmation(page: Page, section: string, dishes: number) {
  const dialog = page.getByRole("alertdialog", {
    name: deleteQuestion(section, dishes),
    exact: true,
  });
  return {
    dialog,
    keep: dialog.getByRole("button", { name: strings.keep, exact: true }),
    confirm: dialog.getByRole("button", { name: strings.remove, exact: true }),
  };
}

function deleteFailure(section: string): string {
  return `${fill(strings.notDeleted, { section })} ${editing.problems.outOfDate}`;
}

test("Delete on a section with dishes asks first, with focus on Keep, and Keep or Escape sends nothing", async ({
  page,
}) => {
  const { withDishes } = ownerFixture();
  const names = await openSections(page);
  const rowDelete = rowButton(page, strings.remove, withDishes.name);
  const { dialog, keep, confirm } = confirmation(
    page,
    withDishes.name,
    withDishes.dishes,
  );

  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect(dialog, "an alert dialog named by its question").toHaveCount(1);
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
    deleteQuestion(withDishes.name, withDishes.dishes),
  );
  await expect(keep, "focus starts on Keep").toBeFocused();

  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(keep, "Tab stays inside the dialog").toBeFocused();

  // The page behind is inert, and the log is not (D-123).
  for (const behind of ["header", "main h1", "main ul"]) {
    expect(
      await page
        .locator(behind)
        .first()
        .evaluate((element) => element.closest("[inert]") !== null),
      `${behind} is inert behind the dialog`,
    ).toBe(true);
  }
  expect(
    await log(page).evaluate(
      (element) => element.closest('[inert], [aria-hidden="true"]') === null,
    ),
    "the log stays heard behind the dialog",
  ).toBe(true);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await keep.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(rowDelete, "Keep returns focus to Delete").toBeFocused();
  await expect(page.locator("[inert]"), "the page is live again").toHaveCount(
    0,
  );

  await page.keyboard.press("Enter");
  await expect(keep).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rowDelete, "Escape returns focus to Delete").toBeFocused();

  expect(await sectionNames(page), "nothing was deleted").toEqual(names);
  await expect(log(page), "and nothing was said").toHaveText("");
  await expect(savedStatus(page)).toHaveText(editing.saved);
});

// The delete itself, as far as the gate may take it: the press is real, the
// write guard holds its answer, and then answers it as an action the server
// does not know, so the section comes back. The press is a deliberate Tab
// then Enter on a stopped clock, in the same instant the dialog opened: a
// key is never held back (D-119).
test("a section delete confirmed by Tab then Enter closes the dialog first, moves focus to a name field, says so, and comes back when the server cannot take it", async ({
  page,
}) => {
  await page.clock.install();
  const writes = expectWrites(page, { hold: true });
  const { withDishes } = ownerFixture();
  const names = await openSections(page);
  const index = names.indexOf(withDishes.name);
  const neighbor = names[index + 1] ?? names[index - 1] ?? "";
  const rowDelete = rowButton(page, strings.remove, withDishes.name);
  const { dialog, keep, confirm } = confirmation(
    page,
    withDishes.name,
    withDishes.dishes,
  );

  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect(keep).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await page.clock.resume();

  await expect(dialog, "the dialog closes").toHaveCount(0);
  await expect
    .poll(() => writes.answered.length, {
      message: "the delete is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(page.locator("[inert]"), "the page is live again").toHaveCount(
    0,
  );
  expect(await sectionNames(page), "the row is gone").toEqual(
    names.filter((name) => name !== withDishes.name),
  );
  await expect(
    nameField(page, neighbor),
    "focus is in the next row's name field",
  ).toBeFocused();
  await expect(
    log(page).getByText(fill(strings.deleted, { section: withDishes.name }), {
      exact: true,
    }),
    "the delete is said once",
  ).toHaveCount(1);

  writes.release();
  const failure = deleteFailure(withDishes.name);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await sectionNames(page), "the section is back").toEqual(names);
  await expect(rowDelete, "focus is back on its Delete").toBeFocused();
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
});

test("Delete on a section with no dishes asks nothing, and the section comes back when the server cannot take it", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { emptySection } = ownerFixture();
  const names = await openSections(page);
  const rowDelete = rowButton(page, strings.remove, emptySection.name);

  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the delete is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("alertdialog"),
    "an empty section goes at once",
  ).toHaveCount(0);
  expect(await sectionNames(page), "the row is gone").toEqual(
    names.filter((name) => name !== emptySection.name),
  );

  writes.release();
  const failure = deleteFailure(emptySection.name);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await sectionNames(page), "the section is back").toEqual(names);
  await expect(rowDelete, "focus is back on its Delete").toBeFocused();
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
});
