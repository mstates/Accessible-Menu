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
import { restaurantDishPath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { chromeName } from "./chrome-name";

// The allergen group on a dish's page with saves that land for real against
// the stand-in (D-148, D-129): a tick and the check, each said once and
// kept after a reload; the check's stamp line with its date; a change that
// clears a check and says so; the other-allergen rows, their refusals
// unsent, and their Undo; the apply to a same-named dish and its Undo; a
// page whose lists moved under it, from another tab, refused with one
// sentence and no Try again; and a failed save with Try again. The gate
// cannot land a save, so this runs here. Each check leaves the stand-in as
// it found it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const allergens = strings.allergens;
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

function status(page: Page) {
  return page.locator('main [role="status"]');
}

function tryAgainButton(page: Page) {
  return page.getByRole("button", { name: editing.tryAgain, exact: true });
}

function undoButton(page: Page, label: string | RegExp) {
  return page.getByRole("button", { name: label, exact: true });
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

test("a tick says Saved. once and holds after a reload, and on a checked dish it clears the check, says so, and Undo leaves the dish unchecked", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await press(page, allergens.names.milk);
  await expect(box(page, allergens.names.milk)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  expect(await said(page, allergens.clearedNow), "nothing to clear").toBe(0);
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk"], others: [] }, false)} ${allergens.notChecked}`,
  );
  await reload(page);
  await expect(box(page, allergens.names.milk)).toBeChecked();
  await expectNoMissingIds(page);
  // As it was.
  await press(page, allergens.names.milk);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(box(page, allergens.names.milk)).not.toBeChecked();

  await openDish(page, "sizes");
  await expect(checkBox(page)).toBeChecked();
  await press(page, allergens.names.sesame);
  await expect(box(page, allergens.names.sesame)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect.poll(() => said(page, allergens.clearedNow)).toBe(1);
  await expect(checkBox(page), "the check is cleared").not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk", "wheat", "sesame"], others: ["celery"] }, false)} ${allergens.cleared}`,
  );
  expect((await row(dishes.sizes.id)).allergens_reviewed_by).toBeNull();
  await expectNoMissingIds(page);

  await undoButton(
    page,
    fill(allergens.undo.ticked, {
      allergen: allergens.names.sesame,
      dish: dishes.sizes.name,
    }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(allergens.undo.tickedBack, { allergen: allergens.names.sesame }),
      ),
    )
    .toBe(1);
  await expect(box(page, allergens.names.sesame)).not.toBeChecked();
  await expect(
    checkBox(page),
    "Undo puts the list back and never makes a check",
  ).not.toBeChecked();
  await expectNoMissingIds(page);

  // As it was: checked again, by a person.
  await press(page, allergens.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(checkBox(page)).toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk", "wheat"], others: ["celery"] }, true)} ${await stampOf(dishes.sizes.id)}`,
  );
});

test("the check says Saved. once, reads checked by you with the date in the restaurant's time zone, holds after a reload, and Undo unchecks", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await expect(checkBox(page)).not.toBeChecked();
  await press(page, allergens.checkLabel);
  await expect(checkBox(page)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  const stamp = await stampOf(dishes.market.id);
  expect(stamp).toMatch(/^Checked by you on [A-Z][a-z]+ \d{1,2}, \d{4}\.$/);
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: [], others: [] }, true)} ${stamp}`,
  );
  await expect(checkBox(page)).toHaveAccessibleDescription(
    `${allergens.checkHint} ${reads({ allergens: [], others: [] }, true)} ${stamp}`,
  );
  await expectNoMissingIds(page);
  await reload(page);
  await expect(checkBox(page)).toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: [], others: [] }, true)} ${stamp}`,
  );

  await undoButton(
    page,
    fill(allergens.undo.checked, { dish: dishes.market.name }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(allergens.undo.checkedBack, { dish: dishes.market.name }),
      ),
    )
    .toBe(1);
  await expect(checkBox(page)).not.toBeChecked();
  await reload(page);
  await expect(checkBox(page)).not.toBeChecked();
  expect((await row(dishes.market.id)).allergens_reviewed_at).toBeNull();
});

