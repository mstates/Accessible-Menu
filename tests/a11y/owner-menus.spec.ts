import { expect, test, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantDetailsPath,
  restaurantMenuPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import { CONFIRM_GUARD_MS } from "../../src/ui/alert-dialog-guard";
import {
  expectFocusResetThenSkipLink,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectRootAtLargest,
  open,
  setLargestText,
} from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// The menus list, signed in as the test owner (D-100), on the three menus
// the test restaurant was given by hand. The gate never writes and never
// types into a field that saves (D-108, D-111, D-115): every test here runs
// behind the write guard. Most only read. One presses Enter and Tab in a name
// it does not change, and the guard proves nothing was sent. Two press a
// Move button and say they expect a write; the guard answers it inside the
// browser as an action the server does not know, which is how the failed
// state is reached. Typing, real saves and the "Saved." they say (D-118),
// add, a delete that lands, Undo with something to undo, and a name that is
// taken are covered by the unit tests and by hand. The shared page checks
// for this page run from owner-pages.spec.ts.
//
// The delete confirmation (D-119) is checked without a write: it is opened,
// read, and left by Keep and by Escape, and the guard proves nothing was
// sent. Two more tests press Delete for real, on the menu with sections,
// through the dialog, and on a menu with none, and say they expect a write;
// the guard holds the answer so the screen can be read while the delete is
// on its way, then answers it as a failure, so the menu comes back. Which
// menu holds sections and which holds none comes from the setup.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const details = restaurantDetailsPath(code);
const strings = en.owner.menus;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;

guardWrites();

function rows(page: Page) {
  return page.locator("main ul > li");
}

function savedStatus(page: Page) {
  return page.locator('main [role="status"]');
}

function log(page: Page) {
  return page.locator('main [role="log"]');
}

function rowButton(page: Page, action: string, menu: string) {
  return page.getByRole("button", {
    name: fill(strings.rowAction, { action, menu }),
    exact: true,
  });
}

// The menus in the order the page shows them, by the value of each name
// field.
async function menuNames(page: Page): Promise<string[]> {
  return rows(page)
    .getByRole("textbox")
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// The list is ready to press once the page has hydrated.
async function openMenus(page: Page): Promise<string[]> {
  await open(page, menusPath);
  await page.waitForLoadState("networkidle");
  const names = await menuNames(page);
  expect(
    names.length,
    "the test restaurant has three menus",
  ).toBeGreaterThanOrEqual(3);
  return names;
}

function movedDownFailure(menu: string): string {
  return `${fill(strings.notMoved, { menu })} ${editing.problems.outOfDate}`;
}

test("the menus page is named for itself, and the nav marks Menus as the current page", async ({
  page,
}) => {
  await open(page, menusPath);
  const name = await restaurantName(page);
  await expect(page).toHaveTitle(pageTitle(en, strings.title, name));
  await expect(page.locator("main h1")).toHaveText(strings.heading);
  const restaurantNav = page.getByRole("navigation", { name, exact: true });
  await expect(restaurantNav).toHaveCount(1);
  const current = restaurantNav.locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(nav.menus);
  await expect(current).toHaveAttribute("href", menusPath);
  await expect(restaurantNav.locator(`a[href="${details}"]`)).toHaveText(
    nav.details,
  );
});

test("every field and button names its menu, and no two controls share a name", async ({
  page,
}) => {
  const names = await openMenus(page);
  for (const menu of names) {
    await expect(
      page.getByRole("textbox", {
        name: `${strings.nameLabel} ${fill(strings.nameFor, { menu })}`,
        exact: true,
      }),
    ).toHaveCount(1);
    for (const label of [strings.moveUp, strings.moveDown, strings.remove]) {
      await expect(rowButton(page, label, menu)).toHaveCount(1);
    }
  }

  const snapshot = await page.locator("main").ariaSnapshot();
  const controls = [
    ...snapshot.matchAll(/- (?:textbox|button) "([^"]*)"/g),
  ].map((match) => match[1] ?? "");
  expect(
    controls.length,
    "every row's field and three buttons, the add field and button, and Undo",
  ).toBe(names.length * 4 + 3);
  expect(new Set(controls).size, "no two controls share a name").toBe(
    controls.length,
  );
});

test("the first row cannot move up, the last cannot move down, and both buttons still take focus", async ({
  page,
}) => {
  const names = await openMenus(page);
  const first = names[0] ?? "";
  const middle = names[1] ?? "";
  const last = names[names.length - 1] ?? "";
  const edges = [
    rowButton(page, strings.moveUp, first),
    rowButton(page, strings.moveDown, last),
  ];
  for (const button of edges) {
    await expect(button).toHaveAttribute("aria-disabled", "true");
    expect(
      await button.evaluate((element) => element.hasAttribute("disabled")),
      "an edge button is dimmed, not removed from the tab order",
    ).toBe(false);
    await button.focus();
    await expect(button).toBeFocused();
  }
  for (const label of [strings.moveUp, strings.moveDown]) {
    await expect(rowButton(page, label, middle)).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  }
});

test("pressing Move up on the first row sends nothing and says it is already first", async ({
  page,
}) => {
  const names = await openMenus(page);
  const first = names[0] ?? "";
  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { menu: first }),
  );
  expect(await menuNames(page)).toEqual(names);
});

