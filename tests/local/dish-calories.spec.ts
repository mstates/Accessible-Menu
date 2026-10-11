import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { restaurantDishPath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// Calories and the Cooked to order box on a dish's page, with saves that
// land for real against the stand-in (D-167, task 7): calories saved under
// One price, under Market price, and on a size, read back as typed and as
// a range, the three refusals unsent, and Undo; the box ticked and
// unticked, each said once, read back after a reload, and undone. The gate
// cannot land a save, so this runs here. Each check leaves the stand-in as
// it found it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const editing = en.owner.editing;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Priced = "sizes" | "one" | "market";

function dishPath(which: Priced): string {
  return restaurantDishPath(code, ownerFixture().dishes[which].id);
}

async function openDish(page: Page, which: Priced): Promise<void> {
  await page.goto(dishPath(which));
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

function caloriesField(page: Page) {
  return page.getByRole("textbox", {
    name: strings.price.caloriesLabel,
    exact: true,
  });
}

function sizeCaloriesField(page: Page, size: string) {
  return page.getByRole("textbox", {
    name: `${strings.price.sizeCaloriesLabel} ${fill(strings.price.labelFor, { size })}`,
    exact: true,
  });
}

function cookedBox(page: Page) {
  return page.getByRole("checkbox", {
    name: strings.cookedToOrder.label,
    exact: true,
  });
}

// Ticks the box by its visible words, inside its wrapper: the heading above
// says the same words. React Aria keeps the input under the label, where a
// pointer cannot reach it directly.
function cookedWords(page: Page) {
  return page
    .locator("#dish-cooked-to-order")
    .getByText(strings.cookedToOrder.label, { exact: true });
}

function status(page: Page) {
  return page.locator('main [role="status"]');
}

function undoButton(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

type Row = {
  id: string;
  calories_low: number | null;
  calories_high: number | null;
  cooked_to_order: boolean;
};

async function row(table: "items" | "sizes", id: string): Promise<Row> {
  const response = await fetch(`${standin}/__test/${table}`);
  const found = ((await response.json()) as Row[]).find(
    (each) => each.id === id,
  );
  if (!found) throw new Error(`the stand-in has no ${table} row ${id}`);
  return found;
}

async function writesSoFar(): Promise<number> {
  const response = await fetch(`${standin}/__test/writes`);
  return ((await response.json()) as unknown[]).length;
}

test("calories under One price save on Enter as a number and as a range, say Saved. once each, read back after a reload, and Undo puts them back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const dish = dishes.one.name;
  await openDish(page, "one");
  const calories = caloriesField(page);
  await expect(calories).toHaveValue("320");

  await calories.fill("300 to 340");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(calories, "a range shows back as typed").toHaveValue(
    "300 to 340",
  );
  let stored = await row("items", dishes.one.id);
  expect([stored.calories_low, stored.calories_high]).toEqual([300, 340]);

  await calories.fill("1,250");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(calories, "a thousands comma reads back plain").toHaveValue(
    "1250",
  );
  stored = await row("items", dishes.one.id);
  expect([stored.calories_low, stored.calories_high]).toEqual([1250, null]);

  await reload(page);
  await expect(caloriesField(page)).toHaveValue("1250");
  await undoButton(page, fill(strings.undo.calories, { dish })).click();
  await expect
    .poll(() => said(page, fill(strings.undo.caloriesBack, { dish })))
    .toBe(1);
  await expect(caloriesField(page)).toHaveValue("300 to 340");
  await expectNoMissingIds(page);

  // As it was.
  await caloriesField(page).fill("320");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  stored = await row("items", dishes.one.id);
  expect([stored.calories_low, stored.calories_high]).toEqual([320, null]);
});

test("calories in the wrong shape, over the cap, or out of order are refused in the field with nothing sent, and a fix says All changes saved.", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const dish = dishes.market.name;
  await openDish(page, "market");
  const calories = caloriesField(page);
  await expect(calories).toHaveValue("410");
  const before = await writesSoFar();
  const refused = (problem: string) =>
    `${fill(strings.notSaved.calories, { dish })} ${problem}`;
  for (const [typed, problem] of [
    ["lots", strings.errors.caloriesFormat],
    ["100,000", strings.errors.caloriesRange],
    ["500 to 400", strings.errors.caloriesOrder],
  ] as const) {
    await calories.fill(typed);
    await page.keyboard.press("Enter");
    await expect(calories).toHaveAttribute("aria-invalid", "true");
    await expect(status(page)).toHaveText(refused(problem));
    expect(await writesSoFar(), `nothing was sent for ${typed}`).toBe(before);
  }
  await calories.fill("410");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect(status(page)).toHaveText(editing.saved);
  expect(await writesSoFar()).toBe(before);
});

test("a size's calories save on Enter, read back after a reload, and Undo puts them back", async ({
  page,
}) => {
  await openDish(page, "sizes");
  const cup = sizeCaloriesField(page, "Cup");
  await expect(cup).toHaveValue("180");
  await cup.fill("190 to 210");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await reload(page);
  await expect(sizeCaloriesField(page, "Cup")).toHaveValue("190 to 210");
  await undoButton(
    page,
    fill(strings.undo.sizeCalories, { size: "Cup" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(strings.undo.sizeCaloriesBack, { size: "Cup" })),
    )
    .toBe(1);
  await expect(sizeCaloriesField(page, "Cup")).toHaveValue("180");
  await expectNoMissingIds(page);
});

test("Cooked to order ticked and unticked each say Saved. once, hold after a reload, and are undone", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const dish = dishes.one.name;
  await openDish(page, "one");
  await expect(cookedBox(page)).not.toBeChecked();
  await cookedWords(page).click();
  await expect(cookedBox(page)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row("items", dishes.one.id)).cooked_to_order).toBe(true);
  await reload(page);
  await expect(cookedBox(page)).toBeChecked();

  await undoButton(page, fill(strings.cookedToOrder.undo.on, { dish })).click();
  await expect
    .poll(() => said(page, fill(strings.cookedToOrder.undo.onBack, { dish })))
    .toBe(1);
  await expect(cookedBox(page)).not.toBeChecked();
  expect((await row("items", dishes.one.id)).cooked_to_order).toBe(false);

  await cookedWords(page).click();
  await expect.poll(() => said(page, saved)).toBe(1);
  await cookedWords(page).click();
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(cookedBox(page)).not.toBeChecked();
  await undoButton(
    page,
    fill(strings.cookedToOrder.undo.off, { dish }),
  ).click();
  await expect
    .poll(() => said(page, fill(strings.cookedToOrder.undo.offBack, { dish })))
    .toBe(1);
  await expect(cookedBox(page)).toBeChecked();
  await expectNoMissingIds(page);

  // As it was.
  await cookedWords(page).click();
  await expect.poll(() => said(page, saved)).toBe(3);
  expect((await row("items", dishes.one.id)).cooked_to_order).toBe(false);
});

test("a Cooked to order tick the server refuses goes back, is said once with Try again, and Try again lands it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const dish = dishes.one.name;
  await openDish(page, "one");
  await fetch(`${standin}/__test/fail?times=1`);
  await cookedWords(page).click();
  const failure = `${fill(strings.cookedToOrder.notSaved, { dish })} ${editing.problems.failed}`;
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(status(page)).toHaveText(failure);
  await expect(cookedBox(page)).not.toBeChecked();
  await expect(cookedBox(page)).toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("button", { name: editing.tryAgain, exact: true })
    .click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect(cookedBox(page)).toBeChecked();
  expect((await row("items", dishes.one.id)).cooked_to_order).toBe(true);
  await expectNoMissingIds(page);

  // As it was.
  await cookedWords(page).click();
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row("items", dishes.one.id)).cooked_to_order).toBe(false);
});
