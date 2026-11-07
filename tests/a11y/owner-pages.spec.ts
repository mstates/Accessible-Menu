import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { DAY_KEYS, type DayKey } from "../../src/domain/hours";
import {
  dashboardPath,
  fieldId,
  restaurantDetailsPath,
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantNewPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import {
  expectFocusResetThenSkipLink,
  expectForcedColorsKept,
  expectKeyboardWalk,
  expectLandedOutline,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNoMissingIds,
  expectRootAtLargest,
  open,
  pageChecks,
  setLargestText,
  tabTo,
  type PageCheckOptions,
} from "./checks";
import { expectLabelShape } from "./label-shape";
import {
  bannerMarks,
  dashboardControls,
  detailsControls,
  formMarks,
  menusControls,
  newControls,
  savedDetailsControls,
} from "./owner-controls";
import { ownerEnv, ownerFixture } from "./owner-env";
import { stopClock } from "./owner-lists";
import { ownerPages, restaurantName } from "./pages";
import { savedBanner, setSavedNotice } from "./saved-banner";
import { expectWrites, guardWrites } from "./write-guard";

// Owner screens, signed in as the test owner (D-100), with the session from
// owner.setup.ts. The gate never sends a write (D-108, D-115): every test in
// this file runs behind the write guard, which answers any request that is
// not a GET inside the browser and fails a test that sent one without
// saying so. These checks load pages, press Tab, run axe, inject a style,
// and follow links. The tests that press Save say they expect a write, and
// nothing they send reaches the server. The trial button is tabbed over,
// never pressed.

const { code } = ownerEnv();
const details = restaurantDetailsPath(code);
const strings = en.owner.restaurants;

guardWrites();

// What each owner page is expected to show (D-137), by its path without
// the query, so an arrival with a result message checks the same controls.
function checksFor(path: string): PageCheckOptions {
  const at = new URL(path, "http://localhost").pathname;
  if (at === dashboardPath) return { controls: dashboardControls };
  if (at === restaurantNewPath()) {
    return { controls: newControls, marks: formMarks };
  }
  // Details and Menus hold labels of one node (D-193): axe also leaves
  // nothing to review on them.
  if (at === details) {
    return { controls: detailsControls, marks: formMarks, review: true };
  }
  if (at === restaurantMenusPath(code)) {
    return { controls: menusControls, review: true };
  }
  throw new Error(`${path} has no expected controls in owner-controls.ts`);
}

for (const path of ownerPages(code)) {
  test.describe(path, () => {
    pageChecks(path, checksFor(path));
  });
}

// Details as a save that lands leaves it (D-211): the success banner under
// the heading. The gate never lands a save (D-108), so the cookie the save
// leaves is set before each load. The same checks as Details, with the
// banner's dismiss button among the controls and its two marks in forced
// colors; its snapshot replaces the ?saved=1 arrival's.
test.describe(`${details} after a save`, () => {
  pageChecks(details, {
    ...checksFor(details),
    controls: savedDetailsControls,
    marks: [...formMarks, ...bannerMarks],
    snapshot: "app-restaurants-code-details-saved",
    prepare: (page) => setSavedNotice(page, code),
  });
});

function statusRegion(page: Page) {
  return page.locator('header [role="status"]');
}

// What Next's route announcer last said, from its open shadow root.
function announcerText(page: Page) {
  return page.evaluate(
    () =>
      document
        .querySelector("next-route-announcer")
        ?.shadowRoot?.querySelector("#__next-route-announcer__")?.textContent ??
      "",
  );
}

// Holds the client-side navigation request for one path (a GET carrying the
// RSC header and no prefetch header) until the returned function is called.
// Prefetches pass, so the link is as ready as it would be for an owner. The
// request is handed on with fallback, never continue, so it still goes
// through the write guard on the context.
async function holdNavigation(page: Page, path: string) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const request = route.request();
      const headers = request.headers();
      if (
        request.method() === "GET" &&
        headers["rsc"] === "1" &&
        !headers["next-router-prefetch"]
      ) {
        await held;
      }
      await route.fallback();
    },
  );
  return () => release();
}

// Presses Save details with the button, the way an owner does, and returns
// the button's id, which React Aria's pending message names. The write guard
// answers the save inside the browser with the response Next gives for an
// action it does not know (D-108), so if Next's response ever changes shape
// the error page fails to appear and the test fails; it never writes.
async function pressSave(page: Page): Promise<string> {
  await open(page, details);
  const save = page.getByRole("button", { name: strings.details.submit });
  const id = await save.getAttribute("id");
  if (!id) throw new Error("the Save button has no id");
  await save.click();
  return id;
}

function errorHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: en.owner.error.heading });
}

// React Aria's live announcer messages that name an element by id (D-109).
function messagesNaming(page: Page, id: string) {
  return page.locator(`[data-live-announcer] [aria-labelledby~="${id}"]`);
}

// React Aria's assertive log, made by the first announce call on a page
// before that call holds its message back for 100 ms. Next's route
// announcer carries the mark too (D-201), but it is no div and has no log.
const reactAriaAssertiveLog =
  'div[data-live-announcer] > [role="log"][aria-live="assertive"]';

