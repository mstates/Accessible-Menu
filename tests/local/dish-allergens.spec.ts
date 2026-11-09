import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { checkedOnDate, US_MAJOR_ALLERGENS } from "../../src/domain/allergens";
import {
  dinersReadText,
  dinerSentence,
  otherAction,
  otherSuffix,
} from "../../src/features/owner/allergens/allergen-words";
import { restaurantDishPagePath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { chromeName, expectNamedByOneLabel } from "./chrome-name";
import { saveAndFail, saveAndLand, summary } from "./save";

// The allergen group on a dish's Allergens page, which saves by one press
// (D-148, D-129, D-223, D-229), with saves that land for real against the
// stand-in: a tick with the check kept lands checked with a fresh stamp in
// two statements, D-148's rule in one save; a tick with the check unticked
// lands unchecked in one; a check alone lands stamped; a Save with nothing
// changed writes nothing and flashes; a blank row is dropped by Save; the
// other-allergen rows' refusals, unsent, under their fields; a rename and a
// remove kept by Save; the apply to a same-named dish; a page whose lists
// moved under it, from another tab, refused with one sentence in the
// summary and nothing written; and a save the server refuses, kept, landed
// by the next press. The gate cannot land a save, so this runs here. Each
// check leaves the stand-in as it found it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const allergens = strings.allergens;
const editing = en.owner.editing;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Priced = "sizes" | "one" | "market";

// The dish's Allergens page (D-222), where its group lives.
function dishPath(which: Priced): string {
  return restaurantDishPagePath(
    code,
    ownerFixture().dishes[which].id,
    "allergens",
  );
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

function box(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

function checkBox(page: Page) {
  return box(page, allergens.checkLabel);
}

// Ticks a box by its visible words: React Aria keeps the input under the
// label, where a pointer cannot reach it directly.
async function press(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
}

function sentenceLine(page: Page) {
  return page.locator("#dish-allergen-sentence");
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: allergens.submit, exact: true });
}

// Saves the page and listens to the new document's log.
async function save(page: Page): Promise<void> {
  await saveAndLand(page, allergens.submit, allergens.saved);
  await hearLog(page);
}

function otherField(page: Page, position: number) {
  return page.getByRole("combobox", {
    name: `${allergens.otherLabel} ${otherSuffix(allergens, position)}`,
    exact: true,
  });
}

function otherButton(page: Page, action: string, label: string) {
  return page.getByRole("button", {
    name: otherAction(allergens, action, label),
    exact: true,
  });
}

function addOther(page: Page) {
  return page.getByRole("button", { name: allergens.addOther, exact: true });
}

function applyButton(page: Page, dish: string) {
  return page.getByRole("button", {
    name: new RegExp(
      `^${escape(allergens.sameNamed.apply)}, ${escape(dish)} in `,
    ),
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Row = {
  id: string;
  name: string;
  allergens: string[];
  custom_allergens: string[];
  allergens_reviewed: boolean;
  allergens_reviewed_by: string | null;
  allergens_reviewed_at: string | null;
};

async function items(): Promise<Row[]> {
  const response = await fetch(`${standin}/__test/items`);
  return (await response.json()) as Row[];
}

async function row(id: string): Promise<Row> {
  const found = (await items()).find((each) => each.id === id);
  if (!found) throw new Error(`the stand-in has no dish ${id}`);
  return found;
}

async function zone(): Promise<string> {
  const response = await fetch(`${standin}/__test/restaurant`);
  return ((await response.json()) as { timezone: string }).timezone;
}

async function writesSoFar(): Promise<number> {
  const response = await fetch(`${standin}/__test/writes`);
  return ((await response.json()) as unknown[]).length;
}

// A dish's lists set somewhere else, as another tab or another person
// would, through the stand-in's knob. The trigger's rules apply.
async function setElsewhere(
  id: string,
  lists: { allergens?: string[]; others?: string[]; checked?: boolean },
): Promise<void> {
  const query = new URLSearchParams({
    id,
    allergens: (lists.allergens ?? []).join(","),
    others: (lists.others ?? []).join(","),
    checked: lists.checked ? "1" : "0",
  });
  const response = await fetch(`${standin}/__test/set-allergens?${query}`);
  if (!response.ok) throw new Error(`set-allergens failed: ${response.status}`);
}

function reads(
  lists: { allergens: readonly string[]; others: string[] },
  checked: boolean,
): string {
  return dinersReadText(
    allergens,
    dinerSentence(
      en.allergens,
      {
        allergens: lists.allergens as (typeof US_MAJOR_ALLERGENS)[number][],
        others: lists.others,
      },
      checked,
    ),
  );
}

async function stampOf(id: string): Promise<string> {
  const stamped = await row(id);
  return fill(allergens.checkedByYou, {
    date: checkedOnDate(
      stamped.allergens_reviewed_at ?? "",
      await zone(),
      "en",
    ),
  });
}

// The sentence under the check follows the saved lists and the saved check
// (D-229): what diners read now, and the stamp.
async function expectSentence(
  page: Page,
  lists: { allergens: readonly string[]; others: string[] },
  stamp: string,
) {
  await expect(sentenceLine(page)).toHaveText(
    `${reads(lists, stamp.startsWith("Checked"))} ${stamp}`,
  );
}

test("a tick with the check kept lands checked with a fresh stamp in two statements; a tick with the check unticked lands unchecked in one; the check alone lands stamped in one; and a Save with nothing changed writes nothing and flashes", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const saved = { allergens: ["milk", "wheat"], others: ["celery"] };
  const withSesame = {
    allergens: ["milk", "wheat", "sesame"],
    others: ["celery"],
  };
  await openDish(page, "sizes");
  await expect(checkBox(page)).toBeChecked();
  const stampBefore = (await row(dishes.sizes.id)).allergens_reviewed_at;
  let sent = await writesSoFar();

  // D-148 in one save: the lists, then the check again, so the check stands
  // and the trigger stamps it afresh.
  await press(page, allergens.names.sesame);
  await expect(box(page, allergens.names.sesame)).toBeChecked();
  await expect(checkBox(page), "the check stays until Save").toBeChecked();
  await expectSentence(page, saved, await stampOf(dishes.sizes.id));
  expect(await writesSoFar(), "a tick sends nothing").toBe(sent);
  await save(page);
  expect(await writesSoFar(), "the lists, then the check").toBe(sent + 2);
  const checkedAgain = await row(dishes.sizes.id);
  expect(checkedAgain.allergens).toEqual(["milk", "wheat", "sesame"]);
  expect(checkedAgain.allergens_reviewed).toBe(true);
  expect(checkedAgain.allergens_reviewed_at).not.toBeNull();
  expect(checkedAgain.allergens_reviewed_at, "a fresh stamp").not.toBe(
    stampBefore,
  );
  await expect(box(page, allergens.names.sesame)).toBeChecked();
  await expect(checkBox(page)).toBeChecked();
  await expectSentence(page, withSesame, await stampOf(dishes.sizes.id));
  await expectNoMissingIds(page);

  // The tick undone with the check unticked: one statement, and the
  // trigger leaves the dish unchecked.
  sent = await writesSoFar();
  await press(page, allergens.names.sesame);
  await press(page, allergens.checkLabel);
  await expect(checkBox(page)).not.toBeChecked();
  await save(page);
  expect(await writesSoFar(), "the lists alone").toBe(sent + 1);
  const unchecked = await row(dishes.sizes.id);
  expect(unchecked.allergens).toEqual(["milk", "wheat"]);
  expect(unchecked.allergens_reviewed).toBe(false);
  expect(unchecked.allergens_reviewed_by).toBeNull();
  await expect(checkBox(page)).not.toBeChecked();
  await expectSentence(page, saved, allergens.notChecked);

  // The check alone: one statement, stamped by a person.
  sent = await writesSoFar();
  await press(page, allergens.checkLabel);
  await save(page);
  expect(await writesSoFar(), "the check alone").toBe(sent + 1);
  const checked = await row(dishes.sizes.id);
  expect(checked.allergens_reviewed).toBe(true);
  expect(checked.allergens_reviewed_at).not.toBeNull();
  await expect(checkBox(page)).toBeChecked();
  await expectSentence(page, saved, await stampOf(dishes.sizes.id));

  // Nothing changed: nothing written, and the flash still says saved.
  sent = await writesSoFar();
  await save(page);
  expect(await writesSoFar(), "nothing changed, nothing written").toBe(sent);
  await expectNoMissingIds(page);
});

test("the check saved reads checked by you with the date in the restaurant's time zone and holds after a reload, and the uncheck saved reads Not checked yet", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const none = { allergens: [], others: [] };
  await openDish(page, "market");
  await expect(checkBox(page)).not.toBeChecked();
  await expectSentence(page, none, allergens.notChecked);
  await press(page, allergens.checkLabel);
  await expect(checkBox(page)).toBeChecked();
  await expectSentence(page, none, allergens.notChecked);
  await save(page);
  const stamp = await stampOf(dishes.market.id);
  expect(stamp).toMatch(/^Checked by you on [A-Z][a-z]+ \d{1,2}, \d{4}\.$/);
  await expect(checkBox(page)).toBeChecked();
  await expectSentence(page, none, stamp);
  await expect(checkBox(page)).toHaveAccessibleDescription(
    `${allergens.checkHint} ${reads(none, true)} ${stamp}`,
  );
  await expectNoMissingIds(page);
  await reload(page);
  await expect(checkBox(page)).toBeChecked();
  await expectSentence(page, none, stamp);

  // As it was: unchecked by a person.
  await press(page, allergens.checkLabel);
  await save(page);
  await expect(checkBox(page)).not.toBeChecked();
  await expectSentence(page, none, allergens.notChecked);
  expect((await row(dishes.market.id)).allergens_reviewed_at).toBeNull();
});

test("a blank row added is dropped by Save: nothing is written, the flash arrives, and the row is gone", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  const sent = await writesSoFar();
  await addOther(page).click();
  await expect(otherField(page, 1)).toBeFocused();
  await expect
    .poll(() => said(page, fill(allergens.otherAdded, { position: 1 })))
    .toBe(1);
  await save(page);
  expect(await writesSoFar(), "a blank row is not a change").toBe(sent);
  await expect(otherField(page, 1)).toHaveCount(0);
  expect((await row(dishes.market.id)).custom_allergens).toEqual([]);
});

test("another allergen is added in the page only, a name that means one of the nine or runs long or holds a comma or repeats is refused unsent under its field on Save, a name that lands is kept, a rename and a remove land with Save", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  // A page error would replace the page with the owner error page, where
  // nothing below is found; it is named instead of hidden.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await openDish(page, "market");
  const before = await writesSoFar();

  await addOther(page).click();
  const first = otherField(page, 1);
  await expect(first, "the new row's field takes focus").toBeFocused();
  await expect
    .poll(() => said(page, fill(allergens.otherAdded, { position: 1 })))
    .toBe(1);
  const id = (await first.getAttribute("id")) ?? "";
  expect(await chromeName(page, id)).toBe(
    `${allergens.otherLabel} ${otherSuffix(allergens, 1)}`,
  );
  await expectNamedByOneLabel(
    page,
    id,
    `${allergens.otherLabel} ${otherSuffix(allergens, 1)}`,
    { visible: allergens.otherLabel },
  );
  expect(await writesSoFar(), "adding a row sends nothing").toBe(before);

  // Each refusal: one problem, so the field is focused with it, and
  // nothing is sent (Primer's rule, D-229).
  async function refused(name: string, message: string) {
    await first.fill(name);
    await saveButton(page).click();
    await expect(first, `${name}: the field is focused`).toBeFocused();
    await expect(first).toHaveAttribute("aria-invalid", "true");
    await expect(
      page
        .locator(`main ol[aria-label="${allergens.othersLabel}"] > li`)
        .first()
        .getByText(message, { exact: true }),
    ).toHaveCount(1);
    await expect(summary(page)).toHaveCount(0);
    expect(await writesSoFar(), `${name}: nothing is sent`).toBe(before);
  }
  await refused(
    "Milk",
    fill(allergens.errors.otherMajor, { allergen: allergens.names.milk }),
  );
  await refused("nuts", allergens.errors.otherMajorBoth);
  await refused("x".repeat(41), allergens.errors.otherLength);
  // A comma reads as two allergens to a diner (D-151): refused unsent, in
  // any of its three forms.
  for (const name of [
    "nuts, except almonds",
    "nuts， except almonds",
    "nuts、 except almonds",
  ]) {
    await refused(name, allergens.errors.otherComma);
  }

  await first.fill("celery");
  // The suggestion list matched the name and stays open while the field
  // has focus; while it is open React Aria hides the rest of the page from
  // assistive technology (D-143), so it is closed before Save is pressed.
  await page.keyboard.press("Escape");
  await save(page);
  expect(pageErrors, "no page error after the name landed").toEqual([]);
  expect(await writesSoFar()).toBe(before + 1);
  expect((await row(dishes.market.id)).custom_allergens).toEqual(["celery"]);
  await expect(otherField(page, 1)).toHaveValue("celery");
  await expect(otherButton(page, allergens.removeOther, "celery")).toHaveCount(
    1,
  );
  await expectNoMissingIds(page);

  // A repeat is refused unsent, under its own field.
  const sent = await writesSoFar();
  await addOther(page).click();
  const second = otherField(page, 2);
  await expect(second).toBeFocused();
  await second.fill("Celery");
  await page.keyboard.press("Escape");
  await saveButton(page).click();
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-invalid", "true");
  await expect(
    page
      .locator(`main ol[aria-label="${allergens.othersLabel}"] > li`)
      .nth(1)
      .getByText(fill(allergens.errors.otherTaken, { other: "celery" }), {
        exact: true,
      }),
  ).toHaveCount(1);
  expect(await writesSoFar(), "a repeat is not sent").toBe(sent);

  // The repeat's row removed on one press, said once, with focus on the
  // row before it; nothing is sent until Save.
  await otherButton(page, allergens.removeOther, "Celery").click();
  await expect
    .poll(() => said(page, fill(allergens.otherRemoved, { other: "Celery" })))
    .toBe(1);
  await expect(otherField(page, 2)).toHaveCount(0);
  expect(await writesSoFar(), "a row removed sends nothing").toBe(sent);

  // A rename lands with Save.
  await otherField(page, 1).fill("mustard");
  await page.keyboard.press("Escape");
  await save(page);
  expect((await row(dishes.market.id)).custom_allergens).toEqual(["mustard"]);
  await expect(otherField(page, 1)).toHaveValue("mustard");

  // A remove goes on one press in the page (D-221) and lands with Save,
  // leaving the stand-in as it was.
  await otherButton(page, allergens.removeOther, "mustard").click();
  await expect
    .poll(() => said(page, fill(allergens.otherRemoved, { other: "mustard" })))
    .toBe(1);
  await expect(otherField(page, 1)).toHaveCount(0);
  await expect(
    addOther(page),
    "focus goes to Add another allergen",
  ).toBeFocused();
  await save(page);
  expect((await row(dishes.market.id)).custom_allergens).toEqual([]);
  expect((await row(dishes.market.id)).allergens_reviewed).toBe(false);
  await expectNoMissingIds(page);
});

