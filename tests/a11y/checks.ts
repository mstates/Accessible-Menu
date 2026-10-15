import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectChromeNamesAgree } from "./chrome-names";

// The checks every page gets (D-62, D-103, D-107), shared by the public pages
// and the owner pages, plus the D-97 expectation after a client-side page
// change. They run in Chromium, WebKit, and Firefox, at every size the
// Playwright config names (D-137).

const MAX_TABS = 200;

function engine(page: Page): string {
  return page.context().browser()?.browserType().name() ?? "chromium";
}

// The key that moves focus to the next control on a page. Playwright's
// WebKit on macOS skips links and buttons on Tab, as Safari does unless
// "Press Tab to highlight each item" is on; Option+Tab reaches every control
// there, the way a Safari keyboard user moves. Everywhere else, Tab. Inside
// a dialog the tests press Tab itself, since React Aria moves focus there on
// Tab in every engine and leaves Option+Tab to the browser.
export function tabKey(page: Page): string {
  const option = engine(page) === "webkit" && process.platform === "darwin";
  return option ? "Alt+Tab" : "Tab";
}

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

async function focused(page: Page, outlineOnly: boolean): Promise<Focused> {
  return page.evaluate((outlineOnly) => {
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
      indicated: outline || (shadow && !outlineOnly),
      injected: element.tagName.toLowerCase().startsWith("vercel-"),
    };
  }, outlineOnly);
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

export async function expectNoAxeViolations(
  page: Page,
  { skip = [] }: { skip?: readonly string[] } = {},
) {
  const results = await new AxeBuilder({ page })
    .disableRules([...skip])
    .analyze();
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

// Every id the page points at by an attribute is on the page: the labels,
// descriptions, and errors React Aria ties by id, and a label's for. axe
// lists a description pointing at a missing id only as needing review, not
// as a violation, so a field that kept a gone description's id passed the
// gate (D-147). pageChecks runs it on every page it visits, and every axe
// call in tests/a11y has it beside it (Q-59). It polls: React Aria drops a
// field's unused description and error ids only in a layout effect, so a
// page that hydrates late points at them for a moment, while an id that
// stays missing fails once the expect timeout runs out.
export async function expectNoMissingIds(page: Page) {
  await expect
    .poll(() => missingIds(page), {
      message: "every id an attribute points at is on the page",
    })
    .toEqual([]);
}

function missingIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const attributes = [
      "aria-describedby",
      "aria-labelledby",
      "aria-errormessage",
      "aria-controls",
      "aria-owns",
      "aria-details",
      "aria-flowto",
      "aria-activedescendant",
      "for",
    ];
    const found: string[] = [];
    for (const attribute of attributes) {
      for (const element of document.querySelectorAll(`[${attribute}]`)) {
        if (element.tagName.toLowerCase().startsWith("vercel-")) continue;
        const ids = (element.getAttribute(attribute) ?? "")
          .split(/\s+/)
          .filter(Boolean);
        for (const id of ids) {
          if (document.getElementById(id)) continue;
          const role = element.getAttribute("role") ?? element.tagName;
          const words = (element.closest("label")?.textContent ?? "").trim();
          found.push(`${role.toLowerCase()} "${words}" ${attribute}="${id}"`);
        }
      }
    }
    return found;
  });
}

