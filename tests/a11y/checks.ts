import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The checks every page gets (D-62, D-103, D-107), shared by the public pages
// and the owner pages, plus the D-97 expectation after a client-side page
// change.

const MAX_TABS = 200;

// WCAG 1.4.12 text spacing, applied the way a user style sheet would apply it.
const textSpacing = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p {
    margin-bottom: 2em !important;
  }
`;

// Android's largest text size, 200% (D-103). With the text-scale opt-in,
// Chrome scales its default font size with the phone's setting and rem
// follows. Chromium's own default font size stands in for the phone, so an
// absolute font-size on html shows here as a root that did not grow, where
// an injected style would hide it.
const largestText = { standard: 32, fixed: 26 };
const textScaleMeta = /<meta name="text-scale" content="scale"\s*\/?>/;

type Focused = {
  key: string;
  visible: boolean;
  indicated: boolean;
  injected: boolean;
};

// Vercel injects a preview toolbar (vercel-live-feedback) into preview
// deployments. It is not part of the page and never ships to production,
// so the walk steps over any element whose tag starts with "vercel-".
// The browser-side checks below inline that prefix because page.evaluate
// runs them in the page, where module constants do not exist.

export async function open(page: Page, path: string) {
  const response = await page.goto(path);
  if (!response) throw new Error(`${path} returned no response`);
  expect(response.status(), `${path} must be a real page`).toBe(200);
  return response;
}

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

// Tags every focusable element with an index and returns their keys.
async function focusableKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'a[href], area[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]';
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );
    const keys: string[] = [];
    elements.forEach((element, index) => {
      if (element.tagName.toLowerCase().startsWith("vercel-")) return;
      const disabled = element.matches(":disabled");
      const negative = element.getAttribute("tabindex") === "-1";
      const style = getComputedStyle(element);
      const shown =
        element.getClientRects().length > 0 &&
        style.visibility !== "hidden" &&
        !element.closest("[hidden], [inert]");
      if (disabled || negative || !shown) return;
      const key = `${element.tagName.toLowerCase()}#${index}`;
      element.setAttribute("data-a11y-key", key);
      keys.push(key);
    });
    return keys;
  });
}

async function focused(page: Page): Promise<Focused> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) {
      return { key: "body", visible: true, indicated: true, injected: false };
    }
    const style = getComputedStyle(element);
    const outline =
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== "none";
    return {
      key:
        element.getAttribute("data-a11y-key") ?? element.tagName.toLowerCase(),
      visible:
        element.getClientRects().length > 0 && style.visibility !== "hidden",
      indicated: outline || shadow,
      injected: element.tagName.toLowerCase().startsWith("vercel-"),
    };
  });
}