test("Apply gives the same-named dish this list and the check, stamped, and moves focus to the check box", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  const other = (await items()).find(
    (each) =>
      each.id !== dishes.sizes.id &&
      each.name.trim().toLowerCase() === dishes.sizes.name.trim().toLowerCase(),
  );
  if (!other) throw new Error("the stand-in has no second Soup of the day");
  expect(other.allergens_reviewed).toBe(false);
  const apply = applyButton(page, dishes.sizes.name);
  await expect(apply).toHaveCount(1);
  await apply.click();
  await expect
    .poll(
      async () =>
        (await heard(page)).filter((each) => each.startsWith("Applied. "))
          .length,
    )
    .toBe(1);
  const applied = await row(other.id);
  expect(applied.allergens).toEqual(["milk", "wheat"]);
  expect(applied.custom_allergens).toEqual(["celery"]);
  expect(applied.allergens_reviewed).toBe(true);
  expect(applied.allergens_reviewed_by).toBe(
    (await row(dishes.sizes.id)).allergens_reviewed_by,
  );
  await expect(checkBox(page), "focus moves to the check box").toBeFocused();
  await expect(
    page.locator("main p").filter({ hasText: /^Applied\. / }),
    "the result shows as a plain line",
  ).toHaveCount(1);
  await expectNoMissingIds(page);

  // As it was: the other dish cleared elsewhere, so the line is back on a
  // reload.
  await setElsewhere(other.id, {});
  const back = await row(other.id);
  expect(back.allergens).toEqual([]);
  expect(back.custom_allergens).toEqual([]);
  expect(back.allergens_reviewed).toBe(false);
  await reload(page);
  await expect(
    applyButton(page, dishes.sizes.name),
    "the line is back",
  ).toHaveCount(1);
});

