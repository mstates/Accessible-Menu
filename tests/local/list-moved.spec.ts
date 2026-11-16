import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { ownerEnv, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// The pages that save as the owner goes, with two tabs open (D-237, rule
// 2): a text's save hands back the value the page showed for it and lands
// only if the server still holds that value. A rename from a tab that is
// behind is refused, with nothing written; the sentence is said once, the
// typed text stays, and the button is Reload, never Try again, since the
// same page would send the same stale value. Read on Menus, on a menu's
// page, and on a section's page, for a row's name and for the page's own
// text, the section's note.
//
// What a save hands back is held from the field's first keystroke, since
// every save on these pages ends in a refresh that can put a newer value
// under the text being typed. Each rule of that hold has its check here,
// and each check goes red when its rule is taken out:
// - a value that arrives under typed text is still refused;
// - a field saved twice in a row never refuses itself;
// - a value that arrives in a field with nothing typed is the one its next
//   save hands back;
// - typing back to what the field showed sends nothing;
// - a save whose answer was lost has landed, and Try again says so.
//
// The gate cannot land a save, so this runs here. Each check makes a menu
// of its own, with two sections and two dishes, and leaves it deleted.

const { code } = ownerEnv();
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const editing = en.owner.editing;
const outOfDate = editing.problems.outOfDate;
const menus = en.owner.menus;
const sections = en.owner.sections;
const dishes = en.owner.dishes;

type Row = {
  id: string;
  name: string;
  note?: string | null;
  deleted_at: string | null;
};

async function knob<Answer = unknown>(
  path: string,
  params: Record<string, string> = {},
): Promise<Answer> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) {
    throw new Error(`the stand-in refused ${path}: ${await response.text()}`);
  }
  return (await response.json()) as Answer;
}

// A menu of the check's own: two sections, the first with two dishes. Every
// name starts with the check's own word, so no check finds another's rows.
type Scratch = { menu: Row; soups: Row; mains: Row; chowder: Row; bisque: Row };

async function scratch(word: string): Promise<Scratch> {
  const menu = await knob<Row>("add", { name: `${word} menu` });
  const soups = await knob<Row>("add-section", {
    menu: menu.name,
    name: `${word} soups`,
  });
  const mains = await knob<Row>("add-section", {
    menu: menu.name,
    name: `${word} mains`,
  });
  const chowder = await knob<Row>("add-dish", {
    section: soups.name,
    name: `${word} chowder`,
  });
  const bisque = await knob<Row>("add-dish", {
    section: soups.name,
    name: `${word} bisque`,
  });
  return { menu, soups, mains, chowder, bisque };
}

type Table = "menus" | "sections" | "items";

async function stored(table: Table, id: string): Promise<Row> {
  const rows = await knob<Row[]>(table);
  const found = rows.find((row) => row.id === id);
  if (!found) throw new Error(`the stand-in has no row ${id} in ${table}`);
  return found;
}

// The menu deleted by a plain mark, whatever it is called by now, which
// hides everything under it, as a menu's delete does.
async function clear(made: Scratch): Promise<void> {
  await knob("delay", { ms: "0" });
  const menu = await stored("menus", made.menu.id);
  if (menu.deleted_at === null) await knob("delete-menu", { name: menu.name });
}

// A value only SQL or an import could leave, which the table allows, set
// straight on the stand-in's row: the page's own fields clean what is
// typed, so no save from a page can store it.
async function setStored(
  table: Table,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${standin}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    throw new Error(`the stand-in refused the row: ${await response.text()}`);
  }
}

