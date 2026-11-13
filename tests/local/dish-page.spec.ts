import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { restaurantDishPath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { restaurantName } from "../a11y/pages";
import { flashBanner } from "../a11y/saved-banner";
import { chromeName, expectNamedByOneLabel } from "./chrome-name";
import { saveAndFail, saveAndLand, summary } from "./save";

// A dish's General page as one form that saves by one press (D-237), with
// saves that land for real against the stand-in: the description, the
// note, the price, and the calories in one call, with the flash; the
// refusals a Save finds, unsent, in the field or in the summary; sizes
// added, named, priced, and removed in the form and written at Save, a
// size without a name or a price refused, a blank one dropped, two trading
// names; the price choice changing the form alone, and a Save writing the
// chosen choice only (Q-171); a page whose fields moved under it, from
// another tab, after a move's refresh, and after Back, refused whole with
// nothing written; the dish gone; a save the server refuses, landed by the
// next press; Move this dish asking for a Save first; and the link to the
// next dish, which asks before it leaves unsaved changes. The gate cannot
// land a save, so this runs here. Every check ends with the three dishes
// put back as it found them, whatever it left, so the checks run in any
// order.
//
// The stand-in keeps no lock and no transaction. What a second save at the
// same instant does, and that a refused save writes nothing, are proved on
// a real Postgres by supabase/checks/item_general_owner_boundary.sql.

const { code } = ownerEnv();
const strings = en.owner.dish;
const general = strings.general;
const editing = en.owner.editing;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Priced = "sizes" | "one" | "market";
const PRICED = ["sizes", "one", "market"] as const;

type StoredSize = {
  id: string | null;
  name: string | null;
  price_cents: number | null;
  calories_low: number | null;
  calories_high: number | null;
};
type StoredGeneral = {
  description: string | null;
  note: string | null;
  price_kind: Priced;
  price_cents: number | null;
  calories_low: number | null;
  calories_high: number | null;
  sizes: StoredSize[];
};

// The dish's General document as the stand-in holds it now.
async function stored(id: string): Promise<StoredGeneral> {
  const response = await fetch(`${standin}/__test/general?id=${id}`);
  const document = (await response.json()) as StoredGeneral | null;
  if (!document) throw new Error(`the stand-in has no dish ${id}`);
  return document;
}

const sizesOf = (document: StoredGeneral) =>
  document.sizes.map(({ name, price_cents, calories_low, calories_high }) => ({
    name,
    price_cents,
    calories_low,
    calories_high,
  }));

// Puts a dish back as a check found it, rows and all: the stand-in sets
// the dish's fields and brings each size back by its id. By id, never by a
// new row of the same name: a published snapshot holds each size's id, so
// a size removed and added again would read as a change not published to
// every spec that runs after this one.
async function putBack(id: string, was: StoredGeneral): Promise<void> {
  const response = await fetch(`${standin}/__test/put-general?id=${id}`, {
    method: "POST",
    body: JSON.stringify(was),
  });
  if (!response.ok) {
    throw new Error(`the dish was not put back: ${await response.text()}`);
  }
}

let found: Record<Priced, StoredGeneral>;

test.beforeEach(async () => {
  const { dishes } = ownerFixture();
  found = {
    sizes: await stored(dishes.sizes.id),
    one: await stored(dishes.one.id),
    market: await stored(dishes.market.id),
  };
});

test.afterEach(async () => {
  const { dishes } = ownerFixture();
  for (const which of PRICED) {
    await putBack(dishes[which].id, found[which]);
    expect(
      await stored(dishes[which].id),
      `${which} is as it was, each size by its id`,
    ).toEqual(found[which]);
  }
});

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

// Presses Save general and waits for the new document, then listens to its
// log.
async function save(page: Page): Promise<void> {
  await saveAndLand(page, general.submit, general.saved);
  await hearLog(page);
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

const description = (page: Page) => field(page, strings.descriptionLabel);
const note = (page: Page) => field(page, strings.noteLabel);
const price = (page: Page) => field(page, strings.price.amountLabel);
const calories = (page: Page) => field(page, strings.price.caloriesLabel);

const forSize = (label: string, size: string) =>
  `${label} ${fill(strings.price.labelFor, { size })}`;

function sizeName(page: Page, size: string) {
  return page.getByRole("combobox", {
    name: forSize(strings.price.sizeNameLabel, size),
    exact: true,
  });
}

function sizePrice(page: Page, size: string) {
  return field(page, forSize(strings.price.sizePriceLabel, size));
}

function sizeCalories(page: Page, size: string) {
  return field(page, forSize(strings.price.sizeCaloriesLabel, size));
}

function sizeButton(page: Page, action: string, size: string) {
  return page.getByRole("button", {
    name: fill(strings.price.sizeAction, { action, size }),
    exact: true,
  });
}

function addSize(page: Page) {
  return page.getByRole("button", { name: strings.price.addSize, exact: true });
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: general.submit, exact: true });
}

