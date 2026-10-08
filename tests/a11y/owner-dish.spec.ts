import { expect, test, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
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
import {
  breadcrumbMarks,
  dishControls,
  formMarks,
  radioMarks,
} from "./owner-controls";
import { ownerEnv, ownerFixture } from "./owner-env";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// A dish's own page (D-128, D-139), signed in as the test owner (D-100), on
// the three dishes the data file priced one way each: by size, at one
// price, and at market price. The gate never writes and never types into a
// field that saves when it is left (D-108, D-111, D-115): every test here
// runs behind the write guard. Two tests press a control that saves, a
// radio and Add a size, and say they expect a write; the guard answers it
// inside the browser as an action the server does not know, which is how
// the failed state is reached. Real saves, "Saved." (D-118), a size that
// lands, a name chosen from the suggestions, Undo with something to undo,
// and a dish that really moves are covered by tests/local, by the unit
// tests, by the boundary scripts, and by hand.
//
// A dish's page is named by its id, which the setup finds and writes down,
// so every path here is read when a test runs, never when this file loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.dish;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;

guardWrites();

type Priced = "sizes" | "one" | "market";

function dishPath(which: Priced): string {
  return restaurantDishPath(code, ownerFixture().dishes[which].id);
}

const checks = {
  controls: (page: Page) =>
    dishControls(
      page,
      ownerFixture().withSections.name,
      ownerFixture().withDishes.name,
    ),
  marks: [...breadcrumbMarks, ...formMarks, ...radioMarks],
};

test.describe("a dish's page, priced by size", () => {
  pageChecks(() => dishPath("sizes"), checks);
});

test.describe("a dish's page, at one price", () => {
  pageChecks(() => dishPath("one"), checks);
});

test.describe("a dish's page, at market price", () => {
  pageChecks(() => dishPath("market"), checks);
});

function savedStatus(page: Page) {
  return page.locator('main [role="status"]');
}

function log(page: Page) {
  return page.locator('main [role="log"]');
}

function breadcrumb(page: Page) {
  return page
    .locator("main")
    .getByRole("navigation", { name: en.ui.breadcrumb, exact: true });
}

function priceGroup(page: Page) {
  return page.getByRole("radiogroup", {
    name: strings.price.heading,
    exact: true,
  });
}

function radio(page: Page, label: string) {
  return page.getByRole("radio", { name: label, exact: true });
}

function descriptionField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.descriptionLabel,
    exact: true,
  });
}

function noteField(page: Page) {
  return page.getByRole("textbox", { name: strings.noteLabel, exact: true });
}

function priceField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.price.amountLabel,
    exact: true,
  });
}

function sizeRows(page: Page) {
  return page.locator(`main ol[aria-label="${strings.price.sizesLabel}"] > li`);
}

function addSizeButton(page: Page) {
  return page.getByRole("button", {
    name: strings.price.addSize,
    exact: true,
  });
}

function moveButton(page: Page) {
  return page.getByRole("button", { name: strings.move.submit, exact: true });
}

// The Select's trigger. React Aria names it by its label and its value.
function moveSelect(page: Page) {
  return page.getByRole("button", { name: new RegExp(strings.move.label) });
}

async function openDish(page: Page, which: Priced): Promise<void> {
  await open(page, dishPath(which));
  await page.waitForLoadState("networkidle");
}

// Each locator comes after the one before it in the document.
async function expectInOrder(locators: Locator[], message: string) {
  for (const [index, locator] of locators.entries()) {
    await expect(locator).toHaveCount(1);
    const before = locators[index - 1];
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
      message,
    ).toBe(true);
  }
}

test("a dish's page is named for its dish, its title names its section and its menu, the breadcrumb leads back three levels, and the nav marks Menus as the part it sits in", async ({
  page,
}) => {
  const { withSections, withDishes, dishes } = ownerFixture();
  await openDish(page, "sizes");
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(
    pageTitle(en, dishes.sizes.name, name, [
      withDishes.name,
      withSections.name,
    ]),
  );
  await expect(page.locator("main h1")).toHaveText(dishes.sizes.name);

  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  const marked = restaurantNav.locator("a[aria-current]");
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("aria-current", "true");
  await expect(marked).toHaveText(nav.menus);
  await expect(
    page.locator('a[aria-current="page"]'),
    "no link points to this page, so none says it is the current page",
  ).toHaveCount(0);

  const trail = breadcrumb(page);
  await expect(trail).toHaveCount(1);
  await expect(trail.locator("ol > li")).toHaveCount(4);
  const links = trail.getByRole("link");
  await expect(links, "Menus, the menu, then the section").toHaveText([
    nav.menus,
    withSections.name,
    withDishes.name,
  ]);
  await expect(links.nth(0)).toHaveAttribute("href", menusPath);
  await expect(links.nth(1)).toHaveAttribute(
    "href",
    restaurantMenuPath(code, withSections.id),
  );
  await expect(links.nth(2)).toHaveAttribute(
    "href",
    restaurantSectionPath(code, withDishes.id),
  );
  await expect(
    trail.locator('[aria-current="page"]'),
    "the page itself is last, and is not a link",
  ).toHaveText(dishes.sizes.name);
  await expectInOrder(
    [trail, page.locator("main h1")],
    "the breadcrumb comes before the h1",
  );
});