// The walk starts from the empty element at the top of the body, where focus
// sits after a page change (D-97), so a page that moved focus to a message
// on arrival is still walked from the skip link. In forced colors a
// box-shadow is not painted, so there only an outline counts as a focus
// indicator.
export async function expectKeyboardWalk(
  page: Page,
  { outlineOnly = false } = {},
) {
  const expected = await focusableKeys(page);
  await page.locator("[data-focus-reset]").focus();
  const reached: string[] = [];
  let tabs = 0;
  while (tabs < MAX_TABS) {
    await page.keyboard.press(tabKey(page));
    tabs += 1;
    const current = await focused(page, outlineOnly);
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

// Moves focus to a control the way a keyboard user does: from the top of the
// page by Tab (Option+Tab in macOS WebKit), so the focus the control moves
// next is judged as keyboard focus in every engine (Q-100).
export async function tabTo(page: Page, target: Locator) {
  await page.locator("[data-focus-reset]").focus();
  for (let tabs = 0; tabs < MAX_TABS; tabs += 1) {
    await page.keyboard.press(tabKey(page));
    const there = await target.evaluate(
      (element) => element === document.activeElement,
    );
    if (there) return;
  }
  throw new Error(`${tabKey(page)} never reached the control`);
}

// The app's one focus ring (Q-100), read from its rule in app/globals.css,
// which every Tab stop wears. The gate runs from the repository's root, as
// the config reads .env.local from it.
type Ring = { width: string; offset: string };
let ring: Ring | null = null;

function focusRing(): Ring {
  if (ring) return ring;
  const css = readFileSync("app/globals.css", "utf8");
  const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const width = /outline:\s*(\d+(?:\.\d+)?px)\s+solid\s/.exec(rule)?.[1];
  const offset = /outline-offset:\s*(\d+(?:\.\d+)?px)/.exec(rule)?.[1];
  if (!width || !offset) {
    throw new Error(
      "app/globals.css has no :focus-visible rule with a solid outline and an offset",
    );
  }
  ring = { width, offset };
  return ring;
}

// Focus that code placed, after a key press or on a page's arrival, shows
// the ring every Tab stop shows (Q-100): the element matches :focus-visible,
// its outline is solid at the ring's width and offset, in the focus color
// outside forced colors, and the ring's top edge is on the screen.
export async function expectLandedOutline(page: Page) {
  const { width, offset } = focusRing();
  const landed = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) {
      return null;
    }
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = "var(--focus)";
    document.body.append(probe);
    const focusColor = getComputedStyle(probe).color;
    probe.remove();
    const words = (element.getAttribute("aria-label") ?? element.textContent)
      ?.trim()
      .slice(0, 40);
    return {
      what: `${element.tagName.toLowerCase()} "${words ?? ""}"`,
      visible: element.matches(":focus-visible"),
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
      color: style.outlineColor,
      focusColor,
      forced: matchMedia("(forced-colors: active)").matches,
      top: element.getBoundingClientRect().top,
    };
  });
  if (!landed) throw new Error("nothing holds focus");
  const { what } = landed;
  expect(landed.visible, `${what} matches :focus-visible`).toBe(true);
  expect(landed.style, `${what} draws its outline`).toBe("solid");
  expect(landed.width, `${what}'s outline is the ring's width`).toBe(width);
  expect(landed.offset, `${what}'s outline is the ring's offset`).toBe(offset);
  if (!landed.forced) {
    expect(landed.color, `${what}'s outline is the focus color`).toBe(
      landed.focusColor,
    );
  }
  const reach = parseFloat(width) + parseFloat(offset);
  expect(
    landed.top - reach,
    `the top of ${what}'s ring is on the screen`,
  ).toBeGreaterThanOrEqual(0);
}

export async function expectNoHorizontalScroll(page: Page) {
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.addStyleTag({ content: textSpacing });
  expect(await hasHorizontalScroll(page)).toBe(false);
}

// Call before the next load: the font size applies to pages loaded after it.
// Chromium takes the default font size itself, the real setting. WebKit and
// Firefox let Playwright set no default font size for a page, so there the
// root is set to 200% by a style added as the page is parsed. Only Chromium
// still catches an absolute font-size on html (D-103, D-137).
export async function setLargestText(page: Page) {
  if (engine(page) === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Page.setFontSizes", { fontSizes: largestText });
    return;
  }
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "html { font-size: 200% !important; }";
      document.head.append(style);
    });
  });
}

export async function expectRootAtLargest(page: Page) {
  await expectRootAt(page, largestText.standard);
}

