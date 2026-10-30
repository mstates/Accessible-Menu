import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { CHOICE_LISTS_HEADING_ID } from "../../src/features/owner/choices/useChoiceListRows";
import {
  restaurantChoiceListPath,
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { FIRST_FOCUS_WAIT_MS } from "../../src/ui/alert-dialog-guard";
import {
  expectFocusResetThenSkipLink,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNoMissingIds,
  open,
  pageChecks,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { breadcrumbMarks, sectionControls } from "./owner-controls";
import { listRowChecks, stopClock } from "./owner-lists";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// A section's own page and its dishes (D-128), signed in as the test owner
// (D-100), on the dishes the data file gave the test restaurant: one section
// with at least three, one with none. The gate never writes and never types
// into a field that saves when it is left (D-108, D-111, D-115): every test
// here runs behind the write guard. The row tests every list shares run
// from listRowChecks in owner-lists.ts; this file holds what is a section's
// page's own: its name, its breadcrumb, its choice lists (D-166), and its
// move to another menu (D-129). One move test presses Move section and says
// it expects a write; the guard answers it inside the browser as an action
// the server does not know, which is how the failed state is reached. Real
// saves and the "Saved." they say (D-118), an add or a delete that lands,
// Undo with something to undo, a taken name, a section that really moves,
// and a choice list that lands are covered by the unit tests, by the
// boundary scripts, by the local checks, and by hand. The data file gives
// the section with dishes one choice list with one option, and the empty
// section none, so the gate reads a page with a row and one without.
//
// A section's page is named by its id, which the setup finds and writes
// down, so every path here is read when a test runs, never when this file
// loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.dishes;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;
const choices = en.owner.choices;

guardWrites();

function dishesPath(): string {
  return restaurantSectionPath(code, ownerFixture().withDishes.id);
}

function emptyPath(): string {
  return restaurantSectionPath(code, ownerFixture().emptySection.id);
}

const checks = {
  controls: (page: Page) =>
    sectionControls(page, ownerFixture().withSections.name),
  marks: breadcrumbMarks,
};

test.describe("a section's page, with dishes", () => {
  pageChecks(dishesPath, { ...checks, snapshot: "sections-with-dishes" });
});

test.describe("a section's page, with no dishes", () => {
  pageChecks(emptyPath, { ...checks, snapshot: "sections-empty" });
});

listRowChecks({
  noun: "dish",
  plural: "dishes",
  words: strings,
  path: dishesPath,
  h1: () => ownerFixture().withDishes.name,
  // The name field and Move up, Move down, and Delete; the section's note,
  // the one choice list's three buttons, its add field and Add choice list,
  // the dishes' add field, Add, Undo, and the move's Select and button. The
  // links to the dish's page and to the list's page are not fields or
  // buttons.
  rowControls: 4,
  pageControls: 11,
  // Each row's link to its dish's own page (D-128).
  rowLink: {
    label: strings.editDish,
    target: () => ({
      name: ownerFixture().dishes.sizes.name,
      path: restaurantDishPath(code, ownerFixture().dishes.sizes.id),
    }),
  },
  // The breadcrumb's link to the section's menu.
  leaveLink: (page) =>
    breadcrumb(page).getByRole("link", {
      name: ownerFixture().withSections.name,
      exact: true,
    }),
  empty: { path: emptyPath, h1: () => ownerFixture().emptySection.name },
  notFound: [
    restaurantSectionPath(code, "not-a-section"),
    restaurantSectionPath(code, "00000000-0000-4000-8000-000000000000"),
  ],
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

// The section's own text at the top of its page (D-135). The page is the
// section, so its name does not repeat it.
function noteField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.section.noteLabel,
    exact: true,
  });
}

// The choice lists block (D-166): its heading, its rows as an ordered list
// named by the heading, and its add form.
function choiceHeading(page: Page) {
  return page
    .locator("main")
    .getByRole("heading", { level: 2, name: choices.heading });
}

function choiceRows(page: Page) {
  return page.locator(
    `main ol[aria-labelledby="${CHOICE_LISTS_HEADING_ID}"] > li`,
  );
}

function newListField(page: Page) {
  return page.getByRole("textbox", {
    name: choices.lists.newLabel,
    exact: true,
  });
}

function listButton(page: Page, action: string, list: string) {
  return page.getByRole("button", {
    name: fill(choices.lists.rowAction, { action, list }),
    exact: true,
  });
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

// D-135, D-166, and WCAG 3.3.2: the sentence that says how the page saves
// comes right after the h1, before the first field it governs; then the
// section's note, then the choice lists under their heading with their
// lead, the one row, and the add form, then the status and Undo, then the
// dishes' own lead right above the dishes.
test("the section's note comes first, after the sentence that says how it saves, with its hint, then the choice lists, then the status, then the dishes", async ({
  page,
}) => {
  const { lists } = ownerFixture();
  await openDishes(page);
  const note = noteField(page);
  await expect(note).toHaveCount(1);
  await expect(note).toHaveAccessibleDescription(strings.section.noteHint);
  expect(
    await note.evaluate((element) => element.tagName),
    "the note takes several lines",
  ).toBe("TEXTAREA");

  const main = page.locator("main");
  const inOrder = [
    main.locator("h1"),
    main.getByText(strings.section.lead, { exact: true }),
    note,
    choiceHeading(page),
    main.getByText(choices.leadSection, { exact: true }),
    choiceRows(page).first(),
    newListField(page),
    savedStatus(page),
    main.getByText(strings.lead, { exact: true }),
    rows(page).first(),
  ];
  for (const [index, locator] of inOrder.entries()) {
    await expect(locator).toHaveCount(1);
    const before = inOrder[index - 1];
    if (!before) continue;
    const next = await locator.elementHandle();
    expect(
      await before.evaluate(
        (element, after) =>
          after !== null &&
          Boolean(
            element.compareDocumentPosition(after) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        next,
      ),
      "the h1, the lead, the note, the choice lists' heading, lead, row, and add field, the status, the dishes' lead, then the dishes, in that order",
    ).toBe(true);
  }
  await expect(newListField(page)).toHaveAccessibleDescription(
    choices.lists.newHint,
  );
  await expect(
    choiceRows(page).first().getByRole("heading", { level: 3 }),
    "a list's row is headed by its lead, one level under the block's heading",
  ).toHaveText(lists.section.lead);
});

// It types nothing, so nothing may be sent or said; the write guard is the
// proof that nothing was sent (D-118). In the note Enter is a line break,
// which would be typing, so the note is only left, with Tab. The dimmed
// Move up after it says one sentence at once, so the log is read after
// every commit has run.
test("Tab out of the section's unchanged note sends nothing and says nothing", async ({
  page,
}) => {
  const names = await openDishes(page);
  const first = names[0] ?? "";
  const note = noteField(page);
  await note.focus();
  await page.keyboard.press("Tab");
  await expect(note).not.toBeFocused();

  await page
    .getByRole("button", {
      name: fill(strings.rowAction, { action: strings.moveUp, dish: first }),
      exact: true,
    })
    .press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { dish: first }),
  );
  await expect(savedStatus(page)).toHaveText(editing.saved);
});

// D-128: the row headings are checked with every list's; the page's two
// other level 2 headings name the choice lists, before the list, and the
// section's move, after it (D-166). The lists' rows are level 3, under
// their heading.
test("the choice lists and the move have their own headings, around every dish's, and each list's row is a level 3 heading", async ({
  page,
}) => {
  const { lists } = ownerFixture();
  const names = await openDishes(page);
  await expect(
    page.locator("main").getByRole("heading", { level: 2 }),
  ).toHaveText([choices.heading, ...names, strings.move.heading]);
  await expect(
    page.locator("main").getByRole("heading", { level: 3 }),
  ).toHaveText([lists.section.lead]);
});

// The choice lists on a section's page (D-166): the one row the data file
// gives Starters, with its link to the list's own page named by the lead,
// its three buttons, and the add form; and nothing but the heading, the
// lead, and the add form on a section with none.
test("a section's choice list reads as a row with its link and buttons named by the lead, and a section with none says so", async ({
  page,
}) => {
  const { lists, withDishes, withSections } = ownerFixture();
  const lead = lists.section.lead;
  await openDishes(page);
  await expect(choiceRows(page)).toHaveCount(1);
  const link = page.getByRole("link", {
    name: fill(choices.lists.rowAction, {
      action: choices.lists.edit,
      list: lead,
    }),
    exact: true,
  });
  await expect(link).toHaveCount(1);
  await expect(link, "the visible words start the name").toHaveText(
    choices.lists.edit,
  );
  await expect(link).toHaveAttribute(
    "href",
    restaurantChoiceListPath(code, lists.section.id),
  );
  for (const action of [
    choices.lists.moveUp,
    choices.lists.moveDown,
    choices.lists.remove,
  ]) {
    await expect(listButton(page, action, lead)).toHaveCount(1);
  }
  await expect(
    listButton(page, choices.lists.moveUp, lead),
    "the one row is first",
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    listButton(page, choices.lists.moveDown, lead),
    "and last",
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByRole("button", { name: choices.lists.add, exact: true }),
  ).toHaveCount(1);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  // Move up on the one row sends nothing and says it is already first.
  await listButton(page, choices.lists.moveUp, lead).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(choices.lists.alreadyFirst, { list: lead }),
  );
  await expect(savedStatus(page)).toHaveText(editing.saved);

  // The link leads to the list's own page, titled with every level inside.
  const name = await restaurantName(page);
  await link.click();
  await page.waitForURL(
    `**${restaurantChoiceListPath(code, lists.section.id)}`,
  );
  await expectFocusResetThenSkipLink(page);
  await expect(page).toHaveTitle(
    pageTitle(en, lead, name, [withDishes.name, withSections.name]),
  );
  await expect(page.locator("main h1")).toHaveText(lead);

  await open(page, emptyPath());
  await expect(choiceHeading(page)).toHaveCount(1);
  await expect(
    page.locator("main").getByText(choices.leadSection, { exact: true }),
  ).toHaveCount(1);
  await expect(choiceRows(page)).toHaveCount(0);
  await expect(
    page.locator("main").getByText(choices.lists.none, { exact: true }),
  ).toHaveCount(1);
  await expect(newListField(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: choices.lists.add, exact: true }),
  ).toHaveCount(1);
});

