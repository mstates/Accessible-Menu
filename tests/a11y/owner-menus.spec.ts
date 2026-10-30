import { expect, test, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import {
  restaurantDetailsPath,
  restaurantMenuPath,
  restaurantMenusPath,
} from "../../src/features/owner/paths";
import {
  CONFIRM_GUARD_MS,
  FIRST_FOCUS_WAIT_MS,
} from "../../src/ui/alert-dialog-guard";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNoMissingIds,
  expectRootAtLargest,
  open,
  setLargestText,
} from "./checks";
import { expectLabelShape } from "./label-shape";
import { ownerEnv, ownerFixture, type OwnerFixture } from "./owner-env";
import { listRowChecks, stopClock } from "./owner-lists";
import { restaurantName } from "./pages";
import { expectWrites, guardWrites } from "./write-guard";

// The menus list, signed in as the test owner (D-100), on the menus the
// data file gave the test restaurant (D-126). The gate never writes and
// never types into a field that saves (D-108, D-111, D-115): every test
// here runs behind the write guard. The row tests every list shares run
// from listRowChecks in owner-lists.ts; this file holds what is the menus
// page's own. Typing, real saves and the "Saved." they say (D-118), add, a
// delete that lands, Undo with something to undo, and a name that is taken
// are covered by the unit tests and by hand. The shared page checks for
// this page run from owner-pages.spec.ts. The line under each name that
// says whether the menu is published (Q-115) is read here too, against the
// states the setup wrote.
//
// The delete confirmation (D-119) is one piece for every list, and its
// clock tests run here: its first focus (D-136), the dialog itself and then
// Keep after the wait, with every focus and blur counted; a tap on its
// Delete inside the double-tap guard is not taken, with the write guard as
// the proof that nothing was sent; and
// two tests press Delete for real and say they expect a write, by a tap
// once the double-tap guard is over and by a press with no pointer behind
// it. The write guard holds the answer so the screen can be read while the
// delete is on its way, then answers it as a failure, so the menu comes
// back. Which menu holds sections and which holds none comes from the
// setup.

const { code } = ownerEnv();
const menusPath = restaurantMenusPath(code);
const details = restaurantDetailsPath(code);
const strings = en.owner.menus;
const editing = en.owner.editing;
const nav = en.owner.restaurants.nav;
const publishing = en.owner.publishing;

guardWrites();

listRowChecks({
  noun: "menu",
  plural: "menus",
  words: strings,
  path: () => menusPath,
  h1: () => strings.heading,
  // The name field and Move up, Move down, and Delete; the add field, Add,
  // and Undo.
  rowControls: 4,
  pageControls: 3,
  rowLink: {
    label: strings.editSections,
    target: () => {
      const { withSections } = ownerFixture();
      return {
        name: withSections.name,
        path: restaurantMenuPath(code, withSections.id),
      };
    },
  },
  // The restaurant nav's Details link.
  leaveLink: (page) => page.locator(`nav a[href="${details}"]`),
  deletes: {
    asking: () => {
      const { withSections } = ownerFixture();
      return {
        name: withSections.name,
        question: deleteQuestion(withSections),
      };
    },
    empty: () => ownerFixture().empty.name,
  },
});

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

function nameField(page: Page, menu: string) {
  return page.getByRole("textbox", {
    name: `${strings.nameLabel} ${fill(strings.labelFor, { menu })}`,
    exact: true,
  });
}

