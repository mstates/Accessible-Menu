import { expect, type Locator, type Page } from "@playwright/test";

// What the gate checks the same way on every thing that has a page nav
// (D-222): a dish's five pages and a menu's two (D-224). Each thing's own
// spec holds its names and its states; the nav itself, the reading order,
// and the layout are read here. Not a spec: a spec cannot import a spec.

// The page nav, named by the thing it belongs to: the dish, the menu.
export function pageNav(page: Page, thing: string) {
  return page
    .locator("main")
    .getByRole("navigation", { name: thing, exact: true });
}

// Each locator comes after the one before it in the document.
export async function expectInOrder(locators: Locator[], message: string) {
  for (const [index, locator] of locators.entries()) {
    await expect(locator).toHaveCount(1);
    const before = locators[index - 1];
    if (!before) continue;
    const next = await locator.elementHandle();
    expect(
      await before.evaluate(
        (element, after) =>
          after !== null &&
          Boolean(
            element.compareDocumentPosition(after) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        next,
      ),
      message,
    ).toBe(true);
  }
}

// D-222's layout: once main has 36rem of room at the root's font size, the
// page nav takes a left column with the content beside it, their tops
// level; narrower, one column, the nav under the h1 and the content under
// the nav, each the width of the other. The break is a container query in
// rem on main's width, so it follows the root's size however the size was
// raised, and at the largest text the columns stack wherever the room runs
// out, in every engine, which is the right reflow; both are measured, at
// every size, and the room is read the way the query reads it.
export async function expectLayout(page: Page, thing: string) {
  const boxes = await page.evaluate((name) => {
    const nav = document.querySelector(
      `main nav[aria-label="${CSS.escape(name)}"]`,
    );
    const h1 = document.querySelector("main h1");
    const content = nav?.nextElementSibling;
    const container = nav?.parentElement?.parentElement;
    if (!nav || !h1 || !content || !container) {
      throw new Error("the page nav, the h1, or the content is missing");
    }
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    };
    return {
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      width: container.getBoundingClientRect().width,
      nav: box(nav),
      h1: box(h1),
      content: box(content),
    };
  }, thing);
  const wide = boxes.width >= 36 * boxes.root;
  const where = `${Math.round(boxes.width)}px of room at a ${boxes.root}px root`;
  expect(
    boxes.nav.top,
    `${where}: the nav starts under the h1`,
  ).toBeGreaterThanOrEqual(boxes.h1.bottom - 0.5);
  if (wide) {
    expect(
      boxes.nav.right,
      `${where}: the nav ends before the content starts`,
    ).toBeLessThanOrEqual(boxes.content.left + 0.5);
    expect(
      Math.abs(boxes.nav.top - boxes.content.top),
      `${where}: the nav's and the content's tops are level`,
    ).toBeLessThanOrEqual(1);
  } else {
    expect(
      boxes.content.top,
      `${where}: the content starts under the nav`,
    ).toBeGreaterThanOrEqual(boxes.nav.bottom - 0.5);
    expect(
      Math.abs(boxes.nav.width - boxes.content.width),
      `${where}: the nav spans the content's width`,
    ).toBeLessThanOrEqual(1);
  }
}
