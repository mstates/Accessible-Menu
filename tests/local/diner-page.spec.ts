import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { soldOutEnd } from "../../src/domain/availability";
import { parseHours } from "../../src/domain/hours";
import { menuPath } from "../../src/domain/menu-url";
import { parseSchedule } from "../../src/domain/schedule";
import { formatTime } from "../../src/domain/time";
import { lifetimeSeconds, nextTimedChange } from "../../src/domain/timed";
import { zonedDay } from "../../src/domain/timezones";
import {
  restaurantDetailsPath,
  restaurantDishPath,
  restaurantMenuPath,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// The diner page with the writes landing for real against the stand-in
// (the diner page task): a price change live through Publish; a special's
// end and a sold-out dish's return ending the page's lifetime at the edge
// (core/cache, the one proof that unstable_cache lowers the route's
// revalidate); availability and a schedule reaching diners without
// Publish; a details save live; a failed read never cached; the two
// unavailable pages (Q-84, Q-31); a made-up id's page; the second menu's
// page by its id; the page whole with JavaScript off; and a new
// restaurant's code answering at once. The stand-in seeds Dinner and
// Drinks published as CI Diner's data file leaves them. Each check puts
// the stand-in back as it found it.

const { code } = ownerEnv();
const bare = menuPath(code);
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const zone = "America/New_York";
const dish = en.owner.dish;
const publishing = en.owner.publishing;
const saved = en.owner.editing.fieldSaved;
const restaurants = en.owner.restaurants;

type Served = { status: number; html: string; maxAge: number | null };

// A diner's read of a page: its status, its HTML, and the s-maxage the
// server set, which is the page's lifetime at the edge.
async function served(page: Page, path: string): Promise<Served> {
  const response = await page.request.get(path, {
    headers: { accept: "text/html" },
    maxRedirects: 0,
  });
  const control = response.headers()["cache-control"] ?? "";
  const match = /s-maxage=(\d+)/.exec(control);
  return {
    status: response.status(),
    html: await response.text(),
    maxAge: match?.[1] ? Number(match[1]) : null,
  };
}

async function knob(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response;
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

async function openOwner(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

// Chooses a radio by its visible words: React Aria keeps the input under
// the label, where a pointer cannot reach it directly.
async function choose(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
  await expect.poll(() => said(page, saved)).toBe(1);
}

function publishButton(page: Page, name: string) {
  return page
    .getByRole("region", { name: publishing.heading, exact: true })
    .getByRole("button", { name, exact: true });
}

async function press(page: Page, name: string, sentence: string) {
  await publishButton(page, name).click();
  await expect.poll(() => said(page, sentence)).toBe(1);
}

// Menus by name, from the stand-in's rows.
async function menuId(name: string): Promise<string> {
  const rows = (await (await knob("menus")).json()) as {
    id: string;
    name: string;
    deleted_at: string | null;
  }[];
  const found = rows.find((row) => row.name === name && !row.deleted_at);
  if (!found) throw new Error(`no menu ${name}`);
  return found.id;
}

// A time of day in New York, as the schedule's fields take it.
function clock(at: Date): string {
  const { minutes } = zonedDay(zone, at);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return formatTime(`${hh}:${mm}`, en.time);
}

test("a price change is live on the diner page within a minute of Publish", async ({
  page,
}) => {
  const { dishes, withSections } = ownerFixture();
  expect((await served(page, bare)).html).toContain("$9, 320 calories");

  await openOwner(page, restaurantDishPath(code, dishes.one.id));
  const price = field(page, dish.price.amountLabel);
  await price.fill("10");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  expect(
    (await served(page, bare)).html,
    "a draft reaches no diner before Publish",
  ).toContain("$9, 320 calories");

  await openOwner(page, restaurantMenuPath(code, withSections.id));
  await press(page, publishing.publish, publishing.spoken.published);
  await expect
    .poll(async () => (await served(page, bare)).html, { timeout: 60_000 })
    .toContain("$10, 320 calories");

  // As it was.
  await openOwner(page, restaurantDishPath(code, dishes.one.id));
  await field(page, dish.price.amountLabel).fill("9");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await openOwner(page, restaurantMenuPath(code, withSections.id));
  await press(page, publishing.publish, publishing.spoken.published);
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain("$9, 320 calories");
});

test("a special's hours ending ends the page's lifetime, and the page changes on its own", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { dishes } = ownerFixture();
  // The soup's hours: from an hour ago until the next whole minute at
  // least a minute ahead, in New York time, so the special shows now and
  // ends within two minutes.
  const now = new Date();
  const ends = new Date(Math.ceil((now.getTime() + 60_000) / 60_000) * 60_000);
  const starts = new Date(now.getTime() - 60 * 60_000);
  await openOwner(page, restaurantDishPath(code, dishes.sizes.id));
  await field(page, dish.schedule.starts).fill(clock(starts));
  await field(page, dish.schedule.ends).fill(clock(ends));
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);

  const before = await served(page, bare);
  expect(before.status).toBe(200);
  // Mains' soup shares the name, so the special is told by its sizes.
  expect(before.html, "the special shows now").toContain(
    "Cup $5, 180 calories",
  );
  const left = Math.ceil((ends.getTime() - Date.now()) / 1000);
  expect(
    before.maxAge,
    "the lifetime ends when the special's hours end",
  ).not.toBeNull();
  expect(before.maxAge ?? 0).toBeLessThanOrEqual(left + 2);
  expect(before.maxAge ?? 0).toBeGreaterThan(0);

  // Past the end: the first read may serve the old page once while the
  // fresh one renders; the next shows the special gone, with nobody
  // pressing anything.
  await page.waitForTimeout(Math.max(0, ends.getTime() - Date.now()) + 1500);
  await served(page, bare);
  await expect
    .poll(async () => (await served(page, bare)).html, { timeout: 30_000 })
    .not.toContain("Cup $5, 180 calories");

  // As it was: every day from 4 to 9 pm.
  await openOwner(page, restaurantDishPath(code, dishes.sizes.id));
  await field(page, dish.schedule.starts).fill("4 pm");
  await field(page, dish.schedule.ends).fill("9 pm");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
});

test("Sold out today reaches diners without Publish, and the page's lifetime ends no later than the dish's return", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openOwner(page, restaurantDishPath(code, dishes.one.id));
  await choose(page, dish.availability.soldOut);
  try {
    const read = await served(page, bare);
    expect(read.html).toContain(en.availability.soldOut);
    // The lifetime is the earliest timed change on the menu, as the domain
    // works it out from the stand-in's rows (the soup's hours may end
    // first), and never later than the restaurant's day's end, when the
    // dish comes back.
    const restaurant = (await (await knob("restaurant")).json()) as {
      hours: unknown;
    };
    const rows = (await (await knob("items")).json()) as {
      id: string;
      available: boolean;
      sold_out_at: string | null;
      special_schedule: unknown;
      deleted_at: string | null;
    }[];
    const hours = parseHours(restaurant.hours);
    const now = new Date();
    const expected = lifetimeSeconds(
      now,
      nextTimedChange({
        now,
        zone,
        hours,
        dishes: rows
          .filter((row) => row.deleted_at === null)
          .map((row) => ({
            available: row.available,
            soldOutAt: row.sold_out_at,
            schedule: parseSchedule(row.special_schedule),
          })),
      }),
    );
    const mark = rows.find((row) => row.id === dishes.one.id)?.sold_out_at;
    expect(mark).not.toBeNull();
    const back = soldOutEnd(new Date(mark ?? 0), hours, zone);
    const left = Math.ceil((back.getTime() - now.getTime()) / 1000);
    expect(read.maxAge).not.toBeNull();
    expect(expected).not.toBeNull();
    expect(Math.abs((read.maxAge ?? 0) - (expected ?? 0))).toBeLessThanOrEqual(
      5,
    );
    expect(read.maxAge ?? 0).toBeLessThanOrEqual(left + 2);
  } finally {
    // As it was.
    await openOwner(page, restaurantDishPath(code, dishes.one.id));
    await choose(page, dish.availability.available);
  }
  await expect
    .poll(async () => (await served(page, bare)).html)
    .not.toContain(en.availability.soldOut);
});