test("a deliberate uncheck says Saved. alone and an Undo of a check says its own sentence alone, each leaving Not checked yet. as a reload shows it, while a tick that clears a check still says so", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const none = { allergens: [], others: [] };
  await openDish(page, "market");
  await expect(checkBox(page)).not.toBeChecked();

  // A deliberate uncheck says "Saved." alone, and the stamp reads as a
  // reload shows it (Q-66).
  await press(page, allergens.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(checkBox(page)).toBeChecked();
  await press(page, allergens.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(2);
  expect(
    await said(page, allergens.clearedNow),
    "an uncheck says Saved. alone",
  ).toBe(0);
  await expect(checkBox(page)).not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads(none, false)} ${allergens.notChecked}`,
  );
  await reload(page);
  await expect(sentenceLine(page)).toHaveText(
    `${reads(none, false)} ${allergens.notChecked}`,
  );

  // An Undo of a check says its own sentence alone, with the same stamp.
  await press(page, allergens.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(1);
  await undoButton(
    page,
    fill(allergens.undo.checked, { dish: dishes.market.name }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(allergens.undo.checkedBack, { dish: dishes.market.name }),
      ),
    )
    .toBe(1);
  expect(
    await said(page, allergens.clearedNow),
    "an Undo of a check says its own sentence alone",
  ).toBe(0);
  await expect(checkBox(page)).not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads(none, false)} ${allergens.notChecked}`,
  );
  await reload(page);
  await expect(sentenceLine(page)).toHaveText(
    `${reads(none, false)} ${allergens.notChecked}`,
  );

  // A tick that clears a check still says so, and the stamp says why.
  await press(page, allergens.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(1);
  await press(page, allergens.names.milk);
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect.poll(() => said(page, allergens.clearedNow)).toBe(1);
  await expect(checkBox(page)).not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk"], others: [] }, false)} ${allergens.cleared}`,
  );
  await expectNoMissingIds(page);

  // As it was: no allergens, not checked.
  await press(page, allergens.names.milk);
  await expect.poll(() => said(page, saved)).toBe(3);
  const back = await row(dishes.market.id);
  expect(back.allergens).toEqual([]);
  expect(back.allergens_reviewed).toBe(false);
});