// D-128 and D-139, and WCAG 3.3.2: the sentence that says how the page
// saves comes right after the h1, then the description, the price heading
// naming its group, the choice's own fields, the note, the status, the next
// dish, and the move.
test("the page reads in order: the lead, the description, the price group under its heading with three choices, the sizes, the note, the status, the next dish, and the move", async ({
  page,
}) => {
  await openDish(page, "sizes");
  const main = page.locator("main");
  const group = priceGroup(page);
  await expect(group).toHaveCount(1);
  const choices = group.getByRole("radio");
  await expect(choices, "three choices, in D-139's order").toHaveCount(3);
  for (const [index, label] of [
    strings.price.one,
    strings.price.sizes,
    strings.price.market,
  ].entries()) {
    await expect(choices.nth(index)).toHaveAccessibleName(label);
  }
  await expect(radio(page, strings.price.sizes)).toBeChecked();
  expect(
    await descriptionField(page).evaluate((element) => element.tagName),
    "the description takes several lines",
  ).toBe("TEXTAREA");
  await expect(descriptionField(page)).toHaveAccessibleDescription(
    strings.descriptionHint,
  );
  expect(
    await noteField(page).evaluate((element) => element.tagName),
    "the note is one line",
  ).toBe("INPUT");
  await expect(noteField(page)).toHaveAccessibleDescription(strings.noteHint);
  await expect(priceField(page), "no one-price field by size").toHaveCount(0);
  await expectInOrder(
    [
      main.locator("h1"),
      main.getByText(strings.lead, { exact: true }),
      descriptionField(page),
      main.getByRole("heading", { level: 2, name: strings.price.heading }),
      group,
      sizeRows(page).first(),
      addSizeButton(page),
      noteField(page),
      savedStatus(page),
      main.locator('a[href*="/dishes/"]'),
      main.getByRole("heading", { level: 2, name: strings.move.heading }),
    ],
    "the h1, the lead, the description, the price heading, its group, the sizes, Add a size, the note, the status, the next dish, then the move, in that order",
  );
});

test("each price choice brings its own fields: one price a field with the decimal keypad, market price a sentence, and nothing else", async ({
  page,
}) => {
  await openDish(page, "one");
  await expect(radio(page, strings.price.one)).toBeChecked();
  const amount = priceField(page);
  await expect(amount).toHaveCount(1);
  await expect(amount).toHaveAttribute("inputmode", "decimal");
  await expect(amount).toHaveAccessibleDescription(strings.price.amountHint);
  await expect(
    page.locator("main").getByText(strings.price.currency, { exact: true }),
    "the dollar sign shows beside the field",
  ).toHaveCount(1);
  await expect(sizeRows(page)).toHaveCount(0);
  await expect(addSizeButton(page)).toHaveCount(0);

  await openDish(page, "market");
  await expect(radio(page, strings.price.market)).toBeChecked();
  await expect(priceGroup(page)).toHaveAccessibleDescription(
    strings.price.marketHint,
  );
  await expect(priceField(page)).toHaveCount(0);
  await expect(sizeRows(page)).toHaveCount(0);
  await expect(addSizeButton(page)).toHaveCount(0);
});