// The first gate test to press Enter in a field that saves (D-118). It types
// nothing, so nothing may be sent or said; the write guard is the proof
// that nothing was sent. The dimmed Move up after it says one sentence at
// once, so the log is read after the commit has run.
test("Enter and Tab on an unchanged name send nothing and say nothing", async ({
  page,
}) => {
  const names = await openMenus(page);
  const first = names[0] ?? "";
  const middle = names[1] ?? "";
  const field = page.getByRole("textbox", {
    name: `${strings.nameLabel} ${fill(strings.nameFor, { menu: middle })}`,
    exact: true,
  });
  await field.focus();
  await page.keyboard.press("Enter");
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(field).not.toBeFocused();

  await rowButton(page, strings.moveUp, first).focus();
  await page.keyboard.press("Enter");
  await expect(log(page)).toHaveText(
    fill(strings.alreadyFirst, { menu: first }),
  );
  await expect(savedStatus(page)).toHaveText(editing.saved);
  expect(await menuNames(page)).toEqual(names);
});

test("the saved status is never spoken, the log is polite and empty, and Undo starts with nothing to undo", async ({
  page,
}) => {
  await openMenus(page);
  const status = savedStatus(page);
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute("aria-live", "off");
  await expect(status).toHaveText(editing.saved);

  const region = log(page);
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveText("");

  const undo = page.getByRole("button", { name: editing.undo, exact: true });
  await expect(undo).toHaveCount(1);
  await expect(undo).toHaveAttribute("aria-disabled", "true");
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(region).toHaveText(editing.nothingToUndo);
  await expect(undo).toBeFocused();
});