// Records every change of document.title from the first byte, so a check
// can say what the title was at first paint. Runs in the page as an init
// script, so it names nothing from this module.
function recordTitles() {
  const w = window as unknown as { __titles: { t: number; title: string }[] };
  w.__titles = [{ t: performance.now(), title: document.title }];
  new MutationObserver(() => {
    const last = w.__titles[w.__titles.length - 1];
    if (last?.title !== document.title) {
      w.__titles.push({ t: performance.now(), title: document.title });
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
}

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};

function decodeEntities(text: string) {
  return text.replace(
    /&(?:amp|lt|gt|quot|#x27|#39);/g,
    (m) => entities[m] ?? m,
  );
}

// D-107: exactly one title, inside the served head, and it is the document
// title from first contentful paint through load.
export async function expectTitleInServedHead(page: Page, path: string) {
  await page.addInitScript(recordTitles);
  const response = await open(page, path);
  const html = await response.text();
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
  expect(titles.length, `${path} serves exactly one title`).toBe(1);
  const [title] = titles;
  expect(title?.index ?? -1, "the title is in the served head").toBeLessThan(
    html.indexOf("</head>"),
  );
  const served = decodeEntities(title?.[1] ?? "");
  // The paint entry is recorded a frame or so after the paint itself.
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName("first-contentful-paint").length,
      ),
    )
    .toBeGreaterThan(0);
  const seen = await page.evaluate(() => {
    const w = window as unknown as {
      __titles: { t: number; title: string }[];
    };
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    const before = paint
      ? w.__titles.filter((e) => e.t <= paint.startTime)
      : [];
    return {
      atFirstPaint: before[before.length - 1]?.title ?? null,
      atLoad: document.title,
    };
  });
  expect(seen.atFirstPaint, "the title at first contentful paint").toBe(served);
  expect(seen.atLoad, "the title after load").toBe(served);
}

// The checks below run on whatever state the page is in, so the owner tests
// apply them to a pending link and to the error page as well as to a fresh
// load.

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const summary = results.violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help}\n  ${violation.nodes
          .map((node) => node.target.join(" "))
          .join("\n  ")}`,
    )
    .join("\n");
  expect(results.violations, summary).toEqual([]);
}

// The walk starts from the empty element at the top of the body, where focus
// sits after a page change (D-97), so a page that moved focus to a message
// on arrival is still walked from the skip link.
export async function expectKeyboardWalk(page: Page) {
  const expected = await focusableKeys(page);
  await page.locator("[data-focus-reset]").focus();
  const reached: string[] = [];
  let tabs = 0;
  while (tabs < MAX_TABS) {
    await page.keyboard.press("Tab");
    tabs += 1;
    const current = await focused(page);
    if (current.key === "body") break;
    if (reached.includes(current.key)) break;
    if (current.injected) continue;
    expect(current.visible, `${current.key} took focus while hidden`).toBe(
      true,
    );
    expect(current.indicated, `${current.key} shows no focus indicator`).toBe(
      true,
    );
    reached.push(current.key);
  }
  expect(tabs, "focus never cycled back: possible keyboard trap").toBeLessThan(
    MAX_TABS,
  );
  expect([...reached].sort()).toEqual([...expected].sort());
}

export async function expectNoHorizontalScroll(page: Page) {
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.addStyleTag({ content: textSpacing });
  expect(await hasHorizontalScroll(page)).toBe(false);
}

// Call before the first load: the font size applies to pages loaded after it.
export async function setLargestText(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Page.setFontSizes", { fontSizes: largestText });
}

export async function expectRootAtLargest(page: Page) {
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).fontSize,
    ),
    "html follows the default font size",
  ).toBe("32px");
}

// Registers the checks for one path. Call it inside a describe.
export function pageChecks(path: string) {
  test("axe reports zero violations", async ({ page }) => {
    await open(page, path);
    await expectNoAxeViolations(page);
  });

  test("keyboard reaches every control, focus is visible, nothing traps", async ({
    page,
  }) => {
    await open(page, path);
    await expectKeyboardWalk(page);
  });

  test("no horizontal scroll, before and after text spacing", async ({
    page,
  }) => {
    await open(page, path);
    await expectNoHorizontalScroll(page);
  });

  test("at the largest phone text size, no horizontal scroll, before and after text spacing", async ({
    page,
  }) => {
    await setLargestText(page);
    const response = await open(page, path);
    const html = await response.text();
    const headEnd = html.indexOf("</head>");
    expect(headEnd, `${path} served no head`).toBeGreaterThan(-1);
    expect(
      html.slice(0, headEnd),
      "the text-scale opt-in is in the served head",
    ).toMatch(textScaleMeta);
    await expectRootAtLargest(page);
    await expectNoHorizontalScroll(page);
  });

  test("the title is in the served head and is the document title from first paint", async ({
    page,
  }) => {
    await expectTitleInServedHead(page, path);
  });
}

// D-97: after a client-side path change, the empty element at the start of
// the body holds focus and the next Tab reaches the skip link, as after a
// full page load.
export async function expectFocusResetThenSkipLink(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.hasAttribute("data-focus-reset") ?? false,
      ),
    )
    .toBe(true);

  await page.keyboard.press("Tab");
  const href = await page.evaluate(() =>
    document.activeElement?.getAttribute("href"),
  );
  expect(href, "the first Tab after a page change is the skip link").toBe(
    "#main",
  );
}