// Nothing in React Aria's logs is renamed (D-210, superseding D-207): a
// message naming the Button is taken out with it, never given words of its
// own. React Aria sets no aria-label on its logs or on a message that names
// an element, so any aria-label inside a log would be ours. Next's route
// announcer carries the mark too (D-201), but holds no log.
async function expectNothingRenamed(page: Page) {
  await expect(
    page.locator('[data-live-announcer] [role="log"] [aria-label]'),
    "nothing in React Aria's log is renamed",
  ).toHaveCount(0);
}

async function expectNoNamelessMessages(page: Page) {
  const dangling = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll("[data-live-announcer] [aria-labelledby]"),
      ].filter((node) =>
        (node.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .some((name) => !document.getElementById(name)),
      ).length,
  );
  expect(
    dangling,
    "no message in React Aria's log names an element that is gone",
  ).toBe(0);
}

type RecordedMessage = { names: string[]; existed: boolean; at: number };

// Records every message React Aria adds to its log, whether each element it
// names existed when it was added, and when it was added by the page's own
// clock, which a test on Playwright's stopped clock moves itself. Runs in
// the page as an init script.
function recordAnnouncerMessages() {
  const w = window as unknown as { __messages: RecordedMessage[] };
  w.__messages = [];
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (!node.closest("[data-live-announcer]")) continue;
        const names = (node.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .filter(Boolean);
        if (names.length === 0) continue;
        w.__messages.push({
          names,
          existed: names.every((name) => document.getElementById(name)),
          at: Date.now(),
        });
      }
    }
  }).observe(document, { subtree: true, childList: true });
}

// The recorded messages that name an element by id.
function recordedMessages(page: Page, id: string): Promise<RecordedMessage[]> {
  return page.evaluate(
    (button) =>
      (
        window as unknown as { __messages: RecordedMessage[] }
      ).__messages.filter((m) => m.names.includes(button)),
    id,
  );
}

test("every owner page carries an empty status region", async ({ page }) => {
  for (const path of ownerPages(code)) {
    await open(page, path);
    await expect(statusRegion(page)).toHaveCount(1);
    await expect(statusRegion(page)).toHaveText("");
  }
});

test("owner titles name the page, then the restaurant, then the site", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await expect(page).toHaveTitle(pageTitle(en, en.owner.title));
  await open(page, restaurantNewPath());
  await expect(page).toHaveTitle(pageTitle(en, strings.new.title));
  await open(page, details);
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, strings.details.title, name));
  await open(page, restaurantDetailsPath(code, { created: true }));
  await expect(page).toHaveTitle(
    pageTitle(en, strings.details.createdTitle, name),
  );
});

// D-113: the h1 is the page's own name, and the restaurant shows as the
// visible text that names its nav. The dashboard's card is a second source
// for that name, so the nav cannot agree only with itself.
test("the restaurant nav shows the restaurant's name, is named by it, and marks Details as the current page", async ({
  page,
}) => {
  await open(page, dashboardPath);
  const card = page.locator("main section").filter({
    has: page.locator(`a[href="${details}"]`),
  });
  const onDashboard = (await card.locator("h2").textContent())?.trim() ?? "";
  expect(onDashboard, "the dashboard names the restaurant").not.toBe("");

  await open(page, details);
  const name = await restaurantName(page);
  expect(name, "the nav shows the name the dashboard shows").toBe(onDashboard);
  const nav = page.getByRole("navigation", { name, exact: true });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByText(name, { exact: true })).toBeVisible();
  const current = nav.locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(strings.nav.details);
  await expect(current).toHaveAttribute("href", details);
  await expect(
    nav.locator(`a[href="${restaurantMenusPath(code)}"]`),
  ).toHaveText(strings.nav.menus);
  await expect(page.locator("main h1")).toHaveText(strings.details.heading);
});

// A day's Open 24 hours box, named for its day (D-124).
function allDayName(day: DayKey): string {
  const { fields, days } = strings;
  return `${fields.allDay} ${fill(fields.allDayDay, { day: days[day] })}`;
}

