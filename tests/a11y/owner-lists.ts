import { expect, test, type Locator, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { FIRST_FOCUS_WAIT_MS } from "../../src/ui/alert-dialog-guard";
import {
  expectFocusResetThenSkipLink,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  open,
} from "./checks";
import { expectWrites } from "./write-guard";

// What the three editing lists share, checked the same way on each (D-128):
// the menus of a restaurant, the sections of a menu, and the dishes of a
// section are one list with one row. listRowChecks registers the row tests
// every list runs, and each list's spec calls it once with its own page and
// its own words; what only one list has stays in its own spec. Not a spec
// itself: it registers tests only when a spec calls listRowChecks.

const editing = en.owner.editing;

export function listRows(page: Page) {
  return page.locator("main ul > li");
}

function savedStatus(page: Page) {
  return page.locator('main [role="status"]');
}

function log(page: Page) {
  return page.locator('main [role="log"]');
}

// The names the list shows, in order, by the value of each name field.
async function savedNames(page: Page): Promise<string[]> {
  return listRows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
}

// Every name on the page, in order: a saved row by its name field, a row
// not saved yet by its text, which is its first paragraph.
async function namesOnPage(page: Page): Promise<string[]> {
  return listRows(page).evaluateAll((rows) =>
    rows.map((row) => {
      const field = row.querySelector<HTMLInputElement>('input[id$="-name"]');
      return field ? field.value : (row.querySelector("p")?.textContent ?? "");
    }),
  );
}

// Every saved row holds one heading, a level 2 with the row's saved name,
// so a screen reader moves through a long list row by row. The headings
// come in the order of the name fields, and the list holds no other
// heading.
export async function expectRowHeadings(page: Page, path: string) {
  await open(page, path);
  await page.waitForLoadState("networkidle");
  const rows = await listRows(page).evaluateAll((items) =>
    items.map((item) => ({
      headings: [...item.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
        (heading) => `${heading.tagName} ${heading.textContent ?? ""}`,
      ),
      name:
        item.querySelector<HTMLInputElement>('input[id$="-name"]')?.value ??
        null,
    })),
  );
  expect(rows.length, "the list has rows to read").toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.name, "every row here is a saved row").not.toBeNull();
    expect(row.headings, "one heading a row, its saved name").toEqual([
      `H2 ${row.name}`,
    ]);
  }
  const headings = page.locator("main ul").getByRole("heading", { level: 2 });
  await expect(headings).toHaveText(rows.map((row) => row.name ?? ""));
  await expect(
    page.locator("main ul").getByRole("heading"),
    "the list holds no other heading",
  ).toHaveCount(rows.length);
}

// Records every sentence added to the page's log from now on. The log drops
// a message after seven seconds, so reading its children later would miss
// some; this hears each one as it is added.
async function hearLog(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    const log = document.querySelector('main [role="log"]');
    if (!log) throw new Error("the page has no log");
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          w.__said.push(node.textContent ?? "");
        }
      }
    }).observe(log, { childList: true });
  });
}

function heard(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __said: string[] }).__said,
  );
}

type BurstWords = {
  // The add field's label.
  newLabel: string;
  // "Remove, Burst one": the one button on an added row that failed.
  removeName: (name: string) => string;
  // "Burst one was not added." and "Burst one removed."
  notAdded: (name: string) => string;
  removed: (name: string) => string;
};

const BURST = ["Burst one", "Burst two", "Burst three"];

