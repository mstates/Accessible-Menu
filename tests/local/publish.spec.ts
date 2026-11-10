import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  dashboardPath,
  restaurantDishPath,
  restaurantMenuPagePath,
  restaurantMenuPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard, listRows } from "../a11y/owner-lists";
import { flashBanner } from "../a11y/saved-banner";
import { saveAndFail, saveAndLand, summary } from "./save";

// Publish and Unpublish on a menu's Publishing page (D-224), with the
// presses landing for real against the stand-in (D-82, migration 12), which
// seeds Dinner, Drinks, and Brunch published as CI Diner's data file does.
// A press that lands loads the page again with the flash that names the
// menu, and a refused press keeps the page with the failure in the focused
// summary (D-231). Here: a rename turning the page nav's line to changes
// not yet published on both of the menu's pages, and the dashboard saying
// so; Publish, Unpublish, and Publish again, the line and the review
// following each; the Menus list's line under each name following the next
// time the list is read (Q-115); a menu with no dishes (D-177) and a size
// with no name (D-139) refused with their sentences and nothing written,
// each thing Publish waits on a link that lands on the page that fixes it;
// a press with nothing changed publishing again (Q-82); and the page
// holding what it showed from a landed press until the new document
// arrives. The gate cannot land a press, so this runs here. Each check
// leaves the stand-in as it found it: Dinner published with nothing
// changed since, its first section with its name, the soup with its two
// sizes, Lunch not published.

const { code } = ownerEnv();
const strings = en.owner.publishing;
const pages = en.owner.menuPages;
const editing = en.owner.editing;
const dish = en.owner.dish;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Menu = { id: string; name: string };

const line = {
  published: `${strings.heading} ${pages.state.published}`,
  changed: `${strings.heading} ${pages.state.changed}`,
  notPublished: `${strings.heading} ${pages.state.notPublished}`,
};

function publishingPath(menu: Menu): string {
  return restaurantMenuPagePath(code, menu.id, "publishing");
}

