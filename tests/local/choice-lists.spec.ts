import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { CHOICE_LISTS_HEADING_ID } from "../../src/features/owner/choices/useChoiceListRows";
import {
  restaurantChoiceListPath,
  restaurantDishPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { restaurantName } from "../a11y/pages";

// Choice lists as rows on a dish's and a section's page, and the lead on
// the list's own page, with saves that land for real against the stand-in
// (D-166, task 7): a list added by lead on each home, said once, its row's
// link reaching the list page with the whole title; the lead changed by
// typing and by a suggestion chosen, read back after a reload, and undone;
// Move up and Move down landing and reading back in order; Delete on a
// list with options asking, Keep sending nothing, Delete landing, and Undo
// bringing the list back with its options; Undo of an add refused once the
// list holds an option; a taken lead refused unsent. The gate cannot land
// a save, so this runs here. Each check leaves the stand-in as it found
// it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.choices;
const editing = en.owner.editing;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

async function openPath(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

function status(page: Page) {
  return page.locator('main [role="status"]');
}

function choiceRows(page: Page) {
  return page.locator(
    `main ol[aria-labelledby="${CHOICE_LISTS_HEADING_ID}"] > li`,
  );
}

async function leads(page: Page): Promise<string[]> {
  return choiceRows(page)
    .locator("h3")
    .evaluateAll((all) => all.map((h3) => (h3.textContent ?? "").trim()));
}

function newListField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.lists.newLabel,
    exact: true,
  });
}

function listButton(page: Page, action: string, list: string) {
  return page.getByRole("button", {
    name: fill(strings.lists.rowAction, { action, list }),
    exact: true,
  });
}

function listLink(page: Page, list: string) {
  return page.getByRole("link", {
    name: fill(strings.lists.rowAction, { action: strings.lists.edit, list }),
    exact: true,
  });
}

