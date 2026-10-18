import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { menuNaming } from "../../src/domain/diner";
import {
  feedbackPath,
  menuPath,
  statementPath,
} from "../../src/domain/menu-url";
import { showingAt } from "../../src/domain/schedule";
import {
  expectControlsShown,
  expectForcedColorsKept,
  expectLandedOutline,
  expectNoHorizontalScroll,
  expectNoMissingIds,
  expectRootAt,
  open,
  pageChecks,
  setRootText,
  tabTo,
} from "./checks";
import { menuCode } from "./pages";

// The diner page from real data (the diner page task), on CI Diner's
// published Dinner and Drinks as its data file leaves them (D-126), or on
// the stand-in's when `npm run local -- --public-gate` names it: the
// headings exactly as the Phase 1 acceptance line reads them (D-81, D-181), a
// section link landing on its heading with JavaScript and by fragment
// without it, no cookie set and no request to any other origin (rule 7),
// the page whole with scripts off (rule 1, Q-67), the sentences from the
// one builder each (rule 8), the switcher and the second menu's page by
// its id, a made-up id's page, the canonical link (D-88), a root at 53px
// (Q-42), and the choice lists in both forms (Build 2, D-166, Q-74): a
// dish's own list and Starters' roll list repeated inside each dish on
// Dinner, and Kids' two lists once under the heading on Drinks with a link
// in each dish that moves focus to them. The soup is a special every day
// from 4 to 9 pm New York, so the checks that read it compute whether it
// shows now. Brunch, the third published menu, holds one dish off the menu
// for now, so its page shows no dish and reads one line where its sections
// would be (D-177). Every allergen sentence is one plain run of text: a
// dish's line one semibold text node, an option's line one text node or the
// drawn-once, spoken-once pair (D-182).

const bare = menuPath(menuCode);
const madeUp = menuPath(menuCode, "00000000-0000-4000-8000-000000000000");
const zone = "America/New_York";
const soupShows = () =>
  showingAt({ hours: { open: "16:00", close: "21:00" } }, new Date(), zone)
    .showing;

// The second and third published menus' pages, found from the switcher
// before the checks that need them run. A failure says what the fetch got,
// its status, x-vercel-cache, and age, and the menus the switcher named,
// so a stale edge copy reads as one at a glance (attempt 2 on 2ef6227).
let drinksPath = "";
let brunchPath = "";

test.beforeAll(async ({ request }) => {
  const response = await request.get(bare);
  const headers = response.headers();
  const html = await response.text();
  const found = [
    ...html.matchAll(/href="(\/m\/\d{8}\/[0-9a-f-]{36})"[^>]*>([^<]+)</g),
  ].map((match) => ({ path: match[1] ?? "", name: match[2] ?? "" }));
  const got =
    `${bare} answered ${response.status()}, x-vercel-cache ` +
    `${headers["x-vercel-cache"] ?? "none"}, age ${headers["age"] ?? "none"}, ` +
    `menus ${found.map((menu) => menu.name).join(", ") || "none"}`;
  if (response.status() !== 200) throw new Error(`${got}: not a page`);
  const drinks = found.find((menu) => menu.name === "Drinks");
  if (!drinks) throw new Error(`${got}: the switcher names no Drinks page`);
  drinksPath = drinks.path;
  const brunch = found.find((menu) => menu.name === "Brunch");
  if (!brunch) throw new Error(`${got}: the switcher names no Brunch page`);
  brunchPath = brunch.path;
});

// The section's choices block and the link each dish carries to it (Q-74).
const kidsLink = fill(en.menu.sectionChoicesLink, { section: "Kids" });

// The section's name is on the screen above its landed choices block (Q-100,
// the block's scroll margin), so a diner who followed the link sees whose
// choices these are.
async function expectSectionNameAbove(page: Page, section: string) {
  const heading = await page
    .getByRole("heading", { level: 3, name: section, exact: true })
    .boundingBox();
  const block = await page
    .getByRole("group", {
      name: fill(en.menu.sectionChoicesLink, { section }),
      exact: true,
    })
    .boundingBox();
  expect(heading, `${section}'s heading is drawn`).not.toBeNull();
  expect(block, `${section}'s choices block is drawn`).not.toBeNull();
  expect(
    heading?.y ?? -1,
    `${section}'s heading starts on the screen`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    (heading?.y ?? 0) + (heading?.height ?? 0),
    `${section}'s heading sits above the block`,
  ).toBeLessThanOrEqual(block?.y ?? 0);
}