// A root past 200%, for the diner pages (Q-42): iOS's largest accessibility
// text size makes the root about 53px. Call before the next load, as
// setLargestText is. Chromium takes the default font size itself; WebKit
// and Firefox take a root set to the matching percentage as the page is
// parsed.
export async function setRootText(page: Page, px: number) {
  if (engine(page) === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Page.setFontSizes", {
      fontSizes: {
        standard: px,
        fixed: Math.round((px * largestText.fixed) / largestText.standard),
      },
    });
    return;
  }
  const percent = (px / 16) * 100;
  await page.addInitScript((size: number) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = `html { font-size: ${size}% !important; }`;
      document.head.append(style);
    });
  }, percent);
}

export async function expectRootAt(page: Page, px: number) {
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).fontSize,
    ),
    "html follows the default font size",
  ).toBe(`${px}px`);
}

// A link or button a page is expected to show, by its role and its whole
// accessible name.
export type Control = { role: "link" | "button"; name: string };

// A drawn mark a page is expected to show, found by a selector: what it is,
// for the message, and where it is.
export type Mark = { what: string; selector: string };

// Every expected control is on the page, and every match, and every other
// link and button the page renders, is visible, inside the viewport's width,
// not cut off by an ancestor that clips, and not overflowing itself (D-137).
// Elements hidden on purpose are left out of the sweep: inside [hidden] or
// [inert], Vercel's toolbar, and anything one pixel or smaller, which is how
// the skip link sits until it takes focus.
export async function expectControlsShown(
  page: Page,
  expected: readonly Control[] = [],
) {
  const missing: string[] = [];
  for (const control of expected) {
    const matches = page.getByRole(control.role, {
      name: control.name,
      exact: true,
    });
    const count = await matches.count();
    if (count === 0) missing.push(`${control.role} "${control.name}"`);
    for (let index = 0; index < count; index += 1) {
      await matches
        .nth(index)
        .evaluate(
          (element, label) => element.setAttribute("data-a11y-expected", label),
          `${control.role} "${control.name}"`,
        );
    }
  }
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    const selector =
      'a[href], button, [role="button"], [role="link"], [data-a11y-expected]';
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element.tagName.toLowerCase().startsWith("vercel-")) continue;
      if (element.closest("[hidden], [inert]")) continue;
      const expected = element.getAttribute("data-a11y-expected");
      const name =
        expected ??
        (element.getAttribute("aria-label") ?? element.textContent ?? "")
          .trim()
          .slice(0, 60);
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const shown =
        box.width > 1 && box.height > 1 && style.visibility !== "hidden";
      if (!shown) {
        if (expected) found.push(`${name} is not shown`);
        continue;
      }
      if (box.left < -0.5 || box.right > width + 0.5) {
        found.push(
          `${name} runs outside the viewport's width (${Math.round(box.left)} to ${Math.round(box.right)} of ${width})`,
        );
        continue;
      }
      if (
        style.display !== "inline" &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        found.push(
          `${name} overflows itself (${element.scrollWidth} in ${element.clientWidth})`,
        );
      }
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const clips = getComputedStyle(parent);
        const sideways = clips.overflowX !== "visible";
        const upright =
          clips.overflowY === "hidden" || clips.overflowY === "clip";
        if (!sideways && !upright) continue;
        const edge = parent.getBoundingClientRect();
        const cutSideways =
          sideways &&
          (box.left < edge.left - 0.5 || box.right > edge.right + 0.5);
        const cutUpright =
          upright &&
          (box.top < edge.top - 0.5 || box.bottom > edge.bottom + 0.5);
        if (cutSideways || cutUpright) {
          found.push(`${name} is cut off by a box that clips it`);
          break;
        }
      }
    }
    for (const element of document.querySelectorAll("[data-a11y-expected]")) {
      element.removeAttribute("data-a11y-expected");
    }
    return found;
  });
  const all = [
    ...missing.map((control) => `${control} is not on the page`),
    ...problems,
  ];
  expect(all, all.join("\n")).toEqual([]);
}

// Forced colors (D-137). Every paint checked here must be a color of the
// forced palette, read from the page by painting each system color, and
// keep 3:1 against what is behind it. A fixed color is not forced in an
// SVG stroke, so it can pass contrast in both palettes and still be wrong;
// the palette test catches it. A mark drawn as a background is painted over
// with the canvas, and fails contrast.
type Paint = { what: string; color: string; behind: string };