// D-124: checking a day's box takes away only what follows it, focus stays
// on the box, and a second press brings back what was typed, the second
// time included. The details form saves only on Save details, so typing
// and Add send nothing, and Enter is never pressed; the write guard is the
// proof. The test starts from whatever CI Diner's Monday holds, so it needs
// no hours in the data file. Typing here sets no leave warning (only the
// editing lists set one), so nothing is left to put back.
test("Open 24 hours hides a day's times with focus kept, a second press brings back what was typed, every box names its day, and the box and the two Selects are each named by one label of one node", async ({
  page,
}) => {
  await open(page, details);
  await page.waitForLoadState("networkidle");
  const { fields } = strings;
  const monday = strings.days.mon;
  const box = page.getByRole("checkbox", {
    name: allDayName("mon"),
    exact: true,
  });
  const time = (label: string) =>
    page.getByRole("textbox", {
      name: fill(label, { day: monday }),
      exact: true,
    });
  const button = (label: string) =>
    page.getByRole("button", {
      name: fill(label, { day: monday }),
      exact: true,
    });
  const opens = time(fields.opens);
  const opensAgain = time(fields.opensAgain);
  const add = button(fields.addSecondTime);
  const remove = button(fields.removeSecondTime);

  if (await box.isChecked()) {
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).not.toBeChecked();
  }
  await opens.fill("6:45 am");
  if ((await add.count()) > 0) await add.click();
  await opensAgain.fill("9 pm");

  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
  await expect(box, "focus stays on the box").toBeFocused();
  for (const gone of [
    opens,
    time(fields.closes),
    opensAgain,
    time(fields.closesAgain),
    add,
    remove,
  ]) {
    await expect(gone).toHaveCount(0);
  }
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await page.keyboard.press("Space");
  await expect(box).not.toBeChecked();
  await expect(box, "focus stays on the box").toBeFocused();
  await expect(opens).toHaveValue("6:45 am");
  await expect(opensAgain).toHaveValue("9 pm");
  await expect(remove).toHaveCount(1);

  await expect(
    page.getByRole("checkbox", { name: new RegExp(`^${fields.allDay} `) }),
    "one box for each day",
  ).toHaveCount(DAY_KEYS.length);
  for (const day of DAY_KEYS) {
    await expect(
      page.getByRole("checkbox", { name: allDayName(day), exact: true }),
    ).toHaveCount(1);
  }

  // The one node (D-193), in every engine: the box's wrapping label holds
  // the whole name as one clipped text node with the visible words hidden
  // from assistive technology; each Select's label the same, its visible
  // words, a comma, then its value (D-195).
  await expectLabelShape(page, fieldId("hours.mon"), allDayName("mon"), {
    wrapping: true,
    visible: fields.allDay,
  });
  for (const [field, label] of [
    ["region", fields.region],
    ["timezone", fields.timezone],
  ] as const) {
    const button = page.locator(`#${fieldId(field)}`);
    const value = ((await button.textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim();
    await expectLabelShape(page, fieldId(field), `${label}, ${value}`, {
      visible: label,
    });
  }

  // The finder (D-200): a search field named by one label of plain visible
  // words, its matches listed in the page flow, so no combobox is left on
  // the page.
  const finder = page.getByRole("searchbox", {
    name: strings.finder.label,
    exact: true,
  });
  await expect(finder).toHaveCount(1);
  await expect(finder).toHaveAttribute("id", fieldId("addressFinder"));
  await expectLabelShape(page, fieldId("addressFinder"), strings.finder.label);
  await expect(page.getByRole("combobox")).toHaveCount(0);
});

// D-137: the two marks that show only in a state, checked in forced colors.
// Monday's Open 24 hours box shows its check mark, and Save details, held by
// the write guard, shows its spinner once the save has run a second
// (D-209); each is drawn in a system color with
// 3:1 against what is behind it. Space on the box sends nothing (D-127). The
// save is answered inside the browser, on a fresh form, so the error page
// follows and nothing reaches the server.
test(
  "in forced colors, a checked box's mark and a pending button's spinner are drawn in a system color",
  { tag: "@forced" },
  async ({ page }) => {
    await open(page, details);
    await page.waitForLoadState("networkidle");
    const box = page.getByRole("checkbox", {
      name: allDayName("mon"),
      exact: true,
    });
    if (!(await box.isChecked())) {
      await box.focus();
      await page.keyboard.press("Space");
    }
    await expect(box).toBeChecked();
    await expectForcedColorsKept(page, [
      {
        what: "the checked box's mark",
        selector: 'label[data-selected] > span[aria-hidden="true"] svg',
      },
    ]);

    const writes = expectWrites(page, { hold: true });
    await pressSave(page);
    const spinner = '[role="progressbar"] svg[aria-hidden="true"]';
    await expect(page.locator(spinner)).toBeVisible();
    await expectForcedColorsKept(page, [
      { what: "the pending spinner", selector: spinner },
    ]);
    writes.release();
    await expect(errorHeading(page)).toBeFocused();
  },
);

// D-189: the icons box on Details, under Allergens after the preparation
// notes, named by its label with its hint, on as CI Diner's data file sets
// it (the stand-in's seed too); Space toggles it with focus kept and sends
// nothing; it posts with Save details as its own field, present when checked
// and absent when not; and a save with it changed lands on the error page,
// since the guard answers every save in the browser (D-108). The create
// page has no such box: a new restaurant starts with icons off.
test("the icons box sits under Allergens with its hint, follows the restaurant's setting, toggles with Space, posts with Save details, and is absent from the create page (D-189)", async ({
  page,
}) => {
  await open(page, details);
  await page.waitForLoadState("networkidle");
  const allergens = page.locator("fieldset").filter({
    has: page.getByRole("heading", {
      level: 2,
      name: strings.sections.allergens,
      exact: true,
    }),
  });
  const box = allergens.getByRole("checkbox", {
    name: strings.fields.showIcons,
    exact: true,
  });
  await expect(box).toHaveCount(1);
  await expect(box).toHaveAccessibleDescription(strings.fields.showIconsHint);
  await expect(box, "on, as CI Diner's data file sets it").toBeChecked();
  const afterNotes = await box.evaluate((input, id) => {
    const notes = document.getElementById(id);
    return (
      notes !== null &&
      (notes.compareDocumentPosition(input) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    );
  }, fieldId("prepNotes"));
  expect(afterNotes, "after the preparation notes").toBe(true);
  const posted = () =>
    page.evaluate(() => {
      const form = document.querySelector("main form");
      return form instanceof HTMLFormElement
        ? [...new FormData(form).keys()]
        : [];
    });
  expect(await posted()).toContain("showIcons");
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).not.toBeChecked();
  await expect(box, "focus stays on the box").toBeFocused();
  expect(await posted()).not.toContain("showIcons");
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
  expect(await posted()).toContain("showIcons");
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);

  await page.keyboard.press("Space");
  await expect(box).not.toBeChecked();
  const writes = expectWrites(page);
  await page.getByRole("button", { name: strings.details.submit }).click();
  await expect(
    errorHeading(page),
    "focus moves to the error heading",
  ).toBeFocused();
  expect(
    writes.answered.length,
    "the save was sent and answered in the browser",
  ).toBeGreaterThan(0);

  await open(page, restaurantNewPath());
  await expect(
    page.getByRole("checkbox", { name: strings.fields.showIcons, exact: true }),
  ).toHaveCount(0);
});