// The one way the gate sees a failed save: the press is real, and the guard
// answers it as an action the server does not know (Q-41).
test("a move the server cannot take goes back, is said once, and keeps focus on its button", async ({
  page,
}) => {
  const writes = expectWrites(page);
  const names = await openMenus(page);
  const menu = names[0] ?? "";
  const down = rowButton(page, strings.moveDown, menu);
  await down.focus();
  await page.keyboard.press("Enter");

  const failure = movedDownFailure(menu);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await menuNames(page), "the list is back in its order").toEqual(names);
  await expect(
    log(page).getByText(
      fill(strings.movedDown, { menu, position: 2, total: names.length }),
      { exact: true },
    ),
    "the move was said when it was made",
  ).toHaveCount(1);
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
  await expect(down, "focus is on the button that was pressed").toBeFocused();
  await expect(
    page.getByRole("button", { name: editing.reload, exact: true }),
    "a page that is out of date offers Reload",
  ).toHaveCount(1);
  expect(
    writes.answered.length,
    "the save was sent and answered in the browser",
  ).toBeGreaterThan(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test("a link pressed while a save is on its way waits, and stays when the save fails", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const names = await openMenus(page);
  const menu = names[0] ?? "";
  const name = await restaurantName(page);
  await rowButton(page, strings.moveDown, menu).focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the save is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(savedStatus(page)).toHaveText(editing.saving);

  const link = page
    .getByRole("navigation", { name, exact: true })
    .locator(`a[href="${details}"]`);
  await link.click();
  await expect(savedStatus(page), "the link waits for the save").toHaveText(
    editing.saving,
  );
  expect(new URL(page.url()).pathname).toBe(menusPath);

  writes.release();
  const failure = movedDownFailure(menu);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(
    new URL(page.url()).pathname,
    "the page stays, so the failure is not left behind",
  ).toBe(menusPath);
  await expect(page.locator("main h1")).toHaveText(strings.heading);
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
  await expect(link, "focus stays on the link").toBeFocused();
  await expect(page.locator('header [role="status"]')).toHaveText("");
});

// The link from a menu's row to its own page (D-122).
function sectionsLink(page: Page, menu: string) {
  return page.getByRole("link", {
    name: fill(strings.rowAction, { action: strings.editSections, menu }),
    exact: true,
  });
}

function nameField(page: Page, menu: string) {
  return page.getByRole("textbox", {
    name: `${strings.nameLabel} ${fill(strings.nameFor, { menu })}`,
    exact: true,
  });
}

// What the confirmation asks, which is also its name (D-119).
function deleteQuestion(menu: string, sections: number): string {
  const counted = fill(
    sections === 1 ? strings.sectionCount.one : strings.sectionCount.other,
    { count: sections },
  );
  return fill(strings.deleteAsk, { menu, sections: counted });
}

// The confirmation and its two answers. Every locator is scoped to the
// dialog: Playwright still finds the controls behind it by role, since its
// role engine does not know the page there is inert.
function confirmation(page: Page, menu: string, sections: number) {
  const dialog = page.getByRole("alertdialog", {
    name: deleteQuestion(menu, sections),
    exact: true,
  });
  return {
    dialog,
    keep: dialog.getByRole("button", { name: strings.keep, exact: true }),
    confirm: dialog.getByRole("button", { name: strings.remove, exact: true }),
  };
}

function deleteFailure(menu: string): string {
  return `${fill(strings.notDeleted, { menu })} ${editing.problems.outOfDate}`;
}

// The dialog's own reflow. The page check measures the document, and the
// overlay around the dialog scrolls on its own, so it is measured here: it
// never scrolls sideways, and scrolled to its top the question starts on
// screen, so a question taller than the screen is read from its first line.
async function expectDialogFits(dialog: Locator) {
  const fits = await dialog.evaluate((element) => {
    const overlay = element.parentElement?.parentElement;
    const heading = element.querySelector("h2");
    if (!overlay || !heading) return null;
    overlay.scrollTop = 0;
    return {
      sideways: overlay.scrollWidth > overlay.clientWidth,
      top: heading.getBoundingClientRect().top,
    };
  });
  expect(fits, "the dialog sits in its overlay, with its question").not.toBe(
    null,
  );
  expect(fits?.sideways, "the dialog does not scroll sideways").toBe(false);
  expect(
    fits?.top ?? -1,
    "the question starts on screen",
  ).toBeGreaterThanOrEqual(0);
}

test("every row links to its menu's own page, by a name that says which menu", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  const names = await openMenus(page);
  const targets: string[] = [];
  for (const menu of names) {
    const link = sectionsLink(page, menu);
    await expect(link).toHaveCount(1);
    await expect(link, "the visible words start the name").toHaveText(
      strings.editSections,
    );
    targets.push((await link.getAttribute("href")) ?? "");
  }
  expect(new Set(targets).size, "each link goes to its own page").toBe(
    names.length,
  );

  const target = restaurantMenuPath(code, withSections.id);
  const link = sectionsLink(page, withSections.name);
  await expect(link).toHaveAttribute("href", target);
  await link.click();
  await page.waitForURL(`**${target}`);
  await expectFocusResetThenSkipLink(page);
  await expect(page.locator("main h1")).toHaveText(withSections.name);
});

