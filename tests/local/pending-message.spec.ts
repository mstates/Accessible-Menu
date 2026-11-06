import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { restaurantDetailsPath } from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";
import { savedBanner } from "../a11y/saved-banner";

// A Details save that lands, held past the second (D-209, D-210, Q-140).
// React Aria announces the pending Save button by reference, a role="img"
// node in its assertive log naming the button's id (D-109). Since D-211 a
// save that lands loads Details again as a new document (Q-141), so the
// whole page goes, the message with it, and the new page starts with
// nothing of React Aria's: no node names the button, none is nameless or
// renamed, and its logs are empty. The gate cannot land a save (D-108), so
// the path a real save takes is checked here; the gate's three
// @pending-message tests pin the Button's own endings on the error page,
// where the button goes and the document stays. The save's POST is held in
// the browser until React Aria's message is there, which is past the
// second.

const { code } = ownerEnv();
const strings = en.owner.restaurants.details;
const details = restaurantDetailsPath(code);

// Every element added to one of React Aria's logs, with what it names.
function recordMessages() {
  const w = window as unknown as { __messages: string[] };
  w.__messages = [];
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const log = node.parentElement;
        if (log?.getAttribute("role") !== "log") continue;
        if (!log.closest("[data-live-announcer]")) continue;
        w.__messages.push(node.getAttribute("aria-labelledby") ?? "");
      }
    }
  }).observe(document, { subtree: true, childList: true });
}

// Messages in React Aria's logs that name any element that is gone.
const dangling = (page: Page) =>
  page.evaluate(
    () =>
      [
        ...document.querySelectorAll("[data-live-announcer] [aria-labelledby]"),
      ].filter((node) =>
        (node.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .some((name) => !document.getElementById(name)),
      ).length,
  );

test("a save held past the second announces while the Save button is there, and lands on a new page with the banner, where no node names the button, none is nameless or renamed, and React Aria's logs are empty (D-210, D-211)", async ({
  page,
}) => {
  await page.addInitScript(recordMessages);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route(
    (url) => url.pathname === details,
    async (route) => {
      if (route.request().method() === "POST") {
        posts += 1;
        await held;
      }
      await route.fallback();
    },
  );

  await page.goto(details);
  await page.waitForLoadState("networkidle");
  const save = page.getByRole("button", { name: strings.submit, exact: true });
  const id = await save.getAttribute("id");
  if (!id) throw new Error("the Save button has no id");
  await save.focus();
  await expect(save).toBeFocused();
  await page.keyboard.press("Enter");

  const naming = page.locator(
    `[data-live-announcer] [aria-labelledby~="${id}"]`,
  );
  await expect(
    naming,
    "React Aria announced the Save button while it was there",
  ).toHaveCount(1, { timeout: 3_000 });

  const messages = () =>
    page.evaluate(
      () => (window as unknown as { __messages: string[] }).__messages,
    );
  expect(
    await messages(),
    "React Aria's one message named the Save button",
  ).toEqual([id]);
  const before = await page.evaluate(() => performance.timeOrigin);

  release();
  await expect(
    savedBanner(page),
    "the save lands on a new page, with the banner",
  ).toHaveCount(1, { timeout: 10_000 });
  expect(
    await page.evaluate(() => performance.timeOrigin),
    "a new document",
  ).toBeGreaterThan(before);
  expect(
    await page.evaluate(() => document.activeElement === document.body),
    "nothing of ours moved focus",
  ).toBe(true);
  await expect(naming, "no node names the gone Save button").toHaveCount(0);
  expect(await dangling(page), "no node names a gone id").toBe(0);
  await expect(
    page.locator('[data-live-announcer] [role="log"] [aria-label]'),
    "nothing in React Aria's log is renamed",
  ).toHaveCount(0);
  await expect(
    page.locator('[data-live-announcer] [role="log"] > *'),
    "React Aria's logs are empty",
  ).toHaveCount(0);
  expect(await messages(), "the new page announced nothing").toEqual([]);
  expect(posts, "one save was sent").toBe(1);
});