// D-211, Q-141: a Details save that lands loads the page again, and the
// success banner arrives with it at the top of the body content, the
// container's full width: main's first element child, above the heading
// (D-215). D-214 refines it to GitHub's flash: the dismiss button carries
// autofocus in the served HTML, so the browser focuses it as the page
// loads, before React hydrates, and the words sit in one alert with
// aria-atomic. Inside the banner the dismiss button comes first (D-215),
// then the heading, then the words, so from the focused button the next
// item is the heading and the one after it the words (D-216); on screen
// the button stays on the right of them, by CSS order (D-215). Its icon
// sits beside the words and is hidden from assistive technology; its
// dismiss button is named and at least 24 by 24, and sends focus to the
// heading, by Enter and by pointer, through React Aria's press on the
// button our render function draws. The cookie is cleared as the banner
// shows, so a reload and Back show no banner, no alert, and nothing
// focused. Alerts are counted inside main, since Next's
// route announcer is an alert of its own under the body. The checks wait
// for Details' own heading before counting banners, so a page still on its
// way cannot pass for one without a banner.
test(
  "after a save, Details arrives with the success banner first in main, above its heading, reading its dismiss button, its heading, then its words in one atomic alert, the button on the right of the words on screen and focused by the served autofocus; dismiss by Enter or pointer sends focus to the heading, and a reload or Back shows no banner, no alert, and nothing focused (D-211, D-214, D-215, D-216)",
  { tag: "@saved-banner" },
  async ({ page }) => {
    const heading = page.locator("main h1");
    const alerts = page.locator("main").getByRole("alert");
    await setSavedNotice(page, code);
    const response = await open(page, details);
    const served = await response.text();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).search, "nothing in the address").toBe("");
    const banner = savedBanner(page);
    await expect(banner).toHaveCount(1);
    const dismiss = banner.getByRole("button", {
      name: en.ui.banner.dismiss,
      exact: true,
    });
    const servedDismiss = [...served.matchAll(/<button\b[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes(`aria-label="${en.ui.banner.dismiss}"`));
    expect(
      servedDismiss,
      "the served HTML holds one dismiss button",
    ).toHaveLength(1);
    expect(
      servedDismiss[0],
      "the served dismiss button carries autofocus, so the browser focuses it as the page loads",
    ).toMatch(/\sautofocus(=""|\s|>)/);
    await expect(
      dismiss,
      "the dismiss button has focus on arrival",
    ).toBeFocused();
    await expectLandedOutline(page);
    const alert = banner.getByRole("alert");
    await expect(alert, "the words are in one alert").toHaveCount(1);
    await expect(alert).toHaveAttribute("aria-atomic", "true");
    await expect(alert).toHaveText(strings.details.saved);
    await expect(alerts, "the banner's is the one alert in main").toHaveCount(
      1,
    );
    await expect(
      banner.getByRole("heading", {
        level: 2,
        name: en.ui.banner.success,
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      banner.getByText(strings.details.saved, { exact: true }),
    ).toBeVisible();
    const shape = await banner.evaluate((section) => {
      const main = section.closest("main");
      const h1 = main?.querySelector("h1");
      const icon = section.querySelector(":scope > svg");
      const words = section.querySelector(':scope > [role="alert"]');
      const button = section.querySelector(":scope > button");
      const padding = main ? getComputedStyle(main) : null;
      const inner = main
        ? main.clientWidth -
          parseFloat(padding?.paddingLeft ?? "0") -
          parseFloat(padding?.paddingRight ?? "0")
        : 0;
      const wordsBox = words?.getBoundingClientRect();
      const buttonBox = button?.getBoundingClientRect();
      return {
        firstInMain: main?.firstElementChild === section,
        aboveHeading: h1 !== null && section.nextElementSibling === h1,
        order: [...section.children].map((child) =>
          child.getAttribute("role") === "alert"
            ? "alert"
            : child.tagName.toLowerCase(),
        ),
        buttonRight:
          wordsBox !== undefined &&
          buttonBox !== undefined &&
          buttonBox.left >= wordsBox.right &&
          buttonBox.top < wordsBox.bottom &&
          buttonBox.bottom > wordsBox.top,
        fullWidth: Math.abs(section.getBoundingClientRect().width - inner) < 1,
        iconHidden: icon?.getAttribute("aria-hidden") === "true",
        iconShown: (icon?.getBoundingClientRect().width ?? 0) > 0,
        iconBeforeWords:
          icon !== null &&
          words !== null &&
          (icon.compareDocumentPosition(words) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
      };
    });
    expect(shape.firstInMain, "the banner is main's first element child").toBe(
      true,
    );
    expect(shape.aboveHeading, "the heading comes right after the banner").toBe(
      true,
    );
    expect(
      shape.order,
      "the banner reads its dismiss button, its heading, then its words, the icon beside them",
    ).toEqual(["button", "h2", "svg", "alert"]);
    expect(
      shape.buttonRight,
      "on screen the dismiss button sits on the right of the words, on their row",
    ).toBe(true);
    expect(shape.fullWidth, "the banner fills the container's width").toBe(
      true,
    );
    expect(shape.iconHidden, "the icon is hidden from assistive tech").toBe(
      true,
    );
    expect(shape.iconShown, "the icon shows").toBe(true);
    expect(shape.iconBeforeWords, "the icon sits before the words").toBe(true);
    const box = await dismiss.boundingBox();
    expect(
      box?.width ?? 0,
      "the dismiss button is 24 wide or more",
    ).toBeGreaterThanOrEqual(24);
    expect(
      box?.height ?? 0,
      "the dismiss button is 24 high or more",
    ).toBeGreaterThanOrEqual(24);
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page, { review: true });

    await tabTo(page, dismiss);
    await page.keyboard.press("Enter");
    await expect(banner, "dismissed, the banner goes").toHaveCount(0);
    await expect(alerts, "dismissed, no alert is left").toHaveCount(0);
    await expect(heading, "focus moves to the heading").toBeFocused();
    await expectLandedOutline(page);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(heading).toHaveText(strings.details.heading);
    await expect(banner, "a reload shows no banner").toHaveCount(0);
    await expect(alerts, "a reload shows no alert").toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement === document.body),
      "after a reload nothing is focused",
    ).toBe(true);

    // By pointer: React Aria's press reaches the button our render function
    // draws, and focus still goes to the heading.
    await setSavedNotice(page, code);
    await open(page, details);
    await page.waitForLoadState("networkidle");
    await expect(banner).toHaveCount(1);
    await expect(dismiss).toBeFocused();
    await dismiss.click();
    await expect(banner, "dismissed by pointer, the banner goes").toHaveCount(
      0,
    );
    await expect(heading, "focus moves to the heading").toBeFocused();

    await setSavedNotice(page, code);
    await open(page, details);
    await page.waitForLoadState("networkidle");
    await expect(banner).toHaveCount(1);
    await page.locator(`main a[href="${dashboardPath}"]`).click();
    await page.waitForURL(`**${dashboardPath}`);
    await page.goBack();
    await page.waitForURL(`**${details}`);
    await expect(heading).toHaveText(strings.details.heading);
    await expect(banner, "Back shows no banner").toHaveCount(0);
    await expect(alerts, "Back shows no alert").toHaveCount(0);
    await expectFocusResetThenSkipLink(page);
  },
);

