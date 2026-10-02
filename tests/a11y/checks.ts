import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The checks every page gets (D-62, D-103), shared by the public pages and
// the owner pages, plus the D-97 expectation after a client-side page change.

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

// Registers the checks for one path. Call it inside a describe.
export function pageChecks(path: string) {
  test("axe reports zero violations", async ({ page }) => {
    await open(page, path);
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
  });

  test("keyboard reaches every control, focus is visible, nothing traps", async ({
    page,
  }) => {
    await open(page, path);
    const expected = await focusableKeys(page);
    const reached: string[] = [];
    let previous = "";
    let tabs = 0;
    while (tabs < MAX_TABS) {
      await page.keyboard.press("Tab");
      tabs += 1;
      const current = await focused(page);
      if (current.key === "body") break;
      // A native time input keeps focus while Tab moves between its hour,
      // minute, and AM/PM parts, so the same element twice in a row is one
      // control still being crossed, not a cycle.
      if (current.key === previous) continue;
      if (reached.includes(current.key)) break;
      previous = current.key;
      if (current.injected) continue;
      expect(current.visible, `${current.key} took focus while hidden`).toBe(
        true,
      );
      expect(current.indicated, `${current.key} shows no focus indicator`).toBe(
        true,
      );
      reached.push(current.key);
    }
    expect(
      tabs,
      "focus never cycled back: possible keyboard trap",
    ).toBeLessThan(MAX_TABS);
    expect([...reached].sort()).toEqual([...expected].sort());
  });

  test("no horizontal scroll, before and after text spacing", async ({
    page,
  }) => {
    await open(page, path);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.addStyleTag({ content: textSpacing });
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("at the largest phone text size, no horizontal scroll, before and after text spacing", async ({
    page,
  }) => {
    const session = await page.context().newCDPSession(page);
    await session.send("Page.setFontSizes", { fontSizes: largestText });
    const response = await open(page, path);
    const html = await response.text();
    const headEnd = html.indexOf("</head>");
    expect(headEnd, `${path} served no head`).toBeGreaterThan(-1);
    expect(
      html.slice(0, headEnd),
      "the text-scale opt-in is in the served head",
    ).toMatch(textScaleMeta);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).fontSize,
      ),
      "html follows the default font size",
    ).toBe("32px");
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.addStyleTag({ content: textSpacing });
    expect(await hasHorizontalScroll(page)).toBe(false);
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