// Three names added with Enter without waiting (D-125). This is the one
// place the gate types into a field: an add field sends nothing until Enter
// or its button, so typing there is safe, and the write guard answers what
// Enter sends (D-115, refined for this test). It never types into a field
// that saves when it is left.
//
// The first add's answer is held, so the screen can be read while the other
// two wait their turn behind it. Released, the guard answers each as an
// action the server does not know, one after another, so each name ends as
// a row with its error and its Remove. At no point is a name missing from
// the page or on it twice. Nothing reaches the server, and each row is
// removed again before the test ends.
export async function expectBurstKeepsEveryName(
  page: Page,
  path: string,
  words: BurstWords,
) {
  const writes = expectWrites(page, { hold: true });
  await open(page, path);
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  const before = await savedNames(page);
  const field = page.getByRole("textbox", {
    name: words.newLabel,
    exact: true,
  });

  await field.focus();
  for (const name of BURST) {
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
    await expect(field, "the name leaves the field at once").toHaveValue("");
    await expect(field, "and focus stays in the field").toBeFocused();
  }

  const waiting = listRows(page).filter({ hasText: editing.notSavedYet });
  await expect(waiting, "all three show at once, not saved yet").toHaveCount(3);
  for (const [index, name] of BURST.entries()) {
    const row = waiting.nth(index);
    await expect(row.locator("p").first()).toHaveText(name);
    await expect(
      row.getByRole("heading"),
      "a row not saved yet has no heading",
    ).toHaveCount(0);
    await expect(row.getByRole("textbox"), "and no field").toHaveCount(0);
    await expect(row.getByRole("button"), "and no button").toHaveCount(0);
  }
  expect(await namesOnPage(page), "every name is on the page once").toEqual([
    ...before,
    ...BURST,
  ]);
  await expect(savedStatus(page)).toHaveText(editing.saving);
  expect(
    writes.answered.length,
    "one add is on its way; the other two wait their turn",
  ).toBe(1);
  await expectNoAxeViolations(page);

  writes.release();
  await expect
    .poll(() => writes.answered.length, {
      message: "each add is sent in turn",
    })
    .toBe(3);
  const failure = (name: string) =>
    `${words.notAdded(name)} ${editing.problems.outOfDate}`;
  for (const name of BURST) {
    const remove = page.getByRole("button", {
      name: words.removeName(name),
      exact: true,
    });
    await expect(remove, `${name} is kept, with its Remove`).toHaveCount(1);
    await expect(
      listRows(page).filter({ has: remove }),
      "and with its error",
    ).toContainText(editing.problems.outOfDate);
  }
  expect(await namesOnPage(page), "no name is lost or doubled").toEqual([
    ...before,
    ...BURST,
  ]);
  await expect(savedStatus(page)).toHaveText(failure(BURST[2] ?? ""));
  await expect
    .poll(() => heard(page), {
      message: "each failure is said once, in the order the names were entered",
    })
    .toEqual(BURST.map(failure));
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Remove sends nothing: the names were never saved.
  for (const name of BURST) {
    await page
      .getByRole("button", { name: words.removeName(name), exact: true })
      .press("Enter");
    await expect(field, "Remove puts focus in the add field").toBeFocused();
  }
  expect(await namesOnPage(page), "the list is as it was").toEqual(before);
  await expect(savedStatus(page)).toHaveText(editing.saved);
  // The return to saved is said by an effect, a commit after the status
  // shows it, so the log is read until it has it.
  await expect
    .poll(async () => (await heard(page)).slice(3), {
      message: "each Remove is said once, then the return to saved, once",
    })
    .toEqual([...BURST.map(words.removed), editing.savedAgain]);
  expect(writes.answered.length, "Remove sent nothing").toBe(3);
}

// The placeholder a list's sentences carry for a row's name.
type Noun = "menu" | "section" | "dish";

// The words the row checks read, under the same keys in each list's slice
// of copy.
type RowWords = {
  rowAction: string;
  nameLabel: string;
  labelFor: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  alreadyFirst: string;
  movedDown: string;
  notMoved: string;
  newLabel: string;
  add: string;
  none: string;
  notAdded: string;
  removed: string;
  deleted: string;
  notDeleted: string;
  keep?: string;
};

// A text of a row besides its name, by its whole name for one row.
type RowField = {
  name: (row: string) => string;
  hint: string;
  multiline: boolean;
};