test("another allergen is added in the page only, a name that means one of the nine or runs long or holds a comma or repeats is refused unsent, a name that lands clears the check, and a rename and a remove are undone", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  // A page error would replace the page with the owner error page, where
  // nothing below is found; it is named instead of hidden.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await openDish(page, "market");
  await press(page, allergens.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(1);
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
  expect(await writesSoFar(), "adding a row sends nothing").toBe(before);

  await page.keyboard.type("Milk");
  await page.keyboard.press("Enter");
  const majorFailure = `${fill(allergens.notSaved.other, { other: fill(allergens.unnamedOther, { position: 1 }) })} ${fill(allergens.errors.otherMajor, { allergen: allergens.names.milk })}`;
  await expect(status(page)).toHaveText(majorFailure);
  await expect(first).toHaveAttribute("aria-invalid", "true");
  expect(
    await writesSoFar(),
    "a name that means one of the nine is not sent",
  ).toBe(before);

  await first.fill("nuts");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(allergens.notSaved.other, { other: fill(allergens.unnamedOther, { position: 1 }) })} ${allergens.errors.otherMajorBoth}`,
  );
  expect(await writesSoFar()).toBe(before);

  await first.fill("x".repeat(41));
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(allergens.notSaved.other, { other: fill(allergens.unnamedOther, { position: 1 }) })} ${allergens.errors.otherLength}`,
  );
  expect(await writesSoFar()).toBe(before);

  // A comma reads as two allergens to a diner (D-151): refused unsent, in
  // any of its three forms.
  for (const name of [
    "nuts, except almonds",
    "nuts\uFF0C except almonds",
    "nuts\u3001 except almonds",
  ]) {
    await first.fill(name);
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText(
      `${fill(allergens.notSaved.other, { other: fill(allergens.unnamedOther, { position: 1 }) })} ${allergens.errors.otherComma}`,
    );
    expect(await writesSoFar(), `a comma is not sent: ${name}`).toBe(before);
  }

  await first.fill("celery");
  await page.keyboard.press("Enter");
  // The suggestion list matched the name and stays open while the field
  // has focus; while it is open React Aria hides the rest of the page from
  // assistive technology (D-143), so it is closed before anything else is
  // looked at, as an owner's next Tab would close it.
  await page.keyboard.press("Escape");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect.poll(() => said(page, allergens.clearedNow)).toBe(1);
  expect(pageErrors, "no page error after the name landed").toEqual([]);
  await expect(
    checkBox(page),
    "a name that lands clears the check",
  ).not.toBeChecked();
  expect((await row(dishes.market.id)).custom_allergens).toEqual(["celery"]);
  await expect(otherButton(page, allergens.removeOther, "celery")).toHaveCount(
    1,
  );
  await expectNoMissingIds(page);

  await addOther(page).click();
  const second = otherField(page, 2);
  await expect(second).toBeFocused();
  await page.keyboard.type("Celery");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(allergens.notSaved.other, { other: fill(allergens.unnamedOther, { position: 2 }) })} ${fill(allergens.errors.otherTaken, { other: "celery" })}`,
  );
  const sent = await writesSoFar();
  await otherButton(
    page,
    allergens.removeOther,
    fill(allergens.unnamedOther, { position: 2 }),
  ).click();
  await expect
    .poll(() => said(page, fill(allergens.blankRemoved, { position: 2 })))
    .toBe(1);
  await expect(otherField(page, 2)).toHaveCount(0);
  expect(await writesSoFar(), "a blank row removed sends nothing").toBe(sent);

  await first.fill("mustard");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  // Removing the failed blank row already ended its failure, and "All
  // changes saved." followed it (D-125), so the rename's landing says
  // "Saved.", the second on this page.
  await expect.poll(() => said(page, editing.savedAgain)).toBe(2);
  await expect.poll(() => said(page, saved)).toBe(2);
  expect((await row(dishes.market.id)).custom_allergens).toEqual(["mustard"]);
  await undoButton(
    page,
    fill(allergens.undo.otherRenamed, { from: "celery", to: "mustard" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(allergens.undo.otherRenamedBack, { from: "celery" })),
    )
    .toBe(1);
  await expect(first).toHaveValue("celery");

  await otherButton(page, allergens.removeOther, "celery").click();
  await expect
    .poll(() => said(page, fill(allergens.otherRemoved, { other: "celery" })))
    .toBe(1);
  await expect(otherField(page, 1)).toHaveCount(0);
  await expect(
    addOther(page),
    "focus goes to Add another allergen",
  ).toBeFocused();
  await undoButton(
    page,
    fill(allergens.undo.otherRemoved, { other: "celery" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(allergens.undo.otherRemovedBack, { other: "celery" })),
    )
    .toBe(1);
  await expect(otherField(page, 1)).toHaveValue("celery");
  await expectNoMissingIds(page);

  // As it was.
  await otherButton(page, allergens.removeOther, "celery").click();
  await expect
    .poll(() => said(page, fill(allergens.otherRemoved, { other: "celery" })))
    .toBe(2);
  await expect(otherField(page, 1)).toHaveCount(0);
  // The remove is said and shown as it is queued; the row holds it once
  // the write lands.
  await expect
    .poll(async () => (await row(dishes.market.id)).custom_allergens)
    .toEqual([]);
  expect((await row(dishes.market.id)).allergens_reviewed).toBe(false);
});

test("Apply gives the same-named dish this list and the check, stamped, moves focus to the check box, and Undo puts that dish back as it was", async ({
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
  await expect(apply, "the line goes").toHaveCount(0);
  await expect(checkBox(page), "focus moves to the check box").toBeFocused();
  await expectNoMissingIds(page);

  const undoPrefix = fill(
    allergens.sameNamed.undo.applied.split(" in ")[0] ?? "",
    { dish: dishes.sizes.name },
  );
  await undoButton(page, new RegExp(`^${escape(undoPrefix)} in `)).click();
  await expect
    .poll(
      async () =>
        (await heard(page)).filter(
          (each) =>
            each.startsWith("Undone. ") && each.endsWith(" is as it was."),
        ).length,
    )
    .toBe(1);
  const back = await row(other.id);
  expect(back.allergens).toEqual([]);
  expect(back.custom_allergens).toEqual([]);
  expect(back.allergens_reviewed).toBe(false);
  await expect(
    applyButton(page, dishes.sizes.name),
    "the line is back",
  ).toHaveCount(1);
});

test("a list that moved under the page from another tab refuses a tick and a check with one sentence and no Try again, and the page then shows the lists as they are now", async ({
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
  await hearLog(other);
  try {
    await press(other, allergens.names.wheat);
    await expect.poll(() => said(other, saved)).toBe(1);

    await press(page, allergens.names.milk);
    await expect.poll(() => said(page, allergens.listsMoved)).toBe(1);
    await expect(status(page)).toHaveText(allergens.listsMoved);
    await expect(tryAgainButton(page), "no Try again").toHaveCount(0);
    await expect(
      box(page, allergens.names.milk),
      "nothing was written",
    ).not.toBeChecked();
    await expect(
      box(page, allergens.names.wheat),
      "the page shows the list as it is now",
    ).toBeChecked();
    expect((await row(dishes.market.id)).allergens).toEqual(["wheat"]);
    await expectNoMissingIds(page);

    await press(other, allergens.names.sesame);
    await expect.poll(() => said(other, saved)).toBe(2);
    await press(page, allergens.checkLabel);
    await expect.poll(() => said(page, allergens.listsChanged)).toBe(1);
    await expect(tryAgainButton(page)).toHaveCount(0);
    await expect(checkBox(page), "nothing is checked").not.toBeChecked();
    await expect(box(page, allergens.names.sesame)).toBeChecked();
    expect((await row(dishes.market.id)).allergens_reviewed).toBe(false);
    await expectNoMissingIds(page);

    // As it was, from the page that is now current.
    await press(page, allergens.names.wheat);
    await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
    await press(page, allergens.names.sesame);
    await expect.poll(() => said(page, saved)).toBe(1);
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
  await expect(
    box(page, allergens.names.sesame),
    "the page shows this dish as it is now",
  ).toBeChecked();
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

test("a tick the server refuses is said once with Try again, and Try again lands it with All changes saved.", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await fetch(`${standin}/__test/fail?times=1`);
  await press(page, allergens.names.milk);
  const failure = `${fill(allergens.notSaved.allergens, { dish: dishes.market.name })} ${editing.problems.failed}`;
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(status(page)).toHaveText(failure);
  await expect(box(page, allergens.names.milk)).not.toBeChecked();
  await expect(box(page, allergens.names.milk)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(tryAgainButton(page)).toHaveCount(1);
  await tryAgainButton(page).click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  expect(
    await said(page, saved),
    "the save that ends a failure says only that",
  ).toBe(0);
  await expect(box(page, allergens.names.milk)).toBeChecked();
  await expect(box(page, allergens.names.milk)).not.toHaveAttribute(
    "aria-invalid",
  );
  await expectNoMissingIds(page);

  // As it was.
  await press(page, allergens.names.milk);
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row(dishes.market.id)).allergens).toEqual([]);
});