// D-119, D-166: a list with options asks first. The question names the
// list and its options and is the dialog's name; focus goes to Keep; Keep
// sends nothing.
test(
  "Delete on a choice list with options asks first, with focus on Keep, and Keep sends nothing",
  { tag: "@dialog" },
  async ({ page }) => {
    const { lists } = ownerFixture();
    const lead = lists.section.lead;
    const question = fill(choices.lists.deleteAsk, {
      list: lead,
      options: fill(
        lists.section.options === 1
          ? choices.lists.optionCount.one
          : choices.lists.optionCount.other,
        { count: lists.section.options },
      ),
    });
    await openDishes(page);
    const rowDelete = listButton(page, choices.lists.remove, lead);
    const dialog = page.getByRole("alertdialog", {
      name: question,
      exact: true,
    });
    const keep = dialog.getByRole("button", {
      name: choices.lists.keep,
      exact: true,
    });
    await rowDelete.focus();
    await page.keyboard.press("Enter");
    await expect(dialog, "an alert dialog named by its question").toHaveCount(
      1,
    );
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      question,
    );
    await expect(keep, "focus moves to Keep (D-136)").toBeFocused();
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
    await keep.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(rowDelete, "Keep returns focus to Delete").toBeFocused();
    await expect(choiceRows(page), "nothing was deleted").toHaveCount(1);
    await expect(log(page), "and nothing was said").toHaveText("");
    await expect(savedStatus(page)).toHaveText(editing.saved);
  },
);

