import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { soldOutEnd } from "../../src/domain/availability";
import { menuNaming } from "../../src/domain/diner";
import { parseHours } from "../../src/domain/hours";
import { menuPath, statementPath } from "../../src/domain/menu-url";
import { parseSchedule } from "../../src/domain/schedule";
import { formatTime } from "../../src/domain/time";
import { lifetimeSeconds, nextTimedChange } from "../../src/domain/timed";
import { zonedDay } from "../../src/domain/timezones";
import {
  restaurantDetailsPath,
  restaurantDishPagePath,
  restaurantDishPath,
  restaurantMenuPagePath,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog } from "../a11y/owner-lists";
import { flashBanner } from "../a11y/saved-banner";
import { saveAndLand } from "./save";

// The diner page with the writes landing for real against the stand-in
// (the diner page task): a price change live through Publish; a special's
// end and a sold-out dish's return ending the page's lifetime at the edge
// (core/cache, the one proof that unstable_cache lowers the route's
// revalidate); availability and a schedule reaching diners without
// Publish; a details save live; a failed read never cached; the two
// unavailable pages (Q-84, Q-31); a made-up id's page; the second menu's
// page by its id; the page whole with JavaScript off; a new restaurant's
// code answering at once; a section's lists past the constant once under
// the heading with a link in each dish that moves focus to them (Build 2,
// Q-74); the menu named under the restaurant's name when it is the only
// one published (Q-97); and a published menu that shows no dish reading
// one line where its sections would be (D-177). The stand-in seeds
// Dinner, Drinks, and Brunch published as CI Diner's data file leaves
// them. Each check puts the stand-in back as it found it.

const { code } = ownerEnv();
const bare = menuPath(code);
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const zone = "America/New_York";
const dish = en.owner.dish;
const publishing = en.owner.publishing;
const restaurants = en.owner.restaurants;

type Served = {
  status: number;
  html: string;
  maxAge: number | null;
  staleFor: number | null;
};

// A diner's read of a page: its status, its HTML, the s-maxage the server
// set, which is the page's lifetime at the edge, and the
// stale-while-revalidate window after it, one second on a page with a
// lifetime (Q-95): past it the edge waits for the fresh page.
async function served(page: Page, path: string): Promise<Served> {
  const response = await page.request.get(path, {
    headers: { accept: "text/html" },
    maxRedirects: 0,
  });
  const control = response.headers()["cache-control"] ?? "";
  const match = /s-maxage=(\d+)/.exec(control);
  const stale = /stale-while-revalidate=(\d+)/.exec(control);
  return {
    status: response.status(),
    html: await response.text(),
    maxAge: match?.[1] ? Number(match[1]) : null,
    staleFor: stale?.[1] ? Number(stale[1]) : null,
  };
}

async function knob(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response;
}