async function headings(page: Page) {
  return page.getByRole("heading").evaluateAll((nodes) =>
    nodes.map((node) => ({
      level: Number(node.tagName.slice(1)),
      text: node.textContent?.trim() ?? "",
    })),
  );
}

test.describe(bare, () => {
  pageChecks(bare);
});

test.describe("the second menu's page", () => {
  pageChecks(() => drinksPath);
});

test.describe("the third menu's page", () => {
  pageChecks(() => brunchPath);
});

test.describe(madeUp, () => {
  pageChecks(madeUp);
});

test("the headings list is exactly Accessible menu, the restaurant's name, then each section with its dishes (D-181)", async ({
  page,
}) => {
  await open(page, bare);
  const list = await headings(page);
  expect(list[0]).toEqual({ level: 1, text: en.site.descriptor });
  expect(list[1]?.level).toBe(2);
  expect(list[1]?.text).not.toBe("");
  // After the h2, a section's h3 and then its dishes' h4s, nothing else: no
  // other level, no two h3s in a row, and no h3 without a dish after it.
  const rest = list.slice(2);
  expect(rest.length).toBeGreaterThan(0);
  expect(rest[0]?.level).toBe(3);
  for (const heading of rest) expect([3, 4]).toContain(heading.level);
  rest.forEach((heading, index) => {
    if (heading.level === 3) expect(rest[index + 1]?.level).toBe(4);
  });
  // The section list names the same sections, in order, with their counts,
  // and each count is the number of dish headings under that section.
  const sections = rest.filter((heading) => heading.level === 3);
  const links = await page
    .getByRole("navigation", { name: en.menu.sectionsLabel })
    .getByRole("link")
    .allTextContents();
  expect(links.map((text) => text.split(", ")[0])).toEqual(
    sections.map((heading) => heading.text),
  );
  const counts: number[] = [];
  for (const heading of rest) {
    if (heading.level === 3) counts.push(0);
    else counts[counts.length - 1] = (counts[counts.length - 1] ?? 0) + 1;
  }
  expect(counts).toEqual(
    links.map((text) => Number(/, (\d+) item/.exec(text)?.[1] ?? -1)),
  );
  // Every dish heading sits inside its list item.
  const dishes = rest.filter((heading) => heading.level === 4).length;
  await expect(
    page.getByRole("listitem").getByRole("heading", { level: 4 }),
  ).toHaveCount(dishes);
});

test("a section link puts focus on its heading with JavaScript, and lands there by fragment without it", async ({
  page,
  browser,
}) => {
  await open(page, bare);
  await page.waitForLoadState("networkidle");
  const link = page
    .getByRole("navigation", { name: en.menu.sectionsLabel })
    .getByRole("link")
    .first();
  const name = (await link.textContent())?.split(", ")[0] ?? "";
  await link.click();
  const heading = page.getByRole("heading", { level: 3, name, exact: true });
  await expect(heading).toBeFocused();
  expect(new URL(page.url()).hash).not.toBe("");

  const context = await browser.newContext({
    ...(test.info().project.use as Record<string, unknown>),
    javaScriptEnabled: false,
  });
  try {
    const plain = await context.newPage();
    await plain.goto(bare);
    await plain
      .getByRole("navigation", { name: en.menu.sectionsLabel })
      .getByRole("link")
      .first()
      .click();
    await plain.waitForURL((url) => url.hash !== "");
    // The browser scrolls the heading into view; a page too short to
    // scroll it to the very top still shows it.
    const box = await plain
      .getByRole("heading", { level: 3, name, exact: true })
      .boundingBox();
    const height = plain.viewportSize()?.height ?? 0;
    expect(box, "the heading is in the viewport").not.toBeNull();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? height).toBeLessThan(height);
  } finally {
    await context.close();
  }
});