// Records every title the document has, from its first byte, so a test can
// read back each one a navigation passed through. Runs in the page as an
// init script.
function recordTitles() {
  const w = window as unknown as { __arrivalTitles: string[] };
  w.__arrivalTitles = [];
  let last: string | null = null;
  new MutationObserver(() => {
    if (document.title === last) return;
    last = document.title;
    w.__arrivalTitles.push(last);
  }).observe(document, { subtree: true, childList: true, characterData: true });
}

function titlesSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __arrivalTitles: string[] };
    const seen = w.__arrivalTitles;
    w.__arrivalTitles = [];
    return seen;
  });
}

// Q-51 and D-134: a page that arrives by a link is read by Next's route
// announcer with its whole title, never its h1 alone, on all five owner
// pages a restaurant has: Details, Menus, a menu's page, a section's page,
// and a dish's page. The walk reaches each by the link an owner would press,
// and comes back to a menu's page and a section's page a second time, at
// another menu and another section, once the client already knows those
// routes.
// The title the page commits with is the whole title, never an empty one
// for an instant. Owner links never prefetch: a link pressed while its own
// prefetch was on its way arrived with an empty title, so the walk checks
// that no request is a prefetch. It runs twice: pressing each link as soon
// as its page has arrived, and pressing it after a pause, the time a
// prefetch would have had to land. Both are only reads, so the write guard
// has nothing to answer.
for (const pace of ["at once", "after a pause"] as const) {
  test(
    `arrival by a link reads the whole title on every owner page, each link pressed ${pace}`,
    { tag: "@link-arrival" },
    async ({ page }) => {
      const { withSections, withDishes, emptySection, empty, dishes } =
        ownerFixture();
      const prefetches: string[] = [];
      page.on("request", (request) => {
        if (request.headers()["next-router-prefetch"]) {
          prefetches.push(new URL(request.url()).pathname);
        }
      });
      await page.addInitScript(recordTitles);
      await open(page, dashboardPath);
      await page.waitForLoadState("networkidle");
      const name = (
        await page
          .locator(`main section:has(a[href="${details}"]) h2`)
          .textContent()
      )?.trim();
      expect(name, "the dashboard names the restaurant").toBeTruthy();
      const restaurant = name ?? "";
      const menusPath = restaurantMenusPath(code);
      const menuPage = (menu: { id: string }) =>
        restaurantMenuPath(code, menu.id);
      const sectionPage = (section: { id: string }) =>
        restaurantSectionPath(code, section.id);
      const dishPage = (dish: { id: string }) =>
        restaurantDishPath(code, dish.id);
      const breadcrumbTo = (href: string) =>
        page
          .locator("main")
          .getByRole("navigation", { name: en.ui.breadcrumb, exact: true })
          .locator(`a[href="${href}"]`);
      const inMain = (href: string) => page.locator(`main a[href="${href}"]`);
      const inNav = (href: string) =>
        page
          .getByRole("navigation", { name: restaurant, exact: true })
          .locator(`a[href="${href}"]`);

      const walk = [
        {
          link: inMain(details),
          path: details,
          title: pageTitle(en, strings.details.title, restaurant),
        },
        {
          link: inNav(menusPath),
          path: menusPath,
          title: pageTitle(en, en.owner.menus.title, restaurant),
        },
        {
          link: inMain(menuPage(withSections)),
          path: menuPage(withSections),
          title: pageTitle(en, withSections.name, restaurant),
        },
        {
          link: inMain(sectionPage(withDishes)),
          path: sectionPage(withDishes),
          title: pageTitle(en, withDishes.name, restaurant, withSections.name),
        },
        {
          link: inMain(dishPage(dishes.sizes)),
          path: dishPage(dishes.sizes),
          title: pageTitle(en, dishes.sizes.name, restaurant, [
            withDishes.name,
            withSections.name,
          ]),
        },
        {
          link: breadcrumbTo(sectionPage(withDishes)),
          path: sectionPage(withDishes),
          title: pageTitle(en, withDishes.name, restaurant, withSections.name),
        },
        {
          link: breadcrumbTo(menuPage(withSections)),
          path: menuPage(withSections),
          title: pageTitle(en, withSections.name, restaurant),
        },
        {
          link: inMain(sectionPage(emptySection)),
          path: sectionPage(emptySection),
          title: pageTitle(
            en,
            emptySection.name,
            restaurant,
            withSections.name,
          ),
        },
        {
          link: inNav(menusPath),
          path: menusPath,
          title: pageTitle(en, en.owner.menus.title, restaurant),
        },
        {
          link: inMain(menuPage(empty)),
          path: menuPage(empty),
          title: pageTitle(en, empty.name, restaurant),
        },
        {
          link: inNav(details),
          path: details,
          title: pageTitle(en, strings.details.title, restaurant),
        },
      ];

      for (const step of walk) {
        await titlesSeen(page);
        await step.link.click();
        await page.waitForURL(`**${step.path}`);
        await expect
          .poll(() => announcerText(page), {
            message: `arriving at ${step.path}, the announcer reads the whole title`,
          })
          .toBe(step.title);
        await expect(page).toHaveTitle(step.title);
        expect(
          await titlesSeen(page),
          `arriving at ${step.path}, the page commits with its whole title and never an empty one`,
        ).toEqual([step.title]);
        if (pace === "after a pause") await page.waitForTimeout(1000);
      }
      expect(prefetches, "no owner link prefetches its page").toEqual([]);
    },
  );
}