async function openOwner(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

// Chooses a radio by its visible words and saves the page (D-223, D-229):
// React Aria keeps the input under the label, where a pointer cannot reach
// it directly. The page loads again with the flash, so the log is attached
// again.
async function choose(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
  await saveAndLand(page, dish.availability.submit, dish.availability.saved);
  await hearLog(page);
}

// Publish or Unpublish on a menu's Publishing page (D-224), landed for
// real: the page loads again with the flash that names the menu (D-231).
// That page has no log, so it is opened on its own, never through
// openOwner.
async function press(
  page: Page,
  menu: { id: string; name: string },
  which: "publish" | "unpublish",
): Promise<void> {
  await page.goto(restaurantMenuPagePath(code, menu.id, "publishing"));
  await page.waitForLoadState("networkidle");
  await saveAndLand(
    page,
    publishing[which],
    fill(
      which === "publish"
        ? publishing.flash.published
        : publishing.flash.unpublished,
      { menu: menu.name },
    ),
  );
}

// Menus and dishes by name, from the stand-in's rows.
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

async function dishId(name: string): Promise<string> {
  const rows = (await (await knob("items")).json()) as {
    id: string;
    name: string;
    deleted_at: string | null;
  }[];
  const found = rows.find((row) => row.name === name && !row.deleted_at);
  if (!found) throw new Error(`no dish ${name}`);
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
  await field(page, dish.price.amountLabel).fill("10");
  await saveAndLand(page, dish.general.submit, dish.general.saved);
  expect(
    (await served(page, bare)).html,
    "a draft reaches no diner before Publish",
  ).toContain("$9, 320 calories");

  await press(page, withSections, "publish");
  await expect
    .poll(async () => (await served(page, bare)).html, { timeout: 60_000 })
    .toContain("$10, 320 calories");

  // As it was.
  await openOwner(page, restaurantDishPath(code, dishes.one.id));
  await field(page, dish.price.amountLabel).fill("9");
  await saveAndLand(page, dish.general.submit, dish.general.saved);
  await press(page, withSections, "publish");
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
  await openOwner(
    page,
    restaurantDishPagePath(code, dishes.sizes.id, "availability"),
  );
  await field(page, dish.schedule.starts).fill(clock(starts));
  await field(page, dish.schedule.ends).fill(clock(ends));
  await saveAndLand(page, dish.availability.submit, dish.availability.saved);

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
  expect(
    before.staleFor,
    "a one-second stale window on a page that has a lifetime",
  ).toBe(1);

  // Past the end, with a margin for the whole second the lifetime rounds
  // up to and the one-second window: the first read already waits for the
  // fresh page, the special gone with nobody pressing anything.
  await page.waitForTimeout(Math.max(0, ends.getTime() - Date.now()) + 3000);
  const after = await served(page, bare);
  expect(after.status).toBe(200);
  expect(
    after.html,
    "the first read past the end shows the special gone",
  ).not.toContain("Cup $5, 180 calories");

  // As it was: every day from 4 to 9 pm.
  await openOwner(
    page,
    restaurantDishPagePath(code, dishes.sizes.id, "availability"),
  );
  await field(page, dish.schedule.starts).fill("4 pm");
  await field(page, dish.schedule.ends).fill("9 pm");
  await saveAndLand(page, dish.availability.submit, dish.availability.saved);
});

test("Sold out today reaches diners without Publish, and the page's lifetime ends no later than the dish's return", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openOwner(
    page,
    restaurantDishPagePath(code, dishes.one.id, "availability"),
  );
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
    expect(read.staleFor, "a one-second stale window").toBe(1);
  } finally {
    // As it was.
    await openOwner(
      page,
      restaurantDishPagePath(code, dishes.one.id, "availability"),
    );
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
  // The save landed: Details loaded again, with its banner (D-211).
  await expect(flashBanner(page, "success")).toHaveCount(1, {
    timeout: 10_000,
  });
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain('href="https://standin.example"');
  // The site is the markup's sameAs too (D-184); the clear below takes it
  // out of both.
  expect((await served(page, bare)).html).toContain(
    '"sameAs":"https://standin.example"',
  );

  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  await field(page, restaurants.fields.website).fill("");
  await page
    .getByRole("button", { name: restaurants.details.submit, exact: true })
    .click();
  // The save landed: Details loaded again, with its banner (D-211).
  await expect(flashBanner(page, "success")).toHaveCount(1, {
    timeout: 10_000,
  });
  await expect
    .poll(async () => (await served(page, bare)).html)
    .not.toContain("standin.example");
});

async function writes(): Promise<string[]> {
  return (await (await knob("writes")).json()) as string[];
}

// The icon rows as the page holds them (D-189), read as plain data: every
// paragraph of a dish with the row after it, if one follows; every option's
// list item with the row inside it, if one ends it; whether every allergen
// sentence is still one text node; the sprite's symbols; whether every use
// resolves to one; titles inside svgs; svgs on the page; and whether the
// sprite sits after the footer and outside every landmark.
type IconRead = { text: string; row: string[] | null };
type IconsOnPage = {
  lines: IconRead[];
  options: IconRead[];
  sentencesOneTextNode: boolean;
  symbols: string[];
  usesResolve: boolean;
  titles: number;
  svgs: number;
  spriteAfterFooter: boolean;
};

