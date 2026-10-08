import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { US_MAJOR_ALLERGENS } from "../../src/domain/allergens";
import {
  dinerSentence,
  dinersReadText,
} from "../../src/features/owner/allergens/allergen-words";
import {
  lineAllergenStrings,
  lineLead,
} from "../../src/features/owner/line/line-words";
import {
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNoMissingIds,
  open,
  pageChecks,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import {
  breadcrumbMarks,
  checkboxMarks,
  sectionControls,
} from "./owner-controls";
import { listRowChecks } from "./owner-lists";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// A section's own page and its dishes (D-128), signed in as the test owner
// (D-100), on the dishes the data file gave the test restaurant: one section
// with at least three, one with none. The gate never writes and never types
// into a field that saves when it is left (D-108, D-111, D-115): every test
// here runs behind the write guard. The row tests every list shares run
// from listRowChecks in owner-lists.ts; this file holds what is a section's
// page's own: its name, its breadcrumb, its line's allergen group (D-152),
// and its move to another menu (D-129). One move test presses Move section
// and says it expects a write, and the group's tests press a box and hold
// the write; the guard answers each inside the browser as an action the
// server does not know, which is how the failed state is reached. Real
// saves and the "Saved." they say (D-118), an add or a delete that lands,
// Undo with something to undo, a taken name, a section that really moves,
// and the line's group's landed writes are covered by the unit tests, by
// the boundary scripts, by the local checks, and by hand. The data file
// gives the section with dishes a line, checked with milk and wheat, and
// the empty section none, so the gate reads a page with the group and one
// without.
//
// A section's page is named by its id, which the setup finds and writes
// down, so every path here is read when a test runs, never when this file
// loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.dishes;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;
// The line's group speaks with the dish page's words, the line's own over
// them (D-152).
const line = lineAllergenStrings(en.owner.dish.allergens, strings.line);

guardWrites();

function dishesPath(): string {
  return restaurantSectionPath(code, ownerFixture().withDishes.id);
}

function emptyPath(): string {
  return restaurantSectionPath(code, ownerFixture().emptySection.id);
}

// The section with dishes has a checked line, so its page draws check marks
// (D-152); the empty section has no line, so no box.
const checks = {
  controls: (page: Page) =>
    sectionControls(page, ownerFixture().withSections.name),
  marks: [...breadcrumbMarks, ...checkboxMarks],
};
const unchecked = { ...checks, marks: breadcrumbMarks };

test.describe("a section's page, with dishes", () => {
  pageChecks(dishesPath, checks);
});

test.describe("a section's page, with no dishes", () => {
  pageChecks(emptyPath, unchecked);
});

listRowChecks({
  noun: "dish",
  plural: "dishes",
  words: strings,
  path: dishesPath,
  h1: () => ownerFixture().withDishes.name,
  // The name field and Move up, Move down, and Delete; the section's note
  // and every-dish line, the line's group's Add another allergen (its boxes
  // and the combobox are not counted), the add field, Add, Undo, and the
  // move's Select and button. The link to the dish's page is not a field or
  // a button.
  rowControls: 4,
  pageControls: 8,
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

// The section's own texts at the top of its page (D-135). The page is the
// section, so their names do not repeat it.
function noteField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.section.noteLabel,
    exact: true,
  });
}

function everyItemField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.section.everyItemLabel,
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