// D-97, signed in: the dashboard's details link is a client-side navigation.
test("signed in, after following Edit details, the next Tab reaches the skip link and the page is announced", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  await page.locator(`main a[href="${details}"]`).click();
  await page.waitForURL(`**${details}`);
  await expectFocusResetThenSkipLink(page);
  const name = await restaurantName(page);
  await expect.poll(() => announcerText(page)).toContain(name);
});

// D-106: the loading state comes from the link. The old page stays until the
// new one commits; the region says the word only after a second.
test("a pending link says Loading after a second, then the arriving page is announced", async ({
  page,
}) => {
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  const release = await holdNavigation(page, details);
  const link = page.locator(`main a[href="${details}"]`);
  const clickedAt = Date.now();
  await link.click();
  await expect(statusRegion(page)).toHaveText(en.ui.loading, {
    timeout: 10_000,
  });
  expect(
    Date.now() - clickedAt,
    "nothing is said before the link has been pending for a second",
  ).toBeGreaterThanOrEqual(1000);
  await expect(link, "focus stays on the pending link").toBeFocused();
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  release();
  await page.waitForURL(`**${details}`);
  await expect(statusRegion(page)).toHaveText("");
  await expectFocusResetThenSkipLink(page);
  const name = await restaurantName(page);
  await expect.poll(() => announcerText(page)).toContain(name);
});

test("at the largest phone text size, the pending state does not scroll sideways", async ({
  page,
}) => {
  await setLargestText(page);
  await open(page, dashboardPath);
  await page.waitForLoadState("networkidle");
  const release = await holdNavigation(page, details);
  await page.locator(`main a[href="${details}"]`).click();
  await expect(statusRegion(page)).toHaveText(en.ui.loading, {
    timeout: 10_000,
  });
  await expectRootAtLargest(page);
  await expectNoHorizontalScroll(page);
  release();
  await page.waitForURL(`**${details}`);
});