export type ListUnderTest = {
  noun: Noun;
  // "menus", for the titles.
  plural: string;
  words: RowWords;
  // A page of the list with at least three rows, and its h1. Read when a
  // test runs: some come from the setup's fixture.
  path: () => string;
  h1: () => string;
  // The texts of a row after its name, in order.
  rowFields?: readonly RowField[];
  // How many fields and buttons a row holds, and how many the page holds
  // outside its rows.
  rowControls: number;
  pageControls: number;
  // The link from each row to its own page, and one row to follow it from.
  rowLink?: { label: string; target: () => { name: string; path: string } };
  // A link that leaves the page, which waits for a save on its way.
  leaveLink: (page: Page) => Locator;
  // A page of the list with no rows, and its h1.
  empty?: { path: () => string; h1: () => string };
  // Paths that name no page of this list: one that is not an id, and one
  // that matches nothing.
  notFound?: readonly string[];
  // Rows to delete: one that holds content, with its question, and one that
  // holds nothing.
  deletes?: {
    asking: () => { name: string; question: string };
    empty: () => string;
  };
};

// The double-tap guard reads the page's clock (D-119). A test that presses
// the confirmation's Delete installs Playwright's clock before the page
// loads and stops it here, before its first press, so no time passes for
// the page between one press and the next, however slow the runner is. A
// clock cannot be stopped in its past, so it stops one second on.
// Playwright's own waiting does not run on that clock.
export async function stopClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
}