test("the sizes read in price order, each with a name field that suggests names, a price field, and buttons named for the size", async ({
  page,
}) => {
  await openDish(page, "sizes");
  const rows = sizeRows(page);
  const count = await rows.count();
  expect(count, "the test dish has two sizes").toBeGreaterThanOrEqual(2);
  const names = await rows
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
  const prices = await rows
    .locator('input[id$="-price"]')
    .evaluateAll((fields) =>
      fields.map((field) => Number((field as HTMLInputElement).value)),
    );
  expect(
    [...prices].sort((a, b) => a - b),
    "price order",
  ).toEqual(prices);
  for (const size of names) {
    const suffix = fill(strings.price.labelFor, { size });
    const name = page.getByRole("combobox", {
      name: `${strings.price.sizeNameLabel} ${suffix}`,
      exact: true,
    });
    await expect(name).toHaveCount(1);
    await expect(name).toHaveAccessibleDescription(strings.price.sizeHint);
    const price = page.getByRole("textbox", {
      name: `${strings.price.sizePriceLabel} ${suffix}`,
      exact: true,
    });
    await expect(price).toHaveCount(1);
    await expect(price).toHaveAttribute("inputmode", "decimal");
    for (const action of [strings.price.showNames, strings.price.removeSize]) {
      await expect(
        page.getByRole("button", {
          name: fill(strings.price.sizeAction, { action, size }),
          exact: true,
        }),
      ).toHaveCount(1);
    }
  }

  // The list opens from its button, pressed by keyboard as the Select's is,
  // with every suggestion: the names the restaurant's dishes already use
  // first, here each used once so by name, then the starter list without
  // them (D-139). Opening sends nothing. While the list is open React Aria
  // hides the rest of the page from assistive technology, by design, so
  // axe runs once the list has closed.
  const first = names[0] ?? "";
  const show = page.getByRole("button", {
    name: fill(strings.price.sizeAction, {
      action: strings.price.showNames,
      size: first,
    }),
    exact: true,
  });
  await show.focus();
  await page.keyboard.press("Enter");
  const options = page.getByRole("option");
  const own = [...names].sort((a, b) => a.localeCompare(b));
  const used = new Set(own.map((name) => name.toLowerCase()));
  await expect(options).toHaveText([
    ...own,
    ...strings.price.suggestions.filter(
      (name) => !used.has(name.toLowerCase()),
    ),
  ]);
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(
    page.getByRole("combobox", {
      name: `${strings.price.sizeNameLabel} ${fill(strings.price.labelFor, { size: first })}`,
      exact: true,
    }),
    "focus is in the field the list belongs to",
  ).toBeFocused();
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expect(log(page)).toHaveText("");
  await expectNoAxeViolations(page);
});