test("Delete on a menu with sections asks first, with focus on Keep, and Keep or Escape sends nothing", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  const names = await openMenus(page);
  const rowDelete = rowButton(page, strings.remove, withSections.name);
  const { dialog, keep, confirm } = confirmation(
    page,
    withSections.name,
    withSections.sections,
  );

  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect(dialog, "an alert dialog named by its question").toHaveCount(1);
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
    deleteQuestion(withSections.name, withSections.sections),
  );
  await expect(keep, "focus starts on Keep").toBeFocused();

  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(keep, "Tab stays inside the dialog").toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();

  // The page behind is inert, and the log is not: a save that lands while
  // the dialog is open is still heard (D-123). This pins the mark React
  // Aria leaves alone, which is not public.
  for (const behind of ["header", "main h1", "main ul"]) {
    expect(
      await page
        .locator(behind)
        .first()
        .evaluate((element) => element.closest("[inert]") !== null),
      `${behind} is inert behind the dialog`,
    ).toBe(true);
  }
  expect(
    await log(page).evaluate(
      (element) => element.closest('[inert], [aria-hidden="true"]') === null,
    ),
    "the log stays heard behind the dialog",
  ).toBe(true);
  await expectNoAxeViolations(page);

  await keep.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(rowDelete, "Keep returns focus to Delete").toBeFocused();
  await expect(page.locator("[inert]"), "the page is live again").toHaveCount(
    0,
  );

  await page.keyboard.press("Enter");
  await expect(keep).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rowDelete, "Escape returns focus to Delete").toBeFocused();

  expect(await menuNames(page), "nothing was deleted").toEqual(names);
  await expect(log(page), "and nothing was said").toHaveText("");
  await expect(savedStatus(page)).toHaveText(editing.saved);
});