// D-135, and WCAG 3.3.2: the sentence that says how the page saves comes
// right after the h1, before the first field it governs; then the
// section's two texts, then the line's allergen group under its heading
// (D-152), then the status and Undo, then the dishes' own lead right above
// the dishes.
test("the section's note and every-dish line come first, after the sentence that says how they save, each with its hint, and the line's group follows them", async ({
  page,
}) => {
  await openDishes(page);
  const note = noteField(page);
  const everyItem = everyItemField(page);
  await expect(note).toHaveCount(1);
  await expect(everyItem).toHaveCount(1);
  await expect(note).toHaveAccessibleDescription(strings.section.noteHint);
  await expect(everyItem).toHaveAccessibleDescription(
    strings.section.everyItemHint,
  );
  expect(
    await note.evaluate((element) => element.tagName),
    "the note takes several lines",
  ).toBe("TEXTAREA");
  expect(
    await everyItem.evaluate((element) => element.tagName),
    "the every-dish line is one line",
  ).toBe("INPUT");

  const main = page.locator("main");
  const inOrder = [
    main.locator("h1"),
    main.getByText(strings.section.lead, { exact: true }),
    note,
    everyItem,
    main.getByRole("heading", { level: 2, name: line.heading }),
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
      "the h1, the lead, the note, the every-dish line, the line's group, the status, the dishes' lead, then the dishes, in that order",
    ).toBe(true);
  }
});