function moveButton(page: Page) {
  return page.getByRole("button", { name: strings.move.submit, exact: true });
}

function radio(page: Page, label: string) {
  return page.getByRole("radio", { name: label, exact: true });
}

// Chooses a price choice by its visible words: React Aria keeps the input
// under the label, where a pointer cannot reach it directly.
async function choose(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
  await expect(radio(page, label)).toBeChecked();
}

// The size rows' name fields, in the order the page shows them.
function sizeRows(page: Page) {
  return page.locator(`main ol[aria-label="${strings.price.sizesLabel}"] > li`);
}

function sizeNames(page: Page): Promise<string[]> {
  return sizeRows(page)
    .locator('input[id$="-name"]')
    .evaluateAll((fields) =>
      fields.map((each) => (each as HTMLInputElement).value),
    );
}

async function writes(): Promise<string[]> {
  const response = await fetch(`${standin}/__test/writes`);
  return (await response.json()) as string[];
}

async function writesSoFar(): Promise<number> {
  return (await writes()).length;
}

// The General saves the stand-in was sent, landed or refused.
async function generalCalls(): Promise<number> {
  return (await writes()).filter((each) =>
    each.startsWith("rpc save_item_general "),
  ).length;
}

const unnamed = (position: number) =>
  fill(strings.price.unnamedSize, { position });

const sizeAdded = (total: number) =>
  fill(strings.price.sizeAdded, {
    count: fill(
      total === 1 ? strings.price.sizeCount.one : strings.price.sizeCount.other,
      { count: total },
    ),
  });

const notSaved = (dish: string, problem: string) =>
  `${fill(general.notSaved, { dish })} ${problem}`;

function leaveDialog(page: Page) {
  return page.getByRole("alertdialog", {
    name: strings.form.leave.question,
    exact: true,
  });
}

// The page nav's link to one of the dish's other pages, whatever its state
// line says.
function navLink(page: Page, which: Priced, pageName: string) {
  return page
    .locator("main")
    .getByRole("navigation", {
      name: ownerFixture().dishes[which].name,
      exact: true,
    })
    .getByRole("link", { name: new RegExp(`^${pageName}\\b`) });
}

// A second tab, as another person's would be: its own context, signed in
// as the same owner, at the same dish. It makes its change, saves it, and
// closes.
async function saveElsewhere(
  browser: Browser,
  page: Page,
  which: Priced,
  change: (other: Page) => Promise<void>,
): Promise<void> {
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  try {
    const other = await context.newPage();
    await other.goto(`${origin}${dishPath(which)}`);
    await other.waitForLoadState("networkidle");
    await change(other);
    await saveAndLand(other, general.submit, general.saved);
  } finally {
    await context.close();
  }
}

async function chooseSection(page: Page, section: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(strings.move.label) })
    .click();
  await page.getByRole("option", { name: section, exact: true }).click();
}

test("Save general lands the description, the note, the price, and the calories in one call with its flash, typing sends nothing, and the values are there after a reload", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  const sent = await writesSoFar();
  const calls = await generalCalls();
  await expect(
    page
      .locator("main")
      .getByText(fill(strings.form.lead, { save: general.submit }), {
        exact: true,
      }),
    "the saving line, once",
  ).toHaveCount(1);
  await expect(page.locator('main [role="status"]')).toHaveCount(0);

  await description(page).fill("Crisp greens with a lemon dressing");
  await note(page).fill("Comes with bread");
  await expect(price(page)).toHaveValue("9.00");
  await price(page).fill("12.5");
  await calories(page).fill("300 to 340");
  await page.keyboard.press("Tab");
  expect(await writesSoFar(), "typing and leaving a field send nothing").toBe(
    sent,
  );

  await save(page);
  expect(await generalCalls(), "one call").toBe(calls + 1);
  expect(await writesSoFar(), "and no other write").toBe(sent + 1);
  expect(await stored(dishes.one.id)).toMatchObject({
    description: "Crisp greens with a lemon dressing",
    note: "Comes with bread",
    price_kind: "one",
    price_cents: 1250,
    calories_low: 300,
    calories_high: 340,
  });
  await expect(price(page), "the saved price shows two decimals").toHaveValue(
    "12.50",
  );
  await expect(calories(page), "a range shows back as typed").toHaveValue(
    "300 to 340",
  );
  await expectNoMissingIds(page);

  await reload(page);
  await expect(
    flashBanner(page, "success"),
    "a reload shows no flash",
  ).toHaveCount(0);
  await expect(description(page)).toHaveValue(
    "Crisp greens with a lemon dressing",
  );
  await expect(note(page)).toHaveValue("Comes with bread");
  await expect(price(page)).toHaveValue("12.50");

  // Enter in a field of one line presses Save general; a blank description
  // and a blank note are none, and a thousands comma reads back plain.
  await description(page).fill("");
  await calories(page).fill("1,250");
  await note(page).fill("");
  const loaded = page.waitForEvent("load", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  await loaded;
  await page.waitForLoadState("networkidle");
  await expect(
    flashBanner(page, "success").getByRole("alert"),
    "Enter saved the form",
  ).toHaveText(general.saved);
  expect(await generalCalls()).toBe(calls + 2);
  await expect(calories(page)).toHaveValue("1250");
  expect(await stored(dishes.one.id)).toMatchObject({
    description: null,
    note: null,
    price_cents: 1250,
    calories_low: 1250,
    calories_high: null,
  });
});