// D-209: a button shows and says pending only once its save has run a
// second, the rule a pending link follows before it says Loading (D-106),
// and a second press inside that second sends nothing. On Playwright's
// stopped clock, as the first focus's tests run (D-136), so the second is
// the test's own and no runner's speed can move it. React Aria's first
// message on a page is held 100 ms after the announce call by React Aria
// itself, on the same clock, so the message lands at 1,100 ms; data-pending,
// the spinner, and the announce call come at 1,000. The guard's count alone
// cannot tell a blocked second press from a sent one: useActionState queues
// a second action behind the held one and drops the queue when the first
// fails. The page's count of submits is the proof.
test(
  "a held save shows and says nothing for its first second, takes no second press inside it, and announces once at the second",
  { tag: "@pending-message" },
  async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(recordAnnouncerMessages);
    await page.addInitScript(() => {
      const w = window as unknown as { __submits: number };
      w.__submits = 0;
      document.addEventListener("submit", () => w.__submits++, true);
    });
    const submits = () =>
      page.evaluate(
        () => (window as unknown as { __submits: number }).__submits,
      );
    const writes = expectWrites(page, { hold: true });
    await open(page, details);
    const save = page.getByRole("button", { name: strings.details.submit });
    const id = await save.getAttribute("id");
    if (!id) throw new Error("the Save button has no id");
    const spinner = save.locator('[role="progressbar"]');

    await stopClock(page);
    const pressedAt = await page.evaluate(() => Date.now());
    await save.click();
    await expect(save, "the press is held at once").toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(save, "a held save submits nothing more").toHaveAttribute(
      "type",
      "button",
    );
    await expect(save).toBeFocused();
    expect(await submits(), "the press submitted the form").toBe(1);

    await page.clock.runFor(900);
    await expect(
      messagesNaming(page, id),
      "no pending message inside the second",
    ).toHaveCount(0);
    expect(
      await recordedMessages(page, id),
      "React Aria announced nothing inside the second",
    ).toEqual([]);
    await expect(
      save,
      "no pending state inside the second",
    ).not.toHaveAttribute("data-pending");
    await expect(spinner, "no spinner inside the second").toHaveCount(0);

    await page.keyboard.press("Enter");
    await save.click({ force: true });
    expect(
      await submits(),
      "a second press inside the second submits nothing",
    ).toBe(1);

    await page.clock.runFor(100);
    await expect(save, "pending shows at the second").toHaveAttribute(
      "data-pending",
      "true",
    );
    await expect(
      spinner.locator('svg[aria-hidden="true"]'),
      "the spinner arrives at the second",
    ).toBeVisible();
    await expect(
      page.locator(reactAriaAssertiveLog),
      "React Aria's announce call has run at the second",
    ).toHaveCount(1);

    await page.clock.runFor(100);
    await expect(
      messagesNaming(page, id),
      "the pending message lands once",
    ).toHaveCount(1);
    const recorded = await recordedMessages(page, id);
    expect(recorded, "one message names the Save button").toHaveLength(1);
    expect(
      (recorded[0]?.at ?? 0) - pressedAt,
      "the message lands at the second, not before",
    ).toBeGreaterThanOrEqual(1000);
    expect(await submits(), "still one submit").toBe(1);

    await page.clock.resume();
    writes.release();
    await expect(
      errorHeading(page),
      "focus moves to the error heading",
    ).toBeFocused();
    await expect(
      messagesNaming(page, id),
      "the message went with the button",
    ).toHaveCount(0);
    await expectNoNamelessMessages(page);
    await expectNothingRenamed(page);
    expect(writes.attempted, "one save was sent").toHaveLength(1);
    expect(
      writes.attempted,
      "every request that was not a GET was answered by the route",
    ).toEqual(writes.answered);
  },
);

// D-109 and D-210 pin React Aria's announcer markup, which the Button relies
// on. While the save is held, React Aria's pending message must name the
// Save button by its id, once the save has run a second (D-209); once the
// error page replaces the form, the Button has taken that message out, and
// nothing is renamed. If React Aria ever announces another way, the first
// expectation fails on the upgrade; nothing here can pass because a
// selector found nothing. Tagged so WebKit runs it at the phone size too,
// the iPhone's engine.
test(
  "a save the server cannot take lands on the focused error page, and its pending message goes with the button",
  { tag: "@pending-message" },
  async ({ page }) => {
    const writes = expectWrites(page, { hold: true });
    const id = await pressSave(page);
    await expect(
      messagesNaming(page, id),
      "React Aria's pending message names the Save button",
    ).toHaveCount(1, { timeout: 10_000 });

    writes.release();
    await expect(
      errorHeading(page),
      "focus moves to the error heading",
    ).toBeFocused();
    await expect(
      messagesNaming(page, id),
      "the message went with the button",
    ).toHaveCount(0);
    await expectNothingRenamed(page);
    expect(
      writes.answered.length,
      "the save was sent and answered in the browser",
    ).toBeGreaterThan(0);
    expect(
      writes.attempted,
      "every request that was not a GET was answered by the route",
    ).toEqual(writes.answered);
    await expect(page).toHaveTitle(pageTitle(en, en.owner.error.title));
    await expect(statusRegion(page)).toHaveText("");
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
    await expectKeyboardWalk(page);
    await expectNoNamelessMessages(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: en.owner.error.reload }).click();
    await page.waitForURL(`**${details}`);
    await expect(page.locator("main h1")).not.toHaveText(
      en.owner.error.heading,
    );
    const name = await restaurantName(page);
    await expect(page).toHaveTitle(pageTitle(en, strings.details.title, name));
  },
);

