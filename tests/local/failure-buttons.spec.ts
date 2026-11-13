import { expect, test, type Page, type Route } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { restaurantMenusPath } from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// Which button a failed save gets on a page that saves as the owner goes
// (D-237, rule 3; editing/status.ts): a failure a retry cannot fix, a row
// deleted elsewhere or a page from before a deploy, offers Reload and
// never Try again; a failure a retry can fix, a dropped connection, offers
// Try again and no Reload, and Try again lands it. Read on Menus, with a
// rename, since the rule is one for every such page. The gate answers
// every write as a page from before a deploy, so the gone case and the
// dropped connection can only be made here. Each check makes a menu of its
// own and leaves it deleted.

const { code } = ownerEnv();
const menus = en.owner.menus;
const editing = en.owner.editing;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

async function knob(path: string): Promise<void> {
  const response = await fetch(`${standin}/__test/${path}`);
  if (!response.ok) {
    throw new Error(`the stand-in refused ${path}: ${await response.text()}`);
  }
}

const addMenu = (name: string) => knob(`add?name=${encodeURIComponent(name)}`);
const deleteMenu = (name: string) =>
  knob(`delete-menu?name=${encodeURIComponent(name)}`);

async function openMenus(page: Page): Promise<void> {
  await page.goto(restaurantMenusPath(code));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

function nameField(page: Page, menu: string) {
  return page.getByRole("textbox", {
    name: `${menus.nameLabel} ${fill(menus.labelFor, { menu })}`,
    exact: true,
  });
}

function status(page: Page) {
  return page.locator('main [role="status"]');
}

const tryAgain = (page: Page) =>
  page.getByRole("button", { name: editing.tryAgain, exact: true });
const reloadButton = (page: Page) =>
  page.getByRole("button", { name: editing.reload, exact: true });

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

const notSaved = (menu: string, problem: string) =>
  `${fill(menus.notSaved.name, { menu })} ${problem}`;

// The next request that is not a GET, a Server Action's, answered by the
// handler; every other request goes through.
async function answerNextWrite(
  page: Page,
  answer: (route: Route) => Promise<void>,
): Promise<void> {
  let answered = false;
  await page.route("**/*", async (route) => {
    if (answered || route.request().method() === "GET") {
      await route.fallback();
      return;
    }
    answered = true;
    await answer(route);
  });
}

test("a rename of a menu deleted elsewhere says it is no longer here and offers Reload, never Try again; Reload shows the list without it", async ({
  page,
}) => {
  const name = "Scratch gone";
  await addMenu(name);
  await openMenus(page);
  await expect(nameField(page, name)).toHaveCount(1);
  await deleteMenu(name);

  await nameField(page, name).fill("Scratch renamed");
  await page.keyboard.press("Enter");
  const failure = notSaved(name, menus.errors.gone);
  await expect(status(page)).toHaveText(failure);
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(reloadButton(page), "Reload is the fix").toHaveCount(1);
  await expect(tryAgain(page), "a retry cannot bring the row back").toHaveCount(
    0,
  );

  const loaded = page.waitForEvent("load", { timeout: 10_000 });
  await reloadButton(page).click();
  await loaded;
  await page.waitForLoadState("networkidle");
  await expect(status(page)).toHaveText(editing.saved);
  await expect(nameField(page, name)).toHaveCount(0);
  await expect(nameField(page, "Scratch renamed")).toHaveCount(0);
  await expect(reloadButton(page)).toHaveCount(0);
});

test("a rename sent from a page from before a deploy offers Reload alone (Q-175)", async ({
  page,
}) => {
  const name = "Scratch stale";
  await addMenu(name);
  try {
    await openMenus(page);
    // What Next answers for an action it does not know (Q-41).
    await answerNextWrite(page, (route) =>
      route.fulfill({
        status: 409,
        headers: {
          "x-nextjs-action-not-found": "1",
          "content-type": "text/plain",
        },
        body: "Server Action unavailable.",
      }),
    );
    await nameField(page, name).fill("Scratch renamed");
    await page.keyboard.press("Enter");
    const failure = notSaved(name, editing.problems.outOfDate);
    await expect(status(page)).toHaveText(failure);
    await expect.poll(() => said(page, failure)).toBe(1);
    await expect(reloadButton(page)).toHaveCount(1);
    await expect(
      tryAgain(page),
      "the same page would send the same stale action",
    ).toHaveCount(0);
  } finally {
    await deleteMenu(name);
  }
});

test("a rename with the connection dropped offers Try again and no Reload, and Try again lands it", async ({
  page,
}) => {
  const name = "Scratch dropped";
  const renamed = "Scratch landed";
  await addMenu(name);
  try {
    await openMenus(page);
    await answerNextWrite(page, (route) => route.abort("connectionfailed"));
    await nameField(page, name).fill(renamed);
    await page.keyboard.press("Enter");
    const failure = notSaved(name, editing.problems.unreachable);
    await expect(status(page)).toHaveText(failure);
    await expect.poll(() => said(page, failure)).toBe(1);
    await expect(tryAgain(page), "a retry can land it").toHaveCount(1);
    await expect(reloadButton(page), "a reload would lose it").toHaveCount(0);

    await tryAgain(page).click();
    await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
    await expect(status(page)).toHaveText(editing.saved);
    await expect(tryAgain(page)).toHaveCount(0);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(nameField(page, renamed), "the rename landed").toHaveCount(1);
  } finally {
    await deleteMenu(renamed).catch(() => deleteMenu(name));
  }
});
