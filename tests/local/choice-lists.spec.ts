import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { CHOICE_LISTS_HEADING_ID } from "../../src/features/owner/choices/useChoiceListRows";
import {
  restaurantChoiceListPath,
  restaurantDishPagePath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { restaurantName } from "../a11y/pages";

// Choice lists as rows on a dish's Choice lists page (D-222) and a
// section's page, and the lead on
// the list's own page, with saves that land for real against the stand-in
// (D-166, task 7): a list added by lead on each home, said once, its row's
// link reaching the list page with the whole title; the lead changed by
// typing and by a suggestion chosen, read back after a reload; Move up and
// Move down landing and reading back in order; Delete asking first on
// every list (D-221), by its name alone or with its options, Keep sending
// nothing, Delete landing; a taken lead refused unsent. The gate cannot
// land a save, so this runs here. Each check leaves the stand-in as it
// found it, so the checks run in any order.

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

// Each row's heading: an h2 on a dish's Choice lists page, an h3 on a
// section's page (D-222).
async function leads(page: Page): Promise<string[]> {
  return choiceRows(page)
    .locator(":is(h2, h3)")
    .evaluateAll((all) => all.map((h) => (h.textContent ?? "").trim()));
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

// Delete on a list asks first, whatever it holds (D-221): the dialog named
// by its question, then the confirmation by key.
async function deleteThroughDialog(
  page: Page,
  lead: string,
  question: string,
): Promise<void> {
  await listButton(page, strings.lists.remove, lead).click();
  const dialog = page.getByRole("alertdialog", { name: question, exact: true });
  await expect(dialog).toHaveCount(1);
  await confirmByKey(page, dialog);
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

test("a list added by lead on the section's page and on a dish's page is said once, shows as a row with Edit choices reaching its page, and Delete asks first by its name while it holds no option", async ({
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
  // A list that holds no option asks by its name alone (D-221).
  await deleteThroughDialog(
    page,
    "Add on",
    fill(strings.lists.deleteAskEmpty, { list: "Add on" }),
  );
  await expect
    .poll(() => said(page, fill(strings.lists.deleted, { list: "Add on" })))
    .toBe(1);
  expect(await leads(page)).toEqual([]);
  await expect
    .poll(
      async () =>
        (await listRows()).find((list) => list.id === added?.id)?.deleted_at,
    )
    .not.toBeNull();

  // A dish's page: the market price dish has none.
  await openPath(
    page,
    restaurantDishPagePath(code, dishes.market.id, "choices"),
  );
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

  // As it was: the list, holding an option now, deleted through the dialog
  // that names the option (D-119), confirmed by key once focus has reached
  // Keep (D-136). The page is opened afresh so its count is the server's.
  await addOptionElsewhere(onDish?.id ?? "", "Aioli");
  await openPath(
    page,
    restaurantDishPagePath(code, dishes.market.id, "choices"),
  );
  await deleteThroughDialog(
    page,
    "Choose a sauce",
    fill(strings.lists.deleteAsk, {
      list: "Choose a sauce",
      options: fill(strings.lists.optionCount.one, { count: 1 }),
    }),
  );
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

test("the lead changes by typing and by a suggestion chosen, each saying Saved. once, and reads back after a reload with the new title; a taken lead is refused unsent", async ({
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
    `${fill(strings.page.notSaved.lead, { list: "Choose two sides" })} ${fill(strings.page.errors.leadTakenDish, { list: "Add on" })}`,
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
  await openPath(page, restaurantDishPagePath(code, dishes.one.id, "choices"));
  await deleteThroughDialog(
    page,
    "Add on",
    fill(strings.lists.deleteAskEmpty, { list: "Add on" }),
  );
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

test("Move up and Move down land and read back in order after a reload", async ({
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
    await openPath(
      page,
      restaurantDishPagePath(code, dishes.one.id, "choices"),
    );
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
    await listButton(page, strings.lists.moveDown, "Add on").click();
    await expect
      .poll(() =>
        said(
          page,
          fill(strings.lists.movedDown, {
            list: "Add on",
            position: 2,
            total: 2,
          }),
        ),
      )
      .toBe(1);
    expect(await leads(page)).toEqual(["Choose a dressing", "Add on"]);
    await reload(page);
    expect(await leads(page), "the order holds again").toEqual([
      "Choose a dressing",
      "Add on",
    ]);
    await expectNoMissingIds(page);
  } finally {
    await openPath(
      page,
      restaurantDishPagePath(code, dishes.one.id, "choices"),
    );
    await deleteThroughDialog(
      page,
      "Add on",
      fill(strings.lists.deleteAskEmpty, { list: "Add on" }),
    );
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

test("Delete on a list with options asks, naming them, Keep sends nothing, and Delete lands with its sentence, the option staying with its list", async ({
  page,
}) => {
  // The list is made here, on the section with none, so the fixture's own
  // list stays for the other checks; its one option is added elsewhere.
  const { emptySection } = ownerFixture();
  const lead = "Add on";
  const query = new URLSearchParams({
    home: "section",
    id: emptySection.id,
    lead,
  });
  await fetch(`${standin}/__test/add-list?${query}`);
  const made = (await listRows()).find(
    (list) =>
      list.section_id === emptySection.id &&
      list.lead === lead &&
      list.deleted_at === null,
  );
  if (!made) throw new Error("the list was not made");
  await addOptionElsewhere(made.id, "Aioli");
  await openPath(page, restaurantSectionPath(code, emptySection.id));
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
        (await listRows()).find((list) => list.id === made.id)?.deleted_at,
    )
    .not.toBeNull();
  expect(
    (await optionRows()).filter(
      (option) =>
        option.choice_list_id === made.id && option.deleted_at === null,
    ).length,
    "the option stays with its list, marked by the list alone",
  ).toBe(1);
  await expectNoMissingIds(page);
});
