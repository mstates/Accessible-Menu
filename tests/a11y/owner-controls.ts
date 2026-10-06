import type { Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { DAY_KEYS } from "../../src/domain/hours";
import type { Control, Mark } from "./checks";
import { listRows } from "./owner-lists";

// The links and buttons each owner page is expected to show, checked at
// every size by the arrival pass (D-137), and the drawn marks each is
// expected to show in forced colors. Names come from the copy and from the
// page itself: a list's rows are named by its saved names, and the
// dashboard's links by each restaurant's heading, so the lists follow the
// data file (D-126) without repeating it.

const strings = en.owner.restaurants;
const editing = en.owner.editing;

const link = (name: string): Control => ({ role: "link", name });
const button = (name: string): Control => ({ role: "button", name });

// Every owner page starts with the site's name as a link home. A page inside
// a restaurant has its nav, and a menu's or a section's page also has a
// breadcrumb whose first link is Menus, found by the same name.
const site = link(en.site.name);
const nav = [link(strings.nav.details), link(strings.nav.menus)];

// The Select's arrow on the restaurant forms, and the breadcrumb's slashes.
export const formMarks: readonly Mark[] = [
  {
    what: "a Select's arrow",
    selector: 'button[aria-haspopup="listbox"] svg[aria-hidden="true"]',
  },
];
export const breadcrumbMarks: readonly Mark[] = [
  {
    what: "the breadcrumb's slashes",
    selector: `nav[aria-label="${en.ui.breadcrumb}"] span[aria-hidden="true"]`,
  },
];

async function headings(page: Page): Promise<string[]> {
  return page
    .locator("main section h2")
    .evaluateAll((all) => all.map((h2) => (h2.textContent ?? "").trim()));
}

async function rowNames(page: Page): Promise<string[]> {
  return listRows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// Each saved row's Move up, Move down, and Delete, and its link where the
// list has one, named by the row.
type ListWords = {
  rowAction: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  add: string;
};
async function rowControls(
  page: Page,
  words: ListWords,
  noun: string,
  rowLink?: string,
): Promise<Control[]> {
  const named = (action: string, row: string) =>
    fill(words.rowAction, { action, [noun]: row });
  const rows = (await rowNames(page)).flatMap((row) => [
    ...(rowLink ? [link(named(rowLink, row))] : []),
    button(named(words.moveUp, row)),
    button(named(words.moveDown, row)),
    button(named(words.remove, row)),
  ]);
  return [...rows, button(words.add), button(editing.undo)];
}

export async function dashboardControls(page: Page): Promise<Control[]> {
  const restaurants = (await headings(page)).flatMap((restaurant) => [
    link(
      `${strings.editDetails} ${fill(strings.editDetailsFor, { restaurant })}`,
    ),
    link(`${strings.editMenus} ${fill(strings.editMenusFor, { restaurant })}`),
  ]);
  return [site, link(strings.add), ...restaurants, button(en.owner.signOut)];
}

export async function newControls(): Promise<Control[]> {
  return [
    site,
    link(strings.backToDashboard),
    ...DAY_KEYS.map((day) =>
      button(fill(strings.fields.addSecondTime, { day: strings.days[day] })),
    ),
    button(strings.new.submit),
  ];
}

// The details form's second-time buttons follow what CI Diner's hours hold,
// so only the controls every details page has are named; the sweep checks
// the rest.
export async function detailsControls(): Promise<Control[]> {
  return [
    site,
    ...nav,
    link(strings.backToDashboard),
    button(strings.details.submit),
  ];
}

export async function menusControls(page: Page): Promise<Control[]> {
  const words = en.owner.menus;
  return [
    site,
    ...nav,
    ...(await rowControls(page, words, "menu", words.editSections)),
  ];
}

export async function menuControls(page: Page): Promise<Control[]> {
  const words = en.owner.sections;
  return [
    site,
    ...nav,
    ...(await rowControls(page, words, "section", words.editDishes)),
  ];
}

export async function sectionControls(
  page: Page,
  menu: string,
): Promise<Control[]> {
  const words = en.owner.dishes;
  return [
    site,
    ...nav,
    link(menu),
    ...(await rowControls(page, words, "dish")),
    button(words.move.submit),
  ];
}