function iconsOn(page: Page): Promise<IconsOnPage> {
  return page.evaluate(
    ({ contains, checkedNone, notConfirmed }) => {
      const hrefs = (row: Element | null): string[] | null => {
        if (!row || row.getAttribute("aria-hidden") !== "true") return null;
        if ((row.textContent ?? "").trim() !== "") return null;
        const svgs = [...row.children];
        if (
          svgs.length === 0 ||
          !svgs.every((child) => child.tagName.toLowerCase() === "svg")
        ) {
          return null;
        }
        return svgs.map(
          (svg) => svg.querySelector("use")?.getAttribute("href") ?? "",
        );
      };
      const isSentence = (text: string) =>
        text === checkedNone ||
        text === notConfirmed ||
        (text.startsWith(`${contains} `) && text.endsWith("."));
      const paragraphs = [
        ...document.querySelectorAll("main section > ul > li > p"),
      ];
      const lines = paragraphs.map((p) => ({
        text: p.textContent ?? "",
        row: hrefs(p.nextElementSibling),
      }));
      const sentencesOneTextNode = paragraphs
        .filter((p) => isSentence(p.textContent ?? ""))
        .every(
          (p) =>
            p.childNodes.length === 1 &&
            p.childNodes[0]?.nodeType === Node.TEXT_NODE,
        );
      const options = [
        ...document.querySelectorAll(
          "main section > ul > li li, [role='group'] li",
        ),
      ].map((item) => ({
        text: item.textContent ?? "",
        row: hrefs(item.lastElementChild),
      }));
      const symbols = [...document.querySelectorAll("symbol")].map(
        (symbol) => symbol.id,
      );
      const usesResolve = [...document.querySelectorAll("use")].every((use) => {
        const href = use.getAttribute("href") ?? "";
        return (
          href.startsWith("#") &&
          document.getElementById(href.slice(1))?.tagName.toLowerCase() ===
            "symbol"
        );
      });
      const sprite = document.querySelector("symbol")?.closest("svg") ?? null;
      const footer = document.querySelector("footer");
      const spriteAfterFooter =
        sprite !== null &&
        footer !== null &&
        sprite.closest("main, footer, nav, header") === null &&
        (footer.compareDocumentPosition(sprite) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0;
      return {
        lines,
        options,
        sentencesOneTextNode,
        symbols,
        usesResolve,
        titles: document.querySelectorAll("svg title").length,
        svgs: document.querySelectorAll("svg").length,
        spriteAfterFooter,
      };
    },
    {
      contains: en.allergens.contains,
      checkedNone: en.allergens.checkedNone,
      notConfirmed: en.allergens.notConfirmed,
    },
  );
}

// Turns the icons box on or off through Details and saves, the way an owner
// does, so the diner page is re-rendered through the restaurant's tag.
async function setIcons(page: Page, on: boolean): Promise<void> {
  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  const box = page.getByRole("checkbox", {
    name: restaurants.fields.showIcons,
    exact: true,
  });
  if ((await box.isChecked()) !== on) {
    await box.focus();
    await page.keyboard.press("Space");
  }
  await expect(box).toBeChecked({ checked: on });
  await page
    .getByRole("button", { name: restaurants.details.submit, exact: true })
    .click();
  // The save landed: Details loaded again, with its banner (D-211).
  await expect(flashBanner(page, "success")).toHaveCount(1, {
    timeout: 10_000,
  });
}

const ICON_IDS = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame",
  "vegan",
  "vegetarian",
];