// It types nothing, so nothing may be sent or said; the write guard is the
// proof that nothing was sent (D-118). Enter commits the price and the
// note, which are one line; in the description Enter is a line break, so
// it is only left, with Tab.
test("Tab through the unchanged description, Enter in the unchanged price and note send nothing and say nothing", async ({
  page,
}) => {
  await openDish(page, "one");
  await descriptionField(page).focus();
  await page.keyboard.press("Tab");
  await expect(
    radio(page, strings.price.one),
    "the chosen radio comes next",
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(priceField(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(priceField(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(noteField(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(noteField(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(noteField(page)).not.toBeFocused();
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expect(log(page)).toHaveText("");
});

test("choosing another price choice sends one write, which is answered in the browser, is said once, and the choice goes back", async ({
  page,
}) => {
  const writes = expectWrites(page);
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  // The radio is chosen by its visible words: React Aria keeps the input
  // under the label, where a pointer cannot reach it directly. The choice
  // shows at once and goes back when the save fails, so what is checked
  // afterwards is the saved choice.
  await page.getByText(strings.price.sizes, { exact: true }).click();
  const failure = `${fill(strings.notSaved.priceKind, {
    dish: dishes.one.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(
    radio(page, strings.price.one),
    "the saved choice is back",
  ).toBeChecked();
  await expect(priceField(page), "and its field with it").toHaveCount(1);
  await expect(addSizeButton(page)).toHaveCount(0);
  await expect(
    priceGroup(page),
    "the group is marked invalid and describes the problem",
  ).toHaveAttribute("aria-invalid", "true");
  expect(
    writes.answered.length,
    "the choice was sent and answered in the browser",
  ).toBeGreaterThan(0);
  await expectNoAxeViolations(page);
});

function marketSentence(page: Page) {
  return page
    .locator("main")
    .getByText(strings.price.marketHint, { exact: true });
}

// D-147: the market price sentence describes the group and each radio
// whenever it shows, and nothing keeps pointing at it once it is gone, in
// both directions. The choice shows at once while its save waits, so the
// write is held to look at it there; once released, the guard answers it,
// the save fails, and the choice goes back, a second switch.
test("after a switch to Market price the group and its radios are described by its sentence, and once the choice goes back nothing points at a missing id", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  await page.getByText(strings.price.market, { exact: true }).click();
  await expect(radio(page, strings.price.market)).toBeChecked();
  await expect(marketSentence(page)).toHaveCount(1);
  await expect(priceGroup(page)).toHaveAccessibleDescription(
    strings.price.marketHint,
  );
  for (const label of [
    strings.price.one,
    strings.price.sizes,
    strings.price.market,
  ]) {
    await expect(radio(page, label)).toHaveAccessibleDescription(
      strings.price.marketHint,
    );
  }
  await expectNoMissingIds(page);

  writes.release();
  const failure = `${fill(strings.notSaved.priceKind, {
    dish: dishes.one.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(radio(page, strings.price.one)).toBeChecked();
  await expect(marketSentence(page)).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("on a page loaded at Market price, a switch away leaves nothing pointing at a missing id, and the sentence describes the group again once the choice comes back", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await page.getByText(strings.price.one, { exact: true }).click();
  await expect(radio(page, strings.price.one)).toBeChecked();
  await expect(marketSentence(page)).toHaveCount(0);
  await expect(priceGroup(page)).toHaveAccessibleDescription("");
  await expectNoMissingIds(page);

  writes.release();
  const failure = `${fill(strings.notSaved.priceKind, {
    dish: dishes.market.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(radio(page, strings.price.market)).toBeChecked();
  await expect(marketSentence(page)).toHaveCount(1);
  await expect(
    priceGroup(page),
    "the sentence, then the problem",
  ).toHaveAccessibleDescription(
    `${strings.price.marketHint} ${editing.problems.outOfDate}`,
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("Add a size sends one write, which is answered in the browser, is said once, and keeps focus on the button", async ({
  page,
}) => {
  const writes = expectWrites(page);
  await openDish(page, "sizes");
  const before = await sizeRows(page).count();
  const button = addSizeButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  const failure = `${strings.notAdded} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(button, "focus stays on the button").toBeFocused();
  await expect(sizeRows(page), "no row was added").toHaveCount(before);
  expect(writes.answered.length).toBeGreaterThan(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

// D-128: the link to the next dish in the section, and the last dish says
// so. The data file puts the three dishes in this order.
test("the next dish link names the dish after this one, and the last dish says there is none", async ({
  page,
}) => {
  const { withDishes, dishes } = ownerFixture();
  await openDish(page, "sizes");
  const next = page.locator("main").getByRole("link", {
    name: fill(strings.next.label, { dish: dishes.one.name }),
    exact: true,
  });
  await expect(next).toHaveCount(1);
  await expect(next).toHaveAttribute("href", dishPath("one"));

  await openDish(page, "market");
  await expect(page.locator('main a[href*="/dishes/"]')).toHaveCount(0);
  await expect(
    page
      .locator("main")
      .getByText(fill(strings.next.last, { section: withDishes.name }), {
        exact: true,
      }),
  ).toHaveCount(1);
});

// D-129: the dish moves to another section of its restaurant, from its own
// page. Choosing a section sends nothing; only the button does.
test("the move lists every other section under its menu and not the dish's own, and choosing one sends nothing", async ({
  page,
}) => {
  const { withSections, withDishes } = ownerFixture();
  await openDish(page, "sizes");
  const select = moveSelect(page);
  await expect(select).toHaveCount(1);
  await expect(select).toContainText(strings.move.placeholder);
  await select.focus();
  await page.keyboard.press("Enter");
  const options = page.getByRole("option");
  await expect(options).toHaveCount(withSections.sections - 1);
  await expect(options.filter({ hasText: withDishes.name })).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: withSections.name, exact: true }),
    "the sections sit under their menu's name",
  ).toHaveCount(1);
  await expectNoAxeViolations(page);
  await page.keyboard.press("Enter");
  await expect(options).toHaveCount(0);
  await expect(select, "and focus is back on the Select").toBeFocused();
  await expect(savedStatus(page), "choosing sent nothing").toHaveText(
    editing.saved,
  );
  await expect(log(page), "and said nothing").toHaveText("");
});

test("Move dish with no section chosen says to choose one, and sends nothing", async ({
  page,
}) => {
  await openDish(page, "sizes");
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
  const { withSections, withDishes, dishes } = ownerFixture();
  await openDish(page, "sizes");
  const select = moveSelect(page);
  await select.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(select).not.toContainText(strings.move.placeholder);

  const button = moveButton(page);
  await button.focus();
  await page.keyboard.press("Enter");
  const failure = `${fill(strings.move.notMoved, {
    dish: dishes.sizes.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(button, "focus is on the button that was pressed").toBeFocused();
  await expect(
    breadcrumb(page).getByRole("link"),
    "the dish is where it was",
  ).toHaveText([nav.menus, withSections.name, withDishes.name]);
  expect(
    writes.answered.length,
    "the move was sent and answered in the browser",
  ).toBeGreaterThan(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
