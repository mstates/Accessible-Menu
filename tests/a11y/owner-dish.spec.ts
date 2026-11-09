import { expect, test, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { CHOICE_LISTS_HEADING_ID } from "../../src/features/owner/choices/choice-words";
import {
  DISH_PAGE_HEADING_IDS,
  dishPageHeadingId,
} from "../../src/features/owner/dish/dish-pages";
import { dashboardPath } from "../../src/features/owner/paths";
import {
  CONFIRM_GUARD_MS,
  FIRST_FOCUS_WAIT_MS,
} from "../../src/ui/alert-dialog-guard";
import { SETTLE_MS } from "../../src/features/owner/editing/settle";
import {
  restaurantChoiceListPath,
  restaurantDishPagePath,
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
  type DishPageSlug,
} from "../../src/features/owner/paths";
import {
  expectForcedEdge,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNoMissingIds,
  expectRootAtLargest,
  open,
  pageChecks,
  setLargestText,
} from "./checks";
import {
  bannerMarks,
  breadcrumbMarks,
  checkboxMarks,
  dishAllergensControls,
  dishAvailabilityControls,
  dishChoicesControls,
  dishGeneralControls,
  dishTagsControls,
  formMarks,
  radioMarks,
  savedDishControls,
} from "./owner-controls";
import {
  dinersReadText,
  dinerSentence,
  notAppliedSentence,
  otherAction,
  otherSuffix,
} from "../../src/features/owner/allergens/allergen-words";
import { US_MAJOR_ALLERGENS } from "../../src/domain/allergens";
import { ownerEnv, ownerFixture } from "./owner-env";
import { hearLog, heard, stopClock } from "./owner-lists";
import { restaurantName } from "./pages";
import { expectFlashArrival, flashBanner, setNotice } from "./saved-banner";
import { expectWrites, guardWrites } from "./write-guard";

// A dish's five pages (D-128, D-139, D-148, D-159, D-160, D-222), signed in
// as the test owner (D-100), on the three dishes the data file priced one way
// each: by size, at one price, and at market price, which it also listed
// one way each: the first checked with milk, wheat, and celery, the second
// checked with none, the third not checked, and a second Soup of the day
// in Mains for the same-named line (D-129); and showed one way each (task
// 5): the first a special every day from 4 to 9 pm, the second tagged
// vegetarian and made without gluten ingredients, the third off the menu
// for now; and gave calories, the mark, and a choice list (task 7, D-166,
// D-167): calories on the first's two sizes, on the second, and on the
// third, the third cooked to order, and a dressing list with two options
// on the second. The gate never writes and never types into
// a field that saves when it is left (D-108, D-111, D-115): every test
// here runs behind the write guard. The tests that press a control that
// saves, a radio, Add a size, a page's Save, say they expect a write; the
// guard answers it inside the browser as an action the server does not
// know, which is how the failed state is reached. Real saves, "Saved."
// (D-118), a size that lands, a name chosen from the suggestions, a Save
// that lands with its flash, a list that moved under the page, the apply,
// and a dish that really moves are covered by
// tests/local, by the unit tests, by the boundary scripts, and by hand.
//
// A dish is edited on five pages under one page nav (D-222, D-225): General
// at the dish's own address, then Allergens, Dietary tags with Cooked to
// order, Availability with Schedule, and Choice lists, each at its own
// address under the dish's. Each test here opens the page its group is on.
// General and Choice lists save as the owner goes (D-111); Allergens,
// Dietary tags, and Availability each save by one press of a Save at the
// foot (D-223, D-229): a tick changes the page only, a Save sends one
// write, a Save the browser refuses sends nothing and focuses the first
// problem or the summary of them, and an owner link pressed with unsaved
// changes asks first. The fields on those three pages save nothing when
// they are left, so the tests type into them.
//
// A dish's page is named by its id, which the setup finds and writes down,
// so every path here is read when a test runs, never when this file loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.dish;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;
const tags = strings.tags;
const availability = strings.availability;
const schedule = strings.schedule;
const cookedToOrder = strings.cookedToOrder;
const choiceCopy = en.owner.choices;
const dayNames = en.owner.restaurants.days;
const form = strings.form;

guardWrites();

type Priced = "sizes" | "one" | "market";
// A dish's five pages (D-222): General at the dish's own address, the rest
// under it by slug.
type DishPage = "general" | DishPageSlug;
const dishPages: readonly DishPage[] = [
  "general",
  "allergens",
  "tags",
  "availability",
  "choices",
];

function dishPath(which: Priced, at: DishPage = "general"): string {
  const id = ownerFixture().dishes[which].id;
  return at === "general"
    ? restaurantDishPath(code, id)
    : restaurantDishPagePath(code, id, at);
}

const generalControls = (page: Page) =>
  dishGeneralControls(
    page,
    ownerFixture().withSections.name,
    ownerFixture().withDishes.name,
  );
const subPageControls =
  (which: Priced, controlsOf: typeof dishTagsControls) => (page: Page) =>
    controlsOf(
      page,
      ownerFixture().withSections.name,
      ownerFixture().withDishes.name,
      ownerFixture().dishes[which].name,
    );

// General draws the price radios' dot and the move's Select arrow, and no
// box. A page with a checked box draws its mark: Allergens on the soup
// (milk, wheat, and the check), Dietary tags on the salad (two tags). The
// soup's Availability page has no box checked, since its special runs
// every day, and draws the radios' dot.
const generalChecks = {
  controls: generalControls,
  marks: [...breadcrumbMarks, ...formMarks, ...radioMarks],
};

// The sized dish holds labels of one node, its size fields and its other
// allergen's field (D-193): axe also leaves nothing to review on its General
// and Allergens pages.
test.describe("a dish's General page, priced by size", () => {
  pageChecks(() => dishPath("sizes"), {
    ...generalChecks,
    review: true,
    snapshot: "dishes-sizes",
  });
});

test.describe("a dish's General page, at one price", () => {
  pageChecks(() => dishPath("one"), {
    ...generalChecks,
    snapshot: "dishes-one",
  });
});

test.describe("a dish's General page, at market price", () => {
  pageChecks(() => dishPath("market"), {
    ...generalChecks,
    snapshot: "dishes-market",
  });
});

test.describe("a dish's Allergens page", () => {
  pageChecks(() => dishPath("sizes", "allergens"), {
    controls: subPageControls("sizes", dishAllergensControls),
    marks: [...breadcrumbMarks, ...checkboxMarks],
    review: true,
    snapshot: "dishes-sizes-allergens",
  });
});

test.describe("a dish's Dietary tags page", () => {
  pageChecks(() => dishPath("one", "tags"), {
    controls: subPageControls("one", dishTagsControls),
    marks: [...breadcrumbMarks, ...checkboxMarks],
    snapshot: "dishes-one-tags",
  });
});

test.describe("a dish's Availability page", () => {
  pageChecks(() => dishPath("sizes", "availability"), {
    controls: subPageControls("sizes", dishAvailabilityControls),
    marks: [...breadcrumbMarks, ...radioMarks],
    snapshot: "dishes-sizes-availability",
  });
});

test.describe("a dish's Choice lists page", () => {
  pageChecks(() => dishPath("one", "choices"), {
    controls: subPageControls("one", dishChoicesControls),
    marks: breadcrumbMarks,
    snapshot: "dishes-one-choices",
  });
});

// Each of the three pages that save by a press, as its save leaves it
// (D-223, D-229): the success flash first in main (D-219), from the cookie
// the save leaves, set before each load since the gate never lands a save
// (D-108). The same checks as the page, with the flash's dismiss button
// among the controls and its two marks in forced colors.
test.describe("a dish's Allergens page after a save", () => {
  pageChecks(() => dishPath("sizes", "allergens"), {
    controls: subPageControls(
      "sizes",
      savedDishControls(dishAllergensControls),
    ),
    marks: [...breadcrumbMarks, ...checkboxMarks, ...bannerMarks],
    review: true,
    snapshot: "dishes-sizes-allergens-saved",
    prepare: (page) =>
      setNotice(page, "allergens-saved", dishPath("sizes", "allergens")),
  });
});

test.describe("a dish's Dietary tags page after a save", () => {
  pageChecks(() => dishPath("one", "tags"), {
    controls: subPageControls("one", savedDishControls(dishTagsControls)),
    marks: [...breadcrumbMarks, ...checkboxMarks, ...bannerMarks],
    snapshot: "dishes-one-tags-saved",
    prepare: (page) => setNotice(page, "tags-saved", dishPath("one", "tags")),
  });
});

test.describe("a dish's Availability page after a save", () => {
  pageChecks(() => dishPath("sizes", "availability"), {
    controls: subPageControls(
      "sizes",
      savedDishControls(dishAvailabilityControls),
    ),
    marks: [...breadcrumbMarks, ...radioMarks, ...bannerMarks],
    snapshot: "dishes-sizes-availability-saved",
    prepare: (page) =>
      setNotice(page, "availability-saved", dishPath("sizes", "availability")),
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

// The dish's own calories field (D-167), beside its one price or alone
// under Market price; a size's is named for its size.
function caloriesField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.price.caloriesLabel,
    exact: true,
  });
}

function sizeCaloriesField(page: Page, size: string) {
  return page.getByRole("textbox", {
    name: `${strings.price.sizeCaloriesLabel} ${fill(strings.price.labelFor, { size })}`,
    exact: true,
  });
}

// The Cooked to order box and the choice lists block (task 7).
function cookedBox(page: Page) {
  return page.getByRole("checkbox", { name: cookedToOrder.label, exact: true });
}

// The Choice lists page's h1, which names the rows' list (D-222).
function choiceHeading(page: Page) {
  return page
    .locator("main")
    .getByRole("heading", { level: 1, name: choiceCopy.heading });
}

function choiceRows(page: Page) {
  return page.locator(
    `main ol[aria-labelledby="${CHOICE_LISTS_HEADING_ID}"] > li`,
  );
}

function newListField(page: Page) {
  return page.getByRole("textbox", {
    name: choiceCopy.lists.newLabel,
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

const allergens = strings.allergens;

function majorGroup(page: Page) {
  return page.getByRole("group", { name: allergens.groupLabel, exact: true });
}

function box(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

function checkBox(page: Page) {
  return box(page, allergens.checkLabel);
}

function otherRows(page: Page) {
  return page.locator(`main ol[aria-label="${allergens.othersLabel}"] > li`);
}

function addOtherButton(page: Page) {
  return page.getByRole("button", { name: allergens.addOther, exact: true });
}

function sentenceLine(page: Page) {
  return page.locator("#dish-allergen-sentence");
}

// The line under the check box, the sentence diners will read and then the
// stamp, is one plain line (D-182); the check box is described by its hint
// and by that line. Each as a string, or as a RegExp when the stamp is one.
function lineText(sentence: string, stamp: string | RegExp) {
  return stamp instanceof RegExp
    ? new RegExp(`^${escape(`${sentence} `)}${stamp.source}$`)
    : `${sentence} ${stamp}`;
}

function checkDescription(sentence: string, stamp: string | RegExp) {
  const line = lineText(sentence, stamp);
  const hint = `${allergens.checkHint} `;
  return line instanceof RegExp
    ? new RegExp(`^${escape(hint)}${line.source.slice(1)}`)
    : `${hint}${line}`;
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
    allergens,
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

// The showing groups (task 5).
function tagsGroup(page: Page) {
  return page.getByRole("group", { name: tags.heading, exact: true });
}

function tagsLine(page: Page) {
  return page.locator("#dish-tags-sentence");
}

function availabilityGroup(page: Page) {
  return page.getByRole("radiogroup", {
    name: availability.heading,
    exact: true,
  });
}

function boxGroup(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

function scheduleField(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function todayButton(page: Page) {
  return page.getByRole("button", { name: schedule.todayOnly, exact: true });
}

function scheduleLine(page: Page) {
  return page.locator("#dish-schedule-sentence");
}

// The three pages that save by one press (D-223, D-229): the page's Save,
// named for the page; the lead under the h1 that says so; the summary of
// the problems a Save found, a box that takes focus, named by its heading,
// with a link per problem; and the dialog an owner link opens while the
// page holds unsaved changes.
function saveButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function leadLine(page: Page, submit: string) {
  return page
    .locator("main")
    .getByText(fill(form.lead, { save: submit }), { exact: true });
}

function summary(page: Page) {
  return page.locator('main [tabindex="-1"]').filter({
    has: page.getByRole("heading", {
      level: 2,
      name: form.summary,
      exact: true,
    }),
  });
}

function summaryLinks(page: Page) {
  return summary(page).getByRole("link");
}

function leaveDialog(page: Page) {
  return page.getByRole("alertdialog", {
    name: form.leave.question,
    exact: true,
  });
}

function otherField(page: Page, position: number) {
  return page.getByRole("combobox", {
    name: `${allergens.otherLabel} ${otherSuffix(allergens, position)}`,
    exact: true,
  });
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

// The Select's trigger. React Aria names it by its label and its value.
function moveSelect(page: Page) {
  return page.getByRole("button", { name: new RegExp(strings.move.label) });
}

async function openDish(
  page: Page,
  which: Priced,
  at: DishPage = "general",
): Promise<void> {
  await open(page, dishPath(which, at));
  await page.waitForLoadState("networkidle");
}

// The page nav (D-222), named by the dish.
function pageNav(page: Page, dish: string) {
  return page
    .locator("main")
    .getByRole("navigation", { name: dish, exact: true });
}

// What the page nav's five links are named on each dish, from the data
// file: the page's name and, after it, the page's state line. The soup is
// checked, has no tag, is available with a special's hours, and has no
// list; the salad is checked, has two tags, is available with no schedule,
// and has one list; the bread is not checked, has no tag, is off the menu
// with no schedule, and has no list.
function navNames(which: Priced): string[] {
  const state = strings.pages.state;
  const showing = (choice: string, schedule: string) =>
    fill(state.availability, { choice, schedule });
  const lines = {
    sizes: [
      state.allergensConfirmed,
      state.none,
      showing(availability.available, state.scheduleSet),
      state.none,
    ],
    one: [
      state.allergensConfirmed,
      fill(state.tagCount.other, { count: 2 }),
      showing(availability.available, state.scheduleNone),
      fill(choiceCopy.lists.count.one, { count: 1 }),
    ],
    market: [
      state.allergensNotConfirmed,
      state.none,
      showing(availability.off, state.scheduleNone),
      state.none,
    ],
  }[which];
  return [
    strings.pages.general,
    `${allergens.heading} ${lines[0]}`,
    `${tags.heading} ${lines[1]}`,
    `${availability.heading} ${lines[2]}`,
    `${choiceCopy.heading} ${lines[3]}`,
  ];
}

// The page nav on one of a dish's pages: one nav named by the dish's name
// alone, five links in D-222's order, each named by its page and its state
// and leading to its page, the current page's marked and no other.
async function expectPageNav(page: Page, which: Priced, current: DishPage) {
  const dish = ownerFixture().dishes[which].name;
  const nav = pageNav(page, dish);
  await expect(nav).toHaveCount(1);
  await expect(
    nav,
    "named by the dish's name alone, with no label of its own",
  ).toHaveAttribute("aria-label", dish);
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(5);
  const names = navNames(which);
  for (const [index, at] of dishPages.entries()) {
    const link = links.nth(index);
    await expect(
      link,
      `link ${index + 1} is named by its page, then its state`,
    ).toHaveAccessibleName(names[index] ?? "");
    await expect(link).toHaveAttribute("href", dishPath(which, at));
    if (at === current) {
      await expect(link).toHaveAttribute("aria-current", "page");
    } else {
      await expect(link).not.toHaveAttribute("aria-current");
    }
  }
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

test("a dish's General page is named for its dish, its title names its section and its menu, the breadcrumb leads back three levels, the nav marks Menus as the part it sits in, and the page nav marks General", async ({
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

  // The page nav (D-222): the one link on the page that says it is this
  // page is its General.
  await expectPageNav(page, "sizes", "general");
  const current = page.locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(strings.pages.general);
  await expectInOrder(
    [
      trail,
      page.locator("main h1"),
      pageNav(page, dishes.sizes.name),
      page.locator("main").getByText(strings.lead, { exact: true }),
    ],
    "the breadcrumb, the h1, the page nav, then the lead",
  );
});

// D-222, D-225: a sub page is named for the page. Its title puts the page
// first, then the dish and what the dish sits inside; its breadcrumb ends
// with the dish as a link and marks nothing, since a breadcrumb only goes
// up and the page nav marks the page; its h1 carries the id its first
// group is labelled by, so the group has no heading of its own.
test("a dish's sub page is named for the page, its title names the page first, the breadcrumb ends with the dish as a link and marks nothing, the h1 labels the first group, and the page nav marks the page", async ({
  page,
}) => {
  const { withSections, withDishes, dishes } = ownerFixture();
  await openDish(page, "sizes", "allergens");
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(
    pageTitle(en, allergens.heading, name, [
      dishes.sizes.name,
      withDishes.name,
      withSections.name,
    ]),
  );
  await expect(page.locator("main h1")).toHaveText(allergens.heading);
  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  await expect(
    restaurantNav.locator("a[aria-current]"),
    "Menus stays marked as the part the page sits in",
  ).toHaveText(nav.menus);

  const trail = breadcrumb(page);
  await expect(trail.locator("ol > li")).toHaveCount(4);
  const links = trail.getByRole("link");
  await expect(
    links,
    "Menus, the menu, the section, then the dish, every one a link",
  ).toHaveText([
    nav.menus,
    withSections.name,
    withDishes.name,
    dishes.sizes.name,
  ]);
  await expect(links.nth(3)).toHaveAttribute("href", dishPath("sizes"));
  await expect(
    trail.locator("[aria-current]"),
    "a breadcrumb only goes up; the page nav marks the page",
  ).toHaveCount(0);

  await expectPageNav(page, "sizes", "allergens");
  await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(
    page
      .locator("main")
      .getByRole("heading", { level: 2, name: allergens.heading }),
    "the group takes the h1 as its heading",
  ).toHaveCount(0);
  await expectInOrder(
    [
      trail,
      page.locator("main h1"),
      pageNav(page, dishes.sizes.name),
      page.locator("main").getByText(allergens.groupHint, { exact: true }),
    ],
    "the breadcrumb, the h1, the page nav, then the group's lead",
  );

  // The other sub pages: the title, the h1 with the id its group is
  // labelled by, no h2 repeating it, and the nav marking the page, with the
  // salad's states on its pages.
  const others = [
    ["one", "tags", tags.heading, DISH_PAGE_HEADING_IDS.tags],
    [
      "sizes",
      "availability",
      availability.heading,
      DISH_PAGE_HEADING_IDS.availability,
    ],
    ["one", "choices", choiceCopy.heading, DISH_PAGE_HEADING_IDS.choices],
  ] as const;
  for (const [which, at, heading, id] of others) {
    await openDish(page, which, at);
    await expect(page).toHaveTitle(
      pageTitle(en, heading, name, [
        dishes[which].name,
        withDishes.name,
        withSections.name,
      ]),
    );
    const h1 = page.locator("main h1");
    await expect(h1).toHaveText(heading);
    await expect(h1).toHaveAttribute("id", id);
    await expect(
      page.locator("main").getByRole("heading", { level: 2, name: heading }),
    ).toHaveCount(0);
    await expectPageNav(page, which, at);
  }
  // The bread's states: not checked, no tag, off the menu, no list.
  await openDish(page, "market", "tags");
  await expectPageNav(page, "market", "tags");
});

// D-222's layout: once main has 36rem of room at the root's font size, the
// page nav takes a left column with the content beside it, their tops
// level; narrower, one column, the nav under the h1 and the content under
// the nav, each the width of the other. The break is a container query in
// rem on main's width, so it follows the root's size however the size was
// raised, and at the largest text the columns stack wherever the room runs
// out, in every engine, which is the right reflow; both are measured, at
// every size, and the room is read the way the query reads it.
async function expectLayout(page: Page) {
  const dish = ownerFixture().dishes.sizes.name;
  const boxes = await page.evaluate((dish) => {
    const nav = document.querySelector(
      `main nav[aria-label="${CSS.escape(dish)}"]`,
    );
    const h1 = document.querySelector("main h1");
    const content = nav?.nextElementSibling;
    const container = nav?.parentElement?.parentElement;
    if (!nav || !h1 || !content || !container) {
      throw new Error("the page nav, the h1, or the content is missing");
    }
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    };
    return {
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      width: container.getBoundingClientRect().width,
      nav: box(nav),
      h1: box(h1),
      content: box(content),
    };
  }, dish);
  const wide = boxes.width >= 36 * boxes.root;
  const where = `${Math.round(boxes.width)}px of room at a ${boxes.root}px root`;
  expect(
    boxes.nav.top,
    `${where}: the nav starts under the h1`,
  ).toBeGreaterThanOrEqual(boxes.h1.bottom - 0.5);
  if (wide) {
    expect(
      boxes.nav.right,
      `${where}: the nav ends before the content starts`,
    ).toBeLessThanOrEqual(boxes.content.left + 0.5);
    expect(
      Math.abs(boxes.nav.top - boxes.content.top),
      `${where}: the nav's and the content's tops are level`,
    ).toBeLessThanOrEqual(1);
  } else {
    expect(
      boxes.content.top,
      `${where}: the content starts under the nav`,
    ).toBeGreaterThanOrEqual(boxes.nav.bottom - 0.5);
    expect(
      Math.abs(boxes.nav.width - boxes.content.width),
      `${where}: the nav spans the content's width`,
    ).toBeLessThanOrEqual(1);
  }
}

test(
  "the page nav sits left of the content once main has 36rem of room and under the h1 below that, at the default and the largest text",
  { tag: "@arrival" },
  async ({ page }) => {
    const path = dishPath("sizes", "allergens");
    await open(page, path);
    await page.waitForLoadState("networkidle");
    await expectLayout(page);
    await setLargestText(page);
    await open(page, path);
    await page.waitForLoadState("networkidle");
    await expectRootAtLargest(page);
    await expectLayout(page);
  },
);

// D-222's marker in forced colors: the current link's bar is its own left
// border, drawn in a system color with 3:1 against what is behind it, and
// no other link has one, since the others take the bar's width as padding
// and not as a transparent border, which would paint there. Tailwind's
// preflight gives every element a zero-width solid border, so the width
// alone says whether a bar is drawn.
test(
  "in forced colors the page nav's current link keeps its bar and no other link draws one",
  { tag: "@forced" },
  async ({ page }) => {
    await openDish(page, "sizes", "allergens");
    const dish = ownerFixture().dishes.sizes.name;
    await expectForcedEdge(
      page,
      `main nav[aria-label="${dish}"] a[aria-current="page"]`,
      "left",
      4,
    );
    const others = pageNav(page, dish).locator("a:not([aria-current])");
    await expect(others).toHaveCount(4);
    const bars = await others.evaluateAll((links) =>
      links.map((link) => parseFloat(getComputedStyle(link).borderLeftWidth)),
    );
    expect(bars, "no other link draws a bar").toEqual([0, 0, 0, 0]);
  },
);

// D-128, D-139, and WCAG 3.3.2: on General the sentence that says how the
// page saves comes right after the page nav, then the description, the
// price heading naming its group, the choice's own fields, the note, the
// status, the next dish, and the move. The dish's other groups are on
// their own pages (D-222).
test("General reads in order: the lead, the description, the price group under its heading with three choices, the sizes, the note, the status, the next dish, and the move, and holds no other group", async ({
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
      pageNav(page, ownerFixture().dishes.sizes.name),
      main.getByText(strings.lead, { exact: true }),
      descriptionField(page),
      main.getByRole("heading", { level: 2, name: strings.price.heading }),
      group,
      sizeRows(page).first(),
      addSizeButton(page),
      noteField(page),
      savedStatus(page),
      main.locator('p a[href*="/dishes/"]'),
      main.getByRole("heading", { level: 2, name: strings.move.heading }),
    ],
    "the h1, the page nav, the lead, the description, the price heading, its group, the sizes, Add a size, the note, the status, the next dish, then the move, in that order",
  );
  for (const heading of [
    allergens.heading,
    tags.heading,
    availability.heading,
    schedule.heading,
    cookedToOrder.heading,
    choiceCopy.heading,
  ]) {
    await expect(
      main.getByRole("heading", { name: heading, exact: true }),
      `${heading} is on its own page`,
    ).toHaveCount(0);
  }
  await expect(majorGroup(page)).toHaveCount(0);
  await expect(tagsGroup(page)).toHaveCount(0);
  await expect(availabilityGroup(page)).toHaveCount(0);
  await expect(choiceRows(page)).toHaveCount(0);
  await expect(newListField(page)).toHaveCount(0);
  // Each size's row holds its name, its price, and its calories, in that
  // order (D-167).
  const first = sizeRows(page).first();
  await expectInOrder(
    [
      first.getByRole("combobox"),
      first.getByRole("textbox", {
        name: new RegExp(`^${strings.price.sizePriceLabel} `),
      }),
      first.getByRole("textbox", {
        name: new RegExp(`^${strings.price.sizeCaloriesLabel} `),
      }),
    ],
    "a size's name, then its price, then its calories",
  );
});

// D-148 on its own page (D-222, D-223): the h1, the page's lead, the
// group's lead, the nine, the other-allergen rows and Add another allergen,
// the check and its sentence, the same-named line, and Save allergens.
test("Allergens reads in order: the h1, the page's lead, the group's lead, the nine, the other allergens and Add another allergen, the check and its sentence, the same-named line, and Save allergens", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes", "allergens");
  const main = page.locator("main");
  await expectInOrder(
    [
      main.locator("h1"),
      leadLine(page, allergens.submit),
      main.getByText(allergens.groupHint, { exact: true }),
      majorGroup(page),
      otherRows(page).first(),
      addOtherButton(page),
      checkBox(page),
      sentenceLine(page),
      main.getByText(new RegExp(`^${escape(dishes.sizes.name)} is also in `)),
      saveButton(page, allergens.submit),
    ],
    "the h1, the page's lead, the group's lead, the nine, the other allergens, Add another allergen, the check, its sentence, the same-named line, then Save allergens, in that order",
  );
  await expect(
    savedStatus(page),
    "no status: the page saves by a press",
  ).toHaveCount(0);
  await expect(
    main.getByText(strings.lead, { exact: true }),
    "General's lead is General's",
  ).toHaveCount(0);
  await expect(descriptionField(page)).toHaveCount(0);
  await expect(priceGroup(page)).toHaveCount(0);
});

// D-66 and D-167 on their own page (D-222, D-223): the page's lead, the
// three boxes under the h1, the sentence diners read, Cooked to order under
// its own heading, and Save dietary tags.
test("Dietary tags reads in order: the h1, the page's lead, the three boxes, the sentence diners read, Cooked to order under its heading, and Save dietary tags", async ({
  page,
}) => {
  await openDish(page, "one", "tags");
  const main = page.locator("main");
  await expectInOrder(
    [
      main.locator("h1"),
      leadLine(page, tags.submit),
      tagsGroup(page),
      tagsLine(page),
      main.getByRole("heading", { level: 2, name: cookedToOrder.heading }),
      cookedBox(page),
      saveButton(page, tags.submit),
    ],
    "the h1, the page's lead, the tags, their sentence, Cooked to order under its heading, its box, then Save dietary tags, in that order",
  );
  await expect(
    savedStatus(page),
    "no status: the page saves by a press",
  ).toHaveCount(0);
  await expect(log(page), "nothing on this page is said").toHaveCount(0);
  await expect(
    main.getByRole("heading", { level: 2 }),
    "one h2, Cooked to order",
  ).toHaveCount(1);
});

// D-159 and D-160 on their own page (D-222, D-223): the page's lead, the
// three radios under the h1, the schedule under its own heading with its
// lead, days, hours, Today only, the two days, the weeks with their lead,
// the months with theirs, and its sentence, and Save availability.
test("Availability reads in order: the h1, the page's lead, the three radios, the schedule under its heading with its parts and its sentence, and Save availability", async ({
  page,
}) => {
  await openDish(page, "sizes", "availability");
  const main = page.locator("main");
  await expectInOrder(
    [
      main.locator("h1"),
      leadLine(page, availability.submit),
      availabilityGroup(page),
      main.getByRole("heading", { level: 2, name: schedule.heading }),
      main.getByText(schedule.lead, { exact: true }),
      boxGroup(page, schedule.daysLabel),
      boxGroup(page, schedule.hoursLabel),
      scheduleField(page, schedule.starts),
      scheduleField(page, schedule.ends),
      todayButton(page),
      scheduleField(page, schedule.firstDay),
      scheduleField(page, schedule.lastDay),
      main.getByText(schedule.weeksLead, { exact: true }),
      boxGroup(page, schedule.weeksLabel),
      main.getByText(schedule.monthsLead, { exact: true }),
      boxGroup(page, schedule.monthsLabel),
      scheduleLine(page),
      saveButton(page, availability.submit),
    ],
    "the h1, the page's lead, the radios, the schedule heading, its lead, days, hours, Today only, the two days, the weeks with their lead, the months with theirs, its sentence, then Save availability, in that order",
  );
  await expect(
    savedStatus(page),
    "no status: the page saves by a press",
  ).toHaveCount(0);
  await expect(
    main.getByRole("heading", { level: 2 }),
    "one h2, Schedule",
  ).toHaveCount(1);
});

// D-166 on its own page (D-222): the lead under the h1, the rows as h2s,
// the add field, and the status.
test("Choice lists reads in order: the h1, the lead, the rows as h2s, the add field, and the status", async ({
  page,
}) => {
  const { lists } = ownerFixture();
  await openDish(page, "one", "choices");
  const main = page.locator("main");
  await expectInOrder(
    [
      main.locator("h1"),
      main.getByText(choiceCopy.leadDish, { exact: true }),
      choiceRows(page).first(),
      newListField(page),
      savedStatus(page),
    ],
    "the h1, the lead, the rows, the add field, then the status, in that order",
  );
  await expect(
    choiceRows(page).first().getByRole("heading", { level: 2 }),
  ).toHaveText(lists.dish.lead);
  await expect(main.locator("h3"), "no heading below the rows'").toHaveCount(0);
});

// Task 7, D-167: calories one field a place, as the data file gives them:
// on each size of the soup, beside the salad's one price, and alone under
// the bread's market price, each described by the one hint.
test("calories read beside each price: one field a size, one after the one price, and one alone under Market price", async ({
  page,
}) => {
  await openDish(page, "sizes");
  await expect(caloriesField(page), "no dish-level field by size").toHaveCount(
    0,
  );
  await expect(sizeCaloriesField(page, "Cup")).toHaveValue("180");
  await expect(sizeCaloriesField(page, "Bowl")).toHaveValue("290");
  await expect(sizeCaloriesField(page, "Cup")).toHaveAccessibleDescription(
    strings.price.caloriesHint,
  );

  await openDish(page, "one");
  const calories = caloriesField(page);
  await expect(calories).toHaveCount(1);
  await expect(calories).toHaveValue("320");
  await expect(calories).toHaveAccessibleDescription(
    strings.price.caloriesHint,
  );
  await expect(calories).not.toHaveAttribute("inputmode", "decimal");
  await expectInOrder(
    [priceField(page), calories, noteField(page)],
    "the price, then its calories, then the note",
  );

  await openDish(page, "market");
  await expect(priceField(page)).toHaveCount(0);
  await expect(caloriesField(page)).toHaveValue("410");
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// Task 7, D-167: the box under its own heading on the Dietary tags page
// (D-222), with its hint, ticked on the bread alone.
test("Cooked to order reads as one box under its heading with its hint, ticked on the dish the data file marked", async ({
  page,
}) => {
  await openDish(page, "market", "tags");
  const box = cookedBox(page);
  await expect(box).toHaveCount(1);
  await expect(box).toBeChecked();
  await expect(box).toHaveAccessibleDescription(cookedToOrder.hint);
  await expect(
    page
      .locator("main")
      .getByRole("heading", { level: 2, name: cookedToOrder.heading }),
  ).toHaveCount(1);
  await openDish(page, "one", "tags");
  await expect(cookedBox(page)).not.toBeChecked();
  await openDish(page, "sizes", "tags");
  await expect(cookedBox(page)).not.toBeChecked();
});

// Task 7, D-166: the dish's choice lists as rows under the h1 of their page
// (D-222), the salad with its dressing list and the others with none.
test("the choice lists block shows the salad's dressing list as a row with its link and buttons, and none on the other dishes", async ({
  page,
}) => {
  const { lists } = ownerFixture();
  const lead = lists.dish.lead;
  await openDish(page, "one", "choices");
  await expect(choiceHeading(page)).toHaveCount(1);
  await expect(choiceRows(page)).toHaveCount(1);
  await expect(
    choiceRows(page).first().getByRole("heading", { level: 2 }),
  ).toHaveText(lead);
  const link = page.getByRole("link", {
    name: fill(choiceCopy.lists.rowAction, {
      action: choiceCopy.lists.edit,
      list: lead,
    }),
    exact: true,
  });
  await expect(link).toHaveAttribute(
    "href",
    restaurantChoiceListPath(code, lists.dish.id),
  );
  for (const action of [
    choiceCopy.lists.moveUp,
    choiceCopy.lists.moveDown,
    choiceCopy.lists.remove,
  ]) {
    await expect(
      page.getByRole("button", {
        name: fill(choiceCopy.lists.rowAction, { action, list: lead }),
        exact: true,
      }),
    ).toHaveCount(1);
  }
  await expect(newListField(page)).toHaveAccessibleDescription(
    choiceCopy.lists.newHint,
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  for (const which of ["sizes", "market"] as const) {
    await openDish(page, which, "choices");
    await expect(choiceHeading(page)).toHaveCount(1);
    await expect(choiceRows(page)).toHaveCount(0);
    await expect(
      page.locator("main").getByText(choiceCopy.lists.none, { exact: true }),
    ).toHaveCount(1);
  }
});

// The box changes the page only (D-223); Save dietary tags sends the one
// write, held on the button while it waits (D-209); a save that cannot
// land keeps every value and puts the failure in the summary, focused.
test("a Cooked to order tick changes the page only, and Save dietary tags sends one write, held on the button, and keeps the tick with the failure in the summary when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "one", "tags");
  await page
    .locator("#dish-cooked-to-order")
    .getByText(cookedToOrder.label, { exact: true })
    .click();
  await expect(cookedBox(page)).toBeChecked();
  expect(writes.attempted.length, "a tick sends nothing").toBe(0);
  await expectNoMissingIds(page);

  const save = saveButton(page, tags.submit);
  await save.click();
  await expect(save, "the press is held at once").toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect.poll(() => writes.answered.length).toBe(1);
  writes.release();
  const failure = `${fill(tags.notSaved, { dish: dishes.one.name })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page), "the summary takes focus").toBeFocused();
  await expect(summaryLinks(page), "no field is at fault").toHaveCount(0);
  await expect(cookedBox(page), "the tick is kept").toBeChecked();
  await expect(save, "Save is free again").not.toHaveAttribute("aria-disabled");
  await expect(savedStatus(page)).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// Calories in the wrong shape are refused before anything is sent: no
// expectWrites, so the guard is the proof (D-167).
test("calories in the wrong shape are refused in the field with nothing sent, said once, with Try again", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  const calories = caloriesField(page);
  await calories.fill("lots");
  await page.keyboard.press("Enter");
  const refused = `${fill(strings.notSaved.calories, { dish: dishes.one.name })} ${strings.errors.caloriesFormat}`;
  await expect(calories).toHaveAttribute("aria-invalid", "true");
  await expect(calories).toHaveAccessibleDescription(
    `${strings.price.caloriesHint} ${strings.errors.caloriesFormat}`,
  );
  await expect(savedStatus(page)).toHaveText(refused);
  await expect(log(page).getByText(refused, { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: editing.tryAgain, exact: true }),
  ).toHaveCount(1);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  // Back as saved: nothing is sent, and the failure ends.
  await calories.fill("320");
  await page.keyboard.press("Enter");
  await expect(savedStatus(page)).toHaveText(editing.saved);
});

// Task 5, D-66: the three tags named by the words diners read, each with
// its own hint and never the others', the group with no description of its
// own, and the sentence under the group only while a tag is ticked.
test("the dietary tags read as three boxes with their hints, and the sentence diners read follows a tagged dish", async ({
  page,
}) => {
  await openDish(page, "one", "tags");
  const group = tagsGroup(page);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAccessibleDescription("");
  const boxes = group.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  const names = en.dietary.names;
  for (const [index, id] of (
    ["vegan", "vegetarian", "made-without-gluten"] as const
  ).entries()) {
    await expect(boxes.nth(index)).toHaveAccessibleName(names[id]);
    await expect(boxes.nth(index)).toHaveAccessibleDescription(tags.hints[id]);
  }
  await expect(box(page, names.vegan)).not.toBeChecked();
  await expect(box(page, names.vegetarian)).toBeChecked();
  await expect(box(page, names["made-without-gluten"])).toBeChecked();
  await expect(tagsLine(page)).toHaveText(
    fill(tags.dinersRead, {
      sentence: `"${names.vegetarian}. ${names["made-without-gluten"]}."`,
    }),
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await openDish(page, "sizes", "tags");
  for (const name of Object.values(names)) {
    await expect(box(page, name)).not.toBeChecked();
  }
  await expect(tagsLine(page), "no tag, no sentence").toHaveCount(0);
});

// Task 5, D-160: three radios as Price's, the two that change what diners
// see with a hint, and the group's line for a dish off the menu, which is
// read with the group and each radio (D-147).
test("availability reads as three radios with the two hints, a dish off the menu says it is hidden, and an available dish says nothing", async ({
  page,
}) => {
  await openDish(page, "market", "availability");
  const group = availabilityGroup(page);
  await expect(group).toHaveCount(1);
  const choices = group.getByRole("radio");
  await expect(choices).toHaveCount(3);
  for (const [index, label] of [
    availability.available,
    availability.soldOut,
    availability.off,
  ].entries()) {
    await expect(choices.nth(index)).toHaveAccessibleName(label);
  }
  await expect(radio(page, availability.off)).toBeChecked();
  await expect(group).toHaveAccessibleDescription(availability.hidden);
  await expect(radio(page, availability.available)).toHaveAccessibleDescription(
    availability.hidden,
  );
  await expect(radio(page, availability.soldOut)).toHaveAccessibleDescription(
    `${availability.soldOutHint} ${availability.hidden}`,
  );
  await expect(radio(page, availability.off)).toHaveAccessibleDescription(
    `${availability.offHint} ${availability.hidden}`,
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await openDish(page, "one", "availability");
  await expect(radio(page, availability.available)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription("");
  await expect(radio(page, availability.available)).toHaveAccessibleDescription(
    "",
  );
  await expect(radio(page, availability.soldOut)).toHaveAccessibleDescription(
    availability.soldOutHint,
  );
});

// Task 5, D-159: the special's hours in the two time fields, each described
// by the one hint, the dates blank with theirs, no box ticked, and the
// sentence diners read with the line after it; a dish with no schedule
// says so.
test("the schedule reads a special's hours in one format with one hint on both fields, its sentence and when it next shows, and a dish with no schedule says so", async ({
  page,
}) => {
  await openDish(page, "sizes", "availability");
  const starts = scheduleField(page, schedule.starts);
  const ends = scheduleField(page, schedule.ends);
  await expect(starts).toHaveValue("4 pm");
  await expect(ends).toHaveValue("9 pm");
  await expect(starts).toHaveAccessibleDescription(schedule.hoursHint);
  await expect(ends).toHaveAccessibleDescription(schedule.hoursHint);
  await expect(scheduleField(page, schedule.firstDay)).toHaveValue("");
  await expect(
    scheduleField(page, schedule.firstDay),
  ).toHaveAccessibleDescription(schedule.dateHint);
  await expect(scheduleField(page, schedule.lastDay)).toHaveValue("");
  for (const label of [
    schedule.daysLabel,
    schedule.weeksLabel,
    schedule.monthsLabel,
  ]) {
    await expect(
      boxGroup(page, label).getByRole("checkbox", { checked: true }),
    ).toHaveCount(0);
  }
  await expect(
    boxGroup(page, schedule.daysLabel).getByRole("checkbox"),
  ).toHaveCount(7);
  await expect(
    boxGroup(page, schedule.weeksLabel).getByRole("checkbox"),
  ).toHaveCount(5);
  await expect(
    boxGroup(page, schedule.monthsLabel).getByRole("checkbox"),
  ).toHaveCount(12);
  await expect(box(page, dayNames.mon)).toHaveCount(1);
  await expect(box(page, schedule.weeks.first)).toHaveCount(1);
  await expect(box(page, "January")).toHaveCount(1);
  await expect(scheduleLine(page)).toHaveText(
    new RegExp(
      `^${escape(fill(schedule.dinersRead, { sentence: '"Every day, 4 to 9 pm."' }))} (${escape(fill(schedule.showsNow, { time: "9 pm" }))}|Next shows [A-Z][a-z]+, [A-Z][a-z]+ \\d{1,2}\\.)$`,
    ),
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await openDish(page, "one", "availability");
  await expect(scheduleLine(page)).toHaveText(schedule.none);
  await expect(scheduleField(page, schedule.starts)).toHaveValue("");
});

// A tag tick, an availability choice, and a day tick each change the page
// only (D-223); the line under each group keeps reading the saved values
// until a Save lands; Save sends the one write, and a save that cannot land
// keeps the change with the failure in the summary, focused.
test("a tag tick changes the page only while the sentence diners read follows the saved tags, and Save dietary tags keeps the tick with the failure in the summary when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market", "tags");
  await expect(tagsLine(page), "no tag is saved").toHaveCount(0);
  await page.getByText(vegan, { exact: true }).click();
  await expect(box(page, vegan)).toBeChecked();
  await expect(
    tagsLine(page),
    "the sentence follows the saved tags, not the tick",
  ).toHaveCount(0);
  expect(writes.attempted.length, "a tick sends nothing").toBe(0);
  await expectNoMissingIds(page);

  await saveButton(page, tags.submit).click();
  await expect.poll(() => writes.answered.length).toBe(1);
  writes.release();
  const failure = `${fill(tags.notSaved, { dish: dishes.market.name })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page)).toBeFocused();
  await expect(box(page, vegan), "the tick is kept").toBeChecked();
  await expect(tagsLine(page)).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("Sold out today changes the page only while the group's line follows the saved choice, and Save availability keeps the choice with the failure in the summary when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "one", "availability");
  await page.getByText(availability.soldOut, { exact: true }).click();
  await expect(radio(page, availability.soldOut)).toBeChecked();
  await expect(
    availabilityGroup(page),
    "the line follows the saved choice, Available, which has none",
  ).toHaveAccessibleDescription("");
  expect(writes.attempted.length, "a choice sends nothing").toBe(0);
  await expectNoMissingIds(page);

  await saveButton(page, availability.submit).click();
  await expect.poll(() => writes.answered.length).toBe(1);
  writes.release();
  const failure = `${fill(availability.notSaved, { dish: dishes.one.name })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page)).toBeFocused();
  await expect(
    radio(page, availability.soldOut),
    "the choice is kept",
  ).toBeChecked();
  await expect(availabilityGroup(page)).not.toHaveAttribute("aria-invalid");
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("a day tick changes the page only while the sentence diners read follows the saved schedule, and Save availability keeps the tick with the failure in the summary when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "sizes", "availability");
  const every = fill(schedule.dinersRead, {
    sentence: '"Every day, 4 to 9 pm."',
  });
  await expect(scheduleLine(page)).toContainText(every);
  await page.getByText(dayNames.tue, { exact: true }).click();
  await expect(box(page, dayNames.tue)).toBeChecked();
  await expect(
    scheduleLine(page),
    "the sentence follows the saved schedule, not the tick",
  ).toContainText(every);
  expect(writes.attempted.length, "a tick sends nothing").toBe(0);
  await expectNoMissingIds(page);

  await saveButton(page, availability.submit).click();
  await expect.poll(() => writes.answered.length).toBe(1);
  writes.release();
  const failure = `${fill(availability.notSaved, { dish: dishes.sizes.name })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page)).toBeFocused();
  await expect(box(page, dayNames.tue), "the tick is kept").toBeChecked();
  await expect(box(page, dayNames.tue)).not.toHaveAttribute("aria-invalid");
  await expect(scheduleLine(page)).toContainText(every);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// The schedule's fields save nothing when they are left (D-223): the write
// guard proves that Tab through them unchanged sends nothing, and nothing
// is said.
test("Tab through the unchanged time pair, Today only, and the unchanged dates sends nothing and says nothing", async ({
  page,
}) => {
  await openDish(page, "sizes", "availability");
  await scheduleField(page, schedule.starts).focus();
  await page.keyboard.press("Tab");
  await expect(scheduleField(page, schedule.ends)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(todayButton(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(scheduleField(page, schedule.firstDay)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(scheduleField(page, schedule.lastDay)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(scheduleField(page, schedule.lastDay)).not.toBeFocused();
  await expect(log(page)).toHaveText("");
  await expect(summary(page)).toHaveCount(0);
});

// Today only fills the two date fields in the page and says so once;
// nothing is sent until Save (D-223, D-229). No expectWrites, so the guard
// is the proof.
test("Today only fills First day and Last day with today, is said once, sends nothing, and keeps focus on the button", async ({
  page,
}) => {
  await openDish(page, "one", "availability");
  await hearLog(page);
  const first = scheduleField(page, schedule.firstDay);
  const last = scheduleField(page, schedule.lastDay);
  await expect(first).toHaveValue("");
  await todayButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(first).not.toHaveValue("");
  await expect(last).toHaveValue(await first.inputValue());
  const prefix = schedule.todayOnlyFilled.split("{date}")[0] ?? "";
  await expect
    .poll(
      async () =>
        (await heard(page)).filter((each) => each.startsWith(prefix)).length,
    )
    .toBe(1);
  await expect(todayButton(page)).toBeFocused();
  await expect(
    scheduleLine(page),
    "the sentence follows the saved schedule",
  ).toHaveText(schedule.none);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// D-148: the nine in the FDA's order, each with its hint; the other
// allergens as rows named by their place; the check described by its hint
// and by the sentence diners will read, with who checked it and when; and
// the three dishes as the data file listed them.
test("the allergen group shows the nine with their hints, the other allergens as rows, and the check described by the sentence diners read, on each of the three dishes", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes", "allergens");
  const group = majorGroup(page);
  await expect(group).toHaveCount(1);
  await expect(
    group,
    "the lead is a paragraph before the group, not its description, or every box would read it",
  ).toHaveAccessibleDescription("");
  const boxes = group.getByRole("checkbox");
  await expect(boxes, "nine boxes, in the FDA's order").toHaveCount(9);
  for (const [index, id] of US_MAJOR_ALLERGENS.entries()) {
    await expect(boxes.nth(index)).toHaveAccessibleName(allergens.names[id]);
    await expect(boxes.nth(index)).toHaveAccessibleDescription(
      allergens.hints[id],
    );
  }
  for (const id of US_MAJOR_ALLERGENS) {
    const ticked = id === "milk" || id === "wheat";
    await expect(
      box(page, allergens.names[id]),
      `${id} ${ticked ? "ticked" : "not ticked"} on the soup`,
    ).toBeChecked({ checked: ticked });
  }
  const rows = otherRows(page);
  await expect(rows, "the soup lists one other allergen").toHaveCount(1);
  const field = page.getByRole("combobox", {
    name: `${allergens.otherLabel} ${otherSuffix(allergens, 1)}`,
    exact: true,
  });
  await expect(field).toHaveCount(1);
  await expect(field).toHaveValue("celery");
  await expect(field).toHaveAccessibleDescription(allergens.otherHint);
  for (const action of [allergens.showOtherNames, allergens.removeOther]) {
    await expect(
      page.getByRole("button", {
        name: otherAction(allergens, action, "celery"),
        exact: true,
      }),
    ).toHaveCount(1);
  }
  await expect(addOtherButton(page)).toHaveCount(1);
  await expect(addOtherButton(page)).not.toHaveAttribute("aria-disabled");
  await expect(checkBox(page)).toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(
      reads({ allergens: ["milk", "wheat"], others: ["celery"] }, true),
      checkedByYou,
    ),
  );
  // The line is one plain run of text, as on the diner page (D-182).
  await expect(sentenceLine(page)).toHaveText(
    lineText(
      reads({ allergens: ["milk", "wheat"], others: ["celery"] }, true),
      checkedByYou,
    ),
  );
  expect(
    await sentenceLine(page).evaluate(
      (line) =>
        line.childNodes.length === 1 &&
        line.childNodes[0]?.nodeType === Node.TEXT_NODE,
    ),
    "the line holds one text node",
  ).toBe(true);
  // The same-named line (D-129): the data file's second Soup of the day,
  // in Mains, not checked.
  const line = page
    .locator("main")
    .getByText(new RegExp(`^${escape(dishes.sizes.name)} is also in `));
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText(/, not checked yet\.$/);
  const apply = page.getByRole("button", {
    name: new RegExp(
      `^${escape(allergens.sameNamed.apply)}, ${escape(dishes.sizes.name)} in `,
    ),
  });
  await expect(apply).toHaveCount(1);
  await expect(apply, "the visible words come first").toHaveText(
    allergens.sameNamed.apply,
  );

  await openDish(page, "one", "allergens");
  for (const id of US_MAJOR_ALLERGENS) {
    await expect(box(page, allergens.names[id])).not.toBeChecked();
  }
  await expect(otherRows(page)).toHaveCount(0);
  await expect(checkBox(page)).toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(reads({ allergens: [], others: [] }, true), checkedByYou),
  );
  await expect(page.locator('main button[id^="dish-apply-"]')).toHaveCount(0);

  await openDish(page, "market", "allergens");
  await expect(checkBox(page)).not.toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(
    checkDescription(
      reads({ allergens: [], others: [] }, false),
      allergens.notChecked,
    ),
  );
  await expect(page.locator('main button[id^="dish-apply-"]')).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// A tick changes the page only (D-223): the sentence under the check keeps
// reading the saved lists and the saved check until a Save lands, so the
// ids it ties are the same before and after (D-147). Save allergens sends
// the one write; a save that cannot land keeps the tick with the failure
// in the summary, focused.
test("a tick changes the page only while the sentence diners read follows the saved lists, and Save allergens keeps the tick with the failure in the summary when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "market", "allergens");
  const notChecked = checkDescription(
    reads({ allergens: [], others: [] }, false),
    allergens.notChecked,
  );
  await page.getByText(allergens.names.milk, { exact: true }).click();
  await expect(box(page, allergens.names.milk)).toBeChecked();
  await expect(
    checkBox(page),
    "the sentence follows the saved lists, not the tick",
  ).toHaveAccessibleDescription(notChecked);
  expect(writes.attempted.length, "a tick sends nothing").toBe(0);
  await expectNoMissingIds(page);

  const save = saveButton(page, allergens.submit);
  await save.click();
  await expect(save, "the press is held at once").toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect.poll(() => writes.answered.length).toBe(1);
  writes.release();
  const failure = `${fill(allergens.notSaved.allergens, {
    dish: dishes.market.name,
  })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page), "the summary takes focus").toBeFocused();
  await expect(summaryLinks(page), "no field is at fault").toHaveCount(0);
  await expect(
    box(page, allergens.names.milk),
    "the tick is kept",
  ).toBeChecked();
  await expect(box(page, allergens.names.milk)).not.toHaveAttribute(
    "aria-invalid",
  );
  await expect(checkBox(page)).toHaveAccessibleDescription(notChecked);
  await expect(save).not.toHaveAttribute("aria-disabled");
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// On a checked dish a tick leaves the saved check as it is: the check and
// the lists save together by the press, D-148's rule in one save (D-229).
// The same-named offer stays, since it works from the saved list (D-129):
// while the page holds unsaved changes Apply says to save first and sends
// nothing, through the inactive-button pattern Add another allergen uses
// when the rows are full; with the page clean again it sends one write,
// answered in the browser, and says the result once, focus staying on it.
test("a tick on a checked dish leaves the check and the same-named offer as they are; Apply with unsaved changes says to save first and sends nothing, and with the page clean sends one write and says the result once", async ({
  page,
}) => {
  const writes = expectWrites(page);
  const { dishes, withSections, withDishes } = ownerFixture();
  await openDish(page, "sizes", "allergens");
  await hearLog(page);
  const checked = checkDescription(
    reads({ allergens: ["milk", "wheat"], others: ["celery"] }, true),
    checkedByYou,
  );
  const apply = page.locator('main button[id^="dish-apply-"]');
  await expect(apply).toHaveCount(1);
  await expect(apply).not.toHaveAttribute("aria-disabled");

  await page.getByText(allergens.names.sesame, { exact: true }).click();
  await expect(box(page, allergens.names.sesame)).toBeChecked();
  await expect(checkBox(page), "the check stays until Save").toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(checked);
  await expect(apply, "the same-named line stays").toHaveCount(1);
  await expect(apply).toHaveAttribute("aria-disabled", "true");
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, allergens.sameNamed.saveFirst)).toBe(1);
  await expect(apply, "focus stays on Apply").toBeFocused();
  expect(writes.attempted.length, "nothing was sent").toBe(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  // The tick undone: the page is clean, and Apply works from the saved list.
  await page.getByText(allergens.names.sesame, { exact: true }).click();
  await expect(box(page, allergens.names.sesame)).not.toBeChecked();
  await expect(apply).not.toHaveAttribute("aria-disabled");
  const before = (await heard(page)).length;
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => writes.answered.length).toBe(1);
  const notApplied = notAppliedSentence(
    allergens,
    editing,
    strings.errors.parentGone,
    { kind: "out-of-date" },
    {
      name: dishes.sizes.name,
      section: withSections.name,
      menu: withDishes.name,
    },
  );
  await expect.poll(() => said(page, notApplied)).toBe(1);
  expect((await heard(page)).length, "said once").toBe(before + 1);
  await expect(
    page.locator("main p").filter({ hasText: notApplied }),
    "the last result shows as a plain line",
  ).toHaveCount(1);
  await expect(apply, "focus stays on Apply").toBeFocused();
  await expect(apply).toHaveCount(1);
  await expect(savedStatus(page)).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("the check changes the page only while the sentence diners read follows the saved check, and Save allergens keeps it with the failure in the summary when it cannot land", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { dishes } = ownerFixture();
  await openDish(page, "market", "allergens");
  const notChecked = checkDescription(
    reads({ allergens: [], others: [] }, false),
    allergens.notChecked,
  );
  await page.getByText(allergens.checkLabel, { exact: true }).click();
  await expect(checkBox(page)).toBeChecked();
  await expect(
    checkBox(page),
    "the sentence follows the saved check, not the tick",
  ).toHaveAccessibleDescription(notChecked);
  expect(writes.attempted.length, "a tick sends nothing").toBe(0);
  await expectNoMissingIds(page);

  await saveButton(page, allergens.submit).click();
  await expect.poll(() => writes.answered.length).toBe(1);
  writes.release();
  const failure = `${fill(allergens.notSaved.allergens, {
    dish: dishes.market.name,
  })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page)).toBeFocused();
  await expect(checkBox(page), "the tick is kept").toBeChecked();
  await expect(checkBox(page)).toHaveAccessibleDescription(notChecked);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// Add another allergen adds a row in the page only, and a blank row removed
// sends nothing: the write guard is the proof. Each press is said once.
test("Add another allergen adds a blank row with focus in its field and sends nothing, and removing it sends nothing", async ({
  page,
}) => {
  await openDish(page, "market", "allergens");
  await addOtherButton(page).focus();
  await page.keyboard.press("Enter");
  const field = otherField(page, 1);
  await expect(field).toHaveCount(1);
  await expect(field, "focus lands in the new field").toBeFocused();
  await expect(log(page)).toHaveText(
    fill(allergens.otherAdded, { position: 1 }),
  );
  const remove = page.getByRole("button", {
    name: otherAction(
      allergens,
      allergens.removeOther,
      fill(allergens.unnamedOther, { position: 1 }),
    ),
    exact: true,
  });
  await expect(remove).toHaveCount(1);
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(otherRows(page)).toHaveCount(0);
  await expect(
    addOtherButton(page),
    "focus goes to Add another allergen",
  ).toBeFocused();
  await expect(
    log(page).getByText(fill(allergens.blankRemoved, { position: 1 }), {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(savedStatus(page)).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
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
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// It types nothing, so nothing may be sent or said; the write guard is the
// proof that nothing was sent (D-118). Enter commits the price, the
// calories (D-167), and the note, which are one line; in the description
// Enter is a line break, so it is only left, with Tab.
test("Tab through the unchanged description, Enter in the unchanged price, calories, and note send nothing and say nothing", async ({
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
  await expect(caloriesField(page), "the calories come next").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(caloriesField(page)).toBeFocused();
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
  await expectNoMissingIds(page);
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
  await expectNoMissingIds(page);
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
  await expect(
    page.locator('main p a[href*="/dishes/"]'),
    "no next-dish link; the page nav's links lead to this dish's pages",
  ).toHaveCount(0);
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
  const { withSections, withDishes, sectionsInRestaurant } = ownerFixture();
  await openDish(page, "sizes");
  const select = moveSelect(page);
  await expect(select).toHaveCount(1);
  await expect(select).toContainText(strings.move.placeholder);
  await select.focus();
  await page.keyboard.press("Enter");
  const options = page.getByRole("option");
  // Every live section of the restaurant, Drinks' included, less the
  // dish's own.
  await expect(options).toHaveCount(sectionsInRestaurant - 1);
  await expect(options.filter({ hasText: withDishes.name })).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: withSections.name, exact: true }),
    "the sections sit under their menu's name",
  ).toHaveCount(1);
  await expectNoMissingIds(page);
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
  await expectNoMissingIds(page);
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
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

// D-223, D-229: the three pages that save by one press. Each ends in one
// Save named for the page, a submit button never disabled, after a lead
// under the h1 that says the page saves when it is pressed; none shows the
// status region the pages that save as the owner goes show.
test("each page that saves by a press has one Save named for the page, a submit button never disabled and last in its form, a lead that says so, and no status region", async ({
  page,
}) => {
  const pages = [
    { which: "sizes", at: "allergens", submit: allergens.submit },
    { which: "one", at: "tags", submit: tags.submit },
    { which: "sizes", at: "availability", submit: availability.submit },
  ] as const;
  for (const { which, at, submit } of pages) {
    await openDish(page, which, at);
    const main = page.locator("main");
    const save = saveButton(page, submit);
    await expect(save, `${at}: one Save`).toHaveCount(1);
    await expect(save).toHaveAttribute("type", "submit");
    await expect(save).toBeEnabled();
    await expect(save).not.toHaveAttribute("aria-disabled");
    const formOf = main.locator("form").filter({ has: save });
    await expect(formOf, `${at}: Save sits in the page's one form`).toHaveCount(
      1,
    );
    await expect(main.locator("form")).toHaveCount(1);
    await expect(
      formOf.getByRole("button").last(),
      `${at}: Save is the form's last button`,
    ).toHaveAccessibleName(submit);
    await expectInOrder(
      [main.locator("h1"), leadLine(page, submit), save],
      `${at}: the h1, the lead, then Save`,
    );
    await expect(savedStatus(page), `${at}: no status region`).toHaveCount(0);
    await expect(summary(page), `${at}: no summary at rest`).toHaveCount(0);
  }
});

// Primer's rule for a Save the browser refuses (D-229): three or more
// problems focus the summary, whose links lead to each field in field
// order; fewer focus the first field at fault. Nothing is sent: no
// expectWrites, so the guard is the proof. A blank row is dropped, never a
// problem (Michael, November 9, 2026). The fields here save nothing when
// they are left, so the gate types into them (D-115, refined).
test("Save allergens with a name that means one of the nine, a name with a comma, and a name that runs long sends nothing and focuses the summary, whose links lead to each field in order; one problem alone focuses its field", async ({
  page,
}) => {
  await openDish(page, "market", "allergens");
  const names = ["Milk", "nuts, except almonds", "x".repeat(41)];
  for (const [index, name] of names.entries()) {
    await addOtherButton(page).click();
    const field = otherField(page, index + 1);
    await expect(field).toBeFocused();
    await field.fill(name);
    // Leaving the field closes any suggestion list React Aria opened.
    await page.keyboard.press("Tab");
  }
  await saveButton(page, allergens.submit).click();
  const box = summary(page);
  await expect(box, "the summary takes focus").toBeFocused();
  await expect(
    box.getByRole("heading", { level: 2 }),
    "named by its heading",
  ).toHaveText(form.summary);
  const links = summaryLinks(page);
  await expect(links).toHaveText([
    fill(allergens.errors.otherMajor, { allergen: allergens.names.milk }),
    allergens.errors.otherComma,
    allergens.errors.otherLength,
  ]);
  for (const index of names.keys()) {
    const field = otherField(page, index + 1);
    const id = await field.getAttribute("id");
    await expect(links.nth(index)).toHaveAttribute("href", `#${id}`);
    await expect(field).toHaveAttribute("aria-invalid", "true");
  }
  await expect(
    otherRows(page).nth(1).getByText(allergens.errors.otherComma, {
      exact: true,
    }),
    "each problem stands under its field too",
  ).toHaveCount(1);
  await links.nth(1).click();
  await expect(otherField(page, 2), "a link focuses its field").toBeFocused();
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  // The last two rows removed, each by the name typed in it, which names
  // its row's controls as the form holds it: one problem, so its field is
  // focused and there is no summary.
  for (const name of [names[2], names[1]]) {
    await page
      .getByRole("button", {
        name: otherAction(allergens, allergens.removeOther, name ?? ""),
        exact: true,
      })
      .click();
  }
  await expect(otherRows(page)).toHaveCount(1);
  await saveButton(page, allergens.submit).click();
  await expect(otherField(page, 1), "the one field at fault").toBeFocused();
  await expect(otherField(page, 1)).toHaveAttribute("aria-invalid", "true");
  await expect(summary(page)).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("Save availability with Starts at 4, First day soon, and Last day later sends nothing and focuses the summary with a link per problem in field order; Starts alone focuses Starts; a week with no day focuses the week's box", async ({
  page,
}) => {
  await openDish(page, "one", "availability");
  const starts = scheduleField(page, schedule.starts);
  const ends = scheduleField(page, schedule.ends);
  const first = scheduleField(page, schedule.firstDay);
  const last = scheduleField(page, schedule.lastDay);
  const save = saveButton(page, availability.submit);
  await starts.fill("4");
  await first.fill("soon");
  await last.fill("later");
  await save.click();
  await expect(summary(page), "the summary takes focus").toBeFocused();
  const links = summaryLinks(page);
  await expect(links).toHaveText([
    schedule.errors.timeAmPmStarts,
    schedule.errors.timePairEnds,
    schedule.errors.dateFormat,
    schedule.errors.dateFormat,
  ]);
  for (const [index, id] of [
    "dish-schedule-hours-open",
    "dish-schedule-hours-close",
    "dish-schedule-from",
    "dish-schedule-until",
  ].entries()) {
    await expect(links.nth(index)).toHaveAttribute("href", `#${id}`);
  }
  await expect(starts).toHaveAttribute("aria-invalid", "true");
  await expect(starts).toHaveAccessibleDescription(
    `${schedule.errors.timeAmPmStarts} ${schedule.hoursHint}`,
  );
  await expect(ends).toHaveAccessibleDescription(
    `${schedule.errors.timePairEnds} ${schedule.hoursHint}`,
  );
  await expect(first).toHaveAccessibleDescription(
    `${schedule.errors.dateFormat} ${schedule.dateHint}`,
  );
  await links.nth(2).click();
  await expect(first, "a link focuses its field").toBeFocused();
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  // Two problems, the pair's: the first field at fault is focused.
  await first.fill("");
  await last.fill("");
  await save.click();
  await expect(starts, "Starts, the first field at fault").toBeFocused();
  await expect(summary(page)).toHaveCount(0);
  await expect(ends).toHaveAttribute("aria-invalid", "true");
  await expect(first).not.toHaveAttribute("aria-invalid");

  // A week says which of the month's Mondays, so with no day it is one
  // problem, on the week's box: its wrapper takes the focus and hands it
  // to the box. The tick is kept.
  await starts.fill("");
  await page.getByText(schedule.weeks.first, { exact: true }).click();
  await expect(box(page, schedule.weeks.first)).toBeChecked();
  await save.click();
  await expect(box(page, schedule.weeks.first)).toBeFocused();
  await expect(
    box(page, schedule.weeks.first),
    "the tick is kept",
  ).toBeChecked();
  await expect(box(page, schedule.weeks.first)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(box(page, schedule.weeks.first)).toHaveAccessibleDescription(
    schedule.errors.weeksNeedDay,
  );
  await expect(summary(page)).toHaveCount(0);
  await expect(starts).not.toHaveAttribute("aria-invalid");
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// A Save that lands loads the page again with the flash (D-219, D-229),
// here from the cookie the save leaves, since the gate never lands a save
// (D-108). The same arrival as Details' (D-214 to D-216), with the
// breadcrumb between the banner and the h1 (D-222): first in main, before
// the breadcrumb and the h1. Dismiss sends focus to the h1 (D-214), which
// carries the page's heading id (D-225).
test(
  "after a save, Allergens arrives with the success banner first in main, before the breadcrumb and the h1, its dismiss button focused by the served autofocus; Enter on it focuses the h1; and a reload shows no banner",
  { tag: "@saved-banner" },
  async ({ page }) => {
    const path = dishPath("sizes", "allergens");
    await setNotice(page, "allergens-saved", path);
    const response = await open(page, path);
    const { banner, dismiss } = await expectFlashArrival(page, response, {
      kind: "success",
      words: allergens.saved,
    });
    const h1 = page.locator("main h1");
    await expect(h1).toHaveText(allergens.heading);
    await expectInOrder(
      [banner, breadcrumb(page), h1],
      "the banner, the breadcrumb, then the h1",
    );
    await expect(h1).toHaveAttribute(
      "id",
      dishPageHeadingId("allergens") ?? "",
    );
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);

    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(banner).toHaveCount(0);
    await expect(h1, "Dismiss sends focus to the h1").toBeFocused();
    await expectNoMissingIds(page);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(h1).toHaveText(allergens.heading);
    await expect(
      flashBanner(page, "success"),
      "a reload shows no banner",
    ).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  },
);

// The leave rule (D-229): an owner link pressed while the page holds
// unsaved changes asks first, in the one dialog (D-119, D-221), named by
// its question, with focus on Keep editing after the wait (D-136). Keep
// editing returns focus to the link with the change kept; Leave goes. Back
// and forward are not asked (Michael, November 9, 2026). Nothing is
// asked on a page that saves as the owner goes.
test(
  "a page nav link pressed with unsaved changes asks first in a dialog named by its question, focus on Keep editing; Keep editing returns focus to the link with the change kept; Leave goes to the page",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const { dishes } = ownerFixture();
    const vegan = en.dietary.names.vegan;
    await openDish(page, "one", "tags");
    await stopClock(page);
    await page.getByText(vegan, { exact: true }).click();
    await expect(box(page, vegan)).toBeChecked();
    const general = pageNav(page, dishes.one.name).getByRole("link", {
      name: strings.pages.general,
      exact: true,
    });
    await general.focus();
    await page.keyboard.press("Enter");
    const dialog = leaveDialog(page);
    await expect(dialog, "an alert dialog named by its question").toHaveCount(
      1,
    );
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      form.leave.question,
    );
    await expect(dialog).toHaveAccessibleDescription(form.leave.note);
    // React Aria makes the page behind inert, which Playwright's role
    // engine does not read as hidden.
    expect(
      await page
        .locator("main")
        .evaluate((main) => main.closest("[inert]") !== null),
      "the page behind is inert",
    ).toBe(true);
    expect(pathOf(page), "nothing moved").toBe(dishPath("one", "tags"));
    const keep = dialog.getByRole("button", {
      name: form.leave.keep,
      exact: true,
    });
    const leave = dialog.getByRole("button", {
      name: form.leave.leave,
      exact: true,
    });
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
    await expect(keep, "focus moves to Keep editing (D-136)").toBeFocused();
    await expectNoMissingIds(page);

    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(
      general,
      "Keep editing returns focus to the link",
    ).toBeFocused();
    expect(pathOf(page)).toBe(dishPath("one", "tags"));
    await expect(box(page, vegan), "the change is kept").toBeChecked();

    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(1);
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
    await expect(keep).toBeFocused();
    // Axe runs on timers, so the clock runs again for its reading of the
    // open dialog.
    await page.clock.resume();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Tab");
    await expect(leave).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${escape(dishPath("one"))}$`));
    await expect(page.locator("main h1")).toHaveText(dishes.one.name);
    await expect(leaveDialog(page)).toHaveCount(0);
  },
);

test(
  "the dialog's Leave takes no pointer press for half a second after it opens, Escape keeps, and after the wait a pointer press on Leave goes to the dashboard",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const vegan = en.dietary.names.vegan;
    await openDish(page, "one", "tags");
    await stopClock(page);
    await page.getByText(vegan, { exact: true }).click();
    await expect(box(page, vegan)).toBeChecked();
    const site = page.getByRole("link", { name: en.site.name, exact: true });
    await site.click();
    const dialog = leaveDialog(page);
    await expect(dialog).toHaveCount(1);
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
    const leave = dialog.getByRole("button", {
      name: form.leave.leave,
      exact: true,
    });
    await leave.click();
    await expect(
      dialog,
      "a pointer press inside the guard does nothing (D-119)",
    ).toHaveCount(1);
    expect(pathOf(page)).toBe(dishPath("one", "tags"));

    await page.keyboard.press("Escape");
    await expect(dialog, "Escape keeps").toHaveCount(0);
    expect(pathOf(page)).toBe(dishPath("one", "tags"));
    await expect(box(page, vegan)).toBeChecked();

    await site.click();
    await expect(dialog).toHaveCount(1);
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS + CONFIRM_GUARD_MS);
    await leave.click();
    await page.clock.resume();
    await expect(page).toHaveURL(new RegExp(`${escape(dashboardPath)}$`));
  },
);

// While a submit is on its way the link holds without asking (Michael,
// November 9, 2026): a save that lands loads the page again, one that
// fails keeps the page with the summary focused, and only then does the
// link ask.
test(
  "while a save is on its way a page nav link holds without a dialog and nothing moves; once the save fails the page stays with the summary focused and the change kept, and the link asks",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const writes = expectWrites(page, { hold: true });
    const { dishes } = ownerFixture();
    const vegan = en.dietary.names.vegan;
    await openDish(page, "one", "tags");
    await stopClock(page);
    await page.getByText(vegan, { exact: true }).click();
    await expect(box(page, vegan)).toBeChecked();
    const save = saveButton(page, tags.submit);
    await save.click();
    await expect(save, "the press is held (D-209)").toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect.poll(() => writes.answered.length).toBe(1);

    const general = pageNav(page, dishes.one.name).getByRole("link", {
      name: strings.pages.general,
      exact: true,
    });
    await general.focus();
    await page.keyboard.press("Enter");
    await expect(
      leaveDialog(page),
      "no dialog while the save is on its way",
    ).toHaveCount(0);
    expect(pathOf(page), "nothing moved").toBe(dishPath("one", "tags"));
    await page.clock.runFor(2000);
    expect(pathOf(page), "and nothing moves later").toBe(
      dishPath("one", "tags"),
    );

    writes.release();
    const failure = `${fill(tags.notSaved, { dish: dishes.one.name })} ${editing.problems.outOfDate}`;
    await expect(summary(page).getByText(failure, { exact: true })).toHaveCount(
      1,
    );
    await expect(summary(page), "the summary takes focus").toBeFocused();
    await expect(box(page, vegan), "the change is kept").toBeChecked();
    await expect(save).not.toHaveAttribute("aria-disabled");
    expect(pathOf(page)).toBe(dishPath("one", "tags"));

    await general.focus();
    await page.keyboard.press("Enter");
    await expect(
      leaveDialog(page),
      "with the save answered, the link asks",
    ).toHaveCount(1);
    // Axe runs on timers, so the clock runs again for its reading.
    await page.clock.resume();
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
  },
);

// The browser's own warning on a full unload (D-229): armed only while the
// page holds unsaved changes, so the flash a landed save brings never
// trips it. A synthetic beforeunload in the page tells whether a handler
// cancelled it.
test("the browser's leave warning is armed only while the page holds unsaved changes", async ({
  page,
}) => {
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market", "tags");
  const armed = () =>
    page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
  expect(await armed(), "clean: not armed").toBe(false);
  await page.getByText(vegan, { exact: true }).click();
  await expect(box(page, vegan)).toBeChecked();
  expect(await armed(), "a tick: armed").toBe(true);
  await page.getByText(vegan, { exact: true }).click();
  await expect(box(page, vegan)).not.toBeChecked();
  expect(await armed(), "back as saved: not armed").toBe(false);

  // An added row that holds nothing is not a change (D-229): the warning
  // arms once a name is typed.
  await openDish(page, "market", "allergens");
  expect(await armed(), "allergens clean: not armed").toBe(false);
  await addOtherButton(page).click();
  await expect(otherRows(page)).toHaveCount(1);
  expect(await armed(), "a blank row: not armed").toBe(false);
  await otherField(page, 1).fill("Celery");
  expect(await armed(), "a name typed: armed").toBe(true);
});

// General's price choice settles before it saves (D-229): a round of
// arrows sends one write, half a second after the last, carrying the last
// choice; a round that ends on the saved choice sends nothing and says
// nothing. On the page's clock, stopped, so the half second is exact.
test("a price choice saves once it has settled: arrows back to the saved choice send nothing and say nothing; arrows through two choices send one write carrying the last, said once when it cannot land; arrows back after that say All changes saved once", async ({
  page,
}) => {
  await page.clock.install();
  const writes = expectWrites(page);
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") bodies.push(request.postData() ?? "");
  });
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  await hearLog(page);
  await stopClock(page);

  // Three arrows end on the saved choice: no write, nothing said.
  await radio(page, strings.price.one).focus();
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(radio(page, strings.price.one)).toBeChecked();
  await page.clock.runFor(SETTLE_MS + 1);
  expect(
    writes.attempted.length,
    "a round back on the saved choice sends nothing",
  ).toBe(0);
  expect((await heard(page)).length, "and says nothing").toBe(0);

  // Two arrows end on Market price: one write, half a second after the
  // last, carrying the last choice.
  await radio(page, strings.price.one).focus();
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, strings.price.sizes)).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, strings.price.market)).toBeChecked();
  await page.clock.runFor(SETTLE_MS - 1);
  expect(
    writes.attempted.length,
    "nothing is sent before the choice settles",
  ).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(() => writes.attempted.length).toBe(1);
  expect(bodies.at(-1), "the write carries the last choice").toContain(
    "market",
  );
  const failure = `${fill(strings.notSaved.priceKind, {
    dish: dishes.one.name,
  })} ${editing.problems.outOfDate}`;
  await expect(savedStatus(page)).toHaveText(failure);
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(
    radio(page, strings.price.one),
    "the saved choice is back",
  ).toBeChecked();

  // Three arrows back on the saved choice after the failure: nothing sent,
  // the failure cleared, and coming back to saved said once (D-118).
  const heardBefore = (await heard(page)).length;
  await radio(page, strings.price.one).focus();
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(radio(page, strings.price.one)).toBeChecked();
  await page.clock.runFor(SETTLE_MS + 1);
  expect(writes.attempted.length, "nothing more is sent").toBe(1);
  await expect(savedStatus(page)).toHaveText(editing.saved);
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  expect((await heard(page)).length, "one more thing said").toBe(
    heardBefore + 1,
  );
  // Axe runs on timers, so the clock runs again for its reading.
  await page.clock.resume();
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});