// D-189: with the stand-in's restaurant on, as CI Diner's data file sets it,
// every Contains sentence and every diet line is followed by a row of its
// own, hidden, with one use per named major allergen or tag in the words'
// order from one sprite of eleven symbols; a custom allergen (the soup's
// celery) and made-without-gluten (no glyph, D-66) draw nothing, the other
// two sentences get no row, every sentence stays one text node, and the
// same HTML comes with JavaScript off. A save of the box off takes every
// row and the sprite out of the HTML and leaves the sentences; a save of it
// on brings them back. The box itself reads its hint.
test("with icons on, each Contains sentence and each diet line is followed by its own hidden row of icons from one sprite, with JavaScript off too; a save of the box off takes them all out of the HTML, and a save of it on brings them back (D-189)", async ({
  page,
  browser,
}) => {
  const icon = (id: string) => `#icon-${id}`;
  const expectOn = (read: IconsOnPage) => {
    const line = (text: string) =>
      read.lines.find((each) => each.text === text);
    expect(
      line(en.allergens.checkedNone)?.row,
      "no row after Checked. No major allergens.",
    ).toBeNull();
    expect(
      line(en.allergens.notConfirmed)?.row,
      "no row after the unconfirmed sentence",
    ).toBeNull();
    expect(
      line("Vegetarian. Made without gluten ingredients.")?.row,
      "the diet row holds vegetarian alone (D-66)",
    ).toEqual([icon("vegetarian")]);
    const soup = line("Contains milk, wheat, celery.");
    if (soup) {
      expect(soup.row, "celery is custom and draws nothing").toEqual([
        icon("milk"),
        icon("wheat"),
      ]);
    }
    expect(read.sentencesOneTextNode, "every sentence one text node").toBe(
      true,
    );
    const option = (start: string) =>
      read.options.find((each) => each.text.startsWith(start));
    expect(option("Ranch, 150 calories")?.row).toEqual([
      icon("milk"),
      icon("eggs"),
    ]);
    expect(option("Vinaigrette, 90 calories")?.row).toBeNull();
    const rolls = read.options.filter((each) =>
      each.text.startsWith("Buttered roll"),
    );
    expect(rolls.length).toBeGreaterThan(0);
    for (const roll of rolls) {
      expect(roll.row, roll.text).toEqual([icon("milk"), icon("wheat")]);
    }
    expect(read.symbols).toEqual(ICON_IDS.map((id) => `icon-${id}`));
    expect(read.usesResolve, "every use resolves to a symbol").toBe(true);
    expect(read.titles, "no title inside an svg").toBe(0);
    expect(read.spriteAfterFooter, "the sprite after the footer").toBe(true);
  };

  await page.goto(bare);
  expectOn(await iconsOn(page));
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const plain = await context.newPage();
    await plain.goto(bare);
    expectOn(await iconsOn(plain));
  } finally {
    await context.close();
  }

  try {
    await page.goto(restaurantDetailsPath(code));
    await page.waitForLoadState("networkidle");
    const box = page.getByRole("checkbox", {
      name: restaurants.fields.showIcons,
      exact: true,
    });
    await expect(box).toBeChecked();
    await expect(box).toHaveAccessibleDescription(
      restaurants.fields.showIconsHint,
    );
    await setIcons(page, false);
    const patch = (await writes())
      .filter((each) => each.startsWith("PATCH restaurants "))
      .at(-1);
    expect(
      JSON.parse(String(patch).slice("PATCH restaurants ".length)),
    ).toMatchObject({ show_icons: false });
    expect(
      (await (await knob("restaurant")).json()) as { show_icons: boolean },
    ).toMatchObject({ show_icons: false });
    await expect
      .poll(async () => (await served(page, bare)).html)
      .not.toContain("<svg");
    const off = (await served(page, bare)).html;
    expect(off).not.toContain("<symbol");
    expect(off).not.toContain("<use");
    expect(off).toContain(en.allergens.checkedNone);
    expect(off).toContain("Vegetarian. Made without gluten ingredients.");
    await page.goto(bare);
    const read = await iconsOn(page);
    expect(read.svgs).toBe(0);
    expect(read.lines.every((each) => each.row === null)).toBe(true);
    expect(read.options.every((each) => each.row === null)).toBe(true);
    expect(read.sentencesOneTextNode).toBe(true);
  } finally {
    await setIcons(page, true);
  }
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain("<symbol");
  await page.goto(bare);
  expectOn(await iconsOn(page));
});

