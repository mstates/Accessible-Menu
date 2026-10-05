import { expect, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  open,
} from "./checks";
import { expectWrites } from "./write-guard";

// What the three editing lists share, checked the same way on each (D-128):
// the menus of a restaurant, the sections of a menu, and the dishes of a
// section are one list, so every row has one heading, and a burst of adds
// keeps every name (D-125). Each list's spec calls these with its own page
// and its own words. Not a spec: it registers no test.

const editing = en.owner.editing;

export function listRows(page: Page) {
  return page.locator("main ul > li");
}

function savedStatus(page: Page) {
  return page.locator('main [role="status"]');
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
