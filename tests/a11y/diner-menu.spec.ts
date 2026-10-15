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
  expectNoHorizontalScroll,
  expectNoMissingIds,
  expectRootAt,
  open,
  pageChecks,
  setRootText,
} from "./checks";
import { menuCode } from "./pages";

// The diner page from real data (the diner page task), on CI Diner's
// published Dinner and Drinks as its data file leaves them (D-126), or on
// the stand-in's when `npm run local -- --public-gate` names it: the
// headings exactly as the Phase 1 acceptance line reads them (D-81), a
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
// shows now.

const bare = menuPath(menuCode);
const madeUp = menuPath(menuCode, "00000000-0000-4000-8000-000000000000");
const zone = "America/New_York";
const soupShows = () =>
  showingAt({ hours: { open: "16:00", close: "21:00" } }, new Date(), zone)
    .showing;

// The second published menu's page, found from the switcher before the
// checks that need it run. A failure says what the fetch got, its status,
// x-vercel-cache, and age, and the menus the switcher named, so a stale
// edge copy reads as one at a glance (attempt 2 on 2ef6227).
let drinksPath = "";

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
});

// The section's choices block and the link each dish carries to it (Q-74).
const kidsLink = fill(en.menu.sectionChoicesLink, { section: "Kids" });

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

test.describe(madeUp, () => {
  pageChecks(madeUp);
});

test("the headings list is exactly Accessible menu, the restaurant's name, then the sections", async ({
  page,
}) => {
  await open(page, bare);
  const list = await headings(page);
  expect(list[0]).toEqual({ level: 1, text: en.site.descriptor });
  expect(list[1]?.level).toBe(2);
  expect(list[1]?.text).not.toBe("");
  const sections = list.slice(2);
  expect(sections.length).toBeGreaterThan(0);
  for (const heading of sections) expect(heading.level).toBe(3);
  // The section list names the same sections, in order, with their counts.
  const links = await page
    .getByRole("navigation", { name: en.menu.sectionsLabel })
    .getByRole("link")
    .allTextContents();
  expect(links.map((text) => text.split(", ")[0])).toEqual(
    sections.map((heading) => heading.text),
  );
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
  for (const path of [bare, drinksPath, madeUp]) {
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
  await expect(menus.getByRole("link")).toHaveText(["Dinner", "Drinks"]);
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
    await expect(page.locator("strong", { hasText: "celery" })).toHaveCount(1);
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
  // The salad's own list (D-166): the lead once, each option's words, and
  // its own allergen sentence with the words in strong, inside the item.
  const salad = page
    .getByRole("listitem")
    .filter({ has: page.getByText("House salad", { exact: true }) });
  await expect(
    page.getByText("Choose a dressing", { exact: true }),
  ).toHaveCount(1);
  await expect(
    salad.getByText("Ranch, 150 calories", { exact: true }),
  ).toHaveCount(1);
  const ranch = salad
    .getByRole("listitem")
    .filter({ hasText: "Ranch, 150 calories" });
  await expect(ranch).toContainText("Contains milk, eggs.");
  await expect(ranch.locator("strong")).toHaveText(["milk", "eggs"]);
  const vinaigrette = salad
    .getByRole("listitem")
    .filter({ hasText: "Vinaigrette, 90 calories" });
  await expect(vinaigrette).toContainText(en.allergens.checkedNone);
  // Starters' roll list, one option, repeated inside every shown dish of
  // Starters after the dish's own lists (Q-74), never once under the
  // heading and with no link.
  const shown = soupShows() ? 2 : 1;
  await expect(
    page.getByText("Add a buttered roll to any dish", { exact: true }),
  ).toHaveCount(shown);
  await expect(
    page.getByText("Buttered roll, +$2", { exact: true }),
  ).toHaveCount(shown);
  await expect(
    page.getByText("Buttered roll, plus two dollars", { exact: true }),
  ).toHaveCount(shown);
  const roll = salad.getByRole("listitem").filter({ hasText: "Buttered roll" });
  await expect(roll).toContainText("Contains milk, wheat.");
  await expect(roll.locator("strong")).toHaveText(["milk", "wheat"]);
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
    block.getByText("Fries, 320 calories", { exact: true }),
  ).toHaveCount(1);
  const mac = block
    .getByRole("listitem")
    .filter({ hasText: "Mac and cheese, 410 calories" });
  await expect(mac).toContainText("Contains milk, wheat.");
  await expect(mac.locator("strong")).toHaveText(["milk", "wheat"]);
  await expect(
    block.getByRole("listitem").filter({ hasText: "Water" }),
  ).toContainText(en.allergens.checkedNone);
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
  } finally {
    await context.close();
  }
});

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
