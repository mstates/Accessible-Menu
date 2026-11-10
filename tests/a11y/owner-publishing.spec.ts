import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  menuPageHeadingId,
  menuPageState,
  menuPageStateLine,
} from "../../src/features/owner/menu/menu-pages";
import {
  dashboardPath,
  restaurantDishPagePath,
  restaurantMenuPagePath,
  restaurantMenuPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import {
  expectForcedEdge,
  expectNoAxeViolations,
  expectNoMissingIds,
  expectRootAtLargest,
  open,
  pageChecks,
  setLargestText,
} from "./checks";
import {
  bannerMarks,
  breadcrumbMarks,
  landedMenuPublishingControls,
  menuPublishingControls,
} from "./owner-controls";
import { ownerEnv, ownerFixture } from "./owner-env";
import { expectInOrder, expectLayout, pageNav } from "./page-nav";
import { restaurantName } from "./pages";
import { expectFlashArrival, flashBanner, setNotice } from "./saved-banner";
import { expectWrites, guardWrites } from "./write-guard";

// A menu's two pages (D-224) and its Publishing page, signed in as the test
// owner (D-100), on the menus the data file gave the test restaurant
// (D-126): the menu with sections is published with nothing changed, and
// the empty one is not published and has no dishes, set by the data file
// through publish_menu(), since the gate never writes (D-115). What is
// checked here: the page nav on both pages of both menus; the Publishing
// page's name, order, and headings; the review in the two states the data
// holds, the allergen lists not confirmed with a link that lands, and what
// Publish waits on (D-177); the flash a landed press brings, from the
// cookie it leaves (D-231); what a press does when it cannot land; the hold
// while a press is on its way; and the layout. The review of a menu with
// changes, and the presses that land, run in tests/local against the
// stand-in, where a write lands; the compare is pinned in the unit tests.
// The arrival pass for the Sections page runs from owner-sections.spec.ts.

const { code } = ownerEnv();
const strings = en.owner.publishing;
const pages = en.owner.menuPages;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;
const menusPath = restaurantMenusPath(code);

guardWrites();

type Menu = { id: string; name: string };

function sectionsPath(menu: Menu): string {
  return restaurantMenuPath(code, menu.id);
}

function publishingPath(menu: Menu): string {
  return restaurantMenuPagePath(code, menu.id, "publishing");
}

const dinner = () => ownerFixture().withSections;
const lunch = () => ownerFixture().empty;

test.describe("a published menu's Publishing page", () => {
  pageChecks(() => publishingPath(dinner()), {
    controls: (page) => menuPublishingControls(page, dinner().name),
    marks: breadcrumbMarks,
    snapshot: "menus-with-sections-publishing",
  });
});

test.describe("an unpublished menu's Publishing page", () => {
  pageChecks(() => publishingPath(lunch()), {
    controls: (page) => menuPublishingControls(page, lunch().name),
    marks: breadcrumbMarks,
    snapshot: "menus-empty-publishing",
  });
});

// A press that lands loads the page again with the flash (D-219, D-231),
// here from the cookie the press leaves, since the gate never lands one
// (D-108): Publish on the published menu, Unpublish on the one that is not
// published, so each page says what its flash says.
test.describe("a menu's Publishing page after Publish", () => {
  pageChecks(() => publishingPath(dinner()), {
    controls: (page) => landedMenuPublishingControls(page, dinner().name),
    marks: [...breadcrumbMarks, ...bannerMarks],
    snapshot: "menus-with-sections-publishing-published",
    prepare: (page) =>
      setNotice(page, "menu-published", publishingPath(dinner())),
  });
});

test.describe("a menu's Publishing page after Unpublish", () => {
  pageChecks(() => publishingPath(lunch()), {
    controls: (page) => landedMenuPublishingControls(page, lunch().name),
    marks: [...breadcrumbMarks, ...bannerMarks],
    snapshot: "menus-empty-publishing-unpublished",
    prepare: (page) =>
      setNotice(page, "menu-unpublished", publishingPath(lunch())),
  });
});

function main(page: Page) {
  return page.locator("main");
}

function button(page: Page, name: string) {
  return main(page).getByRole("button", { name, exact: true });
}

function breadcrumb(page: Page) {
  return main(page).getByRole("navigation", {
    name: en.ui.breadcrumb,
    exact: true,
  });
}

// The summary a refused press focuses (D-229's shape, D-231): a box named
// by its heading, with the failure sentence.
function summary(page: Page) {
  return page.locator('main [tabindex="-1"]').filter({
    has: page.getByRole("heading", {
      level: 2,
      name: strings.problemHeading,
      exact: true,
    }),
  });
}

// The hint a button is described by, read through the ids it points at.
async function describedBy(page: Page, name: string): Promise<string> {
  return button(page, name).evaluate((element) =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" "),
  );
}