test("a price in the wrong shape is refused in its field with nothing sent, two problems focus the first, three go to the summary with a link to each field in page order, and once fixed the save lands", async ({
  page,
}) => {
  await openDish(page, "one");
  const sent = await writesSoFar();
  await price(page).fill("twelve");
  await saveButton(page).click();
  await expect(
    price(page),
    "the one problem's field takes focus",
  ).toBeFocused();
  await expect(price(page)).toHaveAttribute("aria-invalid", "true");
  await expect(
    price(page),
    "described by its problem alone (D-230)",
  ).toHaveAccessibleDescription(strings.errors.priceFormat);
  await expect(summary(page), "no summary for one problem").toHaveCount(0);
  await expect(flashBanner(page, "success")).toHaveCount(0);
  expect(await writesSoFar(), "nothing was sent").toBe(sent);

  await note(page).fill("y".repeat(121));
  await saveButton(page).click();
  await expect(note(page), "the first of two takes focus").toBeFocused();
  await expect(note(page)).toHaveAccessibleDescription(
    strings.errors.noteLength,
  );
  await expect(summary(page)).toHaveCount(0);

  await description(page).fill("x".repeat(501));
  await calories(page).fill("lots");
  await saveButton(page).click();
  const box = summary(page);
  await expect(box, "four problems go to the summary").toBeFocused();
  await expect(box.getByRole("link")).toHaveText([
    strings.errors.descriptionLength,
    strings.errors.noteLength,
    strings.errors.priceFormat,
    strings.errors.caloriesFormat,
  ]);
  for (const [words, target] of [
    [strings.errors.caloriesFormat, calories(page)],
    [strings.errors.priceFormat, price(page)],
    [strings.errors.noteLength, note(page)],
    [strings.errors.descriptionLength, description(page)],
  ] as const) {
    await box.getByRole("link", { name: words, exact: true }).click();
    await expect(target, `the link "${words}" focuses its field`).toBeFocused();
  }
  expect(await writesSoFar(), "nothing was sent").toBe(sent);
  await expectNoMissingIds(page);

  await description(page).fill("");
  await note(page).fill("");
  await price(page).fill("9");
  await calories(page).fill("320");
  await save(page);
  expect(await writesSoFar(), "the fixed form is sent once").toBe(sent + 1);
  await expect(summary(page)).toHaveCount(0);
});

test("calories in the wrong shape, over the cap, or out of order are refused in the field at Save with nothing sent, under Market price too", async ({
  page,
}) => {
  await openDish(page, "market");
  await expect(calories(page)).toHaveValue("410");
  await expect(price(page), "Market price has no price field").toHaveCount(0);
  const sent = await writesSoFar();
  for (const [typed, problem] of [
    ["lots", strings.errors.caloriesFormat],
    ["100,000", strings.errors.caloriesRange],
    ["500 to 400", strings.errors.caloriesOrder],
  ] as const) {
    await calories(page).fill(typed);
    await saveButton(page).click();
    await expect(calories(page)).toBeFocused();
    await expect(calories(page)).toHaveAttribute("aria-invalid", "true");
    await expect(calories(page)).toHaveAccessibleDescription(problem);
    expect(await writesSoFar(), `nothing was sent for ${typed}`).toBe(sent);
  }
});