test("a details save is live on the diner page", async ({ page }) => {
  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  const website = field(page, restaurants.fields.website);
  await website.fill("https://standin.example");
  await page
    .getByRole("button", { name: restaurants.details.submit, exact: true })
    .click();
  await page.waitForURL(/saved=/);
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain('href="https://standin.example"');

  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  await field(page, restaurants.fields.website).fill("");
  await page
    .getByRole("button", { name: restaurants.details.submit, exact: true })
    .click();
  await page.waitForURL(/saved=/);
  await expect
    .poll(async () => (await served(page, bare)).html)
    .not.toContain("standin.example");
});

test("a failed read is never cached: the page answers 500 once and the menu on the next read", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  // A press clears the restaurant's pages, so the next read renders: the
  // salad off the menu for now.
  await openOwner(page, restaurantDishPath(code, dishes.one.id));
  await choose(page, dish.availability.off);
  try {
    await knob("fail-read", { times: "1" });
    expect((await served(page, bare)).status).toBe(500);
    const next = await served(page, bare);
    expect(next.status).toBe(200);
    expect(next.html).not.toContain("House salad");
  } finally {
    await openOwner(page, restaurantDishPath(code, dishes.one.id));
    await choose(page, dish.availability.available);
  }
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain("House salad");
});