// Q-100: a section link pressed from the keyboard lands on its heading with
// the ring every Tab stop shows, the ring's top on the screen (the heading's
// scroll margin). In forced colors, in both palettes, the ring is in a system
// color; the link's own ring passes the same check first, so the check is
// seen to read a forced ring.
for (const forced of [false, true]) {
  test(
    `a section link pressed from the keyboard lands on its heading, which shows the focus ring${forced ? " in a system color" : ""}`,
    forced ? { tag: "@forced" } : {},
    async ({ page }) => {
      await open(page, bare);
      await page.waitForLoadState("networkidle");
      const link = page
        .getByRole("navigation", { name: en.menu.sectionsLabel })
        .getByRole("link")
        .first();
      const name = (await link.textContent())?.split(", ")[0] ?? "";
      await tabTo(page, link);
      if (forced) await expectForcedColorsKept(page);
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { level: 3, name, exact: true }),
      ).toBeFocused();
      await expectLandedOutline(page);
      if (forced) await expectForcedColorsKept(page);
    },
  );
}

test("no diner response sets a cookie and nothing is requested from another origin", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost:3100").origin;
  const elsewhere: string[] = [];
  const cookies: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith(origin)) elsewhere.push(url);
    return route.continue();
  });
  page.on("response", (response) => {
    if (response.headers()["set-cookie"] !== undefined) {
      cookies.push(response.url());
    }
  });
  for (const path of [bare, drinksPath, brunchPath, madeUp]) {
    const response = await open(page, path);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    await page.waitForLoadState("networkidle");
  }
  expect(elsewhere, "every request goes to the page's own origin").toEqual([]);
  expect(cookies, "no response sets a cookie").toEqual([]);
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("the page reads whole from the served HTML", async ({ page }) => {
    const response = await open(page, bare);
    const html = await response.text();
    expect(html).toContain(en.allergens.noteDefault);
    await expectNoMissingIds(page);
    const list = await headings(page);
    expect(list[0]).toEqual({ level: 1, text: en.site.descriptor });
    await expect(page.getByText(en.allergens.noteDefault)).toBeVisible();
    await expect(
      page.getByText(en.allergens.prepNotes["shared-fryer"]),
    ).toBeVisible();
    await expect(
      page.getByText(/^We're still confirming allergens for /),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: en.menu.footer.feedback, exact: true }),
    ).toHaveAttribute("href", feedbackPath(menuCode));
    await expect(
      page.getByRole("link", {
        name: en.menu.footer.statement,
        exact: true,
      }),
    ).toHaveAttribute("href", statementPath(menuCode));
    await expect(page.getByText("House salad", { exact: true })).toBeVisible();
    await expect(page.getByText("Soup of the day")).toHaveCount(
      soupShows() ? 2 : 1,
    );
    // The lists are in the served HTML too (Build 2).
    expect(html).toContain("Choose a dressing");
    expect(html).toContain("Add a buttered roll to any dish");
  });

  // Q-96: the styles arrive inside the HTML, so the page paints after one
  // request. The head holds a style tag and no stylesheet link, every
  // script in it with a src is async or defer (a nomodule script is skipped
  // by every browser that runs modules, so it never blocks), and with
  // JavaScript off the browser fetches no stylesheet and no script. Inline
  // scripts, the favicon, and the brand mark do not count, and neither does
  // a chunk the head names in a preload link: Next emits one at low
  // priority, Chromium fetches it with scripts off, and a preload never
  // holds up the paint.
  test("the styles arrive inline, and no stylesheet or script is fetched", async ({
    page,
  }) => {
    const fetched: string[] = [];
    page.on("request", (request) => {
      const type = request.resourceType();
      if (type === "stylesheet" || type === "script") {
        fetched.push(`${type} ${new URL(request.url()).pathname}`);
      }
    });
    const response = await open(page, bare);
    const html = await response.text();
    const head = html.slice(0, html.indexOf("</head>"));
    const preloaded = [...head.matchAll(/<link[^>]+rel="preload"[^>]*>/g)]
      .map((match) => /href="([^"]+)"/.exec(match[0])?.[1] ?? "")
      .filter((href) => href !== "");
    expect(head, "the head carries a style tag").toMatch(/<style[\s>]/);
    expect(head, "the head has no stylesheet link").not.toMatch(
      /<link[^>]+rel="stylesheet"/,
    );
    const blocking = [...head.matchAll(/<script\b[^>]*\bsrc=[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => !/\b(async|defer|nomodule)\b/i.test(tag));
    expect(blocking, "every script with a src is async or defer").toEqual([]);
    await page.waitForLoadState("load");
    expect(
      fetched.filter(
        (entry) => !preloaded.some((href) => entry.endsWith(` ${href}`)),
      ),
      "no stylesheet or script is fetched with JavaScript off",
    ).toEqual([]);
  });
});