test("under Prices by size a size is added in the form with focus in its name, named from the suggestions with nothing sent, and saved with its price and calories; the sizes come back in price order and the one price is as it was", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  const sent = await writesSoFar();
  await choose(page, strings.price.sizes);
  await expect(price(page)).toHaveCount(0);

  await addSize(page).click();
  await expect.poll(() => said(page, sizeAdded(1))).toBe(1);
  const name = sizeName(page, unnamed(1));
  await expect(name, "the new size's name takes focus").toBeFocused();
  const id = (await name.getAttribute("id")) ?? "";
  await expectNamedByOneLabel(
    page,
    id,
    forSize(strings.price.sizeNameLabel, unnamed(1)),
    { visible: strings.price.sizeNameLabel },
  );
  await expect(
    page.getByRole("group", {
      name: fill(strings.price.sizeLegend, { position: 1 }),
      exact: true,
    }),
    "the size is a group named by its place while it has no name",
  ).toHaveCount(1);

  await page.keyboard.type("Pi");
  await expect(page.getByRole("option", { name: "Pint" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(name).toHaveValue("Pint");
  await expect(
    flashBanner(page, "success"),
    "Enter on a suggestion picks it and saves nothing",
  ).toHaveCount(0);
  expect(
    await chromeName(page, id),
    "while it has focus, the field keeps the name it had when focus arrived",
  ).toBe(forSize(strings.price.sizeNameLabel, unnamed(1)));
  await page.keyboard.press("Tab");
  await expect
    .poll(() => chromeName(page, id), {
      message: "once it is left, the field takes the name",
    })
    .toBe(forSize(strings.price.sizeNameLabel, "Pint"));
  await expect(sizePrice(page, "Pint"), "the price comes next").toBeFocused();
  await sizePrice(page, "Pint").fill("7");
  await sizeCalories(page, "Pint").fill("200 to 240");
  await expect(
    page.getByRole("group", { name: "Pint", exact: true }),
    "the group takes the size's name",
  ).toHaveCount(1);

  await addSize(page).click();
  await expect.poll(() => said(page, sizeAdded(2))).toBe(1);
  await expect(sizeName(page, unnamed(2))).toBeFocused();
  await page.keyboard.type("Half");
  await page.keyboard.press("Tab");
  await sizePrice(page, "Half").fill("4");
  expect(
    await sizeNames(page),
    "new sizes sit last, in the order added",
  ).toEqual(["Pint", "Half"]);
  expect(await writesSoFar(), "nothing is written until Save").toBe(sent);
  await expectNoMissingIds(page);

  await save(page);
  expect(await writesSoFar(), "one call for the choice and both sizes").toBe(
    sent + 1,
  );
  const after = await stored(dishes.one.id);
  expect(after.price_kind).toBe("sizes");
  expect(after.price_cents, "the one price is as it was").toBe(900);
  expect([after.calories_low, after.calories_high]).toEqual([320, null]);
  expect(sizesOf(after)).toEqual([
    { name: "Half", price_cents: 400, calories_low: null, calories_high: null },
    { name: "Pint", price_cents: 700, calories_low: 200, calories_high: 240 },
  ]);
  expect(await sizeNames(page), "price order on arrival").toEqual([
    "Half",
    "Pint",
  ]);
  await expect(sizePrice(page, "Pint")).toHaveValue("7.00");
  await expect(sizeCalories(page, "Pint")).toHaveValue("200 to 240");

  await choose(page, strings.price.one);
  await expect(price(page), "the one price is still there").toHaveValue("9.00");
  await reload(page);
  await expect(
    radio(page, strings.price.sizes),
    "the choice that was saved",
  ).toBeChecked();
  expect(await sizeNames(page)).toEqual(["Half", "Pint"]);
});

test("a size with a price and no name is refused at Save in its name field with nothing sent, and so are a name with no price and a name another size has", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
  const sent = await writesSoFar();
  await addSize(page).click();
  await expect.poll(() => said(page, sizeAdded(3))).toBe(1);
  await sizePrice(page, unnamed(3)).fill("15");
  await saveButton(page).click();
  const name = sizeName(page, unnamed(3));
  await expect(name, "focus lands in the name").toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(
    fill(strings.errors.sizeNameRequired, { size: unnamed(3) }),
  );
  await expect(flashBanner(page, "success")).toHaveCount(0);
  expect(await writesSoFar(), "nothing was sent").toBe(sent);

  // A name and no price.
  await page.keyboard.type("Pint");
  await page.keyboard.press("Tab");
  await sizePrice(page, "Pint").fill("");
  await saveButton(page).click();
  await expect(sizePrice(page, "Pint")).toBeFocused();
  await expect(sizePrice(page, "Pint")).toHaveAccessibleDescription(
    fill(strings.errors.sizePriceRequired, { size: "Pint" }),
  );
  await expect(
    sizeName(page, "Pint"),
    "the name's problem went with its fix",
  ).not.toHaveAttribute("aria-invalid", "true");
  expect(await writesSoFar()).toBe(sent);

  // A name another size has, whatever the case or the outer spaces.
  await sizePrice(page, "Pint").fill("15");
  await sizeName(page, "Pint").fill(" cup ");
  await page.keyboard.press("Tab");
  await saveButton(page).click();
  const third = sizeRows(page).nth(2).locator('input[id$="-name"]');
  await expect(third).toBeFocused();
  await expect(third).toHaveAccessibleDescription(
    fill(strings.errors.nameTaken, { size: "Cup" }),
  );
  expect(await writesSoFar(), "still nothing sent").toBe(sent);
  expect(sizesOf(await stored(dishes.sizes.id))).toEqual(sizesOf(found.sizes));
  await expectNoMissingIds(page);
});

test("a size left blank is dropped by Save without a word, alone it does not make a link ask, and a blank one an older draft held is dropped too", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  const calls = await generalCalls();
  await addSize(page).click();
  await expect.poll(() => said(page, sizeAdded(3))).toBe(1);
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl", ""]);
  await save(page);
  expect(await generalCalls()).toBe(calls + 1);
  expect(sizesOf(await stored(dishes.sizes.id)), "no size was added").toEqual(
    sizesOf(found.sizes),
  );
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);

  // A blank row alone is not a change: the next dish link goes at once.
  await addSize(page).click();
  await expect.poll(() => said(page, sizeAdded(3))).toBe(1);
  await page
    .getByRole("link", {
      name: fill(strings.next.label, { dish: dishes.one.name }),
      exact: true,
    })
    .click();
  await expect(page.locator("main h1")).toHaveText(dishes.one.name);
  await expect(leaveDialog(page)).toHaveCount(0);

  // An older draft's blank size, made before a Save asked for a name and a
  // price: the page shows it, it is not a change, and Save drops it.
  await fetch(`${standin}/__test/add-size?dish=${dishes.sizes.id}`);
  expect((await stored(dishes.sizes.id)).sizes).toHaveLength(3);
  await openDish(page, "sizes");
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl", ""]);
  await save(page);
  expect(sizesOf(await stored(dishes.sizes.id))).toEqual(sizesOf(found.sizes));
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
});

