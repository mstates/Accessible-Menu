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
import {
  lineAllergenStrings,
  lineLead,
} from "../../src/features/owner/line/line-words";
import { restaurantSectionPath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// The allergen group of a section's line shown with every dish, with saves
// that land for real against the stand-in (D-152, D-153): the group that
// appears once the line is saved and goes once it is cleared, taking its
// list with it, with Undo bringing both back unchecked; a tick and the
// check, each said once and kept after a reload; a change to the words
// that clears the check and says so; the other-allergen rows, their
// refusals unsent, a comma in each of its forms among them (D-151), and
// their Undo; a page whose line or lists moved under it, from another tab,
// refused with one sentence and no Try again, a check pressed at once
// after new words among them (Michael, at approval); a failed save with
// Try again; and a line whose words hold every awkward character the
// compare-and-set has to carry. The gate cannot land a save, so this runs
// here. Each check leaves the stand-in as it found it, so the checks run in
// any order.

const { code } = ownerEnv();
const dishes = en.owner.dishes;
const lineCopy = dishes.line;
const sectionsCopy = en.owner.sections;
const line = lineAllergenStrings(en.owner.dish.allergens, lineCopy);
const editing = en.owner.editing;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// CI Diner's line on the section with dishes, as the stand-in seeds it.
const STARTERS_LINE = "Add a buttered roll to any dish for 2 dollars.";

type Which = "withDishes" | "emptySection";

function sectionPath(which: Which): string {
  return restaurantSectionPath(code, ownerFixture()[which].id);
}

async function openSection(page: Page, which: Which): Promise<void> {
  await page.goto(sectionPath(which));
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
  return box(page, line.checkLabel);
}

// Ticks a box by its visible words: React Aria keeps the input under the
// label, where a pointer cannot reach it directly.
async function press(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
}

function lineField(page: Page) {
  return page.getByRole("textbox", {
    name: dishes.section.everyItemLabel,
    exact: true,
  });
}

function groupHeading(page: Page) {
  return page
    .locator("main")
    .getByRole("heading", { level: 2, name: line.heading });
}

function sentenceLine(page: Page) {
  return page.locator("#line-allergen-sentence");
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
    name: `${line.otherLabel} ${otherSuffix(line, position)}`,
    exact: true,
  });
}

function otherButton(page: Page, action: string, label: string) {
  return page.getByRole("button", {
    name: otherAction(line, action, label),
    exact: true,
  });
}

function addOther(page: Page) {
  return page.getByRole("button", { name: line.addOther, exact: true });
}

// Saves the line's words from its field, with Enter.
async function saveWords(page: Page, words: string): Promise<void> {
  const field = lineField(page);
  await field.fill(words);
  await page.keyboard.press("Enter");
}

type Row = {
  id: string;
  name: string;
  every_item: string | null;
  every_item_allergens: string[];
  every_item_custom_allergens: string[];
  every_item_allergens_reviewed: boolean;
  every_item_allergens_reviewed_by: string | null;
  every_item_allergens_reviewed_at: string | null;
};