// The page's headings, in order, with their levels.
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
  `h2 ${strings.review.heading}`,
  `h2 ${strings.unconfirmed.heading}`,
  `h2 ${strings.actionsHeading}`,
];

// What the nav's Publishing link reads after its name, from the states the
// setup read through menu_publish_states() (D-170).
function stateLine(menu: Menu): string {
  const state = ownerFixture().states.find((entry) => entry.id === menu.id);
  if (!state) throw new Error(`the setup read no state for ${menu.name}`);
  return (
    menuPageStateLine("publishing", menuPageState(state), pages) ??
    "the Publishing page has a state line"
  );
}

// The page nav on one of a menu's pages: one nav named by the menu's name
// alone, two links in D-224's order, Sections with no state and Publishing
// named by its page then its state, each leading to its page, the current
// page's marked and no other.
async function expectMenuNav(
  page: Page,
  menu: Menu,
  current: "sections" | "publishing",
) {
  const list = pageNav(page, menu.name);
  await expect(list).toHaveCount(1);
  await expect(
    list,
    "named by the menu's name alone, with no label of its own",
  ).toHaveAttribute("aria-label", menu.name);
  const links = list.getByRole("link");
  await expect(links).toHaveCount(2);
  const expected = [
    { name: pages.sections, href: sectionsPath(menu), at: "sections" },
    {
      name: `${strings.heading} ${stateLine(menu)}`,
      href: publishingPath(menu),
      at: "publishing",
    },
  ];
  for (const [index, item] of expected.entries()) {
    const link = links.nth(index);
    await expect(
      link,
      `link ${index + 1} is named by its page, then its state`,
    ).toHaveAccessibleName(item.name);
    await expect(link).toHaveAttribute("href", item.href);
    if (item.at === current) {
      await expect(link).toHaveAttribute("aria-current", "page");
    } else {
      await expect(link).not.toHaveAttribute("aria-current");
    }
  }
  await expect(
    page.locator('a[aria-current="page"]'),
    "one link on the page says it is the current page",
  ).toHaveCount(1);
}

test("a menu's page nav is named by the menu and holds Sections, then Publishing with its state, on both pages of both menus, the current page's marked", async ({
  page,
}) => {
  expect(stateLine(dinner()), "the published menu's line").not.toBe(
    pages.state.notPublished,
  );
  expect(stateLine(lunch()), "the unpublished menu's line").toBe(
    pages.state.notPublished,
  );
  for (const menu of [dinner(), lunch()]) {
    await open(page, sectionsPath(menu));
    await expectMenuNav(page, menu, "sections");
    await open(page, publishingPath(menu));
    await expectMenuNav(page, menu, "publishing");
  }
});

test("Publishing is named for the page: its title names the page first, the breadcrumb is links only and ends with the menu, the h1 carries the page's id, and it reads breadcrumb, h1, page nav, state sentence, with What changed, Allergens, and Publish under them", async ({
  page,
}) => {
  const menu = dinner();
  await open(page, publishingPath(menu));
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(
    pageTitle(en, strings.heading, name, [menu.name]),
  );
  const h1 = main(page).locator("h1");
  await expect(h1).toHaveText(strings.heading);
  await expect(h1).toHaveAttribute("id", menuPageHeadingId("publishing") ?? "");

  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  const marked = restaurantNav.locator("a[aria-current]");
  await expect(marked).toHaveCount(1);
  await expect(
    marked,
    "Menus is the current part of the nav, not the current page",
  ).toHaveAttribute("aria-current", "true");
  await expect(marked).toHaveText(nav.menus);

  const crumbs = breadcrumb(page).getByRole("link");
  await expect(crumbs, "two levels above the page").toHaveCount(2);
  await expect(crumbs.nth(0)).toHaveText(nav.menus);
  await expect(crumbs.nth(0)).toHaveAttribute("href", menusPath);
  await expect(crumbs.nth(1)).toHaveText(menu.name);
  await expect(crumbs.nth(1)).toHaveAttribute("href", sectionsPath(menu));
  await expect(
    breadcrumb(page).locator("[aria-current]"),
    "a breadcrumb only goes up; the page nav marks the page",
  ).toHaveCount(0);
  await expect(breadcrumb(page).locator("ol > li")).toHaveCount(2);

  await expectMenuNav(page, menu, "publishing");
  await expectInOrder(
    [
      breadcrumb(page),
      h1,
      pageNav(page, menu.name),
      main(page).getByText(/^Published on /),
      main(page).getByRole("heading", {
        level: 2,
        name: strings.review.heading,
        exact: true,
      }),
      main(page).getByRole("heading", {
        level: 2,
        name: strings.unconfirmed.heading,
        exact: true,
      }),
      main(page).getByRole("heading", {
        level: 2,
        name: strings.actionsHeading,
        exact: true,
      }),
      button(page, strings.publish),
    ],
    "the breadcrumb, the h1, the page nav, the state sentence, then each area under its heading, Publish last",
  );
  expect(
    await headings(page),
    "the first group sits under the h1 with no heading of its own (D-226), and each later area has an h2",
  ).toEqual(pageHeadings);
  await expect(
    main(page).getByRole("region"),
    "the areas are headings with content, not landmarks",
  ).toHaveCount(0);
});