test("Remove takes a size out of the form with focus on the next size's name and writes nothing until Save, which marks it removed", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  const sent = await writesSoFar();
  const removed = (size: string) => fill(strings.price.sizeRemoved, { size });

  // A size with no name is said by its place, and focus goes to the one
  // before when none follows.
  await addSize(page).click();
  await expect.poll(() => said(page, sizeAdded(3))).toBe(1);
  await sizeButton(page, strings.price.removeSize, unnamed(3)).click();
  await expect
    .poll(() =>
      said(page, removed(fill(strings.price.sizeLegend, { position: 3 }))),
    )
    .toBe(1);
  await expect(sizeName(page, "Bowl"), "the size before").toBeFocused();

  await sizeButton(page, strings.price.removeSize, "Cup").click();
  await expect.poll(() => said(page, removed("Cup"))).toBe(1);
  await expect(sizeName(page, "Bowl"), "the next size's name").toBeFocused();
  expect(await sizeNames(page)).toEqual(["Bowl"]);
  expect(await writesSoFar(), "nothing is written until Save").toBe(sent);
  expect(sizesOf(await stored(dishes.sizes.id))).toEqual(sizesOf(found.sizes));

  await save(page);
  expect(await writesSoFar()).toBe(sent + 1);
  expect(
    sizesOf(await stored(dishes.sizes.id)).map((size) => size.name),
  ).toEqual(["Bowl"]);
  expect(await sizeNames(page)).toEqual(["Bowl"]);

  await sizeButton(page, strings.price.removeSize, "Bowl").click();
  await expect.poll(() => said(page, removed("Bowl"))).toBe(1);
  await expect(
    addSize(page),
    "focus goes to Add a size when no size is left",
  ).toBeFocused();
  await expectNoMissingIds(page);
});

test("two sizes trade names in one save", async ({ page }) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  const [cup, bowl] = found.sizes.sizes;
  const first = sizeRows(page).nth(0).locator('input[id$="-name"]');
  const second = sizeRows(page).nth(1).locator('input[id$="-name"]');
  await first.fill("Bowl");
  await page.keyboard.press("Tab");
  await second.fill("Cup");
  await page.keyboard.press("Tab");
  await save(page);
  const after = (await stored(dishes.sizes.id)).sizes;
  expect(
    after.map(({ id, name, price_cents }) => ({ id, name, price_cents })),
    "each size keeps its price and takes the other's name",
  ).toEqual([
    { id: cup?.id, name: "Bowl", price_cents: 500 },
    { id: bowl?.id, name: "Cup", price_cents: 800 },
  ]);
  expect(await sizeNames(page)).toEqual(["Bowl", "Cup"]);
});