test("the delete confirmation fits and scrolls from its top, before and after text spacing", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await openMenus(page);
  const { dialog, keep } = confirmation(
    page,
    withSections.name,
    withSections.sections,
  );
  await rowButton(page, strings.remove, withSections.name).focus();
  await page.keyboard.press("Enter");
  await expect(keep).toBeFocused();
  await expectDialogFits(dialog);
  await expectNoHorizontalScroll(page);
  await expectDialogFits(dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("at the largest phone text size, the delete confirmation fits and scrolls from its top", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await setLargestText(page);
  await openMenus(page);
  await expectRootAtLargest(page);
  const { dialog, keep, confirm } = confirmation(
    page,
    withSections.name,
    withSections.sections,
  );
  await rowButton(page, strings.remove, withSections.name).focus();
  await page.keyboard.press("Enter");
  await expect(keep).toBeFocused();
  await expectDialogFits(dialog);
  await expectNoHorizontalScroll(page);
  await expectDialogFits(dialog);
  await confirm.scrollIntoViewIfNeeded();
  await expect(confirm, "both answers can be reached").toBeInViewport();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// The double-tap guard (D-119). The press that opens the dialog can come
// twice, and the dialog must not take the second one as its answer. Both
// presses are made inside the page, one frame apart at most, so the second
// lands within the guard however slow the runner is. It sends nothing, so
// the write guard is the proof, and the test says it expects no write.
test("a second press right after the dialog opens does not confirm the delete, and the button looks no different", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  const names = await openMenus(page);
  const rowDelete = rowButton(page, strings.remove, withSections.name);
  const { dialog, keep, confirm } = confirmation(
    page,
    withSections.name,
    withSections.sections,
  );
  const rowId = (await rowDelete.getAttribute("id")) ?? "";

  const outcome = await page.evaluate(async (id) => {
    const row = document.getElementById(id);
    if (!row) return "no row";
    row.focus();
    row.click();
    for (let frame = 0; frame < 300; frame += 1) {
      const answers = document.querySelectorAll<HTMLElement>(
        '[role="alertdialog"] button',
      );
      const second = answers[1];
      if (answers.length === 2 && second) {
        second.click();
        return "pressed";
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return "no dialog";
  }, rowId);
  expect(outcome, "the dialog opened and its Delete was pressed at once").toBe(
    "pressed",
  );

  await expect(dialog, "the dialog is still asking").toHaveCount(1);
  expect(await menuNames(page), "nothing was deleted").toEqual(names);
  await expect(confirm, "the button is not disabled").toBeEnabled();
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  expect(
    await confirm.evaluate((element) => getComputedStyle(element).opacity),
    "and not dimmed",
  ).toBe("1");
  await expect(log(page), "and nothing was said").toHaveText("");

  await expect(keep).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog, "Escape works at once").toHaveCount(0);
  await expect(rowDelete).toBeFocused();
});

// The delete itself, as far as the gate may take it: the press is real, the
// guard holds its answer, and then answers it as an action the server does
// not know, so the menu comes back. While the answer is held the screen is
// what a confirmed delete shows: the dialog gone, the page live, the row
// gone, focus in the next row's name field, and the sentence in the log.
test("a confirmed delete closes the dialog first, moves focus to a name field, says so, and comes back when the server cannot take it", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { withSections } = ownerFixture();
  const names = await openMenus(page);
  const index = names.indexOf(withSections.name);
  const neighbor = names[index + 1] ?? names[index - 1] ?? "";
  const rowDelete = rowButton(page, strings.remove, withSections.name);
  const { dialog, keep, confirm } = confirmation(
    page,
    withSections.name,
    withSections.sections,
  );

  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect(keep).toBeFocused();
  // The double-tap guard: the dialog's Delete takes no press at first.
  await page.waitForTimeout(CONFIRM_GUARD_MS + 100);
  await confirm.focus();
  await page.keyboard.press("Enter");

  await expect(dialog, "the dialog closes").toHaveCount(0);
  await expect
    .poll(() => writes.answered.length, {
      message: "the delete is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(page.locator("[inert]"), "the page is live again").toHaveCount(
    0,
  );
  expect(await menuNames(page), "the row is gone").toEqual(
    names.filter((name) => name !== withSections.name),
  );
  await expect(
    nameField(page, neighbor),
    "focus is in the next row's name field",
  ).toBeFocused();
  await expect(
    log(page).getByText(fill(strings.deleted, { menu: withSections.name }), {
      exact: true,
    }),
    "the delete is said once",
  ).toHaveCount(1);

  writes.release();
  const failure = deleteFailure(withSections.name);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await menuNames(page), "the menu is back").toEqual(names);
  await expect(rowDelete, "focus is back on its Delete").toBeFocused();
  await expect(
    log(page).getByText(failure, { exact: true }),
    "the failure is said once",
  ).toHaveCount(1);
});

test("Delete on a menu with no sections asks nothing, and the menu comes back when the server cannot take it", async ({
  page,
}) => {
  const writes = expectWrites(page, { hold: true });
  const { empty } = ownerFixture();
  const names = await openMenus(page);
  const rowDelete = rowButton(page, strings.remove, empty.name);

  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => writes.answered.length, {
      message: "the delete is on its way, and held",
    })
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("alertdialog"),
    "an empty menu goes at once",
  ).toHaveCount(0);
  expect(await menuNames(page), "the row is gone").toEqual(
    names.filter((name) => name !== empty.name),
  );
  await expect(
    log(page).getByText(fill(strings.deleted, { menu: empty.name }), {
      exact: true,
    }),
  ).toHaveCount(1);

  writes.release();
  const failure = deleteFailure(empty.name);
  await expect(savedStatus(page)).toHaveText(failure);
  expect(await menuNames(page), "the menu is back").toEqual(names);
  await expect(rowDelete, "focus is back on its Delete").toBeFocused();
  await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
});
