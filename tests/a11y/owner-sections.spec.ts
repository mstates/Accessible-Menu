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
// saves and the "Saved." they say (D-118), add, a delete that lands, Undo
// with something to undo, and a name that is taken are covered by the unit
// tests and by hand. Which section holds dishes and
// which holds none comes from the setup.
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
  pageChecks(sectionsPath, checks);
});

test.describe("a menu's page, with no sections", () => {
  pageChecks(emptyPath, checks);
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
  // The name field and Move up, Move down, and Delete; the add field, Add,
  // and Undo, and, above them, Publish and Unpublish, since the menu with
  // sections is published (D-82, migration 12). A section's note is on its
  // own page (D-135), so its row is the row every list has.
  rowControls: 4,
  pageControls: 5,
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
    empty: () => ownerFixture().emptySection.name,
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