// The one node (D-193), in every engine: a row's name field is named by
// one label holding the whole name as one clipped text node, with the
// visible words hidden from assistive technology inside it.
test("a menu's name field is named by one label of one node, the whole name, with its visible words hidden from assistive technology", async ({
  page,
}) => {
  const [first] = await openMenus(page);
  if (!first) throw new Error("the menus page shows no menu");
  const id = (await nameField(page, first).getAttribute("id")) ?? "";
  await expectLabelShape(
    page,
    id,
    `${strings.nameLabel} ${fill(strings.labelFor, { menu: first })}`,
    { visible: strings.nameLabel },
  );
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The sentence a row shows for its menu's state (Q-115): the menu page's
// own words (D-171), with the day as a pattern, since the data file's days
// are its own.
function stateLine(state: OwnerFixture["states"][number]): RegExp {
  if (!state.published) {
    return new RegExp(`^${escapeRegExp(publishing.state.notPublished)}$`);
  }
  const key = state.changed
    ? publishing.state.changed
    : publishing.state.published;
  const [before = "", after = ""] = key.split("{date}");
  return new RegExp(
    `^${escapeRegExp(before)}\\w+ \\d{1,2}, \\d{4}${escapeRegExp(after)}$`,
  );
}

// The line under each name (Q-115): one paragraph of plain text saying what
// the menu's own page says of its publish state, after the name field and
// before the row's link and buttons, tied to nothing, so the field, the
// link, and the buttons read exactly as before (D-193). The data file
// leaves the test restaurant with menus in both states.
test("each menu's row says under its name whether it is published, as text tied to nothing", async ({
  page,
}) => {
  const { states } = ownerFixture();
  const names = await openMenus(page);
  expect(
    states.map((state) => state.name),
    "the setup wrote a state for every row, in the page's order",
  ).toEqual(names);
  expect(
    states.some((state) => state.published) &&
      states.some((state) => !state.published),
    "the rows show both states",
  ).toBe(true);
  for (const state of states) {
    const row = rows(page).filter({
      has: page.getByRole("heading", {
        level: 2,
        name: state.name,
        exact: true,
      }),
    });
    await expect(row).toHaveCount(1);
    const line = row.locator("p");
    await expect(line, "one line of text in the row").toHaveCount(1);
    await expect(line).toHaveText(stateLine(state));
    const shape = await line.evaluate((element) => {
      const item = element.closest("li");
      const field = item?.querySelector('input[id$="-name"]') ?? null;
      const link = item?.querySelector("a") ?? null;
      const id = element.id;
      const pointedAt =
        id === ""
          ? 0
          : [
              ...document.querySelectorAll(
                "[aria-describedby], [aria-labelledby]",
              ),
            ].filter((other) =>
              `${other.getAttribute("aria-describedby") ?? ""} ${other.getAttribute("aria-labelledby") ?? ""}`
                .split(/\s+/)
                .includes(id),
            ).length;
      const follows = (first: Node, second: Node) =>
        (first.compareDocumentPosition(second) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0;
      return {
        role: element.getAttribute("role"),
        pointedAt,
        inLabel: element.closest("label") !== null,
        afterField: field ? follows(field, element) : null,
        beforeLink: link ? follows(element, link) : null,
      };
    });
    expect(shape.role, "plain text, no role").toBeNull();
    expect(shape.pointedAt, "nothing on the page points at it").toBe(0);
    expect(shape.inLabel, "and it is in no label").toBe(false);
    expect(shape.afterField, "it sits after the name field").toBe(true);
    expect(shape.beforeLink, "and before the row's link").toBe(true);
    const field = nameField(page, state.name);
    await expect(field, "the field's name is unchanged").toHaveCount(1);
    await expect(
      field,
      "and the line is not its description",
    ).toHaveAccessibleDescription("");
  }
});

// What a menu holds, as the setup counted it: its sections and their dishes.
type Holds = { name: string; sections: number; dishes: number };

// What the confirmation asks, which is also its name (D-119). It names the
// menu's sections, and their dishes when they hold any.
function deleteQuestion({ name: menu, sections, dishes }: Holds): string {
  const counted = (words: { one: string; other: string }, count: number) =>
    fill(count === 1 ? words.one : words.other, { count });
  return dishes > 0
    ? fill(strings.deleteAskBoth, {
        menu,
        sections: counted(strings.sectionCount, sections),
        dishes: counted(strings.dishCount, dishes),
      })
    : fill(strings.deleteAsk, {
        menu,
        sections: counted(strings.sectionCount, sections),
      });
}

// The confirmation and its two answers. Every locator is scoped to the
// dialog: Playwright still finds the controls behind it by role, since its
// role engine does not know the page there is inert.
function confirmation(page: Page, menu: Holds) {
  const dialog = page.getByRole("alertdialog", {
    name: deleteQuestion(menu),
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

test(
  "the delete confirmation fits and scrolls from its top, before and after text spacing",
  { tag: "@dialog" },
  async ({ page }) => {
    const { withSections } = ownerFixture();
    await openMenus(page);
    const { dialog, keep } = confirmation(page, withSections);
    await rowButton(page, strings.remove, withSections.name).focus();
    await page.keyboard.press("Enter");
    await expect(keep).toBeFocused();
    await expectDialogFits(dialog);
    await expectNoHorizontalScroll(page);
    await expectDialogFits(dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  },
);

test(
  "at the largest phone text size, the delete confirmation fits and scrolls from its top",
  { tag: "@dialog" },
  async ({ page }) => {
    const { withSections } = ownerFixture();
    await setLargestText(page);
    await openMenus(page);
    await expectRootAtLargest(page);
    const { dialog, keep, confirm } = confirmation(page, withSections);
    await rowButton(page, strings.remove, withSections.name).focus();
    await page.keyboard.press("Enter");
    await expect(keep).toBeFocused();
    await expectDialogFits(dialog);
    await expectNoHorizontalScroll(page);
    await expectDialogFits(dialog);
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm, "both answers can be reached").toBeInViewport();
    await expectNoMissingIds(page);
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  },
);

// Every focus and blur in the page from here on, named by where it lands:
// the dialog itself, an answer by its words, or the page behind. The
// window's own focus and blur are not counted.
async function recordFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const moves: string[] = [];
    Object.assign(window, { focusMoves: moves });
    const named = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return "page";
      if (target.getAttribute("role") === "alertdialog") return "dialog";
      return target.closest('[role="alertdialog"]')
        ? (target.textContent ?? "").trim()
        : "page";
    };
    for (const type of ["focus", "blur"]) {
      window.addEventListener(
        type,
        (event) => {
          if (event.target === window || event.target === document) return;
          moves.push(`${type} ${named(event.target)}`);
        },
        true,
      );
    }
  });
}

async function focusMoves(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { focusMoves: string[] }).focusMoves,
  );
}

