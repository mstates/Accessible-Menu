import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { DAY_KEYS, type DayKey } from "../../src/domain/hours";
import {
  dashboardPath,
  restaurantDetailsPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantNewPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import {
  expectFocusResetThenSkipLink,
  expectKeyboardWalk,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectRootAtLargest,
  open,
  pageChecks,
  setLargestText,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { ownerPages, restaurantName } from "./pages";
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

for (const path of ownerPages(code)) {
  test.describe(path, () => {
    pageChecks(path);
  });
}

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

// Records every message React Aria adds to its log, and whether each element
// it names existed when it was added. Runs in the page as an init script.
function recordAnnouncerMessages() {
  const w = window as unknown as {
    __messages: { names: string[]; existed: boolean }[];
  };
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
        });
      }
    }
  }).observe(document, { subtree: true, childList: true });
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
test("Open 24 hours hides a day's times with focus kept, a second press brings back what was typed, and every box names its day", async ({
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
});

test("a saved result takes focus on arrival and is not read again on reload or Back", async ({
  page,
}) => {
  const message = page.getByText(strings.details.saved, { exact: true });
  await open(page, restaurantDetailsPath(code, { saved: 1 }));
  await expect(message).toBeFocused();
  await page.reload();
  await expect(message).toHaveCount(0);

  await open(page, restaurantDetailsPath(code, { saved: 2 }));
  await expect(message).toBeFocused();
  await page.locator(`main a[href="${dashboardPath}"]`).click();
  await page.waitForURL(`**${dashboardPath}`);
  await page.goBack();
  await page.waitForURL(`**${details}`);
  await expect(message).toHaveCount(0);
  await expectFocusResetThenSkipLink(page);
});

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
// announcer with its whole title, never its h1 alone, on all four owner
// pages a restaurant has: Details, Menus, a menu's page, and a section's
// page. The walk reaches each by the link an owner would press, and comes
// back to a menu's page and a section's page a second time, at another
// menu and another section, once the client already knows those routes.
// The title the page commits with is the whole title, never an empty one
// for an instant. Owner links never prefetch: a link pressed while its own
// prefetch was on its way arrived with an empty title, so the walk checks
// that no request is a prefetch. It runs twice: pressing each link as soon
// as its page has arrived, and pressing it after a pause, the time a
// prefetch would have had to land. Both are only reads, so the write guard
// has nothing to answer.
for (const pace of ["at once", "after a pause"] as const) {
  test(`arrival by a link reads the whole title on every owner page, each link pressed ${pace}`, async ({
    page,
  }) => {
    const { withSections, withDishes, emptySection, empty } = ownerFixture();
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
        link: page
          .locator("main")
          .getByRole("navigation", { name: en.ui.breadcrumb, exact: true })
          .locator(`a[href="${menuPage(withSections)}"]`),
        path: menuPage(withSections),
        title: pageTitle(en, withSections.name, restaurant),
      },
      {
        link: inMain(sectionPage(emptySection)),
        path: sectionPage(emptySection),
        title: pageTitle(en, emptySection.name, restaurant, withSections.name),
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
  });
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

// D-109 pins React Aria's announcer markup, which the Button relies on.
// While the save is held, React Aria's pending message must name the Save
// button by its id; once the error page replaces the form, the Button has
// taken that message out. If React Aria ever announces another way, the
// first expectation fails on the upgrade; nothing here can pass because a
// selector found nothing.
test("a save the server cannot take lands on the focused error page, and its pending message goes with the button", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const id = await pressSave(page);
  await expect(
    messagesNaming(page, id),
    "React Aria's pending message names the Save button",
  ).toHaveCount(1);

  writes.release();
  await expect(
    errorHeading(page),
    "focus moves to the error heading",
  ).toBeFocused();
  await expect(
    messagesNaming(page, id),
    "the message went with the button",
  ).toHaveCount(0);
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
  await expectNoAxeViolations(page);
  await expectKeyboardWalk(page);
  await expectNoNamelessMessages(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: en.owner.error.reload }).click();
  await page.waitForURL(`**${details}`);
  await expect(page.locator("main h1")).not.toHaveText(en.owner.error.heading);
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, strings.details.title, name));
});

// The late path. Answered at once, the form can be gone before React Aria
// adds its first message on the page, which it holds back for 100 ms; the
// Button watches for that message and takes it out too. The recorder proves
// React Aria still announced the Save button, so this cannot pass on an
// empty log.
test("answered at once, a late pending message is taken out as well", async ({
  page,
}) => {
  await page.addInitScript(recordAnnouncerMessages);
  const writes = expectWrites(page);
  const id = await pressSave(page);
  await expect(
    errorHeading(page),
    "focus moves to the error heading",
  ).toBeFocused();
  await expect
    .poll(
      () =>
        page.evaluate(
          (button) =>
            (
              window as unknown as {
                __messages: { names: string[]; existed: boolean }[];
              }
            ).__messages.filter((m) => m.names.includes(button)).length,
          id,
        ),
      { message: "React Aria announced the pending Save button" },
    )
    .toBeGreaterThan(0);
  const late = await page.evaluate(
    (button) =>
      (
        window as unknown as {
          __messages: { names: string[]; existed: boolean }[];
        }
      ).__messages.some((m) => m.names.includes(button) && !m.existed),
    id,
  );
  test.info().annotations.push({
    type: "pending message",
    description: late
      ? "added after the Save button was gone"
      : "added while the Save button existed",
  });
  await expect(messagesNaming(page, id)).toHaveCount(0);
  await expectNoNamelessMessages(page);
  await expectNoAxeViolations(page);
  expect(
    writes.attempted,
    "every request that was not a GET was answered by the route",
  ).toEqual(writes.answered);
});

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