test("arrows through the price choice change the form and send nothing, what was typed under a choice comes back, and Save writes the chosen choice alone (Q-171)", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  const sent = await writesSoFar();
  await radio(page, strings.price.sizes).focus();
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, strings.price.market)).toBeChecked();
  await expect(addSize(page)).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, strings.price.one)).toBeChecked();
  await expect(price(page)).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(radio(page, strings.price.sizes)).toBeChecked();
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
  // Longer than the half second the choice once took to settle and save.
  await page.waitForTimeout(800);
  expect(await writesSoFar(), "nothing is sent").toBe(sent);
  expect(await heard(page), "nothing is said").toEqual([]);
  expect((await stored(dishes.sizes.id)).price_kind).toBe("sizes");
  await expectNoMissingIds(page);

  // Typed under By size, then One price chosen: the sizes' fields are not
  // on the page at the press, so they are not written.
  await sizePrice(page, "Cup").fill("6");
  await choose(page, strings.price.one);
  await price(page).fill("11");
  await choose(page, strings.price.sizes);
  await expect(
    sizePrice(page, "Cup"),
    "what was typed under By size comes back in the visit",
  ).toHaveValue("6");
  await choose(page, strings.price.one);
  await expect(price(page)).toHaveValue("11");
  await save(page);
  expect(await writesSoFar(), "one call").toBe(sent + 1);
  const after = await stored(dishes.sizes.id);
  expect(after.price_kind).toBe("one");
  expect(after.price_cents).toBe(1100);
  expect(after.sizes, "the stored sizes are as they were").toEqual(
    found.sizes.sizes,
  );
  await expect(radio(page, strings.price.one)).toBeChecked();
  await choose(page, strings.price.sizes);
  await expect(sizePrice(page, "Cup")).toHaveValue("5.00");
});

test("two tabs on General: the second tab's Save is refused whole with the moved sentence in the focused summary, its fields stay as typed, nothing is written over, and a reload shows the first tab's save", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  try {
    const first = await context.newPage();
    await first.goto(`${origin}${dishPath("market")}`);
    await first.waitForLoadState("networkidle");
    await description(first).fill("Saved in the first tab");
    await saveAndLand(first, general.submit, general.saved);
    const calls = await generalCalls();
    const sent = await writesSoFar();

    await note(page).fill("Typed in the second tab");
    await saveAndFail(page, general.submit, general.moved);
    await expect(
      summary(page).getByRole("link"),
      "no field is at fault",
    ).toHaveCount(0);
    expect(await generalCalls(), "one call, refused").toBe(calls + 1);
    expect(await writesSoFar(), "and nothing else").toBe(sent + 1);
    await expect(
      note(page),
      "the second tab's fields are as typed",
    ).toHaveValue("Typed in the second tab");
    await expect(
      description(page),
      "and it still shows the page it loaded",
    ).toHaveValue("");
    await expect(description(first)).toHaveValue("Saved in the first tab");
    expect(await stored(dishes.market.id)).toMatchObject({
      description: "Saved in the first tab",
      note: null,
    });
    await expectNoMissingIds(page);

    // A second press is refused the same way until the page is reloaded.
    await saveAndFail(page, general.submit, general.moved);
    expect(await generalCalls()).toBe(calls + 2);
    expect((await stored(dishes.market.id)).note).toBeNull();

    await reload(page);
    await expect(
      description(page),
      "the reload shows the first tab's save",
    ).toHaveValue("Saved in the first tab");
    await expect(note(page), "and no note").toHaveValue("");
    await note(page).fill("Typed again");
    await save(page);
    expect(await stored(dishes.market.id)).toMatchObject({
      description: "Saved in the first tab",
      note: "Typed again",
    });
  } finally {
    await context.close();
  }
});

test("a save the server refuses keeps every value with its sentence in the focused summary, and the next press lands it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await fetch(`${standin}/__test/fail?times=1`);
  await note(page).fill("Hot from the oven");
  await calories(page).fill("430");
  await saveAndFail(
    page,
    general.submit,
    notSaved(dishes.market.name, editing.problems.failed),
  );
  await expect(note(page), "what was typed stays").toHaveValue(
    "Hot from the oven",
  );
  await expect(calories(page)).toHaveValue("430");
  await expect(note(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("button", { name: editing.tryAgain, exact: true }),
    "a form page has no Try again: Save is still there",
  ).toHaveCount(0);
  expect((await stored(dishes.market.id)).note).toBeNull();

  await save(page);
  await expect(summary(page)).toHaveCount(0);
  expect(await stored(dishes.market.id)).toMatchObject({
    note: "Hot from the oven",
    calories_low: 430,
  });
});