test("a list that moved under the page from another tab refuses Save with one sentence in the summary, keeps the values, changes nothing on the server, and a reload shows the lists as they are now", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  // A second tab, as another person's would be: its own context, signed in
  // as the same owner, at the same address.
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  const other = await context.newPage();
  await other.goto(`${origin}${dishPath("market")}`);
  await other.waitForLoadState("networkidle");
  try {
    await press(other, allergens.names.wheat);
    await saveAndLand(other, allergens.submit, allergens.saved);
    expect((await row(dishes.market.id)).allergens).toEqual(["wheat"]);
    const sent = await writesSoFar();

    await press(page, allergens.names.milk);
    await saveAndFail(page, allergens.submit, allergens.listsMoved);
    await expect(
      box(page, allergens.names.milk),
      "the tick is kept",
    ).toBeChecked();
    await expect(
      box(page, allergens.names.wheat),
      "the page still shows the lists it loaded",
    ).not.toBeChecked();
    expect(
      await writesSoFar(),
      "one statement, refused by its condition, and no second",
    ).toBe(sent + 1);
    expect((await row(dishes.market.id)).allergens).toEqual(["wheat"]);
    await expectNoMissingIds(page);

    // A second press fails the same way until the page is reloaded.
    await saveAndFail(page, allergens.submit, allergens.listsMoved);
    expect(await writesSoFar()).toBe(sent + 2);

    await reload(page);
    await expect(
      box(page, allergens.names.wheat),
      "the page shows the list as it is now",
    ).toBeChecked();
    await expect(box(page, allergens.names.milk)).not.toBeChecked();

    // As it was, from the page that is now current.
    await press(page, allergens.names.wheat);
    await save(page);
    expect((await row(dishes.market.id)).allergens).toEqual([]);
  } finally {
    await context.close();
  }
});