async function writesSoFar(): Promise<number> {
  return (await knob<unknown[]>("writes")).length;
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

// A second tab, signed in as the same owner, opened now: after the first
// tab loaded its page, and before the first tab's own change.
async function inAnotherTab(
  browser: Browser,
  page: Page,
  path: string,
  work: (other: Page) => Promise<void>,
): Promise<void> {
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  try {
    const other = await context.newPage();
    await open(other, `${origin}${path}`);
    await work(other);
  } finally {
    await context.close();
  }
}

type Prefix = "menu" | "section" | "dish";

const nameField = (page: Page, prefix: Prefix, id: string) =>
  page.locator(`#${prefix}-${id}-name`);
const rowOf = (page: Page, field: Locator) =>
  page.locator("main li").filter({ has: field });
const headingOf = (page: Page, field: Locator) =>
  rowOf(page, field).getByRole("heading", { level: 2 });
// The section's note, the page's own text on a section's page.
const noteField = (page: Page) => page.locator("#dish-own-note");
const status = (page: Page) => page.locator('main [role="status"]');
const tryAgain = (page: Page) =>
  page.getByRole("button", { name: editing.tryAgain, exact: true });
const reloadButton = (page: Page) =>
  page.getByRole("button", { name: editing.reload, exact: true });

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

// Every sentence said so far that tells of a save that did not land.
async function failuresSaid(page: Page): Promise<string[]> {
  return (await heard(page)).filter((each) => each.includes("not saved"));
}

// Types a name and commits it with Enter, then waits for the row to hold
// it and the status to settle.
async function rename(
  page: Page,
  field: Locator,
  table: Table,
  id: string,
  name: string,
): Promise<void> {
  await field.fill(name);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await stored(table, id)).name, {
      message: `${name} landed`,
    })
    .toBe(name);
  await expect(status(page)).toHaveText(editing.saved);
}

// Types the section's note and commits it by leaving the field, since
// Enter in a field of several lines types a line break.
async function writeNote(
  page: Page,
  section: string,
  note: string,
): Promise<void> {
  await noteField(page).fill(note);
  await page.keyboard.press("Tab");
  await expect
    .poll(async () => (await stored("sections", section)).note, {
      message: "the note landed",
    })
    .toBe(note);
  await expect(status(page)).toHaveText(editing.saved);
}

// What a refused save leaves on the page: the sentence in the status and
// said once, the typed text kept with its problem under it, Reload and no
// Try again.
async function expectRefused(
  page: Page,
  field: Locator,
  typed: string,
  failure: string,
): Promise<void> {
  await expect(status(page)).toHaveText(failure);
  await expect
    .poll(() => said(page, failure), { message: "the failure is said once" })
    .toBe(1);
  await expect(field, "what was typed is kept").toHaveValue(typed);
  await expect(
    page.locator("main").getByText(outOfDate, { exact: true }),
    "the problem shows under the field",
  ).toHaveCount(1);
  await expect(reloadButton(page), "Reload is the fix").toHaveCount(1);
  await expect(
    tryAgain(page),
    "the same page would send the same stale value",
  ).toHaveCount(0);
}

async function pressReload(page: Page): Promise<void> {
  const loaded = page.waitForEvent("load", { timeout: 10_000 });
  await reloadButton(page).click();
  await loaded;
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  await expect(status(page)).toHaveText(editing.saved);
  await expect(reloadButton(page)).toHaveCount(0);
}

type Kind = {
  what: string;
  word: string;
  table: Table;
  prefix: Prefix;
  notSaved: (name: string) => string;
  path: (made: Scratch) => string;
  row: (made: Scratch) => Row;
};

const kinds: readonly Kind[] = [
  {
    what: "a menu",
    word: "Stale",
    table: "menus",
    prefix: "menu",
    notSaved: (menu) => fill(menus.notSaved.name, { menu }),
    path: () => restaurantMenusPath(code),
    row: (made) => made.menu,
  },
  {
    what: "a section",
    word: "Behind",
    table: "sections",
    prefix: "section",
    notSaved: (section) => fill(sections.notSaved.name, { section }),
    path: (made) => restaurantMenuPath(code, made.menu.id),
    row: (made) => made.soups,
  },
  {
    what: "a dish",
    word: "Older",
    table: "items",
    prefix: "dish",
    notSaved: (dish) => fill(dishes.notSaved.name, { dish }),
    path: (made) => restaurantSectionPath(code, made.soups.id),
    row: (made) => made.chowder,
  },
];