test("a dish deleted elsewhere says it is no longer here at Save, with nothing written", async ({
  page,
}) => {
  const { emptySection } = ownerFixture();
  const name = "Scratch dish";
  const made = await fetch(
    `${standin}/__test/add-dish?section=${encodeURIComponent(emptySection.name)}&name=${encodeURIComponent(name)}`,
  );
  const scratch = (await made.json()) as { id: string };
  try {
    await page.goto(restaurantDishPath(code, scratch.id));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main h1")).toHaveText(name);
    await fetch(`${standin}/__test/delete-dish?id=${scratch.id}`);
    const sent = await writesSoFar();
    await note(page).fill("Too late");
    await saveAndFail(
      page,
      general.submit,
      notSaved(name, strings.errors.parentGone),
    );
    expect(await writesSoFar(), "nothing was written").toBe(sent);
    await expect(note(page)).toHaveValue("Too late");
  } finally {
    await fetch(`${standin}/__test/delete-dish?id=${scratch.id}`);
  }
});

test('Move dish with unsaved changes says "Save general first." once, sends nothing, and keeps focus; once saved, the move lands with the new title and then its sentence, and the move back lands the dish last, where it was', async ({
  page,
}) => {
  // The section's last dish moves, so the move back, which lands a dish
  // last, puts it where it was.
  const { withSections, withDishes, emptySection, dishes } = ownerFixture();
  const dish = dishes.market.name;
  await openDish(page, "market");
  const restaurant = await restaurantName(page);
  await expect(moveButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await chooseSection(page, emptySection.name);
  await note(page).fill("Not saved yet");
  const sent = await writesSoFar();
  await expect(
    moveButton(page),
    "an inactive button, still in the tab order",
  ).toHaveAttribute("aria-disabled", "true");
  await moveButton(page).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, strings.move.saveFirst)).toBe(1);
  await expect(moveButton(page), "focus stays on the button").toBeFocused();
  // Long enough for a move to have been sent and answered.
  await page.waitForTimeout(500);
  expect(await writesSoFar(), "nothing is sent").toBe(sent);
  await expect(
    page
      .locator("main")
      .getByRole("navigation", { name: en.ui.breadcrumb, exact: true })
      .getByRole("link"),
    "the dish is where it was",
  ).toHaveText([
    en.owner.restaurants.nav.menus,
    withSections.name,
    withDishes.name,
  ]);

  await save(page);
  await expect(moveButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await chooseSection(page, emptySection.name);
  await moveButton(page).click();
  const moved = fill(strings.move.moved, {
    dish,
    section: emptySection.name,
    menu: withSections.name,
  });
  await expect.poll(() => said(page, moved)).toBe(1);
  await expect(page).toHaveTitle(
    pageTitle(en, dish, restaurant, [emptySection.name, withSections.name]),
  );
  await expect(
    page
      .locator("main")
      .getByRole("navigation", { name: en.ui.breadcrumb, exact: true })
      .getByRole("link"),
  ).toHaveText([
    en.owner.restaurants.nav.menus,
    withSections.name,
    emptySection.name,
  ]);
  await expect(
    page
      .locator("main")
      .getByText(fill(strings.next.last, { section: emptySection.name }), {
        exact: true,
      }),
    "it is the last dish there",
  ).toHaveCount(1);
  expect(page.url()).toContain(dishPath("market"));
  await expect(note(page), "the form is as it was saved").toHaveValue(
    "Not saved yet",
  );

  // As it was.
  await reload(page);
  await chooseSection(page, withDishes.name);
  await moveButton(page).click();
  const back = fill(strings.move.moved, {
    dish,
    section: withDishes.name,
    menu: withSections.name,
  });
  await expect.poll(() => said(page, back)).toBe(1);
  await expect(page).toHaveTitle(
    pageTitle(en, dish, restaurant, [withDishes.name, withSections.name]),
  );
  await expect(
    page
      .locator("main")
      .getByText(fill(strings.next.last, { section: withDishes.name }), {
        exact: true,
      }),
    "it is the last dish there again",
  ).toHaveCount(1);
});