test("a failed read is never cached: the page answers 500 once and the menu on the next read", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  // A press clears the restaurant's pages, so the next read renders: the
  // salad off the menu for now.
  await openOwner(
    page,
    restaurantDishPagePath(code, dishes.one.id, "availability"),
  );
  await choose(page, dish.availability.off);
  try {
    await knob("fail-read", { times: "1" });
    expect((await served(page, bare)).status).toBe(500);
    const next = await served(page, bare);
    expect(next.status).toBe(200);
    expect(next.html).not.toContain("House salad");
  } finally {
    await openOwner(
      page,
      restaurantDishPagePath(code, dishes.one.id, "availability"),
    );
    await choose(page, dish.availability.available);
  }
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain("House salad");
});

test("a known code with nothing published shows the name and one line, never a 404, and the menu returns on Publish", async ({
  page,
}) => {
  const name = "CI Diner (test restaurant, not real)";
  const { withSections } = ownerFixture();
  const drinks = await menuId("Drinks");
  const brunch = await menuId("Brunch");
  const drinksMenu = { id: drinks, name: "Drinks" };
  const brunchMenu = { id: brunch, name: "Brunch" };
  await press(page, withSections, "unpublish");
  await press(page, drinksMenu, "unpublish");
  await press(page, brunchMenu, "unpublish");

  const read = await served(page, bare);
  expect(read.status).toBe(200);
  expect(read.html).toContain(en.menu.unavailable);
  expect(read.html).toContain('name="robots"');
  expect(read.html).toContain("noindex");
  expect(read.html).toContain(en.menu.footer.feedback);
  expect(read.html).toContain(en.menu.footer.statement);
  expect(read.html).not.toContain(en.menu.sectionsLabel);
  expect(read.html, "no markup on the unavailable page").not.toContain(
    "ld+json",
  );
  // The statement keeps the name and lists no menu (D-184).
  const statement = await served(page, statementPath(code));
  expect(statement.status).toBe(200);
  expect(statement.html).toContain(
    fill(en.statement.heading, { restaurant: name }),
  );
  expect(statement.html).not.toContain(`>${en.statement.menus.heading}<`);
  for (const id of [withSections.id, drinks, brunch]) {
    expect(statement.html).not.toContain(`href="${menuPath(code, id)}"`);
  }

  await press(page, withSections, "publish");
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain("House salad");
  await press(page, drinksMenu, "publish");
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain(">Drinks<");
  await press(page, brunchMenu, "publish");
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain(">Brunch<");
  // The statement lists the three again, each by its id.
  await expect
    .poll(async () => (await served(page, statementPath(code))).html)
    .toContain(`href="${menuPath(code, brunch)}"`);
  const listed = (await served(page, statementPath(code))).html;
  expect(listed).toContain(`>${en.statement.menus.heading}<`);
  for (const id of [withSections.id, drinks]) {
    expect(listed).toContain(`href="${menuPath(code, id)}"`);
  }
});

test("the page carries one schema.org script with the stand-in's city and country, and the statement lists every published menu by name (D-184)", async ({
  page,
}) => {
  const read = await served(page, bare);
  const scripts = [
    ...read.html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((match) => match[1] ?? "");
  expect(scripts).toHaveLength(1);
  const graph = JSON.parse(scripts[0] ?? "") as {
    name: string;
    address: Record<string, string>;
    hasMenu: { name: string; hasMenuSection: { name: string }[] };
  };
  expect(graph.name).toBe("CI Diner (test restaurant, not real)");
  expect(graph.address).toEqual({
    "@type": "PostalAddress",
    addressLocality: "Reading",
    addressCountry: "US",
  });
  expect(graph.hasMenu.name).toBe("Dinner");
  expect(graph.hasMenu.hasMenuSection.map((section) => section.name)).toEqual([
    "Starters",
    "Mains",
  ]);

  const statement = await served(page, statementPath(code));
  expect(statement.status).toBe(200);
  expect(statement.html).toContain(`>${en.statement.menus.heading}<`);
  for (const menu of ["Dinner", "Drinks", "Brunch"]) {
    expect(statement.html).toContain(
      `href="${menuPath(code, await menuId(menu))}"`,
    );
    expect(statement.html).toContain(`>${menu}<`);
  }
  expect(statement.html).not.toContain(
    `href="${menuPath(code, await menuId("Lunch"))}"`,
  );
  expect(statement.html).not.toContain("ld+json");
});

test("a menu id that is not published shows the name, its line, and the way to the menu, for a minute at a time", async ({
  page,
}) => {
  const name = "CI Diner (test restaurant, not real)";
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
    expect(read.staleFor, "a one-second stale window after the minute").toBe(1);
  }
  // The Drinks page by its id, as the switcher links it.
  const drinks = await served(page, menuPath(code, await menuId("Drinks")));
  expect(drinks.status).toBe(200);
  expect(drinks.html).toContain("Lemonade");
  expect(drinks.html).toContain(menuNaming("Drinks", name, en.menu).title);
});