function undoButton(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

// The dialog's confirming button takes no pointer press for half a second
// after it opens (D-119), so the confirmation is pressed by key: Tab from
// Keep, once focus has reached it (D-136), then Enter.
async function confirmByKey(page: Page, dialog: ReturnType<Page["locator"]>) {
  await expect(
    dialog.getByRole("button", { name: strings.lists.keep, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: strings.lists.remove, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
}

function leadField(page: Page) {
  return page.getByRole("combobox", {
    name: strings.page.leadLabel,
    exact: true,
  });
}

type ListRow = {
  id: string;
  item_id: string | null;
  section_id: string | null;
  lead: string;
  sort: number;
  deleted_at: string | null;
};

type OptionRow = {
  id: string;
  choice_list_id: string;
  deleted_at: string | null;
};

async function listRows(): Promise<ListRow[]> {
  const response = await fetch(`${standin}/__test/lists`);
  return (await response.json()) as ListRow[];
}

async function optionRows(): Promise<OptionRow[]> {
  const response = await fetch(`${standin}/__test/options`);
  return (await response.json()) as OptionRow[];
}

async function writesSoFar(): Promise<number> {
  const response = await fetch(`${standin}/__test/writes`);
  return ((await response.json()) as unknown[]).length;
}

// An option added somewhere else, through the stand-in's knob.
async function addOptionElsewhere(listId: string, name: string): Promise<void> {
  const query = new URLSearchParams({ list: listId, name });
  const response = await fetch(`${standin}/__test/add-option?${query}`);
  if (!response.ok) throw new Error(`add-option failed: ${response.status}`);
}

const addedSentence = (lead: string, count: number) =>
  fill(strings.lists.added, {
    list: lead,
    count: fill(
      count === 1 ? strings.lists.count.one : strings.lists.count.other,
      { count },
    ),
  });

test("a list added by lead on the section's page and on a dish's page is said once, shows as a row with Edit choices reaching its page, and Undo removes it while it holds no option", async ({
  page,
}) => {
  const { withSections, withDishes, emptySection, dishes } = ownerFixture();
  const restaurant = await (async () => {
    await openPath(page, restaurantSectionPath(code, emptySection.id));
    return restaurantName(page);
  })();
  expect(await leads(page)).toEqual([]);
  await newListField(page).fill("Add on");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, addedSentence("Add on", 1))).toBe(1);
  expect(await leads(page)).toEqual(["Add on"]);
  const added = (await listRows()).find(
    (list) => list.section_id === emptySection.id && list.deleted_at === null,
  );
  expect(added?.lead).toBe("Add on");
  await expectNoMissingIds(page);

  await listLink(page, "Add on").click();
  await page.waitForURL(`**${restaurantChoiceListPath(code, added?.id ?? "")}`);
  await expect(page).toHaveTitle(
    pageTitle(en, "Add on", restaurant, [emptySection.name, withSections.name]),
  );
  await expect(page.locator("main h1")).toHaveText("Add on");

  await page.goBack();
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  await undoButton(
    page,
    fill(strings.lists.undo.added, { list: "Add on" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(strings.lists.undo.removed, { list: "Add on" })),
    )
    .toBe(1);
  expect(await leads(page)).toEqual([]);
  expect(
    (await listRows()).find((list) => list.id === added?.id)?.deleted_at,
  ).not.toBeNull();

  // A dish's page: the market price dish has none.
  await openPath(page, restaurantDishPath(code, dishes.market.id));
  expect(await leads(page)).toEqual([]);
  await newListField(page).fill("Choose a sauce");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => said(page, addedSentence("Choose a sauce", 1)))
    .toBe(1);
  expect(await leads(page)).toEqual(["Choose a sauce"]);
  const onDish = (await listRows()).find(
    (list) => list.item_id === dishes.market.id && list.deleted_at === null,
  );
  expect(onDish?.lead).toBe("Choose a sauce");
  await listLink(page, "Choose a sauce").click();
  await page.waitForURL(
    `**${restaurantChoiceListPath(code, onDish?.id ?? "")}`,
  );
  await expect(page).toHaveTitle(
    pageTitle(en, "Choose a sauce", restaurant, [
      dishes.market.name,
      withDishes.name,
      withSections.name,
    ]),
  );
  await expectNoMissingIds(page);

  // Undo of the add is refused once the list holds an option (D-119).
  await addOptionElsewhere(onDish?.id ?? "", "Aioli");
  await page.goBack();
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  await undoButton(
    page,
    fill(strings.lists.undo.added, { list: "Choose a sauce" }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(strings.lists.undo.addGrew ?? "", { list: "Choose a sauce" }),
      ),
    )
    .toBe(1);
  expect(await leads(page), "the list stays").toEqual(["Choose a sauce"]);
  await expect(
    page.getByRole("button", { name: editing.tryAgain, exact: true }),
    "no Try again",
  ).toHaveCount(0);

  // As it was: the list deleted with its option, through the dialog,
  // confirmed by key once focus has reached Keep (D-136).
  await listButton(page, strings.lists.remove, "Choose a sauce").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveCount(1);
  await confirmByKey(page, dialog);
  await expect
    .poll(() =>
      said(page, fill(strings.lists.deleted, { list: "Choose a sauce" })),
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await listRows()).find((list) => list.id === onDish?.id)?.deleted_at,
    )
    .not.toBeNull();
});

test("the lead changes by typing and by a suggestion chosen, each saying Saved. once, reads back after a reload with the new title, and Undo puts it back; a taken lead is refused unsent", async ({
  page,
}) => {
  const { lists, withSections, withDishes, dishes } = ownerFixture();
  await openPath(page, restaurantChoiceListPath(code, lists.dish.id));
  const restaurant = await restaurantName(page);
  const lead = leadField(page);
  await expect(lead).toHaveValue(lists.dish.lead);

  await lead.fill("Pick a dressing");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(page.locator("main h1"), "the h1 follows the lead").toHaveText(
    "Pick a dressing",
  );
  await expect(page).toHaveTitle(
    pageTitle(en, "Pick a dressing", restaurant, [
      dishes.one.name,
      withDishes.name,
      withSections.name,
    ]),
  );
  expect(
    (await listRows()).find((list) => list.id === lists.dish.id)?.lead,
  ).toBe("Pick a dressing");

  // A suggestion chosen commits once.
  await lead.fill("Choose t");
  await expect(
    page.getByRole("option", { name: "Choose two sides" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(lead).toHaveValue("Choose two sides");
  await expect.poll(() => said(page, saved)).toBe(2);
  await page.keyboard.press("Tab");
  expect(await said(page, saved), "the choice committed once").toBe(2);
  await reload(page);
  await expect(leadField(page)).toHaveValue("Choose two sides");
  await expect(page.locator("main h1")).toHaveText("Choose two sides");

  await undoButton(
    page,
    fill(strings.page.undo.lead, { list: "Pick a dressing" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(strings.page.undo.leadBack, { list: "Pick a dressing" })),
    )
    .toBe(1);
  await expect(leadField(page)).toHaveValue("Pick a dressing");
  await expectNoMissingIds(page);

  // A lead another list of the home has is refused unsent: the salad has
  // one list, so one is added elsewhere first.
  const query = new URLSearchParams({
    home: "dish",
    id: dishes.one.id,
    lead: "Add on",
  });
  await fetch(`${standin}/__test/add-list?${query}`);
  await reload(page);
  const before = await writesSoFar();
  await leadField(page).fill(" add ON ");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(strings.page.notSaved.lead, { list: "Pick a dressing" })} ${fill(strings.page.errors.leadTakenDish, { list: "Add on" })}`,
  );
  await expect(leadField(page)).toHaveAttribute("aria-invalid", "true");
  expect(await writesSoFar(), "a taken lead is not sent").toBe(before);

  // As it was.
  await leadField(page).fill(lists.dish.lead);
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  const extra = (await listRows()).find(
    (list) => list.item_id === dishes.one.id && list.lead === "Add on",
  );
  await openPath(page, restaurantDishPath(code, dishes.one.id));
  await listButton(page, strings.lists.remove, "Add on").click();
  await expect
    .poll(() => said(page, fill(strings.lists.deleted, { list: "Add on" })))
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await listRows()).find((list) => list.id === extra?.id)?.deleted_at,
    )
    .not.toBeNull();
  expect(
    (await listRows()).find((list) => list.id === lists.dish.id)?.lead,
  ).toBe(lists.dish.lead);
});

test("Move up and Move down land and read back in order after a reload, and Undo puts the order back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const query = new URLSearchParams({
    home: "dish",
    id: dishes.one.id,
    lead: "Add on",
  });
  await fetch(`${standin}/__test/add-list?${query}`);
  const extra = (await listRows()).find(
    (list) => list.item_id === dishes.one.id && list.lead === "Add on",
  );
  try {
    await openPath(page, restaurantDishPath(code, dishes.one.id));
    expect(await leads(page)).toEqual(["Choose a dressing", "Add on"]);
    await listButton(page, strings.lists.moveUp, "Add on").click();
    await expect
      .poll(() =>
        said(
          page,
          fill(strings.lists.movedUp, {
            list: "Add on",
            position: 1,
            total: 2,
          }),
        ),
      )
      .toBe(1);
    expect(await leads(page)).toEqual(["Add on", "Choose a dressing"]);
    await reload(page);
    expect(await leads(page), "the order holds").toEqual([
      "Add on",
      "Choose a dressing",
    ]);
    await undoButton(
      page,
      fill(strings.lists.undo.moved, { list: "Add on" }),
    ).click();
    await expect
      .poll(() =>
        said(
          page,
          fill(strings.lists.undo.movedBack, {
            list: "Add on",
            position: 2,
            total: 2,
          }),
        ),
      )
      .toBe(1);
    expect(await leads(page)).toEqual(["Choose a dressing", "Add on"]);
    await expectNoMissingIds(page);
  } finally {
    await openPath(page, restaurantDishPath(code, dishes.one.id));
    await listButton(page, strings.lists.remove, "Add on").click();
    await expect
      .poll(() => said(page, fill(strings.lists.deleted, { list: "Add on" })))
      .toBe(1);
    await expect
      .poll(
        async () =>
          (await listRows()).find((list) => list.id === extra?.id)?.deleted_at,
      )
      .not.toBeNull();
  }
});

test("Delete on a list with options asks, Keep sends nothing, Delete lands with its sentence, and Undo brings the list back with its options", async ({
  page,
}) => {
  const { lists, withDishes } = ownerFixture();
  const lead = lists.section.lead;
  await openPath(page, restaurantSectionPath(code, withDishes.id));
  const before = await writesSoFar();
  await listButton(page, strings.lists.remove, lead).click();
  const question = fill(strings.lists.deleteAsk, {
    list: lead,
    options: fill(strings.lists.optionCount.one, { count: 1 }),
  });
  const dialog = page.getByRole("alertdialog", { name: question, exact: true });
  await expect(dialog).toHaveCount(1);
  await dialog
    .getByRole("button", { name: strings.lists.keep, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(await writesSoFar(), "Keep sent nothing").toBe(before);
  expect(await leads(page)).toEqual([lead]);

  await listButton(page, strings.lists.remove, lead).click();
  await confirmByKey(page, dialog);
  await expect
    .poll(() => said(page, fill(strings.lists.deleted, { list: lead })))
    .toBe(1);
  expect(await leads(page)).toEqual([]);
  await expect(newListField(page), "focus goes to the add field").toBeFocused();
  await expect
    .poll(
      async () =>
        (await listRows()).find((list) => list.id === lists.section.id)
          ?.deleted_at,
    )
    .not.toBeNull();
  expect(
    (await optionRows()).filter(
      (option) =>
        option.choice_list_id === lists.section.id &&
        option.deleted_at === null,
    ).length,
    "the option stays with its list, marked by the list alone",
  ).toBe(1);

  await undoButton(
    page,
    fill(strings.lists.undo.deleted, { list: lead }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(strings.lists.undo.restored, {
          list: lead,
          position: 1,
          total: 1,
        }),
      ),
    )
    .toBe(1);
  expect(await leads(page)).toEqual([lead]);
  expect(
    (await listRows()).find((list) => list.id === lists.section.id)?.deleted_at,
  ).toBeNull();
  await expectNoMissingIds(page);
  // Its option is back with it: the row asks again.
  await listButton(page, strings.lists.remove, lead).click();
  await expect(dialog).toHaveCount(1);
  await dialog
    .getByRole("button", { name: strings.lists.keep, exact: true })
    .click();
});