test("the sentences on CI Diner's Dinner come from the builders, and the hidden dish is absent", async ({
  page,
}) => {
  await open(page, bare);
  const name = await page.getByRole("heading", { level: 2 }).textContent();
  await expect(page).toHaveTitle(
    menuNaming("Dinner", name ?? "", en.menu).title,
  );
  // The switcher: every menu by its id, Dinner current here, and no line
  // naming the menu, since the switcher does (Q-97).
  await expect(page.getByText("Dinner menu", { exact: true })).toHaveCount(0);
  const menus = page.getByRole("navigation", { name: en.menu.menusLabel });
  await expect(menus.getByRole("link")).toHaveText([
    "Dinner",
    "Drinks",
    "Brunch",
  ]);
  await expect(
    menus.getByRole("link", { name: "Dinner", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    menus.getByRole("link", { name: "Drinks", exact: true }),
  ).toHaveAttribute("href", drinksPath);
  // The week in words, from the details the data file set.
  await expect(
    page.getByText("Monday, closed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Tuesday, 11 am to 2 pm and 5 to 9 pm.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Wednesday to Friday, 11 am to 9 pm.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Saturday, 5 pm to 2 am.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sunday, open 24 hours.", { exact: true }),
  ).toBeVisible();
  // The note, its preparation sentence, and the confirmation line: Mains'
  // soup is the one unchecked dish shown, the bread being off the menu.
  await expect(page.getByText(en.allergens.noteDefault)).toBeVisible();
  await expect(
    page.getByText(en.allergens.prepNotes["shared-fryer"]),
  ).toBeVisible();
  await expect(
    page.getByText(en.allergens.confirming.one, { exact: true }),
  ).toBeVisible();
  // The section list's counts agree with what shows now.
  const sections = page.getByRole("navigation", {
    name: en.menu.sectionsLabel,
  });
  await expect(sections.getByRole("link")).toHaveText([
    soupShows() ? "Starters, 2 items" : "Starters, 1 item",
    "Mains, 1 item",
  ]);
  // The dishes, each sentence as its builder wrote it.
  if (soupShows()) {
    await expect(
      page.getByText("Cup $5, 180 calories. Bowl $8, 290 calories.", {
        exact: true,
      }),
    ).toBeAttached();
    await expect(
      page.getByText(
        "Cup, five dollars, 180 calories. Bowl, eight dollars, 290 calories.",
        { exact: true },
      ),
    ).toBeAttached();
    await expect(
      page.getByText("Contains milk, wheat, celery.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Every day, 4 to 9 pm.", { exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("$9, 320 calories", { exact: true }),
  ).toBeAttached();
  await expect(
    page.getByText("nine dollars, 320 calories", { exact: true }),
  ).toBeAttached();
  await expect(
    page.getByText(en.allergens.checkedNone, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Vegetarian. Made without gluten ingredients.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(en.allergens.notConfirmed, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Garlic bread")).toHaveCount(0);
  await expect(page.getByText(en.menu.cookedToOrder)).toHaveCount(0);
  // The salad's own list (D-166): the lead once, and each option one line,
  // its words then its own allergen sentence, inside the item (D-182).
  const salad = page
    .getByRole("listitem")
    .filter({ has: page.getByText("House salad", { exact: true }) });
  await expect(
    page.getByText("Choose a dressing", { exact: true }),
  ).toHaveCount(1);
  await expect(
    salad.getByText("Ranch, 150 calories. Contains milk, eggs.", {
      exact: true,
    }),
  ).toHaveCount(1);
  const ranch = salad
    .getByRole("listitem")
    .filter({ hasText: "Ranch, 150 calories" });
  await expect(ranch).toHaveText("Ranch, 150 calories. Contains milk, eggs.");
  const vinaigrette = salad
    .getByRole("listitem")
    .filter({ hasText: "Vinaigrette, 90 calories" });
  await expect(vinaigrette).toHaveText(
    `Vinaigrette, 90 calories. ${en.allergens.checkedNone}`,
  );
  // Starters' roll list, one option, repeated inside every shown dish of
  // Starters after the dish's own lists (Q-74), never once under the
  // heading and with no link. The roll has an added price, so its line is
  // drawn once and spoken once, the whole line in each form (D-182).
  const shown = soupShows() ? 2 : 1;
  const rollDrawn = "Buttered roll, +$2. Contains milk, wheat.";
  const rollSpoken = "Buttered roll, plus two dollars. Contains milk, wheat.";
  await expect(
    page.getByText("Add a buttered roll to any dish", { exact: true }),
  ).toHaveCount(shown);
  await expect(page.getByText(rollDrawn, { exact: true })).toHaveCount(shown);
  await expect(page.getByText(rollSpoken, { exact: true })).toHaveCount(shown);
  const roll = salad.getByRole("listitem").filter({ hasText: "Buttered roll" });
  await expect(roll.getByText(rollDrawn, { exact: true })).toHaveCount(1);
  await expect(roll.getByText(rollSpoken, { exact: true })).toHaveCount(1);
  const saladText = await salad.innerText();
  expect(saladText.indexOf("Choose a dressing")).toBeGreaterThan(
    saladText.indexOf(en.allergens.checkedNone),
  );
  expect(saladText.indexOf("Add a buttered roll to any dish")).toBeGreaterThan(
    saladText.indexOf("Vinaigrette, 90 calories"),
  );
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: fill(en.menu.sectionChoicesLink, { section: "Starters" }),
    }),
  ).toHaveCount(0);
  // Mains' soup holds no list.
  const mains = page.locator("section").filter({
    has: page.getByRole("heading", { level: 3, name: "Mains", exact: true }),
  });
  await expect(mains.getByRole("list").getByRole("list")).toHaveCount(0);
  // The notices once in the footer: the salad's calories bring two, and
  // the bread, cooked to order, is off the menu, so no advisory.
  const footer = page.locator("footer");
  await expect(footer.getByText(en.menu.notices.calories)).toHaveCount(1);
  await expect(footer.getByText(en.menu.notices.nutrition)).toHaveCount(1);
  await expect(footer.getByText(en.menu.notices.advisory)).toHaveCount(0);
  await expect(
    footer.getByRole("link", { name: en.site.name, exact: true }),
  ).toHaveAttribute("href", "/");
});

test("the menu pages carry their permanent address as their canonical link, and a made-up id's page is not indexed", async ({
  page,
}) => {
  const canonical = async (path: string) => {
    await open(page, path);
    const href = await page
      .locator('head link[rel="canonical"]')
      .getAttribute("href");
    expect(href, `${path} has a canonical link`).not.toBeNull();
    return new URL(href ?? "");
  };
  const first = await canonical(bare);
  expect(first.pathname).toBe(bare);
  expect(first.search).toBe("");
  expect(first.hash).toBe("");
  const second = await canonical(drinksPath);
  expect(second.pathname).toBe(drinksPath);
  const third = await canonical(brunchPath);
  expect(third.pathname).toBe(brunchPath);
  await open(page, madeUp);
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("a section's lists past the constant show once under its heading, and each dish links to them (Q-74)", async ({
  page,
}) => {
  await open(page, drinksPath);
  const sections = page.getByRole("navigation", {
    name: en.menu.sectionsLabel,
  });
  await expect(sections.getByRole("link")).toHaveText([
    "Soft drinks, 1 item",
    "Kids, 3 items",
  ]);
  await expect(
    page.getByRole("heading", { level: 3, name: "Kids", exact: true }),
  ).toBeVisible();
  // The block: one group named by the link's words, holding the two lists
  // with every option's words and sentence, read where the option is.
  const block = page.getByRole("group", { name: kidsLink, exact: true });
  await expect(block).toHaveCount(1);
  await expect(block).toHaveAttribute("id", /-choices$/);
  await expect(block.getByText("Choose one side", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    block.getByText("Choose one drink", { exact: true }),
  ).toHaveCount(1);
  const lists = block.getByRole("list");
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0).getByRole("listitem")).toHaveCount(6);
  await expect(lists.nth(1).getByRole("listitem")).toHaveCount(5);
  await expect(
    block.getByText(`Fries, 320 calories. ${en.allergens.checkedNone}`, {
      exact: true,
    }),
  ).toHaveCount(1);
  const mac = block
    .getByRole("listitem")
    .filter({ hasText: "Mac and cheese, 410 calories" });
  await expect(mac).toHaveText(
    "Mac and cheese, 410 calories. Contains milk, wheat.",
  );
  await expect(
    block.getByRole("listitem").filter({ hasText: "Water" }),
  ).toHaveText(`Water. ${en.allergens.checkedNone}`);
  // The leads appear nowhere else: no list inside a dish.
  await expect(page.getByText("Choose one side", { exact: true })).toHaveCount(
    1,
  );
  await expect(page.getByText("Choose one drink", { exact: true })).toHaveCount(
    1,
  );
  // Each dish ends with one link to the block, after its description.
  const kids = page.locator("section").filter({
    has: page.getByRole("heading", { level: 3, name: "Kids", exact: true }),
  });
  const links = kids.getByRole("link", { name: kidsLink, exact: true });
  await expect(links).toHaveCount(3);
  const id = await block.getAttribute("id");
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", `#${id}`);
  }
  const burger = kids
    .getByRole("listitem")
    .filter({ has: page.getByText("Kids burger", { exact: true }) });
  await expect(burger.getByRole("list")).toHaveCount(0);
  const burgerText = await burger.innerText();
  expect(burgerText.indexOf(kidsLink)).toBeGreaterThan(
    burgerText.indexOf("A small beef patty on a soft bun."),
  );
  // Everything on Drinks is checked, and the sides' calories bring the
  // calorie notices to this menu's footer.
  await expect(
    page.getByText(en.allergens.confirmedAll, { exact: true }),
  ).toBeVisible();
  const footer = page.locator("footer");
  await expect(footer.getByText(en.menu.notices.calories)).toHaveCount(1);
  await expect(footer.getByText(en.menu.notices.nutrition)).toHaveCount(1);
});

// D-182: every allergen sentence is one swipe stop. A dish's allergen line
// is one text node, semibold whatever its sentence, in its slot; an
// option's line is one text node, or the drawn-once, spoken-once pair when
// its words have a spoken form, and nothing else, so Safari makes no stop
// inside either. Read from the page as plain data, so a failure names the
// line.
type Run = { what: string; shape: "text" | "pair" | "other"; weight: string };

async function allergenRuns(
  page: Page,
): Promise<{ dishes: Run[]; options: Run[] }> {
  return page.evaluate(
    ({ contains, checkedNone, notConfirmed }) => {
      const isSentence = (text: string) =>
        text === checkedNone ||
        text === notConfirmed ||
        (text.startsWith(`${contains} `) && text.endsWith("."));
      const oneText = (node: Node | undefined) =>
        node !== undefined &&
        node.childNodes.length === 1 &&
        node.childNodes[0]?.nodeType === Node.TEXT_NODE;
      const shapeOf = (node: Element): "text" | "pair" | "other" => {
        if (oneText(node)) return "text";
        const [drawn, spoken, ...more] = node.childNodes;
        const span = (child: ChildNode | undefined, hidden: boolean) =>
          child instanceof HTMLSpanElement &&
          (child.getAttribute("aria-hidden") === "true") === hidden &&
          oneText(child);
        return more.length === 0 && span(drawn, true) && span(spoken, false)
          ? "pair"
          : "other";
      };
      const weightOf = (node: Element) => getComputedStyle(node).fontWeight;
      const dishes = [
        ...document.querySelectorAll("main section > ul > li"),
      ].map((dish) => {
        const name = dish.querySelector("h4")?.textContent ?? "a dish";
        const lines = [...dish.querySelectorAll(":scope > p")].filter((p) =>
          isSentence(p.textContent ?? ""),
        );
        const [line] = lines;
        if (lines.length !== 1 || !line) {
          return {
            what: `${name}: ${lines.length} allergen lines`,
            shape: "other" as const,
            weight: "",
          };
        }
        return {
          what: `${name}: ${line.textContent ?? ""}`,
          shape: shapeOf(line),
          weight: weightOf(line),
        };
      });
      const options = [
        ...document.querySelectorAll(
          "main section > ul > li li, [role='group'] li",
        ),
      ].map((item) => ({
        what: item.textContent ?? "",
        shape: shapeOf(item),
        weight: weightOf(item),
      }));
      return { dishes, options };
    },
    {
      contains: en.allergens.contains,
      checkedNone: en.allergens.checkedNone,
      notConfirmed: en.allergens.notConfirmed,
    },
  );
}

test("every allergen sentence is one swipe stop: a dish's line is one semibold text node, and an option's line is one text node or the drawn-once, spoken-once pair (D-182)", async ({
  page,
}) => {
  await open(page, bare);
  const dinner = await allergenRuns(page);
  const shown = soupShows() ? 2 : 1;
  // Starters' soup when it shows, the salad, and Mains' soup.
  expect(dinner.dishes.map((run) => run.what)).toHaveLength(shown + 1);
  for (const run of dinner.dishes) {
    expect(run.shape, run.what).toBe("text");
    expect(run.weight, run.what).toBe("600");
  }
  // Ranch and Vinaigrette have no spoken form: one text node each. The roll
  // has an added price: the pair, once in each shown Starters dish.
  const shapes = (runs: Run[], shape: Run["shape"]) =>
    runs.filter((run) => run.shape === shape).map((run) => run.what);
  expect(shapes(dinner.options, "other")).toEqual([]);
  expect(shapes(dinner.options, "text")).toHaveLength(2);
  expect(shapes(dinner.options, "pair")).toHaveLength(shown);
  for (const run of dinner.options) expect(run.weight, run.what).toBe("400");
  await expect(page.locator("strong, b")).toHaveCount(0);

  await open(page, drinksPath);
  const drinks = await allergenRuns(page);
  // Lemonade and the three Kids dishes; the Kids block's eleven options,
  // none with an added price.
  expect(drinks.dishes.map((run) => run.what)).toHaveLength(4);
  for (const run of drinks.dishes) {
    expect(run.shape, run.what).toBe("text");
    expect(run.weight, run.what).toBe("600");
  }
  expect(shapes(drinks.options, "other")).toEqual([]);
  expect(shapes(drinks.options, "pair")).toEqual([]);
  expect(shapes(drinks.options, "text")).toHaveLength(11);
  for (const run of drinks.options) expect(run.weight, run.what).toBe("400");
  await expect(page.locator("strong, b")).toHaveCount(0);
});

test("a dish's link to its section's choices puts focus on the block with JavaScript, and lands there by fragment without it", async ({
  page,
  browser,
}) => {
  await open(page, drinksPath);
  await page.waitForLoadState("networkidle");
  const block = page.getByRole("group", { name: kidsLink, exact: true });
  const id = (await block.getAttribute("id")) ?? "";
  expect(id).not.toBe("");
  await page.getByRole("link", { name: kidsLink, exact: true }).first().click();
  await expect(block).toBeFocused();
  expect(new URL(page.url()).hash).toBe(`#${id}`);

  const context = await browser.newContext({
    ...(test.info().project.use as Record<string, unknown>),
    javaScriptEnabled: false,
  });
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
    await expectSectionNameAbove(plain, "Kids");
  } finally {
    await context.close();
  }
});

// Q-100: the same from a dish's link to its section's choices: the block
// shows the ring, and its section's name shows above it.
for (const forced of [false, true]) {
  test(
    `a dish's link to its section's choices pressed from the keyboard lands on the block, which shows the focus ring${forced ? " in a system color" : ""} under its section's name`,
    forced ? { tag: "@forced" } : {},
    async ({ page }) => {
      await open(page, drinksPath);
      await page.waitForLoadState("networkidle");
      const link = page
        .getByRole("link", { name: kidsLink, exact: true })
        .first();
      await tabTo(page, link);
      if (forced) await expectForcedColorsKept(page);
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("group", { name: kidsLink, exact: true }),
      ).toBeFocused();
      await expectLandedOutline(page);
      await expectSectionNameAbove(page, "Kids");
      if (forced) await expectForcedColorsKept(page);
    },
  );
}

test("the second menu's page shows that menu as current, and a made-up id shows the restaurant's name with a way to its menu", async ({
  page,
}) => {
  await open(page, drinksPath);
  const name = await page.getByRole("heading", { level: 2 }).textContent();
  await expect(page).toHaveTitle(
    menuNaming("Drinks", name ?? "", en.menu).title,
  );
  const menus = page.getByRole("navigation", { name: en.menu.menusLabel });
  await expect(
    menus.getByRole("link", { name: "Drinks", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  // Every menu is linked by its id, the first one included.
  await expect(
    menus.getByRole("link", { name: "Dinner", exact: true }),
  ).toHaveAttribute("href", /^\/m\/\d{8}\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 3, name: "Soft drinks", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Lemonade", { exact: true })).toBeVisible();
  await expect(page.getByText("$3", { exact: true })).toBeAttached();
  await expect(page.getByText("three dollars", { exact: true })).toBeAttached();
  await expect(
    page.getByText(en.allergens.confirmedAll, { exact: true }),
  ).toBeVisible();

  await open(page, madeUp);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(name ?? "");
  await expect(
    page.getByText(en.menu.menuUnavailable, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: fill(en.menu.menuUnavailableLink, { restaurant: name ?? "" }),
      exact: true,
    }),
  ).toHaveAttribute("href", bare);
  await expect(
    page.getByRole("link", { name: en.menu.footer.feedback, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: en.menu.footer.statement, exact: true }),
  ).toBeVisible();
});

test("a published menu with nothing to show says so where its sections would be, keeps the note, and claims nothing about allergens (D-177)", async ({
  page,
}) => {
  await open(page, brunchPath);
  const name = await page.getByRole("heading", { level: 2 }).textContent();
  await expect(page).toHaveTitle(
    menuNaming("Brunch", name ?? "", en.menu).title,
  );
  // The headings list is the h1 and the restaurant's name alone: no dish
  // shows, so no section's h3 and no dish's h4 (D-181).
  const list = await headings(page);
  expect(list.map((heading) => heading.level)).toEqual([1, 2]);
  // The switcher stays, Brunch current, so its link lands somewhere.
  const menus = page.getByRole("navigation", { name: en.menu.menusLabel });
  await expect(menus.getByRole("link")).toHaveText([
    "Dinner",
    "Drinks",
    "Brunch",
  ]);
  await expect(
    menus.getByRole("link", { name: "Brunch", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  // No section list, no section, no choices block.
  await expect(
    page.getByRole("navigation", { name: en.menu.sectionsLabel }),
  ).toHaveCount(0);
  await expect(page.locator("main section")).toHaveCount(0);
  await expect(page.getByRole("group")).toHaveCount(0);
  // The note and its preparation sentence stay, then the one line, once.
  await expect(page.getByText(en.allergens.noteDefault)).toBeVisible();
  await expect(
    page.getByText(en.allergens.prepNotes["shared-fryer"]),
  ).toBeVisible();
  const line = page.getByText(en.menu.nothingServed, { exact: true });
  await expect(line).toHaveCount(1);
  await expect(line).toBeVisible();
  const paragraphs = await page
    .locator("main p")
    .evaluateAll((all) => all.map((p) => (p.textContent ?? "").trim()));
  expect(
    paragraphs.indexOf(en.allergens.noteDefault),
    "the note comes before the line",
  ).toBeLessThan(paragraphs.indexOf(en.menu.nothingServed));
  // Nothing claims the allergens are confirmed, or still being confirmed.
  await expect(
    page.getByText(en.allergens.confirmedAll, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/^We're still confirming allergens for /),
  ).toHaveCount(0);
  // The footer: no notice, since nothing shows, and the two quiet links.
  const footer = page.locator("footer");
  await expect(footer.getByText(en.menu.notices.calories)).toHaveCount(0);
  await expect(footer.getByText(en.menu.notices.advisory)).toHaveCount(0);
  await expect(
    footer.getByRole("link", { name: en.menu.footer.feedback, exact: true }),
  ).toBeVisible();
  await expect(
    footer.getByRole("link", { name: en.menu.footer.statement, exact: true }),
  ).toBeVisible();
  // The served HTML holds the line and no section list, so the page reads
  // the same with JavaScript off (rule 1).
  const served = await (await page.request.get(brunchPath)).text();
  expect(served).toContain(en.menu.nothingServed);
  expect(served).not.toContain(`aria-label="${en.menu.sectionsLabel}"`);
  expect(served).not.toContain(en.allergens.confirmedAll);
});

test("at a 53px root, no horizontal scroll and nothing cut off", async ({
  page,
}) => {
  await setRootText(page, 53);
  await open(page, bare);
  await expectRootAt(page, 53);
  await expectControlsShown(page);
  await expectNoHorizontalScroll(page);
  await expectControlsShown(page);
});