async function row(id: string): Promise<Row> {
  const response = await fetch(`${standin}/__test/sections`);
  const found = ((await response.json()) as Row[]).find(
    (each) => each.id === id,
  );
  if (!found) throw new Error(`the stand-in has no section ${id}`);
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

// A section's line set somewhere else, as another tab or another person
// would, through the stand-in's knob. The trigger's rules apply.
async function setLineElsewhere(
  id: string,
  state: {
    words: string;
    allergens?: string[];
    others?: string[];
    checked?: boolean;
  },
): Promise<void> {
  const query = new URLSearchParams({
    id,
    words: state.words,
    allergens: (state.allergens ?? []).join(","),
    others: (state.others ?? []).join(","),
    checked: state.checked ? "1" : "0",
  });
  const response = await fetch(`${standin}/__test/set-line?${query}`);
  if (!response.ok) throw new Error(`set-line failed: ${response.status}`);
}

function reads(
  lists: { allergens: readonly string[]; others: string[] },
  checked: boolean,
): string {
  return dinersReadText(
    line,
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
  return fill(line.checkedByYou, {
    date: checkedOnDate(
      stamped.every_item_allergens_reviewed_at ?? "",
      await zone(),
      "en",
    ),
  });
}

const forSection = (template: string, section: string) =>
  fill(template, { section });

test("a section with no line shows no group; words saved with Enter say Saved. once and the group appears unchecked; clearing the line takes its list, says so, sends focus back to the field, and Undo brings the words and the list back, unchecked", async ({
  page,
}) => {
  const { emptySection } = ownerFixture();
  await openSection(page, "emptySection");
  await expect(groupHeading(page), "no line, no group").toHaveCount(0);
  await expect(checkBox(page)).toHaveCount(0);

  const words = "Add a side salad to any dish for 3 dollars.";
  await saveWords(page, words);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(groupHeading(page), "the group appears once saved").toHaveCount(
    1,
  );
  await expect(
    page.locator("main").getByText(lineLead(lineCopy, words), { exact: true }),
  ).toHaveCount(1);
  await expect(checkBox(page)).not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: [], others: [] }, false)} ${line.notChecked}`,
  );
  await expect(lineField(page), "focus stays in the field").toBeFocused();
  expect((await row(emptySection.id)).every_item).toBe(words);
  await expectNoMissingIds(page);

  await press(page, line.names.milk);
  await expect.poll(() => said(page, saved)).toBe(2);
  expect((await row(emptySection.id)).every_item_allergens).toEqual(["milk"]);
  await press(page, line.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(3);
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk"], others: [] }, true)} ${await stampOf(emptySection.id)}`,
  );

  // The line cleared and left with Tab: focus moves into the group, the
  // save lands, the group goes with the list, and focus comes back to the
  // field.
  await lineField(page).fill("");
  await page.keyboard.press("Tab");
  await expect.poll(() => said(page, saved)).toBe(4);
  await expect.poll(() => said(page, lineCopy.wentWithIt)).toBe(1);
  await expect(groupHeading(page), "the group goes").toHaveCount(0);
  await expect(lineField(page), "focus is back in the field").toBeFocused();
  const cleared = await row(emptySection.id);
  expect(cleared.every_item).toBeNull();
  expect(cleared.every_item_allergens).toEqual([]);
  expect(cleared.every_item_allergens_reviewed).toBe(false);
  await expectNoMissingIds(page);

  await undoButton(
    page,
    forSection(sectionsCopy.undo.everyItem, emptySection.name),
  ).click();
  await expect
    .poll(() =>
      said(page, forSection(lineCopy.undo.wordsRestored, emptySection.name)),
    )
    .toBe(1);
  await expect(lineField(page)).toHaveValue(words);
  await expect(groupHeading(page), "the group is back").toHaveCount(1);
  await expect(box(page, line.names.milk)).toBeChecked();
  await expect(
    checkBox(page),
    "Undo brings the list back and never makes a check",
  ).not.toBeChecked();
  const restored = await row(emptySection.id);
  expect(restored.every_item).toBe(words);
  expect(restored.every_item_allergens).toEqual(["milk"]);
  expect(restored.every_item_allergens_reviewed).toBe(false);
  await expectNoMissingIds(page);

  // As it was: no line.
  await saveWords(page, "");
  await expect.poll(() => said(page, saved)).toBe(5);
  await expect(groupHeading(page)).toHaveCount(0);
  expect((await row(emptySection.id)).every_item).toBeNull();
});

test("a tick says Saved. once and holds after a reload, clears the check on the checked line and says so, Undo leaves it unchecked, the check reads checked by you with the date, and a change to the words clears the check again", async ({
  page,
}) => {
  const { withDishes } = ownerFixture();
  await openSection(page, "withDishes");
  await expect(checkBox(page)).toBeChecked();
  await press(page, line.names.sesame);
  await expect(box(page, line.names.sesame)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect.poll(() => said(page, line.clearedNow)).toBe(1);
  await expect(checkBox(page), "the check is cleared").not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk", "wheat", "sesame"], others: [] }, false)} ${line.cleared}`,
  );
  expect(
    (await row(withDishes.id)).every_item_allergens_reviewed_by,
  ).toBeNull();
  await reload(page);
  await expect(box(page, line.names.sesame)).toBeChecked();
  await expect(checkBox(page)).not.toBeChecked();
  await expectNoMissingIds(page);

  await undoButton(
    page,
    fill(line.undo.ticked, {
      allergen: line.names.sesame,
      section: withDishes.name,
    }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(line.undo.tickedBack, { allergen: line.names.sesame })),
    )
    .toBe(1);
  await expect(box(page, line.names.sesame)).not.toBeChecked();
  await expect(
    checkBox(page),
    "Undo puts the list back and never makes a check",
  ).not.toBeChecked();

  await press(page, line.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(checkBox(page)).toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk", "wheat"], others: [] }, true)} ${await stampOf(withDishes.id)}`,
  );
  await reload(page);
  await expect(checkBox(page)).toBeChecked();

  // A change to the words clears the check (D-152), said after "Saved.".
  const changed = "Add a buttered roll to any dish for 3 dollars.";
  await saveWords(page, changed);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect.poll(() => said(page, line.clearedNow)).toBe(1);
  await expect(checkBox(page)).not.toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk", "wheat"], others: [] }, false)} ${line.cleared}`,
  );
  await expect(
    page
      .locator("main")
      .getByText(lineLead(lineCopy, changed), { exact: true }),
    "the lead quotes the words the server holds",
  ).toHaveCount(1);
  const after = await row(withDishes.id);
  expect(after.every_item).toBe(changed);
  expect(after.every_item_allergens_reviewed).toBe(false);
  await expectNoMissingIds(page);

  await undoButton(
    page,
    forSection(sectionsCopy.undo.everyItem, withDishes.name),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        `${forSection(sectionsCopy.undo.everyItemBack, withDishes.name)} ${line.clearedNow}`,
      ),
    )
    .toBe(1);
  await expect(lineField(page)).toHaveValue(STARTERS_LINE);
  await expect(checkBox(page), "Undo never makes a check").not.toBeChecked();

  // As it was: checked again, by a person.
  await press(page, line.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(2);
  const back = await row(withDishes.id);
  expect(back.every_item).toBe(STARTERS_LINE);
  expect(back.every_item_allergens_reviewed).toBe(true);
});

