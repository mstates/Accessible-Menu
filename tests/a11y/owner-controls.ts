import type { Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { DAY_KEYS } from "../../src/domain/hours";
import {
  otherAction,
  otherLabel,
} from "../../src/features/owner/dish/allergen-words";
import {
  sizeAction,
  sizeLabel,
} from "../../src/features/owner/dish/dish-words";
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
// The dot of the chosen radio on the dish page (D-139).
export const radioMarks: readonly Mark[] = [
  {
    what: "a radio's dot",
    selector: 'label:has(input[type="radio"]) > span[aria-hidden="true"] svg',
  },
];
// The check mark of a checked box: on a dish page with a checked allergen
// or a checked list (D-148). An unchecked box draws no mark, so this is
// named only where one is checked.
export const checkboxMarks: readonly Mark[] = [
  {
    what: "a checked box's mark",
    selector:
      'label:has(input[type="checkbox"]) > span[aria-hidden="true"] svg',
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
    ...(await rowControls(page, words, "dish", words.editDish)),
    button(words.move.submit),
  ];
}

// A dish's page (D-128, D-139, D-148): the breadcrumb's three links, each
// size's two buttons when the dish is priced by size, named by the size as
// the page shows it, Add a size, each other allergen's two buttons, named
// by the row as the page shows it, Add another allergen, each same-named
// dish's Apply button, Undo, the link to the next dish when there is one,
// and the move's button; the move's Select is named by its label and its
// value, so the sweep checks it.
export async function dishControls(
  page: Page,
  menu: string,
  section: string,
): Promise<Control[]> {
  const words = en.owner.dish;
  const sizeNames = await page
    .locator(`main ol[aria-label="${words.price.sizesLabel}"] > li`)
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelector<HTMLInputElement>('input[id$="-name"]')?.value ??
          "",
      ),
    );
  const sizes = sizeNames.flatMap((name, index) => {
    const label = sizeLabel(words, { id: "", name, price: "" }, index + 1);
    return [
      button(sizeAction(words, words.price.showNames, label)),
      button(sizeAction(words, words.price.removeSize, label)),
    ];
  });
  const bySize = await page
    .getByRole("radio", { name: words.price.sizes, exact: true })
    .isChecked();
  const otherNames = await page
    .locator(`main ol[aria-label="${words.allergens.othersLabel}"] > li`)
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelector<HTMLInputElement>('input[id$="-name"]')?.value ??
          "",
      ),
    );
  const others = otherNames.flatMap((name, index) => {
    const label = otherLabel(words.allergens, name, index + 1);
    return [
      button(
        otherAction(words.allergens, words.allergens.showOtherNames, label),
      ),
      button(otherAction(words.allergens, words.allergens.removeOther, label)),
    ];
  });
  const applies = await page
    .locator('main button[id^="dish-apply-"]')
    .evaluateAll((buttons) =>
      buttons.map((each) => each.getAttribute("aria-label") ?? ""),
    );
  const nextName = await page
    .locator('main a[href*="/dishes/"]')
    .evaluateAll((links) => links.map((link) => link.textContent ?? ""));
  return [
    site,
    ...nav,
    link(menu),
    link(section),
    ...sizes,
    ...(bySize ? [button(words.price.addSize)] : []),
    ...others,
    button(words.allergens.addOther),
    ...applies.map((name) => button(name)),
    button(editing.undo),
    ...nextName.map((text) => link(text)),
    button(words.move.submit),
  ];
}