for (const kind of kinds) {
  test(`${kind.what} renamed in a second tab refuses this tab's rename with nothing written, says so once, keeps what was typed, and offers Reload, never Try again; Reload shows the other tab's name, and a rename then lands`, async ({
    page,
    browser,
  }) => {
    const made = await scratch(kind.word);
    try {
      const row = kind.row(made);
      const path = kind.path(made);
      await open(page, path);
      const field = nameField(page, kind.prefix, row.id);
      await expect(field).toHaveValue(row.name);

      const theirs = `${row.name} two`;
      await inAnotherTab(browser, page, path, (other) =>
        rename(
          other,
          nameField(other, kind.prefix, row.id),
          kind.table,
          row.id,
          theirs,
        ),
      );

      const writes = await writesSoFar();
      const mine = `${row.name} three`;
      await field.fill(mine);
      await page.keyboard.press("Enter");
      await expectRefused(
        page,
        field,
        mine,
        `${kind.notSaved(row.name)} ${outOfDate}`,
      );
      expect(
        (await stored(kind.table, row.id)).name,
        "the other tab's name stands",
      ).toBe(theirs);
      expect(await writesSoFar(), "one statement, which matched no row").toBe(
        writes + 1,
      );

      await pressReload(page);
      await expect(field, "the page shows the name as it is").toHaveValue(
        theirs,
      );
      await rename(page, field, kind.table, row.id, `${row.name} four`);
      expect(await failuresSaid(page)).toEqual([]);
    } finally {
      await clear(made);
    }
  });
}

test("a section's note changed in a second tab refuses this tab's note with nothing written, says so once, keeps what was typed, and offers Reload; Reload shows the other tab's note, and a change then lands", async ({
  page,
  browser,
}) => {
  const made = await scratch("Noted");
  try {
    const path = restaurantSectionPath(code, made.soups.id);
    await open(page, path);
    await expect(noteField(page)).toHaveValue("");

    await inAnotherTab(browser, page, path, (other) =>
      writeNote(other, made.soups.id, "The second tab's note."),
    );

    const writes = await writesSoFar();
    await noteField(page).fill("The first tab's note.");
    await page.keyboard.press("Tab");
    await expectRefused(
      page,
      noteField(page),
      "The first tab's note.",
      `${fill(sections.notSaved.note, { section: made.soups.name })} ${outOfDate}`,
    );
    expect((await stored("sections", made.soups.id)).note).toBe(
      "The second tab's note.",
    );
    expect(await writesSoFar(), "one statement, which matched no row").toBe(
      writes + 1,
    );

    await pressReload(page);
    await expect(noteField(page)).toHaveValue("The second tab's note.");
    await writeNote(page, made.soups.id, "A note both tabs have seen.");
    expect(await failuresSaid(page)).toEqual([]);
  } finally {
    await clear(made);
  }
});

