import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { restaurantDishPath } from "../../src/features/owner/paths";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { flashBanner } from "../a11y/saved-banner";
import { saveAndFail, saveAndLand } from "./save";

// A dish's General page and the back-forward cache (D-237). A page
// restored from that cache comes back as it was left, its form and the
// document the form showed with it, without loading or running the page's
// code again. So a Back after a full load elsewhere can show a dish as it
// was before someone else changed it, and the Save there must be refused,
// never written over the change: the form hands back the document it
// showed, and the database compares it with its own read.
//
// Reaching that cache from Playwright takes the two changes
// details-bfcache.spec.ts found (D-211): the full Chromium with
// --disable-back-forward-cache left out, and General's document served
// without Cache-Control: no-store. Playwright's WebKit and Firefox restore
// no page at all, so Safari's own Back is heard by hand. These options
// start a worker of their own, so they live at the top of their own file.
// Each check puts the dish back as it found it.
test.use({
  channel: "chromium",
  launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
});

const { code } = ownerEnv();
const strings = en.owner.dish;
const general = strings.general;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Restores = { __restored: boolean[] };
type Stored = { description: string | null; note: string | null };

function generalPath(): string {
  return restaurantDishPath(code, ownerFixture().dishes.one.id);
}

async function stored(): Promise<Stored> {
  const { dishes } = ownerFixture();
  const response = await fetch(`${standin}/__test/general?id=${dishes.one.id}`);
  return (await response.json()) as Stored;
}

async function generalCalls(): Promise<number> {
  const response = await fetch(`${standin}/__test/writes`);
  return ((await response.json()) as string[]).filter((each) =>
    each.startsWith("rpc save_item_general "),
  ).length;
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

// General's document without no-store, and each pageshow recorded with
// whether it came from the cache: a restore keeps the page's window, so a
// second entry, true, can only be a restore.
async function prepare(page: Page): Promise<void> {
  const path = generalPath();
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const request = route.request();
      if (request.method() !== "GET" || request.headers()["rsc"]) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "cache-control": "private, max-age=0",
        },
      });
    },
  );
  await page.addInitScript(() => {
    const w = window as unknown as Restores;
    w.__restored = [];
    addEventListener("pageshow", (event) => w.__restored.push(event.persisted));
  });
}

// Saves a description, loads another page whole, as a typed address does,
// and comes Back from the page itself: Playwright's goBack waits for a
// load a restore never fires. Then says how the page came back, with the
// browser's own reasons when it did not come from the cache.
async function saveLeaveAndComeBack(
  page: Page,
  between: () => Promise<void>,
): Promise<void> {
  const path = generalPath();
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await field(page, strings.descriptionLabel).fill("Saved before leaving");
  await saveAndLand(page, general.submit, general.saved);

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await between();
  await page.evaluate(() => history.back());
  await expect
    .poll(() => page.evaluate(() => location.pathname).catch(() => ""))
    .toBe(path);
  await page.waitForLoadState("networkidle");
  const restored = await page
    .evaluate(() => (window as unknown as Restores).__restored)
    .catch(() => []);
  const reasons = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType("navigation");
    return JSON.stringify(
      (entry as unknown as { notRestoredReasons?: unknown })
        ?.notRestoredReasons ?? null,
    );
  });
  expect(
    restored,
    `General came back from the back-forward cache (the browser's reasons when it did not: ${reasons})`,
  ).toEqual([false, true]);
  await expect(
    flashBanner(page, "success"),
    "restored, the flash hides itself",
  ).toHaveCount(0);
  await expect(
    field(page, strings.descriptionLabel),
    "restored, the fields are as they were left",
  ).toHaveValue("Saved before leaving");
}

async function saveElsewhere(browser: Browser, page: Page): Promise<void> {
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  try {
    const other = await context.newPage();
    await other.goto(`${origin}${generalPath()}`);
    await other.waitForLoadState("networkidle");
    await field(other, strings.descriptionLabel).fill("Changed while away");
    await saveAndLand(other, general.submit, general.saved);
  } finally {
    await context.close();
  }
}

// As it was: the dish's General document put back as each check found it.
let found: unknown;

test.beforeEach(async () => {
  const { dishes } = ownerFixture();
  found = await (
    await fetch(`${standin}/__test/general?id=${dishes.one.id}`)
  ).json();
});

test.afterEach(async () => {
  const { dishes } = ownerFixture();
  const response = await fetch(
    `${standin}/__test/put-general?id=${dishes.one.id}`,
    { method: "POST", body: JSON.stringify(found) },
  );
  expect(response.ok, "the dish is as it was").toBe(true);
});

test("a General page restored from the back-forward cache after the dish changed elsewhere refuses its Save as moved, with nothing written over", async ({
  page,
  browser,
}) => {
  await prepare(page);
  await saveLeaveAndComeBack(page, () => saveElsewhere(browser, page));
  expect((await stored()).description).toBe("Changed while away");

  const calls = await generalCalls();
  await field(page, strings.noteLabel).fill("Typed after Back");
  await saveAndFail(page, general.submit, general.moved);
  expect(await generalCalls(), "one call, refused").toBe(calls + 1);
  expect(await stored()).toMatchObject({
    description: "Changed while away",
    note: null,
  });
});

test("a General page restored from the back-forward cache with no change in between lands its Save", async ({
  page,
}) => {
  await prepare(page);
  await saveLeaveAndComeBack(page, async () => {});
  await field(page, strings.noteLabel).fill("Typed after Back");
  await saveAndLand(page, general.submit, general.saved);
  expect(await stored()).toMatchObject({
    description: "Saved before leaving",
    note: "Typed after Back",
  });
});