// The first focus (D-136). React Aria focuses the dialog itself the moment
// it opens, so the question is read as its name, and after the wait focus
// moves once to Keep. Keep is never blurred and never focused twice, and
// React Aria's own refocus half a second in finds focus on Keep and leaves
// it. On a stopped clock, so the wait is measured to the millisecond and
// the second after it is watched whole.
test(
  "the dialog takes focus first, and after the wait focus moves once to Keep and stays",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const { withSections } = ownerFixture();
    await openMenus(page);
    const rowDelete = rowButton(page, strings.remove, withSections.name);
    const { dialog, keep } = confirmation(page, withSections);

    await stopClock(page);
    await rowDelete.focus();
    await recordFocus(page);
    await page.keyboard.press("Enter");
    await expect(
      dialog,
      "the dialog itself has focus as it opens",
    ).toBeFocused();
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS - 1);
    await expect(dialog, "until the wait is over").toBeFocused();
    await page.clock.runFor(1);
    await expect(keep, "then Keep").toBeFocused();
    await page.clock.runFor(1000);
    await expect(keep, "and Keep keeps it").toBeFocused();
    expect(
      await focusMoves(page),
      "one move into the dialog and one to Keep, nothing blurred or focused again",
    ).toEqual([
      "blur page",
      "focus dialog",
      "blur dialog",
      `focus ${strings.keep}`,
    ]);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(rowDelete).toBeFocused();
  },
);

// An owner who moves before the wait is over keeps the place they moved to:
// a Tab from the dialog reaches Keep, the first answer, a second Tab reaches
// Delete, and the end of the wait moves nothing. Escape sends nothing.
test(
  "a Tab inside the wait moves on from the dialog, and the first focus leaves focus where the owner put it",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const { withSections } = ownerFixture();
    const names = await openMenus(page);
    const rowDelete = rowButton(page, strings.remove, withSections.name);
    const { dialog, keep, confirm } = confirmation(page, withSections);

    await stopClock(page);
    await rowDelete.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(keep, "Tab from the dialog reaches Keep first").toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.clock.runFor(1000);
    await expect(confirm, "the end of the wait moves nothing").toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(rowDelete).toBeFocused();
    expect(await menuNames(page), "nothing was deleted").toEqual(names);
  },
);

