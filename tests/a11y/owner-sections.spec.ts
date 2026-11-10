import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { open, pageChecks } from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { breadcrumbMarks, menuControls } from "./owner-controls";
import { listRowChecks } from "./owner-lists";
import { expectInOrder, pageNav } from "./page-nav";
import { restaurantName } from "./pages";
import { guardWrites } from "./write-guard";

// A menu's own page and its sections, signed in as the test owner (D-100),
// on the sections the data file gave the test restaurant (D-126): one menu
// with at least three, one with none. The gate never writes and never types
// into a field that saves (D-108, D-111, D-115): every test here runs
// behind the write guard. The row tests every list shares run from
// listRowChecks in owner-lists.ts, the delete confirmation's included; its
// clock tests run on the menus page, since the dialog is one piece for
// every list. This file holds what is a menu's page's own. Typing, real
// saves and the "Saved." they say (D-118), add, a delete that lands, and a
// name that is taken are covered by the unit tests and by hand. Which
// section holds dishes and which holds none comes from the setup.
//
// A menu's page is named by its id, which the setup finds and writes down,
// so every path here is read when a test runs, never when this file loads.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const strings = en.owner.sections;
const nav = en.owner.restaurants.nav;

guardWrites();

function sectionsPath(): string {
  return restaurantMenuPath(code, ownerFixture().withSections.id);
}

function emptyPath(): string {
  return restaurantMenuPath(code, ownerFixture().empty.id);
}

const checks = { controls: menuControls, marks: breadcrumbMarks };

test.describe("a menu's page, with sections", () => {
  pageChecks(sectionsPath, { ...checks, snapshot: "menus-with-sections" });
});

test.describe("a menu's page, with no sections", () => {
  pageChecks(emptyPath, { ...checks, snapshot: "menus-empty" });
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

listRowChecks({
  noun: "section",
  plural: "sections",
  words: strings,
  path: sectionsPath,
  h1: () => ownerFixture().withSections.name,
  // The name field and Move up, Move down, and Delete; the add field and
  // Add. Publish and Unpublish are on the menu's Publishing page (D-224).
  // A section's note is on its own page (D-135), so its row is the row
  // every list has.
  rowControls: 4,
  pageControls: 2,
  rowLink: {
    label: strings.editDishes,
    target: () => {
      const { withDishes } = ownerFixture();
      return {
        name: withDishes.name,
        path: restaurantSectionPath(code, withDishes.id),
      };
    },
  },
  leaveLink: (page) => menusCrumb(page),
  empty: { path: emptyPath, h1: () => ownerFixture().empty.name },
  notFound: [
    restaurantMenuPath(code, "not-a-menu"),
    restaurantMenuPath(code, "00000000-0000-4000-8000-000000000000"),
  ],
  deletes: {
    asking: () => {
      const { withDishes } = ownerFixture();
      return {
        name: withDishes.name,
        question: deleteQuestion(withDishes.name, withDishes.dishes),
      };
    },
    // A section that holds nothing asks by its name alone (D-221).
    empty: () => {
      const { emptySection } = ownerFixture();
      return {
        name: emptySection.name,
        question: fill(strings.deleteAskEmpty, { section: emptySection.name }),
      };
    },
  },
});

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

// A menu's Sections page (D-224): the menu's own address, named for the
// menu as it has always been, now the first of the menu's two pages. The
// page nav, named by the menu, marks Sections as the current page; the
// breadcrumb above the h1 still ends with the menu as text. What the nav's
// two links are named, where they lead, and the layout are checked on both
// pages in owner-publishing.spec.ts.
test("a menu's Sections page is named for its menu, the nav marks Menus as the part it sits in, the breadcrumb is the way back, and the page nav marks Sections", async ({
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
  const current = page.locator('a[aria-current="page"]');
  await expect(
    current,
    "one link says it is the current page, the page nav's Sections",
  ).toHaveCount(1);
  await expect(current).toHaveText(en.owner.menuPages.sections);
  await expect(
    pageNav(page, withSections.name).locator('a[aria-current="page"]'),
    "and it is in the page nav",
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", {
      name: en.owner.publishing.heading,
      exact: true,
    }),
    "the Publishing group has left this page",
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: en.owner.publishing.publish,
      exact: true,
    }),
  ).toHaveCount(0);
  await expectInOrder(
    [
      breadcrumb(page),
      page.locator("main h1"),
      pageNav(page, withSections.name),
      page.locator("main").getByText(strings.lead, { exact: true }),
    ],
    "the breadcrumb, the h1, the page nav, then the lead",
  );

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
