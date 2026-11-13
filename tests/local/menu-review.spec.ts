import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { placeIn } from "../../src/features/owner/choices/choice-words";
import {
  restaurantChoiceListPath,
  restaurantDishPath,
  restaurantMenuPagePath,
  restaurantMenuPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { expectNoAxeViolations, expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard, listRows } from "../a11y/owner-lists";
import { flashBanner } from "../a11y/saved-banner";
import { saveAndFail, saveAndLand } from "./save";

// The review before Publish (D-224, Q-150), with the edits landing for
// real against the stand-in: what the Publishing page says changed after a
// change, an add, a delete, and a reorder, each put back; the dishes and
// the options whose allergens are not confirmed, each a link that lands on
// the page where its check is; and the press refused when the draft moved
// after the page showed it, with a sentence that says to reload. The gate
// reads the review on the two states the data file holds and never
// writes, and the compare itself is pinned in the unit tests; this reads
// the page follow the draft. Each check leaves the stand-in as it found
// it: Dinner published with nothing changed since.

const { code } = ownerEnv();
const strings = en.owner.publishing;
const review = strings.review;
const sections = en.owner.sections;
const dishes = en.owner.dishes;
const dish = en.owner.dish;
const editing = en.owner.editing;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Menu = { id: string; name: string };

function main(page: Page) {
  return page.locator("main");
}

async function openPublishing(page: Page, menu: Menu): Promise<void> {
  await page.goto(restaurantMenuPagePath(code, menu.id, "publishing"));
  await page.waitForLoadState("networkidle");
}

// An owner page that saves as the owner goes, with its log heard.
async function openEditing(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

// What the review lists under What changed: one list, one item a sentence.
function changes(page: Page) {
  return main(page).locator(`h2:text-is("${review.heading}") + ul > li`);
}

async function expectNothingChanged(page: Page): Promise<void> {
  await expect(
    main(page).getByText(review.none, { exact: true }),
    "nothing has changed since the last publish",
  ).toBeVisible();
  await expect(changes(page)).toHaveCount(0);
}

async function headings(page: Page): Promise<string[]> {
  return main(page)
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((all) =>
      all.map(
        (heading) =>
          `${heading.tagName.toLowerCase()} ${(heading.textContent ?? "").trim()}`,
      ),
    );
}

const pageHeadings = [
  `h1 ${strings.heading}`,
  `h2 ${review.heading}`,
  `h2 ${strings.unconfirmed.heading}`,
  `h2 ${strings.actionsHeading}`,
];

function counted(words: { one: string; other: string }, count: number) {
  return fill(count === 1 ? words.one : words.other, { count });
}

async function publish(page: Page, menu: Menu): Promise<void> {
  await saveAndLand(
    page,
    strings.publish,
    fill(strings.flash.published, { menu: menu.name }),
  );
}

async function knob(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response;
}

async function writes(): Promise<string[]> {
  return (await (await knob("writes")).json()) as string[];
}

// A row's name field on a list page, by the name it holds.
function nameField(
  page: Page,
  words: { nameLabel: string; labelFor: string },
  noun: "section" | "dish",
  row: string,
) {
  return page.getByRole("textbox", {
    name: `${words.nameLabel} ${fill(words.labelFor, { [noun]: row })}`,
    exact: true,
  });
}

// The first section renamed with Enter, found by its place in the list: a
// field that still has focus after a save keeps the name it had when focus
// arrived (D-140), so a second rename on the same page cannot find it by
// its new name.
async function renameFirst(page: Page, to: string): Promise<void> {
  const before = await said(page, saved);
  await listRows(page).first().locator('input[id$="-name"]').fill(to);
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(before + 1);
}

// The price of the dish at one price, typed and saved with Save general
// (D-237).
async function setPrice(page: Page, dishId: string, to: string) {
  await page.goto(restaurantDishPath(code, dishId));
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("textbox", { name: dish.price.amountLabel, exact: true })
    .fill(to);
  await saveAndLand(page, dish.general.submit, dish.general.saved);
}

// A row moved one step, heard once the move has landed.
async function move(
  page: Page,
  words: typeof sections | typeof dishes,
  noun: "section" | "dish",
  row: string,
  direction: "up" | "down",
  position: number,
  total: number,
): Promise<void> {
  const action = direction === "up" ? words.moveUp : words.moveDown;
  const sentence = fill(direction === "up" ? words.movedUp : words.movedDown, {
    [noun]: row,
    position,
    total,
  });
  const before = await said(page, sentence);
  await page
    .getByRole("button", {
      name: fill(words.rowAction, { action, [noun]: row }),
      exact: true,
    })
    .click();
  await expect.poll(() => said(page, sentence)).toBe(before + 1);
}

async function rowNames(page: Page): Promise<string[]> {
  return listRows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

test("the review counts a section and a dish changed together, as one list with an item a sentence under the same headings, clean under axe, and reads nothing changed once both are put back", async ({
  page,
}) => {
  const { withSections, dishes: priced } = ownerFixture();
  await openPublishing(page, withSections);
  await expectNothingChanged(page);
  expect(await headings(page)).toEqual(pageHeadings);

  await openEditing(page, restaurantMenuPath(code, withSections.id));
  const [first = ""] = await rowNames(page);
  await renameFirst(page, `${first} renamed`);
  await setPrice(page, priced.one.id, "10");

  await openPublishing(page, withSections);
  await expect(
    changes(page),
    "dishes first, then sections, one item a sentence",
  ).toHaveText([
    counted(review.dishesChanged, 1),
    counted(review.sectionsChanged, 1),
  ]);
  await expect(
    main(page).locator(`h2:text-is("${review.heading}") + ul`),
    "one list under What changed",
  ).toHaveCount(1);
  await expect(main(page).getByText(review.none)).toHaveCount(0);
  expect(
    await headings(page),
    "a changed review keeps the page's headings",
  ).toEqual(pageHeadings);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  // As it was.
  await setPrice(page, priced.one.id, "9");
  await openEditing(page, restaurantMenuPath(code, withSections.id));
  await renameFirst(page, first);
  await openPublishing(page, withSections);
  await expectNothingChanged(page);
});

test("a dish added is counted and listed as not confirmed with a link that lands on its Allergens page; once published and deleted it is counted as taken off", async ({
  page,
}) => {
  const { withSections, emptySection } = ownerFixture();
  const name = "Review pie";
  const sectionPath = restaurantSectionPath(code, emptySection.id);

  await openEditing(page, sectionPath);
  await page
    .getByRole("textbox", { name: dishes.newLabel, exact: true })
    .fill(name);
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      said(
        page,
        fill(dishes.added, { dish: name, count: counted(dishes.count, 1) }),
      ),
    )
    .toBe(1);
  await expect(nameField(page, dishes, "dish", name)).toHaveCount(1);

  try {
    await openPublishing(page, withSections);
    await expect(changes(page)).toHaveText([counted(review.dishesAdded, 1)]);
    // A new dish is not confirmed: the review names it with its section,
    // as a link to the page where its check is.
    const unconfirmed = main(page).getByRole("link", {
      name: fill(strings.unconfirmed.dish, {
        dish: name,
        section: emptySection.name,
      }),
      exact: true,
    });
    await expect(unconfirmed).toHaveCount(1);
    await unconfirmed.click();
    await page.waitForURL(/\/dishes\/[0-9a-f-]{36}\/allergens$/);
    await expect(main(page).locator("h1")).toHaveText(dish.allergens.heading);
    await expect(
      main(page).getByRole("navigation", { name, exact: true }),
      "the Allergens page of the dish the link named",
    ).toHaveCount(1);

    // Nothing blocks: the menu publishes with the dish not confirmed.
    await openPublishing(page, withSections);
    await publish(page, withSections);
    await expectNothingChanged(page);
    await expect(
      main(page).getByRole("link", {
        name: fill(strings.unconfirmed.dish, {
          dish: name,
          section: emptySection.name,
        }),
        exact: true,
      }),
      "still listed: not confirmed is not a change",
    ).toHaveCount(1);
  } finally {
    // The dish deleted, by the dialog's keys (D-119, D-136, D-221).
    await openEditing(page, sectionPath);
    await page
      .getByRole("button", {
        name: fill(dishes.rowAction, { action: dishes.remove, dish: name }),
        exact: true,
      })
      .click();
    const dialog = page.getByRole("alertdialog", {
      name: fill(dishes.deleteAskEmpty, { dish: name }),
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: dishes.keep, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: dishes.remove, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => said(page, fill(dishes.deleted, { dish: name })))
      .toBe(1);
  }

  await openPublishing(page, withSections);
  await expect(
    changes(page),
    "a dish that was published and is gone from the draft is taken off",
  ).toHaveText([counted(review.dishesRemoved, 1)]);
  // As it was: published with nothing changed since.
  await publish(page, withSections);
  await expectNothingChanged(page);
});

test("a reorder is its own line: the order of sections, then the order of a section's dishes, each read back as nothing changed once undone", async ({
  page,
}) => {
  const { withSections, withDishes } = ownerFixture();
  const menuPath = restaurantMenuPath(code, withSections.id);
  const sectionPath = restaurantSectionPath(code, withDishes.id);

  await openEditing(page, menuPath);
  const sectionNames = await rowNames(page);
  const [firstSection = ""] = sectionNames;
  await move(
    page,
    sections,
    "section",
    firstSection,
    "down",
    2,
    sectionNames.length,
  );
  await openPublishing(page, withSections);
  await expect(changes(page)).toHaveText([review.sectionsReordered]);
  await openEditing(page, menuPath);
  await move(
    page,
    sections,
    "section",
    firstSection,
    "up",
    1,
    sectionNames.length,
  );
  await openPublishing(page, withSections);
  await expectNothingChanged(page);

  await openEditing(page, sectionPath);
  const dishNames = await rowNames(page);
  const [firstDish = ""] = dishNames;
  await move(page, dishes, "dish", firstDish, "down", 2, dishNames.length);
  await openPublishing(page, withSections);
  await expect(changes(page)).toHaveText([review.dishesReordered]);
  await openEditing(page, sectionPath);
  await move(page, dishes, "dish", firstDish, "up", 1, dishNames.length);
  await openPublishing(page, withSections);
  await expectNothingChanged(page);
});

test("an option whose allergens are not confirmed is listed after the dishes, with its list and its home, and its link lands on the list's page (D-166)", async ({
  page,
}) => {
  const { withSections, dishes: priced, lists } = ownerFixture();
  type Option = { id: string; name: string; choice_list_id: string };
  const options = (await (await knob("options")).json()) as Option[];
  const option = options.find(
    (each) =>
      each.choice_list_id === lists.dish.id && each.name === "Vinaigrette",
  );
  if (!option) throw new Error("the dressing list has no Vinaigrette");

  // The check cleared somewhere else, its lists as they were.
  await knob("set-option-allergens", { id: option.id });
  try {
    await openPublishing(page, withSections);
    const named = main(page).getByRole("link", {
      name: fill(strings.unconfirmed.option, {
        option: option.name,
        place: placeIn(en.owner.choices, lists.dish.lead, priced.one.name),
      }),
      exact: true,
    });
    await expect(named).toHaveCount(1);
    await expect(named).toHaveAttribute(
      "href",
      restaurantChoiceListPath(code, lists.dish.id),
    );
    const leads = await main(page)
      .locator(`h2:text-is("${strings.unconfirmed.heading}") ~ ul`)
      .first()
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(leads[leads.length - 1], "the options come after the dishes").toBe(
      restaurantChoiceListPath(code, lists.dish.id),
    );
    expect(leads[0], "the dishes come first").toMatch(
      /\/dishes\/[0-9a-f-]{36}\/allergens$/,
    );
    // The option's check is part of what its dish publishes.
    await expect(changes(page)).toHaveText([counted(review.dishesChanged, 1)]);

    await named.click();
    await page.waitForURL(`**${restaurantChoiceListPath(code, lists.dish.id)}`);
    await expect(main(page).locator("h1")).toHaveText(lists.dish.lead);
  } finally {
    // As it was: the same lists, checked again.
    await knob("set-option-allergens", { id: option.id, checked: "1" });
  }
  await openPublishing(page, withSections);
  await expectNothingChanged(page);
});

// What the owner reviewed is what gets published (D-224). The review is
// read when the page loads, and a save made in another tab after that
// would otherwise go live unread: the press carries what the review
// showed, and is refused when the draft is no longer that.
test("a draft that moved after the page loaded is refused: nothing is published, the summary says to reload, the reloaded page shows the change, and the press then lands", async ({
  page,
  context,
}) => {
  const { withSections } = ownerFixture();
  await openPublishing(page, withSections);
  await expectNothingChanged(page);

  // Another tab renames a section.
  const other = await context.newPage();
  await openEditing(other, restaurantMenuPath(code, withSections.id));
  const [first = ""] = await rowNames(other);
  await renameFirst(other, `${first} renamed`);

  try {
    const before = (await writes()).length;
    await saveAndFail(
      page,
      strings.publish,
      fill(strings.refused.moved, { menu: withSections.name }),
      strings.problemHeading,
    );
    expect(
      (await writes()).slice(before),
      "nothing was sent to publish_menu(): the check comes first",
    ).toEqual([]);
    await expect(flashBanner(page, "success")).toHaveCount(0);
    await expect(
      main(page).getByText(review.none, { exact: true }),
      "the page still shows the review it loaded with",
    ).toBeVisible();
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(changes(page)).toHaveText([
      counted(review.sectionsChanged, 1),
    ]);
    // With the change read, the press lands.
    await publish(page, withSections);
    await expectNothingChanged(page);
  } finally {
    // As it was: the name back, then published with nothing changed since.
    await renameFirst(other, first);
    await other.close();
    await openPublishing(page, withSections);
    await publish(page, withSections);
  }
  await expectNothingChanged(page);
});