// The double-tap guard (D-119). The press that opens the dialog can come
// twice, and the dialog must not take the second one as its answer. That is
// a pointer's problem, so the guard holds back a mouse, a finger, and a pen,
// and nothing else. Both presses here are real taps on a stopped clock, the
// second just as the first focus reaches Keep (D-136), a tenth of a second
// in and well inside the guard. Keep and Escape are not held back: Escape is
// pressed in that same instant. Nothing is sent, so the write guard is the
// proof, and the test says it expects no write.
test(
  "a second tap right after the dialog opens does not confirm the delete, and the button looks no different",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const { withSections } = ownerFixture();
    const names = await openMenus(page);
    const rowDelete = rowButton(page, strings.remove, withSections.name);
    const { dialog, keep, confirm } = confirmation(page, withSections);

    await stopClock(page);
    await rowDelete.tap();
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
    await expect(
      keep,
      "the dialog opens, and focus moves to Keep",
    ).toBeFocused();
    await confirm.tap();
    await expect(confirm, "the second tap landed on Delete").toBeFocused();

    await expect(dialog, "the dialog is still asking").toHaveCount(1);
    expect(await menuNames(page), "nothing was deleted").toEqual(names);
    await expect(confirm, "the button is not disabled").toBeEnabled();
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    expect(
      await confirm.evaluate((element) => getComputedStyle(element).opacity),
      "and not dimmed",
    ).toBe("1");
    await expect(log(page), "and nothing was said").toHaveText("");

    await page.keyboard.press("Escape");
    await expect(dialog, "Escape works at once").toHaveCount(0);
    await expect(rowDelete).toBeFocused();
  },
);

// The other side of the double-tap guard: once its half second is over, a
// tap on Delete is taken like any press. The clock stops before the dialog
// opens and is moved on by exactly the guard, the first focus's wait and
// then the rest, so this is the first instant a tap counts.
test(
  "a tap on Delete once the double-tap guard is over confirms, and the menu comes back when the server cannot take it",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const writes = expectWrites(page, { hold: true });
    const { withSections } = ownerFixture();
    const names = await openMenus(page);
    const index = names.indexOf(withSections.name);
    const neighbor = names[index + 1] ?? names[index - 1] ?? "";
    const rowDelete = rowButton(page, strings.remove, withSections.name);
    const { dialog, keep, confirm } = confirmation(page, withSections);

    await stopClock(page);
    await rowDelete.tap();
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
    await expect(keep).toBeFocused();
    await page.clock.fastForward(CONFIRM_GUARD_MS - FIRST_FOCUS_WAIT_MS);
    await confirm.tap();
    await page.clock.resume();

    await expect(dialog, "the dialog closes").toHaveCount(0);
    await expect
      .poll(() => writes.answered.length, {
        message: "the delete is on its way, and held",
      })
      .toBeGreaterThan(0);
    expect(await menuNames(page), "the row is gone").toEqual(
      names.filter((name) => name !== withSections.name),
    );
    await expect(
      nameField(page, neighbor),
      "focus is in the next row's name field",
    ).toBeFocused();

    writes.release();
    await expect(savedStatus(page)).toHaveText(
      deleteFailure(withSections.name),
    );
    expect(await menuNames(page), "the menu is back").toEqual(names);
    await expect(rowDelete, "focus is back on its Delete").toBeFocused();
  },
);

// A press with no pointer behind it is what a screen reader sends, and what
// React Aria calls virtual. It is never held back either (D-119): a screen
// reader presses what its cursor is on, so a press on Delete was meant. Both
// presses are made inside the page, the way element.click() makes them, on
// a stopped clock, the second as the first focus reaches Keep (D-136), well
// inside the guard. A real screen reader's press is checked by hand.
test(
  "a press with no pointer behind it, the kind a screen reader sends, confirms the delete at once",
  { tag: "@dialog" },
  async ({ page }) => {
    await page.clock.install();
    const writes = expectWrites(page, { hold: true });
    const { withSections } = ownerFixture();
    const names = await openMenus(page);
    const rowDelete = rowButton(page, strings.remove, withSections.name);
    const { dialog, keep, confirm } = confirmation(page, withSections);

    await stopClock(page);
    await rowDelete.evaluate((element: HTMLElement) => element.click());
    await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
    await expect(
      keep,
      "the dialog opens, and focus moves to Keep",
    ).toBeFocused();
    await confirm.evaluate((element: HTMLElement) => element.click());
    await page.clock.resume();

    await expect(dialog, "the dialog closes").toHaveCount(0);
    await expect
      .poll(() => writes.answered.length, {
        message: "the delete is on its way, and held",
      })
      .toBeGreaterThan(0);
    expect(await menuNames(page), "the row is gone").toEqual(
      names.filter((name) => name !== withSections.name),
    );

    writes.release();
    await expect(savedStatus(page)).toHaveText(
      deleteFailure(withSections.name),
    );
    expect(await menuNames(page), "the menu is back").toEqual(names);
  },
);