// The delete confirmed, as far as the gate may take it: the write is held,
// the row is gone with the sentence said, and it comes back when the guard
// answers (D-119).
test(
  "a choice list delete confirmed by Tab then Enter closes the dialog first, moves focus to the add field, says so, and comes back when the server cannot take it",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const writes = expectWrites(page, { hold: true });
    const { lists } = ownerFixture();
    const lead = lists.section.lead;
    await openDishes(page);
    const rowDelete = listButton(page, choices.lists.remove, lead);
    const dialog = page.getByRole("alertdialog");
    const keep = dialog.getByRole("button", {
      name: choices.lists.keep,
      exact: true,
    });
    const confirm = dialog.getByRole("button", {
      name: choices.lists.remove,
      exact: true,
    });
    await stopClock(page);
    await rowDelete.focus();
    await page.keyboard.press("Enter");
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
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
    await expect(choiceRows(page), "the row is gone").toHaveCount(0);
    await expect(
      newListField(page),
      "focus is in the add field, since no row is left",
    ).toBeFocused();
    await expect(
      log(page).getByText(fill(choices.lists.deleted, { list: lead }), {
        exact: true,
      }),
      "the delete is said once",
    ).toHaveCount(1);

    writes.release();
    const failure = `${fill(choices.lists.notDeleted, { list: lead })} ${editing.problems.outOfDate}`;
    await expect(savedStatus(page)).toHaveText(failure);
    await expect(choiceRows(page), "the row is back").toHaveCount(1);
    await expect(rowDelete, "focus is back on its Delete").toBeFocused();
    await expect(
      log(page).getByText(failure, { exact: true }),
      "the failure is said once",
    ).toHaveCount(1);
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
  },
);

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
  await expectNoMissingIds(page);
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
  await expectNoMissingIds(page);
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
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