test("a known code with nothing published shows the name and one line, never a 404, and the menu returns on Publish", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  const drinks = await menuId("Drinks");
  await openOwner(page, restaurantMenuPath(code, withSections.id));
  await press(page, publishing.unpublish, publishing.spoken.unpublished);
  await openOwner(page, restaurantMenuPath(code, drinks));
  await press(page, publishing.unpublish, publishing.spoken.unpublished);

  const read = await served(page, bare);
  expect(read.status).toBe(200);
  expect(read.html).toContain(en.menu.unavailable);
  expect(read.html).toContain('name="robots"');
  expect(read.html).toContain("noindex");
  expect(read.html).toContain(en.menu.footer.feedback);
  expect(read.html).toContain(en.menu.footer.statement);
  expect(read.html).not.toContain(en.menu.sectionsLabel);

  await openOwner(page, restaurantMenuPath(code, withSections.id));
  await press(page, publishing.publish, publishing.spoken.published);
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain("House salad");
  await openOwner(page, restaurantMenuPath(code, drinks));
  await press(page, publishing.publish, publishing.spoken.published);
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain(">Drinks<");
});

test("a menu id that is not published shows the name, its line, and the way to the menu, for a minute at a time", async ({
  page,
}) => {
  const name = "Stand-in Diner (test restaurant, not real)";
  for (const id of [
    "00000000-0000-4000-8000-000000000000",
    await menuId("Lunch"),
  ]) {
    const read = await served(page, menuPath(code, id));
    expect(read.status).toBe(200);
    expect(read.html).toContain(en.menu.menuUnavailable);
    expect(read.html).toContain(
      fill(en.menu.menuUnavailableLink, { restaurant: name }),
    );
    expect(read.html).toContain(`href="${bare}"`);
    expect(read.html).toContain("noindex");
    expect(read.html).toContain(en.menu.footer.feedback);
    expect(read.maxAge).toBe(60);
  }
  // The Drinks page by its id, as the switcher links it.
  const drinks = await served(page, menuPath(code, await menuId("Drinks")));
  expect(drinks.status).toBe(200);
  expect(drinks.html).toContain("Lemonade");
  expect(drinks.html).toContain(
    fill(en.menu.menuTitle, { menu: "Drinks", restaurant: name }),
  );
});

test("with JavaScript off the page reads whole and points at no missing id", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto(bare);
    expect(response?.status()).toBe(200);
    await expectNoMissingIds(page);
    await expect(
      page.getByRole("heading", { level: 1, name: en.site.descriptor }),
    ).toBeVisible();
    await expect(page.getByText("House salad", { exact: true })).toBeVisible();
    await expect(
      page.getByText(en.allergens.checkedNone, { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("an unknown code answers 404, and the new restaurant's code answers with its name at once", async ({
  page,
}) => {
  // The code the stand-in will mint for the next restaurant, read first so
  // its page is cached as not found before the create.
  const { code } = (await (await knob("next-code")).json()) as {
    code: string;
  };
  expect(code).toMatch(/^\d{8}$/);
  expect((await served(page, menuPath(code))).status).toBe(404);
  await page.goto("/app/restaurants/new");
  await page.waitForLoadState("networkidle");
  await field(page, restaurants.fields.name).fill("Second Stand-in");
  await field(page, restaurants.fields.address).fill("2 Main Street");
  await field(page, restaurants.fields.city).fill("Reading");
  // The state Select's trigger shows its placeholder until a state is chosen.
  await page
    .getByRole("button")
    .filter({ hasText: restaurants.fields.regionPlaceholder })
    .click();
  await page.getByRole("option", { name: "Pennsylvania", exact: true }).click();
  await field(page, restaurants.fields.postalCode).fill("19601");
  await page
    .getByRole("button", { name: restaurants.new.submit, exact: true })
    .click();
  await page.waitForURL(/created=1/);
  try {
    // The page for the new code: cached as not found before the create,
    // cleared by it (core/cache), the name and the line now.
    expect(page.url()).toContain(`/restaurants/${code}/`);
    const read = await served(page, menuPath(code));
    expect(read.status).toBe(200);
    expect(read.html).toContain("Second Stand-in");
    expect(read.html).toContain(en.menu.unavailable);
  } finally {
    await knob("remove-created");
  }
});