test("another allergen on the line is refused unsent as holding a comma in any of its forms, as one of the nine, as too long, or as a repeat; a name that lands clears the check; and a rename and a remove are undone", async ({
  page,
}) => {
  const { withDishes } = ownerFixture();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await openSection(page, "withDishes");
  const before = await writesSoFar();

  await addOther(page).click();
  const first = otherField(page, 1);
  await expect(first, "the new row's field takes focus").toBeFocused();
  await expect
    .poll(() => said(page, fill(line.otherAdded, { position: 1 })))
    .toBe(1);
  expect(await writesSoFar(), "adding a row sends nothing").toBe(before);

  const refused = (problem: string) =>
    `${fill(line.notSaved.other, { other: fill(line.unnamedOther, { position: 1 }) })} ${problem}`;
  for (const name of [
    "nuts, except almonds",
    "nuts， except almonds",
    "nuts、 except almonds",
  ]) {
    await first.fill(name);
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText(refused(line.errors.otherComma));
    await expect(first).toHaveAttribute("aria-invalid", "true");
    expect(await writesSoFar(), `a comma is not sent: ${name}`).toBe(before);
  }

  await first.fill("Milk");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    refused(fill(line.errors.otherMajor, { allergen: line.names.milk })),
  );
  expect(await writesSoFar()).toBe(before);

  await first.fill("x".repeat(41));
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(refused(line.errors.otherLength));
  expect(await writesSoFar()).toBe(before);

  await first.fill("celery");
  await page.keyboard.press("Enter");
  // The suggestion list matched the name and stays open while the field
  // has focus; it is closed before anything else is looked at.
  await page.keyboard.press("Escape");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect.poll(() => said(page, line.clearedNow)).toBe(1);
  expect(pageErrors, "no page error after the name landed").toEqual([]);
  await expect(
    checkBox(page),
    "a name that lands clears the check",
  ).not.toBeChecked();
  expect((await row(withDishes.id)).every_item_custom_allergens).toEqual([
    "celery",
  ]);
  await expect(otherButton(page, line.removeOther, "celery")).toHaveCount(1);
  await expectNoMissingIds(page);

  await addOther(page).click();
  const second = otherField(page, 2);
  await expect(second).toBeFocused();
  await page.keyboard.type("Celery");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(line.notSaved.other, { other: fill(line.unnamedOther, { position: 2 }) })} ${fill(line.errors.otherTaken, { other: "celery" })}`,
  );
  const sent = await writesSoFar();
  await otherButton(
    page,
    line.removeOther,
    fill(line.unnamedOther, { position: 2 }),
  ).click();
  await expect
    .poll(() => said(page, fill(line.blankRemoved, { position: 2 })))
    .toBe(1);
  await expect(otherField(page, 2)).toHaveCount(0);
  expect(await writesSoFar(), "a blank row removed sends nothing").toBe(sent);

  await first.fill("mustard");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  // Removing the failed blank row already ended its failure, and "All
  // changes saved." followed it (D-125), so the rename's landing says
  // "Saved.", the first on this page.
  await expect.poll(() => said(page, editing.savedAgain)).toBe(2);
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row(withDishes.id)).every_item_custom_allergens).toEqual([
    "mustard",
  ]);
  await undoButton(
    page,
    fill(line.undo.otherRenamed, { from: "celery", to: "mustard" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(line.undo.otherRenamedBack, { from: "celery" })),
    )
    .toBe(1);
  await expect(first).toHaveValue("celery");

  await otherButton(page, line.removeOther, "celery").click();
  await expect
    .poll(() => said(page, fill(line.otherRemoved, { other: "celery" })))
    .toBe(1);
  await expect(otherField(page, 1)).toHaveCount(0);
  await expect(
    addOther(page),
    "focus goes to Add another allergen",
  ).toBeFocused();
  await undoButton(
    page,
    fill(line.undo.otherRemoved, { other: "celery" }),
  ).click();
  await expect
    .poll(() =>
      said(page, fill(line.undo.otherRemovedBack, { other: "celery" })),
    )
    .toBe(1);
  await expect(otherField(page, 1)).toHaveValue("celery");
  await expectNoMissingIds(page);

  // As it was: no other allergen, checked again by a person.
  await otherButton(page, line.removeOther, "celery").click();
  await expect
    .poll(() => said(page, fill(line.otherRemoved, { other: "celery" })))
    .toBe(2);
  await expect(otherField(page, 1)).toHaveCount(0);
  await expect
    .poll(async () => (await row(withDishes.id)).every_item_custom_allergens)
    .toEqual([]);
  await press(page, line.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(2);
  expect((await row(withDishes.id)).every_item_allergens_reviewed).toBe(true);
});

test("a line that moved under the page from another tab refuses a tick and a check with one sentence and no Try again, also after the other tab changed the words, and a check pressed at once after new words is refused when the lists changed elsewhere", async ({
  page,
  browser,
}) => {
  const { withDishes } = ownerFixture();
  await openSection(page, "withDishes");
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  const other = await context.newPage();
  await other.goto(`${origin}${sectionPath("withDishes")}`);
  await other.waitForLoadState("networkidle");
  await hearLog(other);
  try {
    await press(other, line.names.soy);
    await expect.poll(() => said(other, saved)).toBe(1);

    await press(page, line.names.sesame);
    await expect.poll(() => said(page, line.listsMoved)).toBe(1);
    await expect(status(page)).toHaveText(line.listsMoved);
    await expect(tryAgainButton(page), "no Try again").toHaveCount(0);
    await expect(
      box(page, line.names.sesame),
      "nothing was written",
    ).not.toBeChecked();
    await expect(
      box(page, line.names.soy),
      "the page shows the list as it is now",
    ).toBeChecked();
    await expect(checkBox(page)).not.toBeChecked();
    expect((await row(withDishes.id)).every_item_allergens).toEqual([
      "milk",
      "wheat",
      "soy",
    ]);
    await expectNoMissingIds(page);

    // The other tab changes the words; this tab's check names the old ones
    // (D-153).
    const otherWords =
      "Add a buttered roll or a scone to any dish for 2 dollars.";
    await saveWords(other, otherWords);
    await expect.poll(() => said(other, saved)).toBe(2);
    await press(page, line.checkLabel);
    await expect.poll(() => said(page, line.listsChanged)).toBe(1);
    await expect(tryAgainButton(page)).toHaveCount(0);
    await expect(checkBox(page), "nothing is checked").not.toBeChecked();
    await expect(
      lineField(page),
      "the page shows the line as it is now",
    ).toHaveValue(otherWords);
    await expect(
      page
        .locator("main")
        .getByText(lineLead(lineCopy, otherWords), { exact: true }),
    ).toHaveCount(1);
    expect((await row(withDishes.id)).every_item_allergens_reviewed).toBe(
      false,
    );
    await expectNoMissingIds(page);

    // Michael's case: the lists change elsewhere, this tab saves new words
    // with Enter and presses the box at once. The save of the words carries
    // no lists, so its answer holds lists this page has never shown; they
    // are not adopted, so the check queued behind it carries the lists the
    // page showed and misses.
    await setLineElsewhere(withDishes.id, {
      words: otherWords,
      allergens: ["milk", "wheat", "soy", "eggs"],
    });
    await fetch(`${standin}/__test/delay?ms=400`);
    const mine = "Add a buttered roll or two to any dish for 2 dollars.";
    await saveWords(page, mine);
    await press(page, line.checkLabel);
    await expect.poll(() => said(page, saved)).toBe(1);
    await expect.poll(() => said(page, line.listsChanged)).toBe(2);
    await fetch(`${standin}/__test/delay?ms=0`);
    await expect(checkBox(page), "nothing is checked").not.toBeChecked();
    await expect(
      box(page, line.names.eggs),
      "the refresh shows the list as it is now",
    ).toBeChecked();
    const now = await row(withDishes.id);
    expect(now.every_item).toBe(mine);
    // The knob stores the list as given; the app writes each in the fixed
    // order.
    expect(now.every_item_allergens).toEqual(["milk", "wheat", "soy", "eggs"]);
    expect(now.every_item_allergens_reviewed).toBe(false);
    await expectNoMissingIds(page);
  } finally {
    await context.close();
    await fetch(`${standin}/__test/delay?ms=0`);
    // As it was, through the knob, in two steps, since a change to the
    // words and a check in one statement ends unchecked: the line and its
    // two allergens, then its check.
    await setLineElsewhere(withDishes.id, {
      words: STARTERS_LINE,
      allergens: ["milk", "wheat"],
    });
    await setLineElsewhere(withDishes.id, {
      words: STARTERS_LINE,
      allergens: ["milk", "wheat"],
      checked: true,
    });
  }
});

test("Undo of words given to a blank line is refused once the line has a list, with one sentence", async ({
  page,
}) => {
  const { emptySection } = ownerFixture();
  await openSection(page, "emptySection");
  const words = "Add a scoop of ice cream to any dish for 2 dollars.";
  await saveWords(page, words);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(groupHeading(page)).toHaveCount(1);
  await setLineElsewhere(emptySection.id, { words, allergens: ["milk"] });
  try {
    await undoButton(
      page,
      forSection(sectionsCopy.undo.everyItem, emptySection.name),
    ).click();
    await expect
      .poll(() =>
        said(page, forSection(lineCopy.undo.wordsGrew, emptySection.name)),
      )
      .toBe(1);
    await expect(lineField(page), "the line stays").toHaveValue(words);
    await expect(
      box(page, line.names.milk),
      "the page shows the list as it is now",
    ).toBeChecked();
    await expect(tryAgainButton(page)).toHaveCount(0);
    await expectNoMissingIds(page);
  } finally {
    await setLineElsewhere(emptySection.id, { words: "" });
  }
});

test("a tick the server refuses is said once with Try again, and Try again lands it with All changes saved.", async ({
  page,
}) => {
  const { withDishes } = ownerFixture();
  await openSection(page, "withDishes");
  await fetch(`${standin}/__test/fail?times=1`);
  await press(page, line.names.sesame);
  const failure = `${forSection(line.notSaved.allergens, withDishes.name)} ${editing.problems.failed}`;
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(status(page)).toHaveText(failure);
  await expect(box(page, line.names.sesame)).not.toBeChecked();
  await expect(box(page, line.names.sesame)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(checkBox(page), "nothing changed on the server").toBeChecked();
  await tryAgainButton(page).click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect.poll(() => said(page, line.clearedNow)).toBe(1);
  await expect(box(page, line.names.sesame)).toBeChecked();
  await expect(checkBox(page)).not.toBeChecked();
  await expectNoMissingIds(page);

  // As it was.
  await press(page, line.names.sesame);
  await expect.poll(() => said(page, saved)).toBe(1);
  await press(page, line.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(2);
  expect((await row(withDishes.id)).every_item_allergens_reviewed).toBe(true);
});

test("a line whose words hold a comma, a period, a double quote, an apostrophe, parentheses, and a backslash is saved, ticked, checked, and read back after a reload", async ({
  page,
}) => {
  const { emptySection } = ownerFixture();
  await openSection(page, "emptySection");
  const words = `Add Nonna's "house" sauce (hot, mild) to any dish for 2.50 \\ 3.00`;
  await saveWords(page, words);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(groupHeading(page)).toHaveCount(1);
  await expect(
    page.locator("main").getByText(lineLead(lineCopy, words), { exact: true }),
  ).toHaveCount(1);
  expect((await row(emptySection.id)).every_item).toBe(words);

  // Every write in the group carries those words (D-153).
  await press(page, line.names.milk);
  await expect.poll(() => said(page, saved)).toBe(2);
  await press(page, line.checkLabel);
  await expect.poll(() => said(page, saved)).toBe(3);
  await reload(page);
  await expect(lineField(page)).toHaveValue(words);
  await expect(box(page, line.names.milk)).toBeChecked();
  await expect(checkBox(page)).toBeChecked();
  await expect(sentenceLine(page)).toHaveText(
    `${reads({ allergens: ["milk"], others: [] }, true)} ${await stampOf(emptySection.id)}`,
  );
  await expectNoMissingIds(page);

  // As it was: no line.
  await saveWords(page, "");
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect.poll(() => said(page, lineCopy.wentWithIt)).toBe(1);
  await expect(groupHeading(page)).toHaveCount(0);
  expect((await row(emptySection.id)).every_item).toBeNull();
});