// Focus in a name field with the caret after its last character, so the
// next key types at the end. Set by code: the End key does not move a
// field's caret on every platform.
async function focusAtEnd(field: Locator): Promise<void> {
  await field.focus();
  await field.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

// The stand-in holds every write for a moment, so a second field can be
// typed in while the first field's save is on its way.
async function holdWrites<Value>(work: () => Promise<Value>): Promise<Value> {
  await knob("delay", { ms: "1500" });
  try {
    return await work();
  } finally {
    await knob("delay", { ms: "0" });
  }
}

test("a name changed in a second tab that arrives under typed text is still refused: the rename hands back what the field showed when typing began, never the newer name the refresh put under it", async ({
  page,
  browser,
}) => {
  const made = await scratch("Under");
  try {
    const path = restaurantMenuPath(code, made.menu.id);
    await open(page, path);
    const soups = nameField(page, "section", made.soups.id);
    const mains = nameField(page, "section", made.mains.id);
    const theirs = `${made.mains.name} two`;
    await inAnotherTab(browser, page, path, (other) =>
      rename(
        other,
        nameField(other, "section", made.mains.id),
        "sections",
        made.mains.id,
        theirs,
      ),
    );

    // A save of the first row is on its way while the second row is typed
    // in; it lands, and its refresh brings the other tab's name under the
    // typed text, where the owner never sees it.
    const typed = `${made.mains.name} x`;
    await holdWrites(async () => {
      await soups.fill(`${made.soups.name} one`);
      await page.keyboard.press("Enter");
      await expect(status(page)).toHaveText(editing.saving);
      await focusAtEnd(mains);
      await page.keyboard.type(" x");
      await expect(mains).toHaveValue(typed);
      await expect(
        headingOf(page, mains),
        "the refresh arrived: the row's heading shows the other tab's name",
      ).toHaveText(theirs);
      await expect(mains, "and the typed text covers it").toHaveValue(typed);
    });
    await expect(status(page)).toHaveText(editing.saved);

    await page.keyboard.press("Enter");
    await expectRefused(
      page,
      mains,
      typed,
      `${fill(sections.notSaved.name, { section: theirs })} ${outOfDate}`,
    );
    expect(
      (await stored("sections", made.mains.id)).name,
      "the other tab's name stands",
    ).toBe(theirs);
    expect((await stored("sections", made.soups.id)).name).toBe(
      `${made.soups.name} one`,
    );
  } finally {
    await clear(made);
  }
});

test("a name typed back to what the field showed, with a newer name arrived under it, sends nothing and shows the newer name", async ({
  page,
  browser,
}) => {
  const made = await scratch("Back");
  try {
    const path = restaurantMenuPath(code, made.menu.id);
    await open(page, path);
    const soups = nameField(page, "section", made.soups.id);
    const mains = nameField(page, "section", made.mains.id);
    const theirs = `${made.soups.name} two`;
    await inAnotherTab(browser, page, path, (other) =>
      rename(
        other,
        nameField(other, "section", made.soups.id),
        "sections",
        made.soups.id,
        theirs,
      ),
    );

    await holdWrites(async () => {
      await mains.fill(`${made.mains.name} one`);
      await page.keyboard.press("Enter");
      await expect(status(page)).toHaveText(editing.saving);
      await focusAtEnd(soups);
      await page.keyboard.type("x");
      await expect(soups).toHaveValue(`${made.soups.name}x`);
      await expect(headingOf(page, soups), "the refresh arrived").toHaveText(
        theirs,
      );
    });
    await expect(status(page)).toHaveText(editing.saved);

    const writes = await writesSoFar();
    await page.keyboard.press("Backspace");
    await expect(soups).toHaveValue(made.soups.name);
    await page.keyboard.press("Enter");
    await expect(
      soups,
      "nothing is left to save, so the field shows the name as it is",
    ).toHaveValue(theirs);
    await expect(status(page)).toHaveText(editing.saved);
    expect(await writesSoFar(), "nothing was sent").toBe(writes);
    expect(await failuresSaid(page)).toEqual([]);
    expect((await stored("sections", made.soups.id)).name).toBe(theirs);
  } finally {
    await clear(made);
  }
});

test("a name saved twice in a row, the second typed while the first is on its way, lands both times: the second hands back what the first answered", async ({
  page,
}) => {
  const made = await scratch("Twice");
  try {
    await open(page, restaurantMenuPath(code, made.menu.id));
    const soups = nameField(page, "section", made.soups.id);
    await holdWrites(async () => {
      await soups.fill(`${made.soups.name} one`);
      await page.keyboard.press("Enter");
      await expect(status(page)).toHaveText(editing.saving);
      await soups.fill(`${made.soups.name} two`);
      await page.keyboard.press("Enter");
    });
    await expect
      .poll(async () => (await stored("sections", made.soups.id)).name)
      .toBe(`${made.soups.name} two`);
    await expect(status(page)).toHaveText(editing.saved);
    expect(await failuresSaid(page)).toEqual([]);
    await expect(reloadButton(page)).toHaveCount(0);

    // And a third, typed once the page has settled.
    await rename(
      page,
      soups,
      "sections",
      made.soups.id,
      `${made.soups.name} three`,
    );
    expect(await failuresSaid(page)).toEqual([]);
  } finally {
    await clear(made);
  }
});

test("a section's note saved twice in a row, the second typed while the first is on its way, lands both times", async ({
  page,
}) => {
  const made = await scratch("Again");
  try {
    await open(page, restaurantSectionPath(code, made.soups.id));
    await holdWrites(async () => {
      await noteField(page).fill("The first note.");
      await page.keyboard.press("Tab");
      await expect(status(page)).toHaveText(editing.saving);
      await noteField(page).fill("The second note.");
      await page.keyboard.press("Tab");
    });
    await expect
      .poll(async () => (await stored("sections", made.soups.id)).note)
      .toBe("The second note.");
    await expect(status(page)).toHaveText(editing.saved);
    expect(await failuresSaid(page)).toEqual([]);
    await expect(reloadButton(page)).toHaveCount(0);

    await writeNote(page, made.soups.id, "The third note.");
    expect(await failuresSaid(page)).toEqual([]);
  } finally {
    await clear(made);
  }
});

test("a name changed in a second tab that arrives in a field with nothing typed is the name its next save hands back, so that save lands", async ({
  page,
  browser,
}) => {
  const made = await scratch("Fresh");
  try {
    const path = restaurantMenuPath(code, made.menu.id);
    await open(page, path);
    const soups = nameField(page, "section", made.soups.id);
    const mains = nameField(page, "section", made.mains.id);
    // This tab's own save of the row, first: what it handed back is done
    // with once the refreshed rows arrive.
    await rename(
      page,
      soups,
      "sections",
      made.soups.id,
      `${made.soups.name} one`,
    );
    const theirs = `${made.soups.name} two`;
    await inAnotherTab(browser, page, path, (other) =>
      rename(
        other,
        nameField(other, "section", made.soups.id),
        "sections",
        made.soups.id,
        theirs,
      ),
    );
    // A save of another row refreshes the page, and the field, with nothing
    // typed in it, shows the other tab's name.
    await rename(
      page,
      mains,
      "sections",
      made.mains.id,
      `${made.mains.name} one`,
    );
    await expect(soups, "the other tab's name arrived").toHaveValue(theirs);

    await rename(
      page,
      soups,
      "sections",
      made.soups.id,
      `${made.soups.name} three`,
    );
    expect(await failuresSaid(page)).toEqual([]);
    await expect(reloadButton(page)).toHaveCount(0);
  } finally {
    await clear(made);
  }
});

test("a section's note changed in a second tab that arrives in the field with nothing typed is the note its next save hands back, so that save lands", async ({
  page,
  browser,
}) => {
  const made = await scratch("Newer");
  try {
    const path = restaurantSectionPath(code, made.soups.id);
    await open(page, path);
    await writeNote(page, made.soups.id, "The first note.");
    await inAnotherTab(browser, page, path, (other) =>
      writeNote(other, made.soups.id, "The second tab's note."),
    );
    await rename(
      page,
      nameField(page, "dish", made.chowder.id),
      "items",
      made.chowder.id,
      `${made.chowder.name} one`,
    );
    await expect(noteField(page), "the other tab's note arrived").toHaveValue(
      "The second tab's note.",
    );

    await writeNote(page, made.soups.id, "The third note.");
    expect(await failuresSaid(page)).toEqual([]);
    await expect(reloadButton(page)).toHaveCount(0);
  } finally {
    await clear(made);
  }
});

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

test("a rename that landed with its answer lost on the way back offers Try again, and Try again finds it landed and says all changes are saved, never that the page is out of date", async ({
  page,
}) => {
  const made = await scratch("Lost");
  try {
    await open(page, restaurantMenusPath(code));
    const field = nameField(page, "menu", made.menu.id);
    const renamed = `${made.menu.name} one`;
    // The server takes the save and lands it; the browser never hears.
    await answerNextWrite(page, async (route) => {
      await route.fetch();
      await route.abort("connectionfailed");
    });
    await field.fill(renamed);
    await page.keyboard.press("Enter");
    const failure = `${fill(menus.notSaved.name, { menu: made.menu.name })} ${editing.problems.unreachable}`;
    await expect(status(page)).toHaveText(failure);
    await expect.poll(() => said(page, failure)).toBe(1);
    await expect(tryAgain(page), "a retry can land it").toHaveCount(1);
    await expect(reloadButton(page)).toHaveCount(0);
    expect(
      (await stored("menus", made.menu.id)).name,
      "the save had landed",
    ).toBe(renamed);

    await tryAgain(page).click();
    await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
    await expect(status(page)).toHaveText(editing.saved);
    await expect(tryAgain(page)).toHaveCount(0);
    await expect(reloadButton(page)).toHaveCount(0);
    expect(await failuresSaid(page), "the one failure, and no second").toEqual([
      failure,
    ]);
    expect((await stored("menus", made.menu.id)).name).toBe(renamed);
  } finally {
    await clear(made);
  }
});

test("a move on a list that changed elsewhere says the list changed and offers Reload, never Try again", async ({
  page,
}) => {
  const made = await scratch("Order");
  try {
    await open(page, restaurantMenuPath(code, made.menu.id));
    await knob("add-section", { menu: made.menu.name, name: "Order sides" });
    await page.locator(`#section-${made.soups.id}-down`).focus();
    await page.keyboard.press("Enter");
    const failure = `${fill(sections.notMoved, { section: made.soups.name })} ${sections.errors.listChanged}`;
    await expect(status(page)).toHaveText(failure);
    await expect.poll(() => said(page, failure)).toBe(1);
    await expect(reloadButton(page), "the sentence says to reload").toHaveCount(
      1,
    );
    await expect(
      tryAgain(page),
      "the same page would send the same list again",
    ).toHaveCount(0);
  } finally {
    await clear(made);
  }
});

test("a name stored with outer spaces and a note stored with a line break and outer spaces, as SQL or an import could leave them, are handed back as they are, so each save lands", async ({
  page,
}) => {
  const made = await scratch("Padded");
  try {
    const padded = (name: string) => `  ${name}  `;
    const note = "\n Ask us.\nWe will check. \n";
    await setStored("menus", made.menu.id, { name: padded(made.menu.name) });
    await setStored("sections", made.soups.id, {
      name: padded(made.soups.name),
      note,
    });
    await setStored("items", made.chowder.id, {
      name: padded(made.chowder.name),
    });

    await open(page, restaurantMenusPath(code));
    const menu = nameField(page, "menu", made.menu.id);
    await expect(menu).toHaveValue(padded(made.menu.name));
    await rename(page, menu, "menus", made.menu.id, "Padded menu two");

    await open(page, restaurantMenuPath(code, made.menu.id));
    const section = nameField(page, "section", made.soups.id);
    await expect(section).toHaveValue(padded(made.soups.name));
    await rename(page, section, "sections", made.soups.id, "Padded soups two");

    await open(page, restaurantSectionPath(code, made.soups.id));
    const dish = nameField(page, "dish", made.chowder.id);
    await expect(dish).toHaveValue(padded(made.chowder.name));
    await rename(page, dish, "items", made.chowder.id, "Padded chowder two");
    expect((await stored("sections", made.soups.id)).note).toBe(note);
    await writeNote(page, made.soups.id, "Ask us.\nWe will check twice.");
    expect(await failuresSaid(page)).toEqual([]);
  } finally {
    await clear(made);
  }
});