test("a section's lists past the constant show once under the heading with a link in every dish, and the link moves focus with JavaScript and lands by fragment without it", async ({
  page,
  browser,
}) => {
  const kidsLink = fill(en.menu.sectionChoicesLink, { section: "Kids" });
  const drinksPath = menuPath(code, await menuId("Drinks"));
  await page.goto(drinksPath);
  await page.waitForLoadState("networkidle");
  // One block named by the link's words, holding the two lists and their
  // eleven options; each of the three dishes holds one link to it and no
  // list of its own.
  const block = page.getByRole("group", { name: kidsLink, exact: true });
  await expect(block).toHaveCount(1);
  const id = (await block.getAttribute("id")) ?? "";
  expect(id).toMatch(/-choices$/);
  await expect(block.getByRole("list")).toHaveCount(2);
  await expect(block.getByRole("listitem")).toHaveCount(11);
  await expect(page.getByText("Choose one side", { exact: true })).toHaveCount(
    1,
  );
  await expect(page.getByText("Choose one drink", { exact: true })).toHaveCount(
    1,
  );
  const links = page.getByRole("link", { name: kidsLink, exact: true });
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", `#${id}`);
  }
  await links.first().click();
  await expect(block).toBeFocused();
  expect(new URL(page.url()).hash).toBe(`#${id}`);

  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const plain = await context.newPage();
    await plain.goto(drinksPath);
    await plain
      .getByRole("link", { name: kidsLink, exact: true })
      .first()
      .click();
    await plain.waitForURL((url) => url.hash === `#${id}`);
    const box = await plain
      .getByRole("group", { name: kidsLink, exact: true })
      .boundingBox();
    const height = plain.viewportSize()?.height ?? 0;
    expect(box, "the block is in the viewport").not.toBeNull();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? height).toBeLessThan(height);
  } finally {
    await context.close();
  }

  // The repeated form on Dinner: Starters' roll list inside each shown
  // dish after the dish's own list, no block, no link.
  await page.goto(bare);
  await page.waitForLoadState("networkidle");
  const salad = page
    .getByRole("listitem")
    .filter({ has: page.getByText("House salad", { exact: true }) });
  const saladText = await salad.innerText();
  expect(saladText.indexOf("Add a buttered roll to any dish")).toBeGreaterThan(
    saladText.indexOf("Vinaigrette, 90 calories"),
  );
  await expect(
    salad.getByText("Buttered roll, +$2. Contains milk, wheat.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: fill(en.menu.sectionChoicesLink, { section: "Starters" }),
    }),
  ).toHaveCount(0);
});