async function forcedPaints(
  page: Page,
  marks: readonly Mark[],
): Promise<{ palette: string[]; paints: Paint[]; missing: string[] }> {
  return page.evaluate((marks) => {
    const keywords = [
      "Canvas",
      "CanvasText",
      "LinkText",
      "VisitedText",
      "ActiveText",
      "ButtonFace",
      "ButtonText",
      "ButtonBorder",
      "Field",
      "FieldText",
      "GrayText",
      "Highlight",
      "HighlightText",
      "SelectedItem",
      "SelectedItemText",
      "Mark",
      "MarkText",
      "AccentColor",
      "AccentColorText",
    ];
    const probe = document.createElement("span");
    document.body.append(probe);
    const palette = keywords.map((keyword) => {
      probe.style.color = keyword;
      return getComputedStyle(probe).color;
    });
    probe.remove();

    const opaque = (color: string) => {
      const parts = color.match(/[\d.]+/g) ?? [];
      return parts.length < 4 || Number(parts[3]) > 0;
    };
    const behind = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const color = getComputedStyle(parent).backgroundColor;
        if (opaque(color)) return color;
      }
      return palette[0] ?? "rgb(255, 255, 255)";
    };
    // Shown means painted: not hidden, not see-through, and not inside a
    // box of a pixel that clips it, which is how React Aria keeps a native
    // select or checkbox for forms and autofill out of sight.
    const shown = (element: Element) => {
      if (element.closest("[hidden], [inert]")) return false;
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) return false;
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        const edge = node.getBoundingClientRect();
        const clips = style.overflow !== "visible" || style.clipPath !== "none";
        if (clips && (edge.width <= 1 || edge.height <= 1)) return false;
      }
      return true;
    };
    const named = (element: Element) =>
      (
        element.getAttribute("aria-label") ??
        element.closest("label, button, a, nav")?.textContent ??
        element.textContent ??
        ""
      )
        .trim()
        .slice(0, 40);

    const paints: { what: string; color: string; behind: string }[] = [];
    // Edges: every field, button, and checkbox box, on all four sides.
    const edged = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select, button, label:has(input[type="checkbox"]) > span[aria-hidden="true"], label:has(input[type="radio"]) > span[aria-hidden="true"]',
    );
    for (const element of edged) {
      if (element.tagName.toLowerCase().startsWith("vercel-")) continue;
      if (!shown(element)) continue;
      const style = getComputedStyle(element);
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const what = `the ${side} edge of ${element.tagName.toLowerCase()} "${named(element)}"`;
        const lineStyle = style.getPropertyValue(`border-${side}-style`);
        const lineWidth = parseFloat(
          style.getPropertyValue(`border-${side}-width`),
        );
        if (lineStyle === "none" || lineStyle === "hidden" || lineWidth < 1) {
          paints.push({ what, color: "none", behind: behind(element) });
          continue;
        }
        paints.push({
          what,
          color: style.getPropertyValue(`border-${side}-color`),
          behind: behind(element),
        });
      }
    }
    // Marks: every drawn SVG, every piece of text hidden from assistive
    // technology, like the breadcrumb's slashes and the required asterisks,
    // and every empty box hidden from it that paints a background or an
    // edge, the way a spinner made in CSS is drawn.
    const markOf = (element: Element, what: string) => {
      const style = getComputedStyle(element);
      const color =
        element instanceof SVGElement
          ? style.stroke !== "none"
            ? style.stroke
            : style.fill
          : style.color;
      paints.push({ what, color, behind: behind(element) });
    };
    const boxOf = (element: Element) => {
      const style = getComputedStyle(element);
      const edged =
        style.borderTopStyle !== "none" &&
        parseFloat(style.borderTopWidth) >= 1;
      const color = opaque(style.backgroundColor)
        ? style.backgroundColor
        : edged
          ? style.borderTopColor
          : null;
      if (color)
        paints.push({ what: "a drawn box", color, behind: behind(element) });
    };
    for (const element of document.querySelectorAll('[aria-hidden="true"]')) {
      if (!shown(element)) continue;
      if (element instanceof SVGSVGElement) {
        markOf(element, `the drawn mark in "${named(element)}"`);
      } else if (
        element.children.length === 0 &&
        (element.textContent ?? "").trim() !== ""
      ) {
        markOf(element, `the mark "${(element.textContent ?? "").trim()}"`);
      } else if (element.children.length === 0) {
        boxOf(element);
      } else {
        for (const svg of element.querySelectorAll("svg")) {
          if (shown(svg)) markOf(svg, `the drawn mark in "${named(svg)}"`);
        }
      }
    }
    // The ring of whatever holds focus while it shows (Q-100). A target that
    // code focused is no Tab stop, so the keyboard walk never sees it.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active.matches(":focus-visible")
    ) {
      const style = getComputedStyle(active);
      const drawn =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 1;
      paints.push({
        what: `the focus ring of ${active.tagName.toLowerCase()} "${named(active)}"`,
        color: drawn ? style.outlineColor : "none",
        behind: behind(active),
      });
    }
    const missing: string[] = [];
    for (const mark of marks) {
      const found = [...document.querySelectorAll(mark.selector)].filter(shown);
      if (found.length === 0) missing.push(mark.what);
    }
    return { palette, paints, missing };
  }, marks);
}