// The late path. React Aria holds back its first message on a page for
// 100 ms after the announce call; a form gone inside that hold leaves the
// message to be added after its button, and the Button watches for it and
// takes it out too (D-109, D-210). On Playwright's stopped clock, so the
// late path is taken every time: the clock runs to the second (D-209),
// where pending shows and React Aria's announce call runs, then stands
// while the answer is let go and the error page replaces the form, then
// runs out the hold. The recorder proves React Aria announced the Save
// button after it was gone, so this cannot pass on an empty log.
test(
  "answered at once, a late pending message is taken out as well",
  { tag: "@pending-message" },
  async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(recordAnnouncerMessages);
    const writes = expectWrites(page, { hold: true });
    await open(page, details);
    const save = page.getByRole("button", { name: strings.details.submit });
    const id = await save.getAttribute("id");
    if (!id) throw new Error("the Save button has no id");

    await stopClock(page);
    await save.click();
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await page.clock.runFor(1000);
    await expect(save).toHaveAttribute("data-pending", "true");
    await expect(
      page.locator(reactAriaAssertiveLog),
      "React Aria's announce call has run, its message held",
    ).toHaveCount(1);
    await expect(messagesNaming(page, id)).toHaveCount(0);

    writes.release();
    await expect(
      errorHeading(page),
      "focus moves to the error heading",
    ).toBeFocused();
    await page.clock.runFor(100);
    await page.clock.resume();
    const recorded = await recordedMessages(page, id);
    expect(
      recorded.map((m) => m.existed),
      "React Aria announced the Save button once, after it was gone",
    ).toEqual([false]);
    await expect(
      messagesNaming(page, id),
      "the late message was taken out",
    ).toHaveCount(0);
    await expectNoNamelessMessages(page);
    await expectNothingRenamed(page);
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
    expect(
      writes.attempted,
      "every request that was not a GET was answered by the route",
    ).toEqual(writes.answered);
  },
);

test("at the largest phone text size, the error page does not scroll sideways", async ({
  page,
}) => {
  expectWrites(page);
  await setLargestText(page);
  await pressSave(page);
  await expect(
    errorHeading(page),
    "focus moves to the error heading",
  ).toBeFocused();
  await expectRootAtLargest(page);
  await expectNoHorizontalScroll(page);
});

// Q-100: a save sent from the keyboard, Enter in the name field (D-108),
// that the server cannot take lands on the error page's heading, which shows
// the ring every Tab stop shows; in forced colors, in both palettes, in a
// system color. The guard answers the save inside the browser.
for (const forced of [false, true]) {
  test(
    `a save sent from the keyboard that the server cannot take lands on the error page's heading, which shows the focus ring${forced ? " in a system color" : ""}`,
    forced ? { tag: "@forced" } : {},
    async ({ page }) => {
      const writes = expectWrites(page);
      await open(page, details);
      await page.waitForLoadState("networkidle");
      await page
        .getByRole("textbox", { name: strings.fields.name, exact: true })
        .press("Enter");
      await expect(errorHeading(page)).toBeFocused();
      await expectLandedOutline(page);
      if (forced) await expectForcedColorsKept(page);
      expect(
        writes.answered.length,
        "the save was sent and answered in the browser",
      ).toBeGreaterThan(0);
    },
  );
}

// D-110: a result that arrives with the page takes focus once. The query
// value repeats, so each arrival is keyed by its render: a reload, with the
// query stripped, and Back, replaying the same render, read nothing, and a
// second arrival is read again.
const checkoutNotices = [
  ["success", en.owner.billing.checkoutSuccess],
  ["cancel", en.owner.billing.checkoutCancel],
  ["missing", en.owner.billing.restaurantMissing],
] as const;

test("a checkout result takes focus on arrival, once for each arrival", async ({
  page,
}) => {
  for (const [value, text] of checkoutNotices) {
    const path = `${dashboardPath}?checkout=${value}`;
    const message = page.getByText(text, { exact: true });
    await open(page, path);
    await expect(message).toBeFocused();
    await expectLandedOutline(page);
    await page.reload();
    await expect(message).toHaveCount(0);
    await open(page, path);
    await expect(message, "a second arrival is read again").toBeFocused();
  }
});

test("a checkout result is not read again on Back", async ({ page }) => {
  const message = page.getByText(en.owner.billing.checkoutSuccess, {
    exact: true,
  });
  await open(page, `${dashboardPath}?checkout=success`);
  await expect(message).toBeFocused();
  await page.locator(`main a[href="${restaurantNewPath()}"]`).click();
  await page.waitForURL(`**${restaurantNewPath()}`);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === dashboardPath);
  await expect(message).toHaveCount(0);
  await expectFocusResetThenSkipLink(page);
});