test("with one menu published the page names it under the restaurant's name and in the title, and with two the switcher takes its place", async ({
  page,
}) => {
  const name = "CI Diner (test restaurant, not real)";
  const drinks = { id: await menuId("Drinks"), name: "Drinks" };
  const brunch = { id: await menuId("Brunch"), name: "Brunch" };
  await press(page, drinks, "unpublish");
  await press(page, brunch, "unpublish");
  try {
    const alone = await served(page, bare);
    expect(alone.status).toBe(200);
    expect(alone.html).toContain(
      `<title>${menuNaming("Dinner", name, en.menu).title}</title>`,
    );
    expect(alone.html).toContain(">Dinner menu<");
    expect(alone.html).not.toContain(`aria-label="${en.menu.menusLabel}"`);
  } finally {
    await press(page, drinks, "publish");
    await press(page, brunch, "publish");
  }
  await expect
    .poll(async () => (await served(page, bare)).html)
    .toContain(">Brunch<");
  const both = await served(page, bare);
  expect(both.html).toContain(
    `<title>${menuNaming("Dinner", name, en.menu).title}</title>`,
  );
  expect(both.html).not.toContain(">Dinner menu<");
  expect(both.html).toContain(`aria-label="${en.menu.menusLabel}"`);
});

test("a published menu whose every dish is off the menu says nothing is served where its sections would be, keeps the note, and shows its dishes again when one is available (D-177)", async ({
  page,
}) => {
  const name = "CI Diner (test restaurant, not real)";
  const brunch = menuPath(code, await menuId("Brunch"));
  const shakshuka = await dishId("Shakshuka");
  const line = en.menu.nothingServed;

  const empty = await served(page, brunch);
  expect(empty.status).toBe(200);
  expect(empty.html).toContain(
    `<title>${menuNaming("Brunch", name, en.menu).title}</title>`,
  );
  expect(empty.html).toContain(line);
  expect(empty.html).toContain(en.allergens.noteDefault);
  expect(empty.html).toContain(en.allergens.prepNotes["shared-fryer"]);
  expect(
    empty.html.indexOf(en.allergens.noteDefault),
    "the note comes before the line",
  ).toBeLessThan(empty.html.indexOf(line));
  expect(empty.html).not.toContain(en.allergens.confirmedAll);
  expect(empty.html).not.toContain("still confirming allergens");
  expect(empty.html).not.toContain(`aria-label="${en.menu.sectionsLabel}"`);
  expect(empty.html).not.toContain("Shakshuka");
  // The switcher stays, Brunch among its menus, so its link lands somewhere.
  expect(empty.html).toContain(`aria-label="${en.menu.menusLabel}"`);
  expect(empty.html).toContain(">Brunch<");
  // No timed change: the page lives until a write, as Drinks' page does.
  const drinks = await served(page, menuPath(code, await menuId("Drinks")));
  expect(empty.maxAge).toBe(drinks.maxAge);
  expect(empty.staleFor).toBe(drinks.staleFor);

  // Available again through its dish page, which clears the restaurant's
  // pages: Eggs is back with its dish and the confirmation line, and the
  // line is gone.
  await openOwner(
    page,
    restaurantDishPagePath(code, shakshuka, "availability"),
  );
  await choose(page, dish.availability.available);
  try {
    const shown = await served(page, brunch);
    expect(shown.html).toContain("Shakshuka");
    expect(shown.html).toContain(`aria-label="${en.menu.sectionsLabel}"`);
    expect(shown.html).toContain(en.allergens.confirmedAll);
    expect(shown.html).not.toContain(line);
  } finally {
    await openOwner(
      page,
      restaurantDishPagePath(code, shakshuka, "availability"),
    );
    await choose(page, dish.availability.off);
  }
  await expect
    .poll(async () => (await served(page, brunch)).html)
    .toContain(line);
});

test("with JavaScript off the page reads whole and points at no missing id", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto(bare);
    expect(response?.status()).toBe(200);
    // Q-96: the styles are inside the HTML, so the page paints after one
    // request; the gate checks the same on the preview.
    const html = (await response?.text()) ?? "";
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head, "the head carries a style tag").toMatch(/<style[\s>]/);
    expect(head, "the head has no stylesheet link").not.toMatch(
      /<link[^>]+rel="stylesheet"/,
    );
    await expectNoMissingIds(page);
    await expect(
      page.getByRole("heading", { level: 1, name: en.site.descriptor }),
    ).toBeVisible();
    // A dish's name is an h4 inside its list item (D-181).
    await expect(
      page.getByRole("heading", { level: 4, name: "House salad", exact: true }),
    ).toBeVisible();
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