test("a published menu's Publishing page says when it was published, reads the review as menu_publish_states() says, lists the dishes not confirmed with a link that lands on Allergens, and shows Publish and Unpublish with their hints", async ({
  page,
}) => {
  const { withSections, withDishes, dishes, states } = ownerFixture();
  const state = states.find((entry) => entry.id === withSections.id);
  expect(state?.published, "the menu with sections is published").toBe(true);
  await open(page, publishingPath(withSections));
  await page.waitForLoadState("networkidle");

  // SQL's flag, read by the setup, against the compare the page made of the
  // two documents: they say the same thing.
  if (state?.changed) {
    await expect(
      main(page).getByText(
        /^Published on .+\. Changes since then are not published yet\.$/,
      ),
    ).toBeVisible();
    await expect(main(page).getByText(strings.review.none)).toHaveCount(0);
  } else {
    await expect(
      main(page).getByText(/^Published on .+\. Nothing has changed since\.$/),
    ).toBeVisible();
    await expect(
      main(page).getByText(strings.review.none, { exact: true }),
      "nothing changed, so the review says so in one sentence",
    ).toBeVisible();
  }

  // The allergen lists not confirmed: a lead that says what the list is,
  // then that the menu can still be published, then the sentence diners
  // read; and each dish by its name and its section, a link to its
  // Allergens page. The data file leaves the market-price dish unchecked.
  await expect(
    main(page).getByText(
      fill(strings.unconfirmed.lead, {
        sentence: `"${en.allergens.notConfirmed}"`,
      }),
      { exact: true },
    ),
  ).toBeVisible();
  const unconfirmed = main(page).getByRole("link", {
    name: fill(strings.unconfirmed.dish, {
      dish: dishes.market.name,
      section: withDishes.name,
    }),
    exact: true,
  });
  await expect(unconfirmed).toHaveCount(1);
  const allergensPath = restaurantDishPagePath(
    code,
    dishes.market.id,
    "allergens",
  );
  await expect(unconfirmed).toHaveAttribute("href", allergensPath);
  const listed = await main(page)
    .locator("ul:not(nav ul) a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(listed.length, "every dish not confirmed is listed").toBeGreaterThan(
    0,
  );
  for (const href of listed) {
    expect(href, "each leads to the page where its check is").toMatch(
      /\/(dishes\/[0-9a-f-]{36}\/allergens|choices\/[0-9a-f-]{36})$/,
    );
  }

  await expect(main(page).getByText(strings.waitingLead)).toHaveCount(0);
  await expect(button(page, strings.publish)).toBeVisible();
  await expect(button(page, strings.unpublish)).toBeVisible();
  expect(await describedBy(page, strings.publish)).toBe(strings.publishHint);
  expect(await describedBy(page, strings.unpublish)).toBe(
    strings.unpublishHint,
  );
  await expect(
    main(page).locator('[role="status"], [role="log"], [role="alert"]'),
    "the page has no status, no log, and no alert of its own",
  ).toHaveCount(0);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await unconfirmed.click();
  await page.waitForURL(`**${allergensPath}`);
  await expect(main(page).locator("h1")).toHaveText(
    en.owner.dish.allergens.heading,
  );
});