// The menu's Sections page, with its log heard.
async function openSections(page: Page, menu: Menu): Promise<void> {
  await page.goto(restaurantMenuPath(code, menu.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

// The menu's Publishing page, which has no log.
async function openPublishing(page: Page, menu: Menu): Promise<void> {
  await page.goto(publishingPath(menu));
  await page.waitForLoadState("networkidle");
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

function main(page: Page) {
  return page.locator("main");
}

function button(page: Page, name: string) {
  return main(page).getByRole("button", { name, exact: true });
}

// The page nav's link for one page, named by the page and its state.
function navLink(page: Page, menu: Menu, name: string) {
  return main(page)
    .getByRole("navigation", { name: menu.name, exact: true })
    .getByRole("link", { name, exact: true });
}

// What the review lists under What changed, one item a sentence.
function changes(page: Page) {
  return main(page).locator(
    `h2:text-is("${strings.review.heading}") + ul > li`,
  );
}

// The links of what Publish waits on, under its lead.
function waiting(page: Page) {
  return main(page)
    .locator(`p:text-is("${strings.waitingLead}") + ul`)
    .getByRole("link");
}

function firstSectionName(page: Page) {
  return listRows(page).first().locator('input[id$="-name"]');
}

const list = new Intl.ListFormat("en", { type: "conjunction" });
const publishedNow = /^Published on .+\. Nothing has changed since\.$/;
const changedNow =
  /^Published on .+\. Changes since then are not published yet\.$/;

async function renameFirstSection(page: Page, to: string): Promise<void> {
  const before = await said(page, saved);
  await firstSectionName(page).fill(to);
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(before + 1);
}

// A press that lands: the page loads again as a new document with the
// flash that names the menu, its dismiss button the active element.
async function publish(page: Page, menu: Menu): Promise<void> {
  await saveAndLand(
    page,
    strings.publish,
    fill(strings.flash.published, { menu: menu.name }),
  );
}

async function unpublish(page: Page, menu: Menu): Promise<void> {
  await saveAndLand(
    page,
    strings.unpublish,
    fill(strings.flash.unpublished, { menu: menu.name }),
  );
}

async function writes(): Promise<string[]> {
  return (await (await fetch(`${standin}/__test/writes`)).json()) as string[];
}

type StoredMenu = {
  id: string;
  published: boolean;
  published_at: string | null;
};

async function stored(menu: Menu): Promise<StoredMenu> {
  const rows = (await (
    await fetch(`${standin}/__test/menus`)
  ).json()) as StoredMenu[];
  const found = rows.find((row) => row.id === menu.id);
  if (!found) throw new Error(`no menu ${menu.name}`);
  return found;
}

// The Menus list, read fresh (the server reads it on every render).
async function openMenus(page: Page): Promise<void> {
  await page.goto(restaurantMenusPath(code));
  await page.waitForLoadState("networkidle");
}

// The line under a menu's name on the Menus list (Q-115): the one paragraph
// in the row whose heading is the menu's name.
function menuLine(page: Page, menu: string) {
  return page
    .locator("main ul > li")
    .filter({
      has: page.getByRole("heading", { level: 2, name: menu, exact: true }),
    })
    .locator("p");
}

function counted(words: { one: string; other: string }, count: number) {
  return fill(count === 1 ? words.one : words.other, { count });
}

test("a rename makes changes not yet published on both of the menu's pages, Publish lands as the flash naming the menu and clears that, Unpublish takes the menu back with its flash, and Publish again", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await openSections(page, withSections);
  await expect(navLink(page, withSections, line.published)).toHaveCount(1);

  const original = await firstSectionName(page).inputValue();
  await renameFirstSection(page, `${original} renamed`);
  await expect(
    navLink(page, withSections, line.changed),
    "the save's refresh brings the nav's line with it",
  ).toHaveCount(1);

  // Dinner, Drinks, and Brunch are published, as the data file leaves CI
  // Diner.
  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText(
      fill(strings.summary.published.other, {
        names: list.format([withSections.name, "Drinks", "Brunch"]),
      }),
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      fill(strings.summary.changed.one, { names: withSections.name }),
      { exact: true },
    ),
  ).toBeVisible();

  await openPublishing(page, withSections);
  await expect(main(page).getByText(changedNow)).toBeVisible();
  await expect(navLink(page, withSections, line.changed)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(changes(page)).toHaveText([
    counted(strings.review.sectionsChanged, 1),
  ]);

  await publish(page, withSections);
  // Dismiss sends focus to the h1 (D-231).
  await page.keyboard.press("Enter");
  await expect(flashBanner(page, "success")).toHaveCount(0);
  await expect(main(page).locator("h1")).toBeFocused();
  await expect(main(page).getByText(publishedNow)).toBeVisible();
  await expect(
    main(page).getByText(strings.review.none, { exact: true }),
  ).toBeVisible();
  await expect(navLink(page, withSections, line.published)).toHaveCount(1);
  await expect(button(page, strings.unpublish)).toBeVisible();

  await unpublish(page, withSections);
  await expect(
    main(page).getByText(strings.state.notPublished, { exact: true }),
  ).toBeVisible();
  await expect(button(page, strings.unpublish)).toHaveCount(0);
  await expect(navLink(page, withSections, line.notPublished)).toHaveCount(1);
  await expect(
    main(page).getByText(
      fill(strings.review.first, {
        sections: counted(strings.review.sectionCount, withSections.sections),
        dishes: counted(strings.review.dishCount, withSections.dishes),
      }),
      { exact: true },
    ),
    "nothing is published, so the review says what a Publish would show",
  ).toBeVisible();

  // The Sections page reads the same line, and Drinks and Brunch stay
  // published on their own.
  await openSections(page, withSections);
  await expect(navLink(page, withSections, line.notPublished)).toHaveCount(1);
  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText(
      fill(strings.summary.published.other, {
        names: list.format(["Drinks", "Brunch"]),
      }),
      { exact: true },
    ),
  ).toBeVisible();

  // As it was: the name back, then published with nothing changed since.
  await openSections(page, withSections);
  await renameFirstSection(page, original);
  await openPublishing(page, withSections);
  await publish(page, withSections);
  await expect(main(page).getByText(publishedNow)).toBeVisible();
  await expect(button(page, strings.unpublish)).toBeVisible();
  await expect(navLink(page, withSections, line.published)).toHaveCount(1);
});

// The list has no live update: a change on the menu's pages shows on the
// list the next time the list is read, and not before.
test("the Menus list says each menu's state under its name, and follows a rename, Unpublish, and Publish the next time it is read", async ({
  page,
}) => {
  const { withSections, empty } = ownerFixture();
  await openMenus(page);
  await expect(menuLine(page, withSections.name)).toHaveText(publishedNow);
  await expect(menuLine(page, empty.name)).toHaveText(
    strings.state.notPublished,
  );

  await openSections(page, withSections);
  const original = await firstSectionName(page).inputValue();
  await renameFirstSection(page, `${original} renamed`);
  await openMenus(page);
  await expect(
    menuLine(page, withSections.name),
    "a change shows on the next read of the list",
  ).toHaveText(changedNow);

  await openSections(page, withSections);
  await renameFirstSection(page, original);
  await openPublishing(page, withSections);
  await unpublish(page, withSections);
  await openMenus(page);
  await expect(menuLine(page, withSections.name)).toHaveText(
    strings.state.notPublished,
  );
  await expect(
    menuLine(page, "Drinks"),
    "the other published menus keep their line",
  ).toHaveText(publishedNow);

  // As it was.
  await openPublishing(page, withSections);
  await publish(page, withSections);
  await openMenus(page);
  await expect(menuLine(page, withSections.name)).toHaveText(publishedNow);
  await expect(menuLine(page, empty.name)).toHaveText(
    strings.state.notPublished,
  );
});

test("a menu with no dishes blocks Publish: the page names the menu as a link to its Sections, and the press is refused in the focused summary with nothing written and no flash (D-177)", async ({
  page,
}) => {
  const { empty } = ownerFixture();
  await openPublishing(page, empty);
  try {
    await expect(
      main(page).getByText(strings.state.notPublished, { exact: true }),
    ).toBeVisible();
    await expect(
      main(page).getByText(strings.review.firstEmpty, { exact: true }),
    ).toBeVisible();
    await expect(waiting(page)).toHaveText([
      fill(strings.problems.noDishes, { menu: empty.name }),
    ]);

    const before = (await writes()).length;
    await saveAndFail(
      page,
      strings.publish,
      fill(strings.refused.noDishes, { menu: empty.name }),
      strings.problemHeading,
    );
    await expect(
      main(page).locator('[role="status"], [role="log"], [role="alert"]'),
      "focus is the announcement: no live region",
    ).toHaveCount(0);
    await expect(
      main(page).getByText(strings.state.notPublished, { exact: true }),
    ).toBeVisible();
    const sent = (await writes()).slice(before);
    expect(
      sent,
      "the press reached the stand-in once and wrote nothing",
    ).toEqual([`rpc publish_menu ${empty.id}`]);
    expect((await stored(empty)).published).toBe(false);

    // What Publish waits on leads to the page that fixes it.
    await waiting(page).click();
    await page.waitForURL(`**${restaurantMenuPath(code, empty.id)}`);
    await expect(main(page).locator("h1")).toHaveText(empty.name);
  } finally {
    // On a build that still publishes an empty menu, put it back as the
    // owner setup needs it: not published.
    if ((await stored(empty)).published) {
      await openPublishing(page, empty);
      await unpublish(page, empty);
    }
  }
});

test("a size with no name blocks Publish: the page names it as a link to its dish, the review counts the dish as changed, and the press is refused in the focused summary with nothing written", async ({
  page,
}) => {
  const { withSections, withDishes, dishes } = ownerFixture();

  await page.goto(restaurantDishPath(code, dishes.sizes.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  await page
    .getByRole("button", { name: dish.price.addSize, exact: true })
    .click();
  const added = fill(dish.price.sizeAdded, {
    count: fill(dish.price.sizeCount.other, { count: 3 }),
  });
  await expect.poll(() => said(page, added)).toBe(1);

  await openPublishing(page, withSections);
  const blocker = fill(strings.problems.sizeUnnamed, {
    dish: dishes.sizes.name,
    section: withDishes.name,
  });
  await expect(
    main(page).getByText(changedNow),
    "a blank size is a change not published yet",
  ).toBeVisible();
  await expect(
    changes(page),
    "a draft may hold a size with no name, and the review reads it",
  ).toHaveText([counted(strings.review.dishesChanged, 1)]);
  await expect(waiting(page)).toHaveText([blocker]);
  await expect(waiting(page)).toHaveAttribute(
    "href",
    restaurantDishPath(code, dishes.sizes.id),
  );

  const before = (await writes()).length;
  await saveAndFail(
    page,
    strings.publish,
    fill(strings.refused.sizeUnnamed, {
      menu: withSections.name,
      dish: dishes.sizes.name,
    }),
    strings.problemHeading,
  );
  await expect(main(page).getByText(changedNow)).toBeVisible();
  expect(
    (await writes()).slice(before),
    "the press reached the stand-in once and wrote nothing",
  ).toEqual([`rpc publish_menu ${withSections.id}`]);

  // The link lands on the dish's General page, where its sizes are.
  await waiting(page).click();
  await page.waitForURL(`**${restaurantDishPath(code, dishes.sizes.id)}`);
  await expect(main(page).locator("h1")).toHaveText(dishes.sizes.name);

  // As it was.
  await page.goto(restaurantDishPath(code, dishes.sizes.id));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  const unnamed = fill(dish.price.unnamedSize, { position: 3 });
  await page
    .getByRole("button", {
      name: fill(dish.price.sizeAction, {
        action: dish.price.removeSize,
        size: unnamed,
      }),
      exact: true,
    })
    .click();
  await expect
    .poll(() => said(page, fill(dish.price.sizeRemoved, { size: unnamed })))
    .toBe(1);
  await openPublishing(page, withSections);
  await expect(main(page).getByText(strings.waitingLead)).toHaveCount(0);
  await expect(main(page).getByText(publishedNow)).toBeVisible();
  await expect(
    main(page).getByText(strings.review.none, { exact: true }),
  ).toBeVisible();
});

test("a press with nothing changed publishes again and moves the time (Q-82)", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await openPublishing(page, withSections);
  await expect(
    main(page).getByText(strings.review.none, { exact: true }),
  ).toBeVisible();
  const before = await stored(withSections);
  const sentBefore = (await writes()).length;
  await publish(page, withSections);
  const after = await stored(withSections);
  expect(after.published).toBe(true);
  expect(
    Date.parse(after.published_at ?? ""),
    "the press published again",
  ).toBeGreaterThan(Date.parse(before.published_at ?? ""));
  expect((await writes()).slice(sentBefore)).toEqual([
    `rpc publish_menu ${withSections.id}`,
  ]);
  await expect(main(page).getByText(publishedNow)).toBeVisible();
  await expect(
    main(page).getByText(strings.review.none, { exact: true }),
  ).toBeVisible();
});

// The action's answer re-renders the page in the old document once the
// write has landed, since the restaurant's diner pages are expired with
// it. Unheld, a landed Unpublish would take its own button away there and
// drop focus to the body before the new document arrives (D-231). So the
// page draws what it showed at the press until the new document comes.
//
// The new document's request is held in the browser for a second and a
// half, so the old document lives on with the action's answer applied.
// Playwright cannot look at a page while its next document is on its way:
// every locator check waits for the navigation to finish, and a script
// sent to the page does not run. So the old document watches itself: a
// sampler started before the press reads the pressed button, the focus,
// and the state sentence every 25 ms, keeps what it saw in session
// storage, and the new document hands it back.
const WATCH_KEY = "held-view-watch";
const HOLD_MS = 1500;

type Watch = {
  // The pressed button was seen held: from then on every sample counts.
  armed: boolean;
  // Samples taken once the page had its answer and was leaving, told by
  // the result's cookie, which the page writes just before it reloads.
  afterAnswer: number;
  // Every sample, once armed, that did not show the page as it was at the
  // press.
  bad: string[];
};

test("from a landed Unpublish to the new document the page holds what it showed: Unpublish stays on the page, held and focused, and then the flash arrives", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  const path = publishingPath(withSections);
  await openPublishing(page, withSections);
  let holding = false;
  const thisPage = (url: URL) => url.pathname === path;
  await page.route(thisPage, async (route) => {
    const request = route.request();
    if (
      holding &&
      request.method() === "GET" &&
      request.resourceType() === "document"
    ) {
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    }
    await route.fallback();
  });
  try {
    await page.evaluate(
      ({ name, key }) => {
        const find = () =>
          [...document.querySelectorAll("main button")].find(
            (each) => (each.textContent ?? "").trim() === name,
          ) ?? null;
        const stateAtPress =
          document.querySelector("main p")?.textContent ?? "";
        const watch = { armed: false, afterAnswer: 0, bad: [] as string[] };
        const sample = () => {
          const pressed = find();
          const held = pressed?.getAttribute("aria-disabled") === "true";
          if (held) watch.armed = true;
          if (watch.armed) {
            const answered = document.cookie.includes(
              "notice=menu-unpublished",
            );
            if (answered) watch.afterAnswer += 1;
            const seen = {
              there: pressed !== null,
              held,
              focused: pressed !== null && document.activeElement === pressed,
              sameState:
                (document.querySelector("main p")?.textContent ?? "") ===
                stateAtPress,
              flash: document.querySelector('main [role="alert"]') !== null,
            };
            if (
              !seen.there ||
              !seen.held ||
              !seen.focused ||
              !seen.sameState ||
              seen.flash
            ) {
              watch.bad.push(
                JSON.stringify({
                  at: Math.round(performance.now()),
                  answered,
                  ...seen,
                }),
              );
            }
          }
          sessionStorage.setItem(key, JSON.stringify(watch));
        };
        setInterval(sample, 25);
        window.addEventListener("pagehide", sample);
      },
      { name: strings.unpublish, key: WATCH_KEY },
    );

    const loaded = page.waitForEvent("load", { timeout: 15_000 });
    holding = true;
    await button(page, strings.unpublish).focus();
    await page.keyboard.press("Enter");
    await loaded;
    holding = false;
    await page.waitForLoadState("networkidle");

    // The new document: the flash, and the menu not published.
    await expect(flashBanner(page, "success").getByRole("alert")).toHaveText(
      fill(strings.flash.unpublished, { menu: withSections.name }),
    );
    await expect(
      main(page).getByText(strings.state.notPublished, { exact: true }),
    ).toBeVisible();
    await expect(button(page, strings.unpublish)).toHaveCount(0);
    expect((await stored(withSections)).published, "the write landed").toBe(
      false,
    );

    // What the old document saw of itself, from the press to its end.
    const watch = JSON.parse(
      (await page.evaluate((key) => sessionStorage.getItem(key), WATCH_KEY)) ??
        "null",
    ) as Watch | null;
    expect(watch, "the old document kept its watch").not.toBeNull();
    expect(watch?.armed, "Unpublish was held once pressed").toBe(true);
    expect(
      watch?.afterAnswer,
      "the old document was watched after it had its answer, while the new one was on its way",
    ).toBeGreaterThan(10);
    expect(
      watch?.bad,
      "from the press to the new document: Unpublish on the page, held, the active element, the state sentence as it was, and no flash",
    ).toEqual([]);
  } finally {
    holding = false;
    await page.unroute(thisPage);
    await page.evaluate((key) => sessionStorage.removeItem(key), WATCH_KEY);
    // As it was.
    if (!(await stored(withSections)).published) {
      await openPublishing(page, withSections);
      await publish(page, withSections);
    }
  }
  await expect(main(page).getByText(publishedNow)).toBeVisible();
  await expect(summary(page, strings.problemHeading)).toHaveCount(0);
});