// It types nothing, so nothing may be sent or said; the write guard is the
// proof that nothing was sent (D-118). Enter commits the every-dish line,
// which is one line; in the note Enter is a line break, which would be
// typing, so the note is only left, with Tab. The dimmed Move up after it
// says one sentence at once, so the log is read after every commit has run.
test("Tab through the section's unchanged note and Enter in its unchanged every-dish line send nothing and say nothing", async ({
  page,
}) => {
  const names = await openDishes(page);
  const first = names[0] ?? "";
  const note = noteField(page);
  const everyItem = everyItemField(page);

  await note.focus();
  await page.keyboard.press("Tab");
  await expect(everyItem, "the every-dish line comes next").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(everyItem).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(everyItem).not.toBeFocused();

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
// other level 2 headings name the line's allergen group, before the list,
// and the section's move, after it (D-152).
test("the line's group and the move have their own headings, around every dish's", async ({
  page,
}) => {
  const names = await openDishes(page);
  await expect(
    page.locator("main").getByRole("heading", { level: 2 }),
  ).toHaveText([line.heading, ...names, strings.move.heading]);
});

// The line's allergen group (D-152), as the dish page's (D-149): under the
// line, its heading, the lead quoting the line's words, the nine boxes
// each described by its own hint, Add another allergen, and the check box
// described by its hint and the sentence diners read with who checked it.
function box(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

function checkBox(page: Page) {
  return box(page, line.checkLabel);
}

function sentenceLine(page: Page) {
  return page.locator("#line-allergen-sentence");
}

function checkDescription(sentence: string, stamp: string | RegExp) {
  const head = `${line.checkHint} ${sentence} `;
  return stamp instanceof RegExp
    ? new RegExp(`^${escape(head)}${stamp.source}$`)
    : `${head}${stamp}`;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const checkedByYou = /Checked by you on [A-Z][a-z]+ \d{1,2}, \d{4}\./;

function reads(
  lists: { allergens: readonly string[]; others: string[] },
  checked: boolean,
) {
  return dinersReadText(
    line,
    dinerSentence(
      en.allergens,
      {
        allergens: lists.allergens as (typeof US_MAJOR_ALLERGENS)[number][],
        others: lists.others,
      },
      checked,
    ),
  );
}

test("the line's allergen group shows under a line with words, with the nine boxes, the check described by the sentence diners read, and no group under a section with no line", async ({
  page,
}) => {
  await openDishes(page);
  const main = page.locator("main");
  const words = await everyItemField(page).inputValue();
  expect(words, "the test section has a line").not.toBe("");
  await expect(
    main.getByRole("heading", { level: 2, name: line.heading }),
  ).toHaveCount(1);
  await expect(
    main.getByText(lineLead(strings.line, words), { exact: true }),
  ).toHaveCount(1);
  const group = page.getByRole("group", { name: line.groupLabel, exact: true });
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAccessibleDescription("");
  const boxes = group.getByRole("checkbox");
  await expect(boxes, "nine boxes, in the FDA's order").toHaveCount(9);
  for (const [index, id] of US_MAJOR_ALLERGENS.entries()) {
    await expect(boxes.nth(index)).toHaveAccessibleName(line.names[id]);
    await expect(boxes.nth(index)).toHaveAccessibleDescription(line.hints[id]);
  }
  await expect(box(page, line.names.milk)).toBeChecked();
  await expect(box(page, line.names.wheat)).toBeChecked();
  await expect(
    page.locator(`main ol[aria-label="${line.othersLabel}"] > li`),
    "the test line names no other allergen",
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: line.addOther, exact: true }),
  ).toHaveCount(1);
  await expect(checkBox(page)).toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(
      reads({ allergens: ["milk", "wheat"], others: [] }, true),
      checkedByYou,
    ),
  );
  await expect(sentenceLine(page)).toContainText(
    reads({ allergens: ["milk", "wheat"], others: [] }, true),
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await open(page, emptyPath());
  await expect(everyItemField(page)).toHaveValue("");
  await expect(
    page.locator("main").getByRole("heading", { level: 2, name: line.heading }),
    "no line, no group",
  ).toHaveCount(0);
  await expect(checkBox(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: line.addOther, exact: true }),
  ).toHaveCount(0);
});

test("a tick on the checked line shows at once and clears the check, is refused once when it cannot land, and both go back", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { withDishes } = ownerFixture();
  await openDishes(page);
  await page.getByText(line.names.sesame, { exact: true }).click();
  await expect(box(page, line.names.sesame)).toBeChecked();
  await expect(checkBox(page), "the check clears at once").not.toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(
      reads({ allergens: ["milk", "wheat", "sesame"], others: [] }, false),
      line.cleared,
    ),
  );
  await expectNoMissingIds(page);

  writes.release();
  const failure = `${fill(line.notSaved.allergens, {
    section: withDishes.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(
    box(page, line.names.sesame),
    "the box is back",
  ).not.toBeChecked();
  await expect(box(page, line.names.sesame)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(checkBox(page), "the check is back").toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(
      reads({ allergens: ["milk", "wheat"], others: [] }, true),
      checkedByYou,
    ),
  );
  expect(writes.answered.length).toBeGreaterThan(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("an uncheck of the line shows at once, and the check comes back when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { withDishes } = ownerFixture();
  await openDishes(page);
  await page.getByText(line.checkLabel, { exact: true }).click();
  await expect(checkBox(page)).not.toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(
      reads({ allergens: ["milk", "wheat"], others: [] }, false),
      line.notChecked,
    ),
  );
  await expectNoMissingIds(page);

  writes.release();
  const failure = `${fill(line.notSaved.check, {
    section: withDishes.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(checkBox(page), "the check is back").toBeChecked();
  await expect(
    checkBox(page),
    "the hint, the sentence, then the problem",
  ).toHaveAccessibleDescription(
    new RegExp(
      `^${escape(`${line.checkHint} ${reads({ allergens: ["milk", "wheat"], others: [] }, true)} `)}${checkedByYou.source} ${escape(editing.problems.outOfDate)}$`,
    ),
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("Add another allergen on the line adds a blank row with focus in its field and sends nothing, and removing it sends nothing", async ({
  page,
}) => {
  await openDishes(page);
  await page.getByRole("button", { name: line.addOther, exact: true }).click();
  const field = page.getByRole("combobox", {
    name: `${line.otherLabel} ${fill(line.otherLabelFor, { position: 1 })}`,
    exact: true,
  });
  await expect(field).toHaveCount(1);
  await expect(field, "the new row's field takes focus").toBeFocused();
  await expect(field).toHaveAccessibleDescription(line.otherHint);
  await expect(log(page)).toHaveText(fill(line.otherAdded, { position: 1 }));
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  await page
    .getByRole("button", {
      name: fill(line.otherAction, {
        action: line.removeOther,
        other: fill(line.unnamedOther, { position: 1 }),
      }),
      exact: true,
    })
    .click();
  await expect(field).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: line.addOther, exact: true }),
    "focus goes back to Add another allergen",
  ).toBeFocused();
  await expect(savedStatus(page)).toHaveText(editing.saved);
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