function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(one: string, two: string): number {
  const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

function rgb(color: string): string {
  return (color.match(/[\d.]+/g) ?? []).slice(0, 3).join(",");
}

// Every field, button, and checkbox keeps an edge, and every drawn mark
// shows, as does the ring of whatever holds focus while it shows, in a color
// of the forced palette with 3:1 against what is behind it. The marks named
// in the list must be on the page as well.
export async function expectForcedColorsKept(
  page: Page,
  marks: readonly Mark[] = [],
) {
  const { palette, paints, missing } = await forcedPaints(page, marks);
  const system = new Set(palette.map(rgb));
  const problems = [
    ...missing.map((what) => `${what} is not shown`),
    ...paints.flatMap(({ what, color, behind }) => {
      if (color === "none") return [`${what} is not drawn`];
      if (!system.has(rgb(color))) {
        return [`${what} is ${color}, not a system color`];
      }
      const ratio = contrast(color, behind);
      return ratio < 3
        ? [`${what} is ${color} on ${behind}, ${ratio.toFixed(2)}:1`]
        : [];
    }),
  ];
  expect(problems, problems.join("\n")).toEqual([]);
}

// Runs each check as its own step and keeps going after one fails, so a
// page that fails two checks says both. The test fails at the end, naming
// every step that failed.
async function steps(checks: readonly [string, () => Promise<void>][]) {
  const failed: string[] = [];
  for (const [title, body] of checks) {
    try {
      await test.step(title, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`${title}:\n${message}`);
    }
  }
  expect(failed, failed.join("\n\n")).toEqual([]);
}

export type PageCheckOptions = {
  // The links and buttons the page is expected to show, read when the test
  // runs, since a list's rows are known only from the page.
  controls?: (page: Page) => Promise<readonly Control[]>;
  // The drawn marks the page is expected to show in forced colors.
  marks?: readonly Mark[];
};

// Registers the checks for one path. Call it inside a describe. A path that
// is only known once the owner setup has run, a menu's page, is passed as a
// function and read when each test starts; the describe around it then
// carries a fixed title, since a test's name cannot wait for the setup.
//
// The arrival pass (@arrival, D-137) is one test with a step for each
// check, so a page loads twice, not once per check: once as it arrives and
// once at the largest text. The forced-colors pass (@forced) runs only in
// the projects that turn forced colors on.
export function pageChecks(
  target: string | (() => string),
  options: PageCheckOptions = {},
) {
  const at = () => (typeof target === "string" ? target : target());
  const controls = (page: Page) =>
    options.controls ? options.controls(page) : Promise.resolve([]);

  test(
    "arrives whole: the title, axe, every id it points at, the keyboard walk, every control shown, reflow, and the largest text",
    { tag: "@arrival" },
    async ({ page }) => {
      const path = at();
      await steps([
        [
          "the title is in the served head and is the document title from first paint",
          () => expectTitleInServedHead(page, path),
        ],
        ["axe reports zero violations", () => expectNoAxeViolations(page)],
        [
          "every id an attribute points at is on the page",
          async () => {
            // Until the page hydrates, React Aria's server HTML points each
            // field at error and description ids it has not dropped yet, so
            // the ids are read once the page has settled.
            await page.waitForLoadState("networkidle");
            await expectNoMissingIds(page);
          },
        ],
        [
          "keyboard reaches every control, focus is visible, nothing traps",
          async () => {
            // A result message takes focus once the page hydrates, so the
            // walk starts after the page has settled, or that focus move
            // lands mid-walk.
            await page.waitForLoadState("networkidle");
            await expectKeyboardWalk(page);
          },
        ],
        [
          "every link and button it shows is visible and not cut off",
          async () => expectControlsShown(page, await controls(page)),
        ],
        [
          "no horizontal scroll and nothing cut off, before and after text spacing",
          async () => {
            await expectNoHorizontalScroll(page);
            await expectControlsShown(page, await controls(page));
          },
        ],
        [
          "at the largest phone text size, no horizontal scroll and nothing cut off, before and after text spacing",
          async () => {
            await setLargestText(page);
            // Firefox reports a cached page's revalidation as the 304
            // itself. A route turns the HTTP cache off, so the second load
            // is a real one, as the first was.
            const pathname = new URL(path, "http://localhost").pathname;
            await page.route(
              (url) => url.pathname === pathname,
              (route) => route.fallback(),
            );
            const response = await open(page, path);
            const html = await response.text();
            const headEnd = html.indexOf("</head>");
            expect(headEnd, `${path} served no head`).toBeGreaterThan(-1);
            expect(
              html.slice(0, headEnd),
              "the text-scale opt-in is in the served head",
            ).toMatch(textScaleMeta);
            await expectRootAtLargest(page);
            await expectControlsShown(page, await controls(page));
            await expectNoHorizontalScroll(page);
            await expectControlsShown(page, await controls(page));
          },
        ],
      ]);
    },
  );

  // Chrome's own names against Playwright's (D-140, D-142), in the projects
  // that run every test, and only in Chromium.
  test("in Chrome, every link, button, and field is named as Playwright names it, and a name from one label is not read in pieces", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Chrome's own names come through the DevTools Protocol, which only Chromium has",
    );
    await open(page, at());
    await page.waitForLoadState("networkidle");
    await expectChromeNamesAgree(page);
  });

  test(
    "in forced colors, every edge and drawn mark is in a system color and focus shows an outline",
    { tag: "@forced" },
    async ({ page }) => {
      await open(page, at());
      await page.waitForLoadState("networkidle");
      await steps([
        [
          "every field, button, and checkbox keeps an edge, and every drawn mark shows",
          () => expectForcedColorsKept(page, options.marks),
        ],
        [
          "keyboard reaches every control and each shows an outline",
          () => expectKeyboardWalk(page, { outlineOnly: true }),
        ],
        // axe reads a label's -webkit-text-fill-color, which Chromium's
        // computed style leaves at the author's color while it paints the
        // forced one: a button measured on October 5 painted white on black
        // and was read as #121212 on black. In forced colors the contrast is
        // the theme's, and our own paints are held to it above.
        [
          "axe reports zero violations, contrast aside",
          () => expectNoAxeViolations(page, { skip: ["color-contrast"] }),
        ],
        [
          "every id an attribute points at is on the page",
          () => expectNoMissingIds(page),
        ],
      ]);
    },
  );
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

  await page.keyboard.press(tabKey(page));
  const href = await page.evaluate(() =>
    document.activeElement?.getAttribute("href"),
  );
  expect(href, "the first Tab after a page change is the skip link").toBe(
    "#main",
  );
}