// A move refreshes the page in place, and the refresh carries a newer read
// of the dish. The form keeps the document it showed, so a Save after the
// move still hands back what the owner was looking at, and a change made
// elsewhere in between is never written over.
test("a move's refresh does not put a newer document under the form: a change from another tab, then a move here, then a Save here is refused as moved", async ({
  page,
  browser,
}) => {
  const { withSections, withDishes, emptySection, dishes } = ownerFixture();
  const dish = dishes.market.name;
  await openDish(page, "market");
  await saveElsewhere(browser, page, "market", (other) =>
    description(other).fill("From the other tab"),
  );
  try {
    await chooseSection(page, emptySection.name);
    await moveButton(page).click();
    await expect
      .poll(() =>
        said(
          page,
          fill(strings.move.moved, {
            dish,
            section: emptySection.name,
            menu: withSections.name,
          }),
        ),
      )
      .toBe(1);
    await expect(
      description(page),
      "the form still shows what it showed",
    ).toHaveValue("");
    const calls = await generalCalls();
    await note(page).fill("Typed after the move");
    await saveAndFail(page, general.submit, general.moved);
    expect(await generalCalls(), "one call, refused").toBe(calls + 1);
    expect(
      await stored(dishes.market.id),
      "the other tab's description stands and no note is written",
    ).toMatchObject({ description: "From the other tab", note: null });
  } finally {
    // As it was: the dish back in its section, last.
    await page.goto(dishPath("market"));
    await page.waitForLoadState("networkidle");
    await hearLog(page);
    await chooseSection(page, withDishes.name);
    await moveButton(page).click();
    await expect
      .poll(() =>
        said(
          page,
          fill(strings.move.moved, {
            dish,
            section: withDishes.name,
            menu: withSections.name,
          }),
        ),
      )
      .toBe(1);
  }
});

test("the link to the next dish arrives with the whole title, and with unsaved changes it asks: Keep editing stays with focus back on the link, Leave goes and the change is gone", async ({
  page,
}) => {
  const { withSections, withDishes, dishes } = ownerFixture();
  await openDish(page, "sizes");
  const restaurant = await restaurantName(page);
  const next = page.getByRole("link", {
    name: fill(strings.next.label, { dish: dishes.one.name }),
    exact: true,
  });
  await description(page).fill("Never saved");
  await next.click();
  const dialog = leaveDialog(page);
  await expect(dialog).toHaveCount(1);
  const keep = dialog.getByRole("button", {
    name: strings.form.leave.keep,
    exact: true,
  });
  await expect(keep).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(next, "focus is back on the link").toBeFocused();
  await expect(description(page)).toHaveValue("Never saved");

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(1);
  await expect(keep).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: strings.form.leave.leave, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(`**${dishPath("one")}`);
  await expect(page).toHaveTitle(
    pageTitle(en, dishes.one.name, restaurant, [
      withDishes.name,
      withSections.name,
    ]),
  );
  await expect(page.locator("main h1")).toHaveText(dishes.one.name);
  expect((await stored(dishes.sizes.id)).description).toBeNull();
  await openDish(page, "sizes");
  await expect(description(page), "the change was not saved").toHaveValue("");
});

// Back to General from another of the dish's pages is Next's own restore:
// the router brings back the render it kept, so the page shows the dish as
// that render read it, and the form mounts on that document. What the
// restore shows is read before the press, so this cannot pass on a page
// Next loaded fresh.
test("Back to General after a save shows the page as Next kept it; when the dish changed elsewhere since, a Save there is refused as moved with nothing written", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  await description(page).fill("Saved before leaving");
  await save(page);
  await navLink(page, "one", strings.tags.heading).click();
  await expect(page.locator("main h1")).toHaveText(strings.tags.heading);

  await saveElsewhere(browser, page, "one", (other) =>
    description(other).fill("Changed while away"),
  );
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText(dishes.one.name);
  await page.waitForLoadState("networkidle");
  await expect(
    description(page),
    "Back shows the render Next kept, not the dish as it is now",
  ).toHaveValue("Saved before leaving");
  await expect(flashBanner(page, "success"), "and no flash").toHaveCount(0);

  const calls = await generalCalls();
  await note(page).fill("Typed after Back");
  await saveAndFail(page, general.submit, general.moved);
  expect(await generalCalls(), "one call, refused").toBe(calls + 1);
  expect(await stored(dishes.one.id)).toMatchObject({
    description: "Changed while away",
    note: null,
  });
});

test("Back to General after a save, with no change in between, lands the next Save", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  await description(page).fill("Saved before leaving");
  await save(page);
  await navLink(page, "one", strings.tags.heading).click();
  await expect(page.locator("main h1")).toHaveText(strings.tags.heading);
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText(dishes.one.name);
  await page.waitForLoadState("networkidle");
  await expect(description(page)).toHaveValue("Saved before leaving");
  await note(page).fill("Typed after Back");
  await save(page);
  expect(await stored(dishes.one.id)).toMatchObject({
    description: "Saved before leaving",
    note: "Typed after Back",
  });
});