test("Apply refuses when this dish's lists or the other dish's lists are not the ones the page showed, and applies nothing", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  const other = (await items()).find(
    (each) =>
      each.id !== dishes.sizes.id &&
      each.name.trim().toLowerCase() === dishes.sizes.name.trim().toLowerCase(),
  );
  if (!other) throw new Error("the stand-in has no second Soup of the day");

  // This dish changed elsewhere, and was checked again there.
  await setElsewhere(dishes.sizes.id, {
    allergens: ["milk", "wheat", "sesame"],
    others: ["celery"],
  });
  await setElsewhere(dishes.sizes.id, {
    allergens: ["milk", "wheat", "sesame"],
    others: ["celery"],
    checked: true,
  });
  await applyButton(page, dishes.sizes.name).click();
  await expect
    .poll(() => said(page, allergens.sameNamed.errors.sourceChanged))
    .toBe(1);
  expect((await row(other.id)).allergens_reviewed, "nothing was applied").toBe(
    false,
  );
  await expectNoMissingIds(page);

  // The other dish changed elsewhere.
  await reload(page);
  await setElsewhere(other.id, { allergens: ["sesame"] });
  await applyButton(page, dishes.sizes.name).click();
  await expect
    .poll(
      async () =>
        (await heard(page)).filter((each) =>
          each.endsWith(" Open its page to see it."),
        ).length,
    )
    .toBe(1);
  const untouched = await row(other.id);
  expect(untouched.allergens).toEqual(["sesame"]);
  expect(untouched.allergens_reviewed).toBe(false);

  // As it was.
  await setElsewhere(other.id, {});
  await setElsewhere(dishes.sizes.id, {
    allergens: ["milk", "wheat"],
    others: ["celery"],
  });
  await setElsewhere(dishes.sizes.id, {
    allergens: ["milk", "wheat"],
    others: ["celery"],
    checked: true,
  });
  await reload(page);
  await expect(checkBox(page)).toBeChecked();
  await expect(applyButton(page, dishes.sizes.name)).toHaveCount(1);
});

test("a save the server refuses is kept with the failure in the summary, focused, and the next press lands it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await fetch(`${standin}/__test/fail?times=1`);
  await press(page, allergens.names.milk);
  const failure = `${fill(allergens.notSaved.allergens, { dish: dishes.market.name })} ${editing.problems.failed}`;
  await saveAndFail(page, allergens.submit, failure);
  await expect(
    box(page, allergens.names.milk),
    "the tick is kept",
  ).toBeChecked();
  await expect(box(page, allergens.names.milk)).not.toHaveAttribute(
    "aria-invalid",
  );
  expect((await row(dishes.market.id)).allergens).toEqual([]);
  await expectNoMissingIds(page);

  await save(page);
  await expect(box(page, allergens.names.milk)).toBeChecked();
  expect((await row(dishes.market.id)).allergens).toEqual(["milk"]);

  // As it was.
  await press(page, allergens.names.milk);
  await save(page);
  expect((await row(dishes.market.id)).allergens).toEqual([]);
});
