import type { Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { DAY_KEYS } from "../../src/domain/hours";
import {
  otherAction,
  otherLabel,
} from "../../src/features/owner/allergens/allergen-words";
import {
  sizeAction,
  sizeLabel,
} from "../../src/features/owner/dish/dish-words";
import { CHOICE_LISTS_HEADING_ID } from "../../src/features/owner/choices/choice-words";
import { dashboardPath } from "../../src/features/owner/paths";
import type { Control, Mark } from "./checks";
import { listRows } from "./owner-lists";

// The links and buttons each owner page is expected to show, checked at
// every size by the arrival pass (D-137), and the drawn marks each is
// expected to show in forced colors. Names come from the copy and from the
// page itself: a list's rows are named by its saved names, and the
// dashboard's links by each restaurant's heading, so the lists follow the
// data file (D-126) without repeating it.

const strings = en.owner.restaurants;

const link = (name: string): Control => ({ role: "link", name });
const button = (name: string): Control => ({ role: "button", name });

// Every owner page starts with the site's name as a link to the dashboard, a
// signed-in owner's home (Q-142). A page inside a restaurant has its nav,
// and a menu's or a section's page also has a breadcrumb whose first link is
// Menus, found by the same name.
const site: Control = { ...link(en.site.name), href: dashboardPath };
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
// A flash's two drawn marks (D-211, D-219): its kind's icon, beside its
// words, and the cross in its dismiss button.
export const bannerMarks: readonly Mark[] = [
  {
    what: "the banner's icon",
    selector: 'main section[aria-labelledby] > svg[aria-hidden="true"]',
  },
  {
    what: "the cross in the banner's dismiss button",
    selector: 'main section[aria-labelledby] button svg[aria-hidden="true"]',
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

// The restaurant cards' headings, each named by its code (RestaurantCard),
// never the flash's, which is a section with an h2 of its own (D-219).
async function headings(page: Page): Promise<string[]> {
  return page
    .locator('main section h2[id^="restaurant-"]')
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
  return [...rows, button(words.add)];
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

// The dashboard after Checkout (D-219): the same, and the flash's dismiss
// button.
export async function checkoutDashboardControls(
  page: Page,
): Promise<Control[]> {
  return [...(await dashboardControls(page)), button(en.ui.banner.dismiss)];
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

// Details after a save (D-211): the same, and the success banner's dismiss
// button.
export async function savedDetailsControls(): Promise<Control[]> {
  return [...(await detailsControls()), button(en.ui.banner.dismiss)];
}

export async function menusControls(page: Page): Promise<Control[]> {
  const words = en.owner.menus;
  return [
    site,
    ...nav,
    ...(await rowControls(page, words, "menu", words.editSections)),
  ];
}

// A menu's Sections page (D-224): the page nav's two links, Sections and
// Publishing with its state, then the rows' controls. Publish and
// Unpublish are on the menu's Publishing page.
export async function menuControls(page: Page): Promise<Control[]> {
  const words = en.owner.sections;
  return [
    site,
    ...nav,
    ...(await pageNavControls(page)),
    ...(await rowControls(page, words, "section", words.editDishes)),
  ];
}

// A menu's Publishing page (D-224): the breadcrumb's link to the menu, the
// page nav's two, every line of the review that leads somewhere, read from
// the page since they follow the data file (a dish or an option whose
// allergens are not confirmed, and what Publish waits on), then Publish,
// and Unpublish while the menu is published.
export async function menuPublishingControls(
  page: Page,
  menu: string,
): Promise<Control[]> {
  const publishing = en.owner.publishing;
  const published =
    (await page
      .getByRole("button", { name: publishing.unpublish, exact: true })
      .count()) > 0;
  const leads = await page
    .locator("main ul:not(nav ul) a")
    .evaluateAll((links) =>
      links.map((each) => (each.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
  return [
    site,
    ...nav,
    link(menu),
    ...(await pageNavControls(page)),
    ...leads.map((name) => link(name)),
    button(publishing.publish),
    ...(published ? [button(publishing.unpublish)] : []),
  ];
}

// The same after a press that landed (D-231): and the flash's dismiss
// button (D-219).
export async function landedMenuPublishingControls(
  page: Page,
  menu: string,
): Promise<Control[]> {
  return [
    ...(await menuPublishingControls(page, menu)),
    button(en.ui.banner.dismiss),
  ];
}

// A section's page: the breadcrumb's link to its menu, the rows' controls,
// and, while the line shown with every dish has words, its allergen group's
// buttons (D-152): each other allergen's two, named by the row as the page
// shows it, and Add another allergen.
// The choice lists on a dish's Choice lists page or a section's page
// (D-166, D-222): each row's link and three buttons, named by the list's
// lead as its heading shows it, and Add choice list. A row's heading is an
// h2 on the dish's page, where the h1 names the block, and an h3 on the
// section's, under the block's h2.
async function choiceListControls(
  page: Page,
  rowHeading: "h2" | "h3",
): Promise<Control[]> {
  const choices = en.owner.choices.lists;
  const leads = await page
    .locator(
      `main ol[aria-labelledby="${CHOICE_LISTS_HEADING_ID}"] > li ${rowHeading}`,
    )
    .evaluateAll((all) => all.map((h) => (h.textContent ?? "").trim()));
  const named = (action: string, list: string) =>
    fill(choices.rowAction, { action, list });
  return [
    ...leads.flatMap((lead) => [
      link(named(choices.edit, lead)),
      button(named(choices.moveUp, lead)),
      button(named(choices.moveDown, lead)),
      button(named(choices.remove, lead)),
    ]),
    button(choices.add),
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
    ...(await choiceListControls(page, "h3")),
    ...(await rowControls(page, words, "dish", words.editDish)),
    button(words.move.submit),
  ];
}

// The page nav on a dish's pages (D-222): five links, each named by its
// page and, after it, the page's state line as the page shows it, read
// from the nav itself since the states follow the data file (D-126); the
// nav test in owner-dish.spec.ts holds the words. The page nav is the nav
// inside main that is not the breadcrumb.
async function pageNavControls(page: Page): Promise<Control[]> {
  const names = await page
    .locator(`main nav:not([aria-label="${en.ui.breadcrumb}"]) a`)
    .evaluateAll((links) =>
      links.map((link) => (link.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
  return names.map((name) => link(name));
}

// What every one of a dish's pages shows (D-222): the site link, the
// restaurant nav's two, the breadcrumb's links (the menu and the section,
// and the dish on a sub page), and the page nav's five.
async function dishFrameControls(
  page: Page,
  trail: readonly string[],
): Promise<Control[]> {
  return [
    site,
    ...nav,
    ...trail.map((crumb) => link(crumb)),
    ...(await pageNavControls(page)),
  ];
}

// A dish's General page (D-128, D-139, D-222, D-237), in the page's order:
// the link to the next dish when there is one, each size's two buttons
// when the dish is priced by size, named by the size as the page shows it,
// Add a size, the page's one Save, and the move's button; the move's
// Select is named by its label and its value, so the sweep checks it. The
// next dish's link is the one in a paragraph: the page nav's links lead to
// the dish's pages too.
export async function dishGeneralControls(
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
    const label = sizeLabel(words, name, index + 1);
    return [
      button(sizeAction(words, words.price.showNames, label)),
      button(sizeAction(words, words.price.removeSize, label)),
    ];
  });
  const bySize = await page
    .getByRole("radio", { name: words.price.sizes, exact: true })
    .isChecked();
  const nextName = await page
    .locator('main p a[href*="/dishes/"]')
    .evaluateAll((links) => links.map((link) => link.textContent ?? ""));
  return [
    ...(await dishFrameControls(page, [menu, section])),
    ...nextName.map((text) => link(text)),
    ...sizes,
    ...(bySize ? [button(words.price.addSize)] : []),
    button(words.general.submit),
    button(words.move.submit),
  ];
}

// General after its save (D-237): the same, and the success banner's
// dismiss button (D-219).
export async function savedDishGeneralControls(
  page: Page,
  menu: string,
  section: string,
): Promise<Control[]> {
  return [
    ...(await dishGeneralControls(page, menu, section)),
    button(en.ui.banner.dismiss),
  ];
}

// A dish's Allergens page (D-148, D-222, D-223): each other allergen's two
// buttons, named by the row as the page shows it, Add another allergen,
// each same-named dish's or option's Apply button, and the page's one Save.
export async function dishAllergensControls(
  page: Page,
  menu: string,
  section: string,
  dish: string,
): Promise<Control[]> {
  const words = en.owner.dish.allergens;
  const otherNames = await page
    .locator(`main ol[aria-label="${words.othersLabel}"] > li`)
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelector<HTMLInputElement>('input[id$="-name"]')?.value ??
          "",
      ),
    );
  const others = otherNames.flatMap((name, index) => {
    const label = otherLabel(words, name, index + 1);
    return [
      button(otherAction(words, words.showOtherNames, label)),
      button(otherAction(words, words.removeOther, label)),
    ];
  });
  const applies = await page
    .locator('main button[id^="dish-apply-"]')
    .evaluateAll((buttons) =>
      buttons.map((each) => each.getAttribute("aria-label") ?? ""),
    );
  return [
    ...(await dishFrameControls(page, [menu, section, dish])),
    ...others,
    button(words.addOther),
    ...applies.map((name) => button(name)),
    button(words.submit),
  ];
}

// A dish's Dietary tags page (D-66, D-222, D-223): the frame's, and the
// page's one Save; its boxes are neither links nor buttons.
export async function dishTagsControls(
  page: Page,
  menu: string,
  section: string,
  dish: string,
): Promise<Control[]> {
  return [
    ...(await dishFrameControls(page, [menu, section, dish])),
    button(en.owner.dish.tags.submit),
  ];
}

// A dish's Availability page (D-160, D-222, D-223): Today only (task 5)
// and the page's one Save.
export async function dishAvailabilityControls(
  page: Page,
  menu: string,
  section: string,
  dish: string,
): Promise<Control[]> {
  return [
    ...(await dishFrameControls(page, [menu, section, dish])),
    button(en.owner.dish.schedule.todayOnly),
    button(en.owner.dish.availability.submit),
  ];
}

// One of the three after its save (D-229): the same, and the success
// banner's dismiss button (D-219).
export function savedDishControls(
  controlsOf: typeof dishTagsControls,
): typeof dishTagsControls {
  return async (page, menu, section, dish) => [
    ...(await controlsOf(page, menu, section, dish)),
    button(en.ui.banner.dismiss),
  ];
}

// A dish's Choice lists page (D-166, D-222): the lists' controls, each row
// an h2 under the h1.
export async function dishChoicesControls(
  page: Page,
  menu: string,
  section: string,
  dish: string,
): Promise<Control[]> {
  return [
    ...(await dishFrameControls(page, [menu, section, dish])),
    ...(await choiceListControls(page, "h2")),
  ];
}

// A choice list's page (D-166): the breadcrumb's links, Show suggested
// leads, each option's three buttons named by the option, each option's
// other-allergen buttons and Add another allergen, each same-named Apply
// button, and Add option.
export async function choiceListPageControls(
  page: Page,
  trail: readonly string[],
): Promise<Control[]> {
  const words = en.owner.choices;
  const allergens = en.owner.dish.allergens;
  const names = await page
    .locator("main ul > li")
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelector<HTMLInputElement>('input[id$="-name"]')?.value ??
          "",
      ),
    );
  const named = (action: string, option: string) =>
    fill(words.options.rowAction, { action, option });
  const rows = await Promise.all(
    names.map(async (name) => {
      const li = page.locator("main ul > li").filter({
        has: page.locator(`input[id$="-name"][value="${name}"]`),
      });
      const otherNames = await li
        .locator(`ol[aria-label="${allergens.othersLabel}"] > li`)
        .evaluateAll((all) =>
          all.map(
            (row) =>
              row.querySelector<HTMLInputElement>('input[id$="-name"]')
                ?.value ?? "",
          ),
        );
      const applies = await li
        .locator('button[id^="option-"][id*="-apply-"]')
        .evaluateAll((buttons) =>
          buttons.map((each) => each.getAttribute("aria-label") ?? ""),
        );
      return [
        button(named(words.options.moveUp, name)),
        button(named(words.options.moveDown, name)),
        button(named(words.options.remove, name)),
        ...otherNames.flatMap((other, index) => {
          const label = otherLabel(allergens, other, index + 1);
          return [
            button(otherAction(allergens, allergens.showOtherNames, label)),
            button(otherAction(allergens, allergens.removeOther, label)),
          ];
        }),
        button(allergens.addOther),
        ...applies.map((name) => button(name)),
      ];
    }),
  );
  return [
    site,
    ...nav,
    ...trail.map((crumb) => link(crumb)),
    button(words.page.showLeads),
    ...rows.flat(),
    button(words.options.add),
  ];
}
