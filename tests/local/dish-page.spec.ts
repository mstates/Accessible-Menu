import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { pageTitle } from "../../src/copy/title";
import { restaurantDishPath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { restaurantName } from "../a11y/pages";
import { chromeName } from "./chrome-name";

// A dish's page with saves that land for real against the stand-in (D-128,
// D-139, D-142): the texts and the price, the price choice and what the
// other choices keep, a size added, named from the suggestions, priced,
// removed, and put back in its place, the order sizes keep while the page
// is open and take after a reload, the move with its sentence after the
// new title, the link to the next dish, a failed save with Try again, and
// Undo after a reload. The gate cannot land a save, so this runs here. Each
// check leaves the stand-in as it found it, so the checks run in any order.

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

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function sizeName(page: Page, size: string) {
  return page.getByRole("combobox", {
    name: `${strings.price.sizeNameLabel} ${fill(strings.price.labelFor, { size })}`,
    exact: true,
  });
}

function sizePrice(page: Page, size: string) {
  return field(
    page,
    `${strings.price.sizePriceLabel} ${fill(strings.price.labelFor, { size })}`,
  );
}

function sizeButton(page: Page, action: string, size: string) {
  return page.getByRole("button", {
    name: fill(strings.price.sizeAction, { action, size }),
    exact: true,
  });
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

function status(page: Page) {
  return page.locator('main [role="status"]');
}

function undoButton(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

function sizeNames(page: Page): Promise<string[]> {
  return page
    .locator(
      `main ol[aria-label="${strings.price.sizesLabel}"] > li input[id$="-name"]`,
    )
    .evaluateAll((fields) =>
      fields.map((each) => (each as HTMLInputElement).value),
    );
}

async function writesSoFar(): Promise<number> {
  const response = await fetch(`${standin}/__test/writes`);
  return ((await response.json()) as unknown[]).length;
}

const unnamed = (position: number) =>
  fill(strings.price.unnamedSize, { position });

test("the description saves when it is left, the note and the price on Enter, each says Saved. once, and a price comes back with two decimals", async ({
  page,
}) => {
  await openDish(page, "one");
  const description = field(page, strings.descriptionLabel);
  await description.fill("Crisp greens with a lemon dressing");
  await page.keyboard.press("Tab");
  await expect.poll(() => said(page, saved)).toBe(1);

  const note = field(page, strings.noteLabel);
  await note.fill("Comes with bread");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(note, "focus stays in the field").toBeFocused();

  const price = field(page, strings.price.amountLabel);
  await expect(price).toHaveValue("9.00");
  await price.fill("12.5");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(3);
  await expect(price, "the saved price shows two decimals").toHaveValue(
    "12.50",
  );

  await reload(page);
  await expect(field(page, strings.descriptionLabel)).toHaveValue(
    "Crisp greens with a lemon dressing",
  );
  await expect(field(page, strings.noteLabel)).toHaveValue("Comes with bread");
  await expect(field(page, strings.price.amountLabel)).toHaveValue("12.50");

  // As it was.
  await field(page, strings.descriptionLabel).fill("");
  await page.keyboard.press("Tab");
  await field(page, strings.noteLabel).fill("");
  await page.keyboard.press("Enter");
  await field(page, strings.price.amountLabel).fill("9");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(3);
  await expect(field(page, strings.price.amountLabel)).toHaveValue("9.00");
});

test("a price in the wrong shape is refused in the field with nothing sent, and a fix says All changes saved. once", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  const before = await writesSoFar();
  const price = field(page, strings.price.amountLabel);
  await price.fill("twelve");
  await page.keyboard.press("Enter");
  const failure = `${fill(strings.notSaved.price, { dish: dishes.one.name })} ${strings.errors.priceFormat}`;
  await expect(price).toHaveAttribute("aria-invalid", "true");
  await expect(status(page)).toHaveText(failure);
  await expect.poll(() => said(page, failure)).toBe(1);
  expect(await writesSoFar(), "nothing was sent").toBe(before);

  await price.fill("9.00");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  expect(await said(page, saved), "the field back as saved sends nothing").toBe(
    0,
  );
  await expect(status(page)).toHaveText(editing.saved);
  expect(await writesSoFar()).toBe(before);
});

test("switching the price choice saves and says Saved. once, a size is added blank with focus in its name, and the other choice keeps what it held, also after a reload", async ({
  page,
}) => {
  await openDish(page, "one");
  await choose(page, strings.price.sizes);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(radio(page, strings.price.sizes)).toBeChecked();
  await expect(field(page, strings.price.amountLabel)).toHaveCount(0);

  const add = page.getByRole("button", {
    name: strings.price.addSize,
    exact: true,
  });
  await add.click();
  const added = fill(strings.price.sizeAdded, {
    count: fill(strings.price.sizeCount.one, { count: 1 }),
  });
  await expect.poll(() => said(page, added)).toBe(1);
  const name = sizeName(page, unnamed(1));
  await expect(name, "the new size's name takes focus").toBeFocused();
  await name.fill("Half");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(2);
  await page.keyboard.press("Tab");
  const price = sizePrice(page, "Half");
  await expect(price, "the price comes next").toBeFocused();
  await price.fill("6");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(3);
  await expect(price).toHaveValue("6.00");

  await choose(page, strings.price.one);
  await expect.poll(() => said(page, saved)).toBe(4);
  await expect(
    field(page, strings.price.amountLabel),
    "the one price is still there",
  ).toHaveValue("9.00");

  await reload(page);
  await expect(radio(page, strings.price.one)).toBeChecked();
  await expect(field(page, strings.price.amountLabel)).toHaveValue("9.00");
  await choose(page, strings.price.sizes);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(sizePrice(page, "Half"), "and so is the size").toHaveValue(
    "6.00",
  );

  // As it was.
  await sizeButton(page, strings.price.removeSize, "Half").click();
  await expect
    .poll(() => said(page, fill(strings.price.sizeRemoved, { size: "Half" })))
    .toBe(1);
  await expect(
    add,
    "focus goes to Add a size when no size is left",
  ).toBeFocused();
  await choose(page, strings.price.one);
  await expect.poll(() => said(page, saved)).toBe(2);
});

// D-147, with the saves landing, the way the preview pass found it: the
// market price sentence describes the group and its radios after a switch
// to it, and nothing points at its id after a switch away, from a page
// loaded at either.
test("a switch to Market price that lands ties its sentence to the group and its radios, and a switch away that lands leaves nothing pointing at a missing id", async ({
  page,
}) => {
  const choices = [
    strings.price.one,
    strings.price.sizes,
    strings.price.market,
  ];
  async function expectDescribed() {
    await expect(
      page.locator("main").getByText(strings.price.marketHint, { exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("radiogroup", {
        name: strings.price.heading,
        exact: true,
      }),
    ).toHaveAccessibleDescription(strings.price.marketHint);
    for (const label of choices) {
      await expect(radio(page, label)).toHaveAccessibleDescription(
        strings.price.marketHint,
      );
    }
    await expectNoMissingIds(page);
  }

  await openDish(page, "one");
  await choose(page, strings.price.market);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expectDescribed();
  await choose(page, strings.price.one);
  await expect.poll(() => said(page, saved)).toBe(2);
  await expectNoMissingIds(page);

  await openDish(page, "market");
  await choose(page, strings.price.one);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expectNoMissingIds(page);
  await choose(page, strings.price.market);
  await expect.poll(() => said(page, saved)).toBe(2);
  await expectDescribed();
});

test("a size named from the suggestions commits once and keeps its field's name in Chrome while focused, a taken name is refused unsent, and a removed size comes back in its place", async ({
  page,
}) => {
  await openDish(page, "sizes");
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
  await page
    .getByRole("button", { name: strings.price.addSize, exact: true })
    .click();
  const added = fill(strings.price.sizeAdded, {
    count: fill(strings.price.sizeCount.other, { count: 3 }),
  });
  await expect.poll(() => said(page, added)).toBe(1);
  const name = sizeName(page, unnamed(3));
  await expect(name).toBeFocused();
  const id = (await name.getAttribute("id")) ?? "";
  expect(await chromeName(page, id)).toBe(
    `${strings.price.sizeNameLabel} ${fill(strings.price.labelFor, { size: unnamed(3) })}`,
  );

  await page.keyboard.type("Pi");
  await expect(page.getByRole("option", { name: "Pint" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(name).toHaveValue("Pint");
  await expect.poll(() => said(page, saved)).toBe(1);
  expect(
    await chromeName(page, id),
    "while it has focus, the field keeps the name it had when focus arrived",
  ).toBe(
    `${strings.price.sizeNameLabel} ${fill(strings.price.labelFor, { size: unnamed(3) })}`,
  );
  await page.keyboard.press("Tab");
  await expect
    .poll(() => chromeName(page, id), {
      message: "once it is left, the field takes the saved name",
    })
    .toBe(
      `${strings.price.sizeNameLabel} ${fill(strings.price.labelFor, { size: "Pint" })}`,
    );
  expect(await said(page, saved), "the choice committed once").toBe(1);
  const price = sizePrice(page, "Pint");
  await expect(price).toBeFocused();
  await price.fill("7");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(2);

  const before = await writesSoFar();
  const pint = sizeName(page, "Pint");
  await pint.fill(" cup ");
  await page.keyboard.press("Enter");
  const taken = `${fill(strings.notSaved.sizeName, { size: "Pint" })} ${fill(strings.errors.nameTaken, { size: "Cup" })}`;
  await expect(status(page)).toHaveText(taken);
  expect(await writesSoFar(), "a taken name is not sent").toBe(before);
  await pint.fill("Pint");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);

  expect(
    await sizeNames(page),
    "the new size keeps its place while the page is open",
  ).toEqual(["Cup", "Bowl", "Pint"]);
  await reload(page);
  expect(await sizeNames(page), "and sits in price order on arrival").toEqual([
    "Cup",
    "Pint",
    "Bowl",
  ]);

  await sizeButton(page, strings.price.removeSize, "Pint").click();
  await expect
    .poll(() => said(page, fill(strings.price.sizeRemoved, { size: "Pint" })))
    .toBe(1);
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
  await expect(
    sizeName(page, "Bowl"),
    "focus goes to the next size's name",
  ).toBeFocused();
  await undoButton(
    page,
    fill(strings.undo.sizeDeleted, { size: "Pint" }),
  ).click();
  await expect
    .poll(() => said(page, fill(strings.undo.sizeRestored, { size: "Pint" })))
    .toBe(1);
  expect(await sizeNames(page), "back in its place").toEqual([
    "Cup",
    "Pint",
    "Bowl",
  ]);

  // As it was.
  await sizeButton(page, strings.price.removeSize, "Pint").click();
  await expect
    .poll(() => said(page, fill(strings.price.sizeRemoved, { size: "Pint" })))
    .toBe(2);
});

test("a size's price change does not move its row while the page is open, and price order applies after a reload", async ({
  page,
}) => {
  await openDish(page, "sizes");
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
  await sizePrice(page, "Cup").fill("9");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(sizePrice(page, "Cup")).toHaveValue("9.00");
  expect(await sizeNames(page), "the rows keep their places").toEqual([
    "Cup",
    "Bowl",
  ]);
  await reload(page);
  expect(await sizeNames(page), "price order on arrival").toEqual([
    "Bowl",
    "Cup",
  ]);

  // As it was.
  await sizePrice(page, "Cup").fill("5");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await reload(page);
  expect(await sizeNames(page)).toEqual(["Cup", "Bowl"]);
});

test("the move reads the new title and then its sentence, the page stays, and Undo after a reload puts the dish back", async ({
  page,
}) => {
  const { withSections, withDishes, emptySection, dishes } = ownerFixture();
  const dish = dishes.sizes.name;
  await openDish(page, "sizes");
  const restaurant = await restaurantName(page);
  await page
    .getByRole("button", { name: new RegExp(strings.move.label) })
    .click();
  await page
    .getByRole("option", { name: emptySection.name, exact: true })
    .click();
  await page
    .getByRole("button", { name: strings.move.submit, exact: true })
    .click();
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
  expect(page.url()).toContain(dishPath("sizes"));

  await reload(page);
  await undoButton(
    page,
    fill(strings.move.undo.moved, { dish, section: emptySection.name }),
  ).click();
  const back = fill(strings.move.undo.movedBack, {
    dish,
    section: withDishes.name,
    position: 1,
    total: 3,
  });
  await expect.poll(() => said(page, back)).toBe(1);
  await expect(page).toHaveTitle(
    pageTitle(en, dish, restaurant, [withDishes.name, withSections.name]),
  );
});

test("the link to the next dish arrives with the whole title", async ({
  page,
}) => {
  const { withSections, withDishes, dishes } = ownerFixture();
  await openDish(page, "sizes");
  const restaurant = await restaurantName(page);
  await page
    .getByRole("link", {
      name: fill(strings.next.label, { dish: dishes.one.name }),
      exact: true,
    })
    .click();
  await page.waitForURL(`**${dishPath("one")}`);
  await expect(page).toHaveTitle(
    pageTitle(en, dishes.one.name, restaurant, [
      withDishes.name,
      withSections.name,
    ]),
  );
});

test("a failed save keeps the text and is said once, Try again lands it with All changes saved., and Undo after a reload takes it back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const dish = dishes.market.name;
  await openDish(page, "market");
  await fetch(`${standin}/__test/fail?times=1`);
  const note = field(page, strings.noteLabel);
  await note.fill("Hot from the oven");
  await page.keyboard.press("Enter");
  const failure = `${fill(strings.notSaved.note, { dish })} ${editing.problems.failed}`;
  await expect(status(page)).toHaveText(failure);
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(note, "what was typed stays").toHaveValue("Hot from the oven");
  await expect(note).toHaveAttribute("aria-invalid", "true");

  await page
    .getByRole("button", { name: editing.tryAgain, exact: true })
    .click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect(status(page)).toHaveText(editing.saved);

  await reload(page);
  await expect(field(page, strings.noteLabel)).toHaveValue("Hot from the oven");
  await undoButton(page, fill(strings.undo.note, { dish })).click();
  await expect
    .poll(() => said(page, fill(strings.undo.noteBack, { dish })))
    .toBe(1);
  await expect(field(page, strings.noteLabel)).toHaveValue("");
});