test("an unpublished menu with no dishes says so, says what a first Publish would show, never that its allergens are confirmed, names the menu as what Publish waits on with a link to its Sections, and shows Publish alone (D-177)", async ({
  page,
}) => {
  const menu = lunch();
  await open(page, publishingPath(menu));
  await page.waitForLoadState("networkidle");
  await expect(
    main(page).getByText(strings.state.notPublished, { exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByText(strings.review.firstEmpty, { exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByText(strings.unconfirmed.noDishes, { exact: true }),
    "a menu with no dishes never reads as all confirmed",
  ).toBeVisible();
  await expect(main(page).getByText(strings.unconfirmed.allDishes)).toHaveCount(
    0,
  );
  await expect(
    main(page).getByText(strings.waitingLead, { exact: true }),
  ).toBeVisible();
  const waiting = main(page).locator("ul:not(nav ul)").getByRole("link");
  await expect(waiting).toHaveText([
    fill(strings.problems.noDishes, { menu: menu.name }),
  ]);
  await expect(
    waiting,
    "what Publish waits on leads to the page that fixes it",
  ).toHaveAttribute("href", sectionsPath(menu));
  await expect(button(page, strings.publish)).toBeVisible();
  await expect(button(page, strings.unpublish)).toHaveCount(0);
  expect(await describedBy(page, strings.publish)).toBe(strings.publishHint);
  expect(await headings(page)).toEqual(pageHeadings);
  await expectInOrder(
    [
      main(page).getByText(strings.waitingLead, { exact: true }),
      waiting,
      button(page, strings.publish),
    ],
    "what Publish waits on is read on the way to the button",
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// The flash as it arrives (D-214 to D-216, D-219, D-231): the same arrival
// as a dish's form pages, with the breadcrumb between the banner and the h1
// (Q-156), its words naming the menu. Dismiss sends focus to the h1, which
// carries the page's heading id (D-225).
for (const landing of [
  {
    press: "Publish",
    notice: "menu-published",
    menu: dinner,
    words: strings.flash.published,
  },
  {
    press: "Unpublish",
    notice: "menu-unpublished",
    menu: lunch,
    words: strings.flash.unpublished,
  },
] as const) {
  test(
    `after ${landing.press}, Publishing arrives with the success banner first in main, before the breadcrumb and the h1, its words naming the menu and its dismiss button focused by the served autofocus; Enter on it focuses the h1; and a reload shows no banner`,
    { tag: "@saved-banner" },
    async ({ page }) => {
      const menu = landing.menu();
      const path = publishingPath(menu);
      await setNotice(page, landing.notice, path);
      const response = await open(page, path);
      const { banner, dismiss } = await expectFlashArrival(page, response, {
        kind: "success",
        words: fill(landing.words, { menu: menu.name }),
      });
      const h1 = main(page).locator("h1");
      await expect(h1).toHaveText(strings.heading);
      await expectInOrder(
        [banner, breadcrumb(page), h1],
        "the banner, the breadcrumb, then the h1",
      );
      await expect(h1).toHaveAttribute(
        "id",
        menuPageHeadingId("publishing") ?? "",
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
      await expect(h1).toHaveText(strings.heading);
      await expect(
        flashBanner(page, "success"),
        "a reload shows no banner",
      ).toHaveCount(0);
      await expect(main(page).getByRole("alert")).toHaveCount(0);
    },
  );
}

// A press that cannot land (Q-41, D-231): the write guard answers it inside
// the browser as an action the server does not know, so the page stays, the
// failure sits in the summary, and the summary takes focus. Focus is the
// announcement: no live region says it, and the page has no status and no
// log. Nothing reaches the server.
for (const refused of [
  {
    press: strings.publish,
    menu: lunch,
    not: strings.refused.notPublished,
  },
  {
    press: strings.unpublish,
    menu: dinner,
    not: strings.refused.notUnpublished,
  },
] as const) {
  test(`a ${refused.press} press the server does not know keeps the page and puts the failure in the summary, which takes focus, with no status, no log, and no alert`, async ({
    page,
  }) => {
    const menu = refused.menu();
    await open(page, publishingPath(menu));
    await page.waitForLoadState("networkidle");
    const state = await main(page)
      .locator("p")
      .first()
      .evaluate((first) => first.textContent ?? "");
    await expect(summary(page), "no summary at rest").toHaveCount(0);
    const writes = expectWrites(page);
    await button(page, refused.press).click();
    const sentence = `${fill(refused.not, { menu: menu.name })} ${editing.problems.outOfDate}`;
    await expect(
      summary(page).getByText(sentence, { exact: true }),
    ).toHaveCount(1);
    await expect(summary(page), "the summary takes focus").toBeFocused();
    expect(writes.answered, "one press, answered in the browser").toHaveLength(
      1,
    );
    await expect(
      main(page).locator('[role="status"], [role="log"], [role="alert"]'),
      "focus is the announcement: no live region",
    ).toHaveCount(0);
    await expect(flashBanner(page, "success")).toHaveCount(0);
    expect(
      await headings(page),
      "the summary's heading comes first after the h1",
    ).toEqual([
      pageHeadings[0],
      `h2 ${strings.problemHeading}`,
      ...pageHeadings.slice(1),
    ]);
    await expect(
      main(page).getByText(state, { exact: true }),
      "the page still says what it said",
    ).toBeVisible();
    await expect(
      button(page, refused.press),
      "the button is let go, to press again",
    ).not.toHaveAttribute("aria-disabled");
    expect(new URL(page.url()).pathname).toBe(publishingPath(menu));
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
  });
}

// The hold while a press is on its way (D-209, D-231): the pressed button
// is held at once and keeps focus, a second press on either button sends
// nothing, and an owner link holds with no dialog, since the press's
// result decides. Once the press fails the page stays, with the summary
// focused and the buttons let go.
test("while a Publish press is on its way the button is held and keeps focus, a second press and a press on Unpublish send nothing, and the nav's Sections link holds; once it fails the summary takes focus", async ({
  page,
}) => {
  const menu = dinner();
  const writes = expectWrites(page, { hold: true });
  await open(page, publishingPath(menu));
  await page.waitForLoadState("networkidle");
  const publish = button(page, strings.publish);
  const unpublish = button(page, strings.unpublish);
  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(publish, "the press is held at once (D-209)").toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(publish, "and keeps focus").toBeFocused();
  await expect.poll(() => writes.answered.length).toBe(1);

  await page.keyboard.press("Enter");
  await publish.click({ force: true });
  await unpublish.click({ force: true });
  const sections = pageNav(page, menu.name).getByRole("link", {
    name: pages.sections,
    exact: true,
  });
  await sections.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  expect(
    writes.answered,
    "no second press was sent, by Publish or by Unpublish",
  ).toHaveLength(1);
  expect(
    new URL(page.url()).pathname,
    "the link holds while the press is on its way",
  ).toBe(publishingPath(menu));
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(unpublish, "Unpublish is still there").toHaveCount(1);

  writes.release();
  const sentence = `${fill(strings.refused.notPublished, { menu: menu.name })} ${editing.problems.outOfDate}`;
  await expect(summary(page).getByText(sentence, { exact: true })).toHaveCount(
    1,
  );
  await expect(summary(page), "the summary takes focus").toBeFocused();
  await expect(publish).not.toHaveAttribute("aria-disabled");
  expect(new URL(page.url()).pathname).toBe(publishingPath(menu));
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

// D-222's layout on a menu's two pages, measured by expectLayout in
// page-nav.ts as on a dish's: the nav in a left column once main has 36rem
// of room, under the h1 below that, at the default and the largest text.
test(
  "on Sections and on Publishing the page nav sits left of the content once main has 36rem of room and under the h1 below that, at the default and the largest text",
  { tag: "@arrival" },
  async ({ page }) => {
    const menu = dinner();
    for (const path of [sectionsPath(menu), publishingPath(menu)]) {
      await open(page, path);
      await page.waitForLoadState("networkidle");
      await expectLayout(page, menu.name);
    }
    await setLargestText(page);
    for (const path of [sectionsPath(menu), publishingPath(menu)]) {
      await open(page, path);
      await page.waitForLoadState("networkidle");
      await expectRootAtLargest(page);
      await expectLayout(page, menu.name);
    }
  },
);

test(
  "in forced colors the menu's page nav keeps its bar on the current link and draws none on the other",
  { tag: "@forced" },
  async ({ page }) => {
    const menu = dinner();
    await open(page, publishingPath(menu));
    await page.waitForLoadState("networkidle");
    await expectForcedEdge(
      page,
      `main nav[aria-label="${menu.name}"] a[aria-current="page"]`,
      "left",
      4,
    );
    const others = pageNav(page, menu.name).locator("a:not([aria-current])");
    await expect(others).toHaveCount(1);
    const bars = await others.evaluateAll((links) =>
      links.map((link) => parseFloat(getComputedStyle(link).borderLeftWidth)),
    );
    expect(bars, "the other link draws no bar").toEqual([0]);
  },
);

test("the dashboard says which menus are published", async ({ page }) => {
  const { withSections, published } = ownerFixture();
  expect(published).toContain(withSections.name);
  const list = new Intl.ListFormat("en", { type: "conjunction" });
  await open(page, dashboardPath);
  await expect(
    page.getByText(
      fill(
        published.length === 1
          ? strings.summary.published.one
          : strings.summary.published.other,
        { names: list.format(published) },
      ),
      { exact: true },
    ),
  ).toBeVisible();
});
