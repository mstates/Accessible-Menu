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
  optionAllergenHeading,
  optionAllergenStrings,
} from "../../src/features/owner/choices/option-words";
import { optionGroupPrefix } from "../../src/features/owner/choices/useOptionAllergens";
import {
  restaurantChoiceListPath,
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
  choiceListPageControls,
  formMarks,
} from "./owner-controls";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// A choice list's own page (D-166, D-154, D-167), signed in as the test
// owner (D-100), on the two lists the data file gave the test restaurant:
// Starters' roll list with its one option, checked with milk and wheat,
// and House salad's dressing list with Ranch, checked with milk and eggs
// and 150 calories, and Vinaigrette, checked with none and 90 calories.
// The gate never writes and never types into a field that saves when it
// is left (D-108, D-111, D-115): every test here runs behind the write
// guard. The tests that press a control that saves, a move, a Remove, a
// box, say they expect a write; the guard answers it inside the browser as
// an action the server does not know, which is how the failed state is
// reached. Real saves, "Saved." (D-118), a lead chosen from the
// suggestions, an option that lands, a rename that clears a check, a list
// that moved under the page, and the apply are covered by tests/local, by the unit tests, by the boundary scripts,
// and by hand.
//
// A list's page is named by its id, which the setup finds and writes down,
// so every path here is read when a test runs, never when this file loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.choices;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;
// The option's group speaks with the dish page's words, the option's own
// over them (D-154).
const group = optionAllergenStrings(en.owner.dish.allergens, strings.allergens);

guardWrites();

type Which = "section" | "dish";

function listPath(which: Which): string {
  return restaurantChoiceListPath(code, ownerFixture().lists[which].id);
}

// The breadcrumb's links: Menus, the menu, the section, and the dish for a
// dish's list.
function trailOf(which: Which): string[] {
  const { withSections, withDishes, dishes } = ownerFixture();
  return [
    nav.menus,
    withSections.name,
    withDishes.name,
    ...(which === "dish" ? [dishes.one.name] : []),
  ];
}

const checks = (which: Which) => ({
  controls: (page: Page) => choiceListPageControls(page, trailOf(which)),
  marks: [...breadcrumbMarks, ...formMarks, ...checkboxMarks],
});

test.describe("a section's choice list", () => {
  pageChecks(() => listPath("section"), {
    ...checks("section"),
    snapshot: "choices-section",
  });
});

test.describe("a dish's choice list", () => {
  pageChecks(() => listPath("dish"), {
    ...checks("dish"),
    snapshot: "choices-dish",
  });
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

function rows(page: Page) {
  return page.locator("main ul > li");
}

function leadField(page: Page) {
  return page.getByRole("combobox", {
    name: strings.page.leadLabel,
    exact: true,
  });
}

function optionField(page: Page, label: string, option: string) {
  return page.getByRole("textbox", {
    name: `${label} ${fill(strings.options.labelFor, { option })}`,
    exact: true,
  });
}

function optionButton(page: Page, action: string, option: string) {
  return page.getByRole("button", {
    name: fill(strings.options.rowAction, { action, option }),
    exact: true,
  });
}

// The group of one option: its own ids, so two groups on one page never
// mix (D-166).
function groupOf(page: Page, optionId: string) {
  const prefix = optionGroupPrefix(optionId);
  return {
    heading: page.locator(`#${prefix}-allergens-heading`),
    check: page.locator(`#${prefix}-allergen-check input[type="checkbox"]`),
    sentence: page.locator(`#${prefix}-allergen-sentence`),
    boxOf: (id: string) =>
      page.locator(`#${prefix}-allergen-${id} input[type="checkbox"]`),
    // A box's visible words, inside its wrapper: React Aria keeps the input
    // under the label, where a pointer cannot reach it directly.
    wordsOf: (id: string) =>
      page
        .locator(`#${prefix}-allergen-${id}`)
        .getByText(group.names[id as keyof typeof group.names], {
          exact: true,
        }),
  };
}

// The options in the order the page shows them, by the value of each name
// field, with their ids from the field's id.
async function options(page: Page): Promise<{ id: string; name: string }[]> {
  return rows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => ({
        id: field.id.replace(/^option-/, "").replace(/-name$/, ""),
        name: (field as HTMLInputElement).value,
      })),
    );
}

async function openList(page: Page, which: Which) {
  await open(page, listPath(which));
  await page.waitForLoadState("networkidle");
  return options(page);
}