// The row tests every editing list runs. The gate never writes and never
// types into a field that saves when it is left (D-108, D-111, D-115).
// Most of these only read. One presses Enter and Tab in fields it does not
// change, and the guard proves nothing was sent; it does not press Enter in
// a field of several lines, since that would type a line break. The ones
// that press a button that saves say they expect a write, and the guard
// answers it inside the browser as an action the server does not know,
// which is how the failed state is reached. The burst types into the add
// field only (D-132). Each spec calls guardWrites itself.
export function listRowChecks(list: ListUnderTest): void {
  const { noun, plural, words } = list;
  const named = (row: string) => ({ [noun]: row });
  const rowButton = (page: Page, action: string, row: string) =>
    page.getByRole("button", {
      name: fill(words.rowAction, { action, ...named(row) }),
      exact: true,
    });
  const nameField = (page: Page, row: string) =>
    page.getByRole("textbox", {
      name: `${words.nameLabel} ${fill(words.labelFor, named(row))}`,
      exact: true,
    });
  const fieldsOf = (page: Page, row: string) => [
    { field: nameField(page, row), multiline: false },
    ...(list.rowFields ?? []).map((spec) => ({
      field: page.getByRole("textbox", { name: spec.name(row), exact: true }),
      multiline: spec.multiline,
    })),
  ];
  const movedDownFailure = (row: string) =>
    `${fill(words.notMoved, named(row))} ${editing.problems.outOfDate}`;
  const deleteFailure = (row: string) =>
    `${fill(words.notDeleted, named(row))} ${editing.problems.outOfDate}`;

  // The list is ready to press once the page has hydrated.
  async function openList(page: Page): Promise<string[]> {
    await open(page, list.path());
    await page.waitForLoadState("networkidle");
    const names = await savedNames(page);
    expect(
      names.length,
      `the test page has three ${plural}`,
    ).toBeGreaterThanOrEqual(3);
    return names;
  }

  test(`every field and button names its ${noun}, each hint is tied to its field, and no two controls share a name`, async ({
    page,
  }) => {
    const names = await openList(page);
    for (const row of names) {
      const name = nameField(page, row);
      await expect(name).toHaveCount(1);
      expect(
        await name.evaluate((element) => element.tagName),
        "the name is one line",
      ).toBe("INPUT");
      for (const spec of list.rowFields ?? []) {
        const field = page.getByRole("textbox", {
          name: spec.name(row),
          exact: true,
        });
        await expect(field).toHaveCount(1);
        await expect(field).toHaveAccessibleDescription(spec.hint);
        expect(
          await field.evaluate((element) => element.tagName),
          spec.multiline ? "it takes several lines" : "it is one line",
        ).toBe(spec.multiline ? "TEXTAREA" : "INPUT");
      }
      for (const label of [words.moveUp, words.moveDown, words.remove]) {
        await expect(rowButton(page, label, row)).toHaveCount(1);
      }
    }
    if (!list.rowLink) {
      await expect(
        listRows(page).getByRole("link"),
        `a ${noun} has no page of its own yet, so its row has no link`,
      ).toHaveCount(0);
    }

    const snapshot = await page.locator("main").ariaSnapshot();
    const controls = [
      ...snapshot.matchAll(/- (?:textbox|button) "([^"]*)"/g),
    ].map((match) => match[1] ?? "");
    expect(
      controls.length,
      "every row's fields and buttons, and the page's own controls",
    ).toBe(names.length * list.rowControls + list.pageControls);
    expect(new Set(controls).size, "no two controls share a name").toBe(
      controls.length,
    );
  });

  test(`the first ${noun} cannot move up, the last cannot move down, and both buttons still take focus`, async ({
    page,
  }) => {
    const names = await openList(page);
    const first = names[0] ?? "";
    const middle = names[1] ?? "";
    const last = names[names.length - 1] ?? "";
    const edges = [
      rowButton(page, words.moveUp, first),
      rowButton(page, words.moveDown, last),
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
    for (const label of [words.moveUp, words.moveDown]) {
      await expect(rowButton(page, label, middle)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  test(`pressing Move up on the first ${noun} sends nothing and says it is already first`, async ({
    page,
  }) => {
    const names = await openList(page);
    const first = names[0] ?? "";
    await rowButton(page, words.moveUp, first).focus();
    await page.keyboard.press("Enter");
    await expect(log(page)).toHaveText(fill(words.alreadyFirst, named(first)));
    expect(await savedNames(page)).toEqual(names);
  });

  // It types nothing, so nothing may be sent or said; the write guard is the
  // proof that nothing was sent (D-118). Enter commits a field of one line,
  // so it is pressed in each of those; a field of several lines is only
  // left, with Tab. The dimmed Move up after it says one sentence at once,
  // so the log is read after every commit has run.
  test(`Enter and Tab through a ${noun}'s unchanged fields send nothing and say nothing`, async ({
    page,
  }) => {
    const names = await openList(page);
    const first = names[0] ?? "";
    const middle = names[1] ?? "";
    const fields = fieldsOf(page, middle);
    await nameField(page, middle).focus();
    for (const { field, multiline } of fields) {
      await expect(field, "the row's fields come in order").toBeFocused();
      if (!multiline) {
        await page.keyboard.press("Enter");
        await expect(field).toBeFocused();
      }
      await page.keyboard.press("Tab");
    }
    for (const { field } of fields) {
      await expect(field, "Tab has left the row's fields").not.toBeFocused();
    }

    await rowButton(page, words.moveUp, first).focus();
    await page.keyboard.press("Enter");
    await expect(log(page)).toHaveText(fill(words.alreadyFirst, named(first)));
    await expect(savedStatus(page)).toHaveText(editing.saved);
    expect(await savedNames(page)).toEqual(names);
  });

  test(`on the ${plural}' page the saved status is never spoken, the log is polite, empty, and kept out of a dialog's reach, and Undo starts with nothing to undo`, async ({
    page,
  }) => {
    await openList(page);
    const status = savedStatus(page);
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute("aria-live", "off");
    await expect(status).toHaveText(editing.saved);

    const region = log(page);
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(
      region,
      "the mark React Aria leaves alone when a modal makes the page inert",
    ).toHaveAttribute("data-react-aria-top-layer", "true");
    await expect(region).toHaveText("");

    const undo = page.getByRole("button", { name: editing.undo, exact: true });
    await expect(undo).toHaveCount(1);
    await expect(undo).toHaveAttribute("aria-disabled", "true");
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(region).toHaveText(editing.nothingToUndo);
    await expect(undo).toBeFocused();
  });

  // The one way the gate sees a failed save: the press is real, and the
  // guard answers it as an action the server does not know (Q-41).
  test(`a ${noun} move the server cannot take goes back, is said once, and keeps focus on its button`, async ({
    page,
  }) => {
    const writes = expectWrites(page);
    const names = await openList(page);
    const row = names[0] ?? "";
    const down = rowButton(page, words.moveDown, row);
    await down.focus();
    await page.keyboard.press("Enter");

    const failure = movedDownFailure(row);
    await expect(savedStatus(page)).toHaveText(failure);
    expect(await savedNames(page), "the list is back in its order").toEqual(
      names,
    );
    await expect(
      log(page).getByText(
        fill(words.movedDown, {
          ...named(row),
          position: 2,
          total: names.length,
        }),
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

  test(`on the ${plural}' page a link pressed while a save is on its way waits, and stays when the save fails`, async ({
    page,
  }) => {
    const writes = expectWrites(page, { hold: true });
    const here = list.path();
    const names = await openList(page);
    const row = names[0] ?? "";
    await rowButton(page, words.moveDown, row).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => writes.answered.length, {
        message: "the save is on its way, and held",
      })
      .toBeGreaterThan(0);
    await expect(savedStatus(page)).toHaveText(editing.saving);

    const link = list.leaveLink(page);
    await link.click();
    await expect(savedStatus(page), "the link waits for the save").toHaveText(
      editing.saving,
    );
    expect(new URL(page.url()).pathname).toBe(here);

    writes.release();
    const failure = movedDownFailure(row);
    await expect(savedStatus(page)).toHaveText(failure);
    expect(
      new URL(page.url()).pathname,
      "the page stays, so the failure is not left behind",
    ).toBe(here);
    await expect(page.locator("main h1")).toHaveText(list.h1());
    await expect(log(page).getByText(failure, { exact: true })).toHaveCount(1);
    await expect(link, "focus stays on the link").toBeFocused();
    await expect(page.locator('header [role="status"]')).toHaveText("");
  });

  // D-128: every row has a visible heading with its saved name.
  test(`every ${noun}'s row has one heading, its saved name`, async ({
    page,
  }) => {
    await expectRowHeadings(page, list.path());
  });

  test(`three ${plural} added with Enter without waiting each stay on the page, are sent in turn, and are said once`, async ({
    page,
  }) => {
    await expectBurstKeepsEveryName(page, list.path(), {
      newLabel: words.newLabel,
      removeName: (row) =>
        fill(words.rowAction, { action: editing.removeUnsaved, ...named(row) }),
      notAdded: (row) => fill(words.notAdded, named(row)),
      removed: (row) => fill(words.removed, named(row)),
    });
  });

  const { empty } = list;
  if (empty) {
    test(`a page with no ${plural} says so, and still has the add field, the status, and a dimmed Undo`, async ({
      page,
    }) => {
      await open(page, empty.path());
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main h1")).toHaveText(empty.h1());
      await expect(listRows(page)).toHaveCount(0);
      await expect(
        page.locator("main").getByText(words.none, { exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("textbox", { name: words.newLabel, exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: words.add, exact: true }),
      ).toHaveCount(1);
      await expect(savedStatus(page)).toHaveText(editing.saved);
      await expect(
        page.getByRole("button", { name: editing.undo, exact: true }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    test(`the ${plural}' pages, with and without, carry an empty status region in the header`, async ({
      page,
    }) => {
      for (const path of [list.path(), empty.path()]) {
        await open(page, path);
        await expect(page.locator('header [role="status"]')).toHaveCount(1);
        await expect(page.locator('header [role="status"]')).toHaveText("");
      }
    });
  }

  // The id in the path is user input. Neither of these reaches a query for
  // the list: the first is not an id at all, and the second names nothing of
  // this restaurant's, which is also what a deleted one's id gets.
  const { notFound } = list;
  if (notFound) {
    test(`an id that is not an id, and one that matches nothing, get the 404 page instead of ${plural}`, async ({
      page,
    }) => {
      for (const path of notFound) {
        const response = await page.goto(path);
        expect(response?.status(), `${path} is not a page`).toBe(404);
        await expect(page).toHaveTitle(pageTitle(en, en.notFound.title));
      }
    });
  }

  const { rowLink } = list;
  if (rowLink) {
    const linkOf = (page: Page, row: string) =>
      page.getByRole("link", {
        name: fill(words.rowAction, { action: rowLink.label, ...named(row) }),
        exact: true,
      });
    test(`every row links to its ${noun}'s own page, by a name that says which ${noun}`, async ({
      page,
    }) => {
      const names = await openList(page);
      const targets: string[] = [];
      for (const row of names) {
        const link = linkOf(page, row);
        await expect(link).toHaveCount(1);
        await expect(link, "the visible words start the name").toHaveText(
          rowLink.label,
        );
        targets.push((await link.getAttribute("href")) ?? "");
      }
      expect(new Set(targets).size, "each link goes to its own page").toBe(
        names.length,
      );

      const target = rowLink.target();
      const link = linkOf(page, target.name);
      await expect(link).toHaveAttribute("href", target.path);
      await link.click();
      await page.waitForURL(`**${target.path}`);
      await expectFocusResetThenSkipLink(page);
      await expect(page.locator("main h1")).toHaveText(target.name);
    });
  }

  const { deletes } = list;
  if (deletes) {
    // The confirmation and its two answers. Every locator is scoped to the
    // dialog: Playwright still finds the controls behind it by role, since
    // its role engine does not know the page there is inert.
    const confirmation = (page: Page, question: string) => {
      const dialog = page.getByRole("alertdialog", {
        name: question,
        exact: true,
      });
      return {
        dialog,
        keep: dialog.getByRole("button", { name: words.keep, exact: true }),
        confirm: dialog.getByRole("button", {
          name: words.remove,
          exact: true,
        }),
      };
    };

    test(
      `Delete on a ${noun} that holds content asks first, with focus on Keep, and Keep or Escape sends nothing`,
      { tag: "@dialog" },
      async ({ page }) => {
        const asking = deletes.asking();
        const names = await openList(page);
        const rowDelete = rowButton(page, words.remove, asking.name);
        const { dialog, keep, confirm } = confirmation(page, asking.question);

        await rowDelete.focus();
        await page.keyboard.press("Enter");
        await expect(
          dialog,
          "an alert dialog named by its question",
        ).toHaveCount(1);
        await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
          asking.question,
        );
        await expect(
          keep,
          "focus moves to Keep, after the dialog itself (D-136)",
        ).toBeFocused();

        await page.keyboard.press("Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(keep, "Tab stays inside the dialog").toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(confirm).toBeFocused();

        // The page behind is inert, and the log is not: a save that lands
        // while the dialog is open is still heard (D-123). This pins the mark
        // React Aria leaves alone, which is not public.
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
            (element) =>
              element.closest('[inert], [aria-hidden="true"]') === null,
          ),
          "the log stays heard behind the dialog",
        ).toBe(true);
        await expectNoAxeViolations(page);
        await expectNoHorizontalScroll(page);

        await keep.focus();
        await page.keyboard.press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(rowDelete, "Keep returns focus to Delete").toBeFocused();
        await expect(
          page.locator("[inert]"),
          "the page is live again",
        ).toHaveCount(0);

        await page.keyboard.press("Enter");
        await expect(keep).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(rowDelete, "Escape returns focus to Delete").toBeFocused();

        expect(await savedNames(page), "nothing was deleted").toEqual(names);
        await expect(log(page), "and nothing was said").toHaveText("");
        await expect(savedStatus(page)).toHaveText(editing.saved);
      },
    );

    // The delete itself, as far as the gate may take it: the press is real,
    // the write guard holds its answer, and then answers it as an action the
    // server does not know, so the row comes back. The press is a deliberate
    // Tab then Enter on a stopped clock, as the first focus reaches Keep
    // (D-136), well inside the double-tap guard: a key is never held back,
    // and never dropped without a word (D-119). While the answer is held the
    // screen is what a confirmed delete shows: the dialog gone, the page
    // live, the row gone, focus in the next row's name field, and the
    // sentence in the log.
    test(
      `a ${noun} delete confirmed by Tab then Enter, at once, closes the dialog first, moves focus to a name field, says so, and comes back when the server cannot take it`,
      { tag: "@dialog" },
      async ({ page }) => {
        await page.clock.install();
        const writes = expectWrites(page, { hold: true });
        const asking = deletes.asking();
        const names = await openList(page);
        const index = names.indexOf(asking.name);
        const neighbor = names[index + 1] ?? names[index - 1] ?? "";
        const rowDelete = rowButton(page, words.remove, asking.name);
        const { dialog, keep, confirm } = confirmation(page, asking.question);

        await stopClock(page);
        await rowDelete.focus();
        await page.keyboard.press("Enter");
        await page.clock.runFor(FIRST_FOCUS_WAIT_MS);
        await expect(keep).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Enter");
        await page.clock.resume();

        await expect(dialog, "the dialog closes").toHaveCount(0);
        await expect
          .poll(() => writes.answered.length, {
            message: "the delete is on its way, and held",
          })
          .toBeGreaterThan(0);
        await expect(
          page.locator("[inert]"),
          "the page is live again",
        ).toHaveCount(0);
        expect(await savedNames(page), "the row is gone").toEqual(
          names.filter((name) => name !== asking.name),
        );
        await expect(
          nameField(page, neighbor),
          "focus is in the next row's name field",
        ).toBeFocused();
        await expect(
          log(page).getByText(fill(words.deleted, named(asking.name)), {
            exact: true,
          }),
          "the delete is said once",
        ).toHaveCount(1);

        writes.release();
        const failure = deleteFailure(asking.name);
        await expect(savedStatus(page)).toHaveText(failure);
        expect(await savedNames(page), "the row is back").toEqual(names);
        await expect(rowDelete, "focus is back on its Delete").toBeFocused();
        await expect(
          log(page).getByText(failure, { exact: true }),
          "the failure is said once",
        ).toHaveCount(1);
      },
    );

    test(`Delete on a ${noun} that holds nothing asks nothing, and the ${noun} comes back when the server cannot take it`, async ({
      page,
    }) => {
      const writes = expectWrites(page, { hold: true });
      const row = deletes.empty();
      const names = await openList(page);
      const rowDelete = rowButton(page, words.remove, row);

      await rowDelete.focus();
      await page.keyboard.press("Enter");
      await expect
        .poll(() => writes.answered.length, {
          message: "the delete is on its way, and held",
        })
        .toBeGreaterThan(0);
      await expect(
        page.getByRole("alertdialog"),
        "a row that holds nothing goes at once",
      ).toHaveCount(0);
      expect(await savedNames(page), "the row is gone").toEqual(
        names.filter((name) => name !== row),
      );
      await expect(
        log(page).getByText(fill(words.deleted, named(row)), { exact: true }),
        "the delete is said once",
      ).toHaveCount(1);

      writes.release();
      const failure = deleteFailure(row);
      await expect(savedStatus(page)).toHaveText(failure);
      expect(await savedNames(page), "the row is back").toEqual(names);
      await expect(rowDelete, "focus is back on its Delete").toBeFocused();
      await expect(log(page).getByText(failure, { exact: true })).toHaveCount(
        1,
      );
    });
  }
}