function reads(
  lists: { allergens: readonly string[]; others: string[] },
  checked: boolean,
) {
  return dinersReadText(
    group,
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

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const checkedByYou = /Checked by you on [A-Z][a-z]+ \d{1,2}, \d{4}\./;

test("a list's page is named for its lead, its title names every level inside it, the breadcrumb leads back, and the nav marks Menus", async ({
  page,
}) => {
  const { withSections, withDishes, dishes, lists } = ownerFixture();
  await open(page, listPath("dish"));
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(
    pageTitle(en, lists.dish.lead, name, [
      dishes.one.name,
      withDishes.name,
      withSections.name,
    ]),
  );
  await expect(page.locator("main h1")).toHaveText(lists.dish.lead);

  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  const marked = restaurantNav.locator("a[aria-current]");
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("aria-current", "true");
  await expect(marked).toHaveText(nav.menus);
  await expect(page.locator('a[aria-current="page"]')).toHaveCount(0);

  const trail = breadcrumb(page);
  await expect(trail.locator("ol > li")).toHaveCount(5);
  const links = trail.getByRole("link");
  await expect(links).toHaveText(trailOf("dish"));
  await expect(links.nth(0)).toHaveAttribute("href", menusPath);
  await expect(links.nth(1)).toHaveAttribute(
    "href",
    restaurantMenuPath(code, withSections.id),
  );
  await expect(links.nth(2)).toHaveAttribute(
    "href",
    restaurantSectionPath(code, withDishes.id),
  );
  await expect(links.nth(3)).toHaveAttribute(
    "href",
    restaurantDishPath(code, dishes.one.id),
  );
  await expect(trail.locator('[aria-current="page"]')).toHaveText(
    lists.dish.lead,
  );

  await open(page, listPath("section"));
  await expect(page).toHaveTitle(
    pageTitle(en, lists.section.lead, name, [
      withDishes.name,
      withSections.name,
    ]),
  );
  await expect(breadcrumb(page).getByRole("link")).toHaveText(
    trailOf("section"),
  );
});

// D-166: the lead is a combo box with suggested leads, then the status,
// then the options' lead, then the rows, then the add form.
test("the page reads in order: the lead with its hint and suggestions, the status, the options' lead, the rows, and the add form", async ({
  page,
}) => {
  const { lists } = ownerFixture();
  await openList(page, "dish");
  const lead = leadField(page);
  await expect(lead).toHaveCount(1);
  await expect(lead).toHaveValue(lists.dish.lead);
  await expect(lead).toHaveAccessibleDescription(strings.page.leadHint);
  const show = page.getByRole("button", {
    name: strings.page.showLeads,
    exact: true,
  });
  await expect(show).toHaveCount(1);
  await show.click();
  await expect(page.getByRole("option")).toHaveText([
    ...strings.page.suggestions,
  ]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(savedStatus(page), "opening the list sent nothing").toHaveText(
    editing.saved,
  );

  const main = page.locator("main");
  const inOrder = [
    main.locator("h1"),
    main.getByText(strings.page.lead, { exact: true }),
    lead,
    savedStatus(page),
    main.getByText(strings.page.optionsLead, { exact: true }),
    rows(page).first(),
    page.getByRole("textbox", { name: strings.options.newLabel, exact: true }),
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
      "the h1, the lead sentence, the lead, the status, the options' lead, the rows, then the add form",
    ).toBe(true);
  }
});

// Each option is a row with its three fields named for it, its three
// buttons, and its own allergen group under an h3, as the data file gives
// them (D-154, D-166, D-167).
test("each option reads as a row with its name, added price, and calories, its buttons, and its own allergen group headed for it", async ({
  page,
}) => {
  const listed = await openList(page, "dish");
  expect(listed.map((option) => option.name)).toEqual(["Ranch", "Vinaigrette"]);
  const [ranch, vinaigrette] = listed;
  if (!ranch || !vinaigrette) throw new Error("two options");

  await expect(
    page.locator("main").getByRole("heading", { level: 2 }),
    "one level 2 heading an option",
  ).toHaveText(["Ranch", "Vinaigrette"]);
  await expect(
    page.locator("main").getByRole("heading", { level: 3 }),
    "one group heading an option, under its row",
  ).toHaveText([
    optionAllergenHeading(group, "Ranch"),
    optionAllergenHeading(group, "Vinaigrette"),
  ]);

  const name = optionField(page, strings.options.nameLabel, "Ranch");
  await expect(name).toHaveValue("Ranch");
  const price = optionField(page, strings.options.priceLabel, "Ranch");
  await expect(price).toHaveValue("");
  await expect(price).toHaveAttribute("inputmode", "decimal");
  await expect(price).toHaveAccessibleDescription(strings.options.priceHint);
  const calories = optionField(page, strings.options.caloriesLabel, "Ranch");
  await expect(calories).toHaveValue("150");
  await expect(calories).toHaveAccessibleDescription(
    strings.options.caloriesHint,
  );
  await expect(
    optionField(page, strings.options.caloriesLabel, "Vinaigrette"),
  ).toHaveValue("90");
  for (const action of [
    strings.options.moveUp,
    strings.options.moveDown,
    strings.options.remove,
  ]) {
    await expect(optionButton(page, action, "Ranch")).toHaveCount(1);
  }
  await expect(
    optionButton(page, strings.options.moveUp, "Ranch"),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    optionButton(page, strings.options.moveDown, "Vinaigrette"),
  ).toHaveAttribute("aria-disabled", "true");

  // Ranch's group: milk and eggs, checked, under its own ids; the sentence
  // diners read names them.
  const ranchGroup = groupOf(page, ranch.id);
  await expect(ranchGroup.heading).toHaveText(
    optionAllergenHeading(group, "Ranch"),
  );
  await expect(ranchGroup.boxOf("milk")).toBeChecked();
  await expect(ranchGroup.boxOf("eggs")).toBeChecked();
  await expect(ranchGroup.boxOf("wheat")).not.toBeChecked();
  await expect(ranchGroup.check).toBeChecked();
  await expect(ranchGroup.sentence).toContainText(
    reads({ allergens: ["milk", "eggs"], others: [] }, true),
  );
  await expect(ranchGroup.check).toHaveAccessibleDescription(
    new RegExp(
      `^${escape(`${group.checkHint} ${reads({ allergens: ["milk", "eggs"], others: [] }, true)} `)}${checkedByYou.source}$`,
    ),
  );
  // Vinaigrette's: none, checked.
  const vinGroup = groupOf(page, vinaigrette.id);
  for (const id of US_MAJOR_ALLERGENS) {
    await expect(vinGroup.boxOf(id)).not.toBeChecked();
  }
  await expect(vinGroup.check).toBeChecked();
  await expect(vinGroup.sentence).toContainText(
    reads({ allergens: [], others: [] }, true),
  );
  await expect(
    page.getByRole("button", { name: group.addOther, exact: true }),
    "one Add another allergen an option",
  ).toHaveCount(2);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  // The section's list: Buttered roll, 2.00 added, milk and wheat, checked.
  const [roll] = await openList(page, "section");
  if (!roll) throw new Error("one option");
  expect(roll.name).toBe("Buttered roll");
  await expect(
    optionField(page, strings.options.priceLabel, "Buttered roll"),
  ).toHaveValue("2.00");
  await expect(
    optionField(page, strings.options.caloriesLabel, "Buttered roll"),
  ).toHaveValue("");
  const rollGroup = groupOf(page, roll.id);
  await expect(rollGroup.boxOf("milk")).toBeChecked();
  await expect(rollGroup.boxOf("wheat")).toBeChecked();
  await expect(rollGroup.check).toBeChecked();
  await expectNoMissingIds(page);
});

// It types nothing, so nothing may be sent or said: Enter and Tab through
// an option's three unchanged fields.
test("Enter and Tab through an option's unchanged fields send nothing and say nothing", async ({
  page,
}) => {
  await openList(page, "dish");
  const fields = [
    optionField(page, strings.options.nameLabel, "Ranch"),
    optionField(page, strings.options.priceLabel, "Ranch"),
    optionField(page, strings.options.caloriesLabel, "Ranch"),
  ];
  await fields[0]?.focus();
  for (const field of fields) {
    await expect(field, "the row's fields come in order").toBeFocused();
    await page.keyboard.press("Enter");
    await expect(field).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expect(log(page)).toHaveText("");
});

// A move is a real press, answered in the browser: the order changes at
// once and goes back when the save fails, said once, with focus kept.
test("Move down on the first option goes back when the server cannot take it, is said once, and keeps focus on its button", async ({
  page,
}) => {
  const writes = expectWrites(page);
  await openList(page, "dish");
  const down = optionButton(page, strings.options.moveDown, "Ranch");
  await down.focus();
  await page.keyboard.press("Enter");
  const failure = `${fill(strings.options.notMoved, { option: "Ranch" })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  expect(
    (await options(page)).map((option) => option.name),
    "the list is back in its order",
  ).toEqual(["Ranch", "Vinaigrette"]);
  await expect(
    log(page).getByText(
      fill(strings.options.movedDown, {
        option: "Ranch",
        position: 2,
        total: 2,
      }),
      { exact: true },
    ),
    "the move was said when it was made",
  ).toHaveCount(1);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(down, "focus is on the button that was pressed").toBeFocused();
  expect(writes.answered.length).toBeGreaterThan(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

// Remove goes at once, with its group, and the row comes back with its
// group when the save fails.
test("Remove on an option takes the row and its group at once, moves focus to the next row's name, and brings both back when the server cannot take it", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const listed = await openList(page, "dish");
  const [ranch] = listed;
  if (!ranch) throw new Error("an option");
  const remove = optionButton(page, strings.options.remove, "Ranch");
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the remove is on its way, and held",
    })
    .toBeGreaterThan(0);
  expect((await options(page)).map((option) => option.name)).toEqual([
    "Vinaigrette",
  ]);
  await expect(
    groupOf(page, ranch.id).heading,
    "its group went with it",
  ).toHaveCount(0);
  await expect(
    optionField(page, strings.options.nameLabel, "Vinaigrette"),
    "focus is in the next row's name",
  ).toBeFocused();
  await expect(
    log(page).getByText(fill(strings.options.deleted, { option: "Ranch" }), {
      exact: true,
    }),
  ).toHaveCount(1);
  await expectNoMissingIds(page);

  writes.release();
  const failure = `${fill(strings.options.notDeleted, { option: "Ranch" })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  expect((await options(page)).map((option) => option.name)).toEqual([
    "Ranch",
    "Vinaigrette",
  ]);
  await expect(
    groupOf(page, ranch.id).heading,
    "the group is back",
  ).toHaveCount(1);
  await expect(remove, "focus is back on its Remove").toBeFocused();
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// A tick on a checked option clears its check at once, as a dish's does,
// and the other option's group is untouched; both go back when the save
// cannot land.
test("a tick on a checked option clears its check at once and leaves the other option's group alone, and both go back when the tick cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const [ranch, vinaigrette] = await openList(page, "dish");
  if (!ranch || !vinaigrette) throw new Error("two options");
  const ranchGroup = groupOf(page, ranch.id);
  const vinGroup = groupOf(page, vinaigrette.id);
  await ranchGroup.wordsOf("sesame").click();
  await expect(ranchGroup.boxOf("sesame")).toBeChecked();
  await expect(ranchGroup.check, "the check clears at once").not.toBeChecked();
  await expect(ranchGroup.check).toHaveAccessibleDescription(
    `${group.checkHint} ${reads({ allergens: ["milk", "eggs", "sesame"], others: [] }, false)} ${group.cleared}`,
  );
  await expect(vinGroup.check, "the other option is untouched").toBeChecked();
  await expect(vinGroup.boxOf("sesame")).not.toBeChecked();
  await expectNoMissingIds(page);

  writes.release();
  const failure = `${fill(group.notSaved.allergens, { option: "Ranch" })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(ranchGroup.boxOf("sesame"), "the box is back").not.toBeChecked();
  await expect(ranchGroup.check, "the check is back").toBeChecked();
  await expect(vinGroup.check).toBeChecked();
  expect(writes.answered.length).toBeGreaterThan(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// The add form, with the name field alone: an option is added by name
// (Michael, October 10, 2026). An empty submit says why and sends nothing.
test("the add form takes a name and refuses an empty one unsent", async ({
  page,
}) => {
  await openList(page, "section");
  const field = page.getByRole("textbox", {
    name: strings.options.newLabel,
    exact: true,
  });
  await expect(field).toHaveCount(1);
  const add = page.getByRole("button", {
    name: strings.options.add,
    exact: true,
  });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(strings.options.errors.nameRequired);
  await expect(field, "focus goes to the add field").toBeFocused();
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// The id in the path is user input.
test("an id that is not an id, and one that matches nothing, get the 404 page instead of a list", async ({
  page,
}) => {
  for (const path of [
    restaurantChoiceListPath(code, "not-a-list"),
    restaurantChoiceListPath(code, "00000000-0000-4000-8000-000000000000"),
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} is not a page`).toBe(404);
    await expect(page).toHaveTitle(pageTitle(en, en.notFound.title));
  }
});
