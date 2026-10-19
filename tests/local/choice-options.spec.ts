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
  optionAllergenHeading,
  optionAllergenStrings,
} from "../../src/features/owner/choices/option-words";
import { optionGroupPrefix } from "../../src/features/owner/choices/useOptionAllergens";
import {
  restaurantChoiceListPath,
  restaurantDishPath,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { expectNamedByOneLabel } from "./chrome-name";

// The options on a choice list's page, with saves that land for real
// against the stand-in (D-166, D-154, D-153): an option added by name
// landing with its group unchecked; a tick and the check, each said once
// and kept after a reload, the check stamped; a rename of a checked option
// clearing the check and saying so, and its Undo; a check pressed right
// after a rename's Enter carrying the new name; a stale tab refused with
// one sentence and no Try again, after a list changed elsewhere and after
// a rename elsewhere; Remove and its Undo bringing the option back in its
// place with its lists and check; the other-allergen refusals; and Apply
// from a checked option to a same-named dish, and back. The gate cannot
// land a save, so this runs here. Each check leaves the stand-in as it
// found it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.choices;
const group = optionAllergenStrings(en.owner.dish.allergens, strings.allergens);
const editing = en.owner.editing;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Which = "section" | "dish";

function listPath(which: Which): string {
  return restaurantChoiceListPath(code, ownerFixture().lists[which].id);
}

async function openList(page: Page, which: Which): Promise<void> {
  await page.goto(listPath(which));
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

function tryAgainButton(page: Page) {
  return page.getByRole("button", { name: editing.tryAgain, exact: true });
}

function undoButton(page: Page, label: string | RegExp) {
  return page.getByRole("button", { name: label, exact: true });
}

function nameField(page: Page, option: string) {
  return page.getByRole("textbox", {
    name: `${strings.options.nameLabel} ${fill(strings.options.labelFor, { option })}`,
    exact: true,
  });
}

function optionButton(page: Page, action: string, option: string) {
  return page.getByRole("button", {
    name: fill(strings.options.rowAction, { action, option }),
    exact: true,
  });
}

// One option's group, by its id (D-166).
function groupOf(page: Page, id: string) {
  const prefix = optionGroupPrefix(id);
  const words = (allergen: string) => {
    const name = group.names[allergen as keyof typeof group.names];
    return page
      .locator(`#${prefix}-allergen-${allergen}`)
      .getByText(name, { exact: true });
  };
  return {
    heading: page.locator(`#${prefix}-allergens-heading`),
    check: page.locator(`#${prefix}-allergen-check input[type="checkbox"]`),
    checkWords: page
      .locator(`#${prefix}-allergen-check`)
      .getByText(group.checkLabel, { exact: true }),
    sentence: page.locator(`#${prefix}-allergen-sentence`),
    boxOf: (allergen: string) =>
      page.locator(`#${prefix}-allergen-${allergen} input[type="checkbox"]`),
    words,
    otherField: (position: number) =>
      page.locator(`#${prefix}-other-${position}-name`),
    addOther: page.locator(`#${prefix}-allergen-add`),
  };
}

async function optionIds(page: Page): Promise<{ id: string; name: string }[]> {
  return page.locator('main ul > li input[id$="-name"]').evaluateAll((fields) =>
    fields.map((field) => ({
      id: field.id.replace(/^option-/, "").replace(/-name$/, ""),
      name: (field as HTMLInputElement).value,
    })),
  );
}

type Row = {
  id: string;
  choice_list_id: string;
  name: string;
  allergens: string[];
  custom_allergens: string[];
  allergens_reviewed: boolean;
  allergens_reviewed_by: string | null;
  allergens_reviewed_at: string | null;
  deleted_at: string | null;
  sort: number;
};

async function rows(): Promise<Row[]> {
  const response = await fetch(`${standin}/__test/options`);
  return (await response.json()) as Row[];
}

async function row(id: string): Promise<Row> {
  const found = (await rows()).find((each) => each.id === id);
  if (!found) throw new Error(`the stand-in has no option ${id}`);
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
  const response = await fetch(
    `${standin}/__test/set-option-allergens?${query}`,
  );
  if (!response.ok)
    throw new Error(`set-option-allergens failed: ${response.status}`);
}

async function renameElsewhere(id: string, name: string): Promise<void> {
  const query = new URLSearchParams({ id, name });
  const response = await fetch(`${standin}/__test/rename-option?${query}`);
  if (!response.ok) throw new Error(`rename-option failed: ${response.status}`);
}

function reads(
  lists: { allergens: readonly string[]; others: string[] },
  checked: boolean,
): string {
  return dinersReadText(
    group,
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
  return fill(group.checkedByYou, {
    date: checkedOnDate(
      stamped.allergens_reviewed_at ?? "",
      await zone(),
      "en",
    ),
  });
}

const forOption = (template: string, option: string) =>
  fill(template, { option });

const addedSentence = (name: string, count: number) =>
  fill(strings.options.added, {
    option: name,
    count: fill(
      count === 1 ? strings.options.count.one : strings.options.count.other,
      { count },
    ),
  });

test("an option added by name lands unchecked with its own group, a tick and the check each say Saved. once and hold after a reload with the stamp, and Remove then Undo brings it back in its place with its list and check", async ({
  page,
}) => {
  const { lists } = ownerFixture();
  await openList(page, "section");
  await page
    .getByRole("textbox", { name: strings.options.newLabel, exact: true })
    .fill("Garlic knot");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, addedSentence("Garlic knot", 2))).toBe(1);
  const knot = (await optionIds(page)).find(
    (option) => option.name === "Garlic knot",
  );
  if (!knot) throw new Error("the option landed");
  const knotGroup = groupOf(page, knot.id);
  await expect(knotGroup.heading).toHaveText(
    optionAllergenHeading(group, "Garlic knot"),
  );
  await expect(knotGroup.check).not.toBeChecked();
  await expect(knotGroup.sentence).toHaveText(
    `${reads({ allergens: [], others: [] }, false)} ${group.notChecked}`,
  );
  await expectNoMissingIds(page);

  await knotGroup.words("wheat").click();
  await expect(knotGroup.boxOf("wheat")).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row(knot.id)).allergens).toEqual(["wheat"]);
  await knotGroup.checkWords.click();
  await expect.poll(() => said(page, saved)).toBe(2);
  const stamp = await stampOf(knot.id);
  expect(stamp).toMatch(/^Checked by you on [A-Z][a-z]+ \d{1,2}, \d{4}\.$/);
  await expect(knotGroup.sentence).toHaveText(
    `${reads({ allergens: ["wheat"], others: [] }, true)} ${stamp}`,
  );
  await reload(page);
  await expect(groupOf(page, knot.id).boxOf("wheat")).toBeChecked();
  await expect(groupOf(page, knot.id).check).toBeChecked();
  expect((await optionIds(page)).map((option) => option.name)).toEqual([
    "Buttered roll",
    "Garlic knot",
  ]);

  // Removed and brought back in its place, with its list and its check.
  await optionButton(page, strings.options.remove, "Garlic knot").click();
  await expect
    .poll(() => said(page, forOption(strings.options.deleted, "Garlic knot")))
    .toBe(1);
  expect((await optionIds(page)).map((option) => option.name)).toEqual([
    "Buttered roll",
  ]);
  await expect(
    nameField(page, "Buttered roll"),
    "focus goes to the row before it, since none follows",
  ).toBeFocused();
  await undoButton(
    page,
    forOption(strings.options.undo.deleted, "Garlic knot"),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(strings.options.undo.restored, {
          option: "Garlic knot",
          position: 2,
          total: 2,
        }),
      ),
    )
    .toBe(1);
  expect((await optionIds(page)).map((option) => option.name)).toEqual([
    "Buttered roll",
    "Garlic knot",
  ]);
  await expect(groupOf(page, knot.id).boxOf("wheat")).toBeChecked();
  await expect(
    groupOf(page, knot.id).check,
    "the check came back with it",
  ).toBeChecked();
  const back = await row(knot.id);
  expect(back.deleted_at).toBeNull();
  expect(back.allergens_reviewed).toBe(true);
  await expectNoMissingIds(page);

  // As it was.
  await optionButton(page, strings.options.remove, "Garlic knot").click();
  await expect
    .poll(() => said(page, forOption(strings.options.deleted, "Garlic knot")))
    .toBe(2);
  await expect.poll(async () => (await row(knot.id)).deleted_at).not.toBeNull();
  expect(
    (await rows()).filter(
      (each) =>
        each.choice_list_id === lists.section.id && each.deleted_at === null,
    ).length,
  ).toBe(1);
});

test("a rename of a checked option says Saved. then that the list is not checked, the stamp says why, a reload shows it unchecked, Undo puts the name back and says the check is still gone, and a check pressed right after the rename's Enter carries the new name and lands", async ({
  page,
}) => {
  const [ranch] = await (async () => {
    await openList(page, "dish");
    return optionIds(page);
  })();
  if (!ranch) throw new Error("Ranch");
  const ranchGroup = groupOf(page, ranch.id);
  await expect(ranchGroup.check).toBeChecked();

  const name = nameField(page, "Ranch");
  await name.fill("Buttermilk ranch");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect.poll(() => said(page, group.clearedNow)).toBe(1);
  await expect(
    ranchGroup.check,
    "the rename cleared the check",
  ).not.toBeChecked();
  await expect(ranchGroup.sentence).toHaveText(
    `${reads({ allergens: ["milk", "eggs"], others: [] }, false)} ${group.cleared}`,
  );
  await expect(
    ranchGroup.heading,
    "the group's heading follows the name",
  ).toHaveText(optionAllergenHeading(group, "Buttermilk ranch"));
  const renamed = await row(ranch.id);
  expect(renamed.name).toBe("Buttermilk ranch");
  expect(renamed.allergens_reviewed).toBe(false);
  await reload(page);
  await expect(groupOf(page, ranch.id).check).not.toBeChecked();
  await expectNoMissingIds(page);

  // Checked again elsewhere, so the page shows it checked after a reload,
  // then the rename undone: the Undo's write is itself a rename, which
  // clears that check, and the Undo's own sentence says so after itself.
  await setElsewhere(ranch.id, { allergens: ["milk", "eggs"], checked: true });
  await reload(page);
  await expect(groupOf(page, ranch.id).check).toBeChecked();
  await undoButton(
    page,
    fill(strings.options.undo.renamed, {
      from: "Ranch",
      to: "Buttermilk ranch",
    }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        `${fill(strings.options.undo.renamedBack, { from: "Ranch" })} ${group.clearedNow}`,
      ),
    )
    .toBe(1);
  await expect(nameField(page, "Ranch")).toHaveValue("Ranch");
  await expect(
    groupOf(page, ranch.id).check,
    "the rename back cleared the check",
  ).not.toBeChecked();
  expect((await row(ranch.id)).allergens_reviewed).toBe(false);

  // Michael's queued-check case (D-149, D-153): the name saved with Enter
  // and the box pressed at once. The check waits its turn behind the save,
  // carries the new name the save answered with, and lands.
  await nameField(page, "Ranch").fill("House ranch");
  await page.keyboard.press("Enter");
  await groupOf(page, ranch.id).checkWords.click();
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(groupOf(page, ranch.id).check).toBeChecked();
  const checked = await row(ranch.id);
  expect(checked.name).toBe("House ranch");
  expect(checked.allergens_reviewed).toBe(true);
  await expectNoMissingIds(page);

  // As it was: Ranch, checked again by a person.
  await nameField(page, "House ranch").fill("Ranch");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(3);
  await groupOf(page, ranch.id).checkWords.click();
  await expect.poll(() => said(page, saved)).toBe(4);
  const back = await row(ranch.id);
  expect(back.name).toBe("Ranch");
  expect(back.allergens_reviewed).toBe(true);
});

test("an option that moved under the page from another tab refuses a tick and a check with one sentence and no Try again, also after the other tab renamed it, and the page then shows the option as it is now", async ({
  page,
  browser,
}) => {
  const [ranch, vinaigrette] = await (async () => {
    await openList(page, "dish");
    return optionIds(page);
  })();
  if (!ranch || !vinaigrette) throw new Error("two options");
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  const other = await context.newPage();
  await other.goto(`${origin}${listPath("dish")}`);
  await other.waitForLoadState("networkidle");
  await hearLog(other);
  try {
    // The other tab ticks soy on Vinaigrette; this tab's tick on it names
    // the old lists.
    await groupOf(other, vinaigrette.id).words("soy").click();
    await expect.poll(() => said(other, saved)).toBe(1);
    await groupOf(page, vinaigrette.id).words("sesame").click();
    await expect.poll(() => said(page, group.listsMoved)).toBe(1);
    await expect(status(page)).toHaveText(group.listsMoved);
    await expect(tryAgainButton(page), "no Try again").toHaveCount(0);
    await expect(
      groupOf(page, vinaigrette.id).boxOf("sesame"),
    ).not.toBeChecked();
    await expect(
      groupOf(page, vinaigrette.id).boxOf("soy"),
      "the page shows the list as it is now",
    ).toBeChecked();
    await expect(
      groupOf(page, ranch.id).check,
      "Ranch is untouched",
    ).toBeChecked();
    expect((await row(vinaigrette.id)).allergens).toEqual(["soy"]);
    await expectNoMissingIds(page);

    // The other tab renames Vinaigrette; this tab's check names the old
    // name (D-153).
    await renameElsewhere(vinaigrette.id, "House vinaigrette");
    await groupOf(page, vinaigrette.id).checkWords.click();
    await expect.poll(() => said(page, group.listsChanged)).toBe(1);
    await expect(tryAgainButton(page)).toHaveCount(0);
    await expect(
      groupOf(page, vinaigrette.id).check,
      "nothing is checked",
    ).not.toBeChecked();
    await expect(
      nameField(page, "House vinaigrette"),
      "the page shows the option as it is now",
    ).toHaveValue("House vinaigrette");
    expect((await row(vinaigrette.id)).allergens_reviewed).toBe(false);
    await expectNoMissingIds(page);
  } finally {
    await context.close();
    // As it was, in two steps, since a change and a check in one statement
    // end unchecked: the name and the lists, then the check.
    await renameElsewhere(vinaigrette.id, "Vinaigrette");
    await setElsewhere(vinaigrette.id, {});
    await setElsewhere(vinaigrette.id, { checked: true });
  }
});

test("another allergen on an option is refused unsent as holding a comma, as one of the nine, as too long, or as a repeat, and a name that lands clears the check", async ({
  page,
}) => {
  const [ranch] = await (async () => {
    await openList(page, "dish");
    return optionIds(page);
  })();
  if (!ranch) throw new Error("Ranch");
  const ranchGroup = groupOf(page, ranch.id);
  const before = await writesSoFar();
  await ranchGroup.addOther.click();
  const first = ranchGroup.otherField(1);
  await expect(first, "the new row's field takes focus").toBeFocused();
  await expect(first).toHaveAccessibleName(
    `${group.otherLabel} ${otherSuffix(group, 1)}`,
  );
  await expectNamedByOneLabel(
    page,
    (await first.getAttribute("id")) ?? "",
    `${group.otherLabel} ${otherSuffix(group, 1)}`,
  );
  expect(await writesSoFar(), "adding a row sends nothing").toBe(before);

  const refused = (problem: string) =>
    `${fill(group.notSaved.other, { other: fill(group.unnamedOther, { position: 1 }) })} ${problem}`;
  for (const [typed, problem] of [
    ["nuts, except almonds", group.errors.otherComma],
    ["Milk", fill(group.errors.otherMajor, { allergen: group.names.milk })],
    ["x".repeat(41), group.errors.otherLength],
  ] as const) {
    await first.fill(typed);
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText(refused(problem));
    expect(await writesSoFar(), `not sent: ${typed}`).toBe(before);
  }

  await first.fill("celery");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect.poll(() => said(page, group.clearedNow)).toBe(1);
  await expect(
    ranchGroup.check,
    "a name that lands clears the check",
  ).not.toBeChecked();
  expect((await row(ranch.id)).custom_allergens).toEqual(["celery"]);

  await ranchGroup.addOther.click();
  await ranchGroup.otherField(2).fill("Celery");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(group.notSaved.other, { other: fill(group.unnamedOther, { position: 2 }) })} ${fill(group.errors.otherTaken, { other: "celery" })}`,
  );
  await page
    .getByRole("button", {
      name: otherAction(
        group,
        group.removeOther,
        fill(group.unnamedOther, { position: 2 }),
      ),
      exact: true,
    })
    .click();
  await expectNoMissingIds(page);

  // As it was: no other allergen, checked again by a person.
  await page
    .getByRole("button", {
      name: otherAction(group, group.removeOther, "celery"),
      exact: true,
    })
    .click();
  await expect
    .poll(() => said(page, fill(group.otherRemoved, { other: "celery" })))
    .toBe(1);
  await expect
    .poll(async () => (await row(ranch.id)).custom_allergens)
    .toEqual([]);
  await ranchGroup.checkWords.click();
  await expect
    .poll(async () => (await row(ranch.id)).allergens_reviewed)
    .toBe(true);
});

test("Apply from a checked option gives the same-named dish this list and the check, and Undo puts the dish back; a dish's page offers the same to a same-named option", async ({
  page,
}) => {
  const { dishes, lists } = ownerFixture();
  // A dish named Ranch, in Starters, not checked: the option's twin.
  const query = new URLSearchParams({ section: "Starters", name: "Ranch" });
  const addedDish = (await (
    await fetch(`${standin}/__test/add-dish?${query}`)
  ).json()) as {
    id: string;
  };
  try {
    const [ranch] = await (async () => {
      await openList(page, "dish");
      return optionIds(page);
    })();
    if (!ranch) throw new Error("Ranch");
    const apply = page.getByRole("button", {
      name: new RegExp(
        `^${group.sameNamed.apply.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, Ranch in `,
      ),
    });
    await expect(apply).toHaveCount(1);
    await expect(apply).toHaveAttribute(
      "aria-label",
      `${group.sameNamed.apply}, Ranch in Starters, Dinner`,
    );
    await apply.click();
    await expect
      .poll(
        async () =>
          (await heard(page)).filter((each) => each.startsWith("Applied. "))
            .length,
      )
      .toBe(1);
    const dishRows = (await (
      await fetch(`${standin}/__test/items`)
    ).json()) as {
      id: string;
      allergens: string[];
      allergens_reviewed: boolean;
    }[];
    const applied = dishRows.find((each) => each.id === addedDish.id);
    expect(applied?.allergens).toEqual(["milk", "eggs"]);
    expect(applied?.allergens_reviewed).toBe(true);
    await expect(apply, "the line goes").toHaveCount(0);
    await expectNoMissingIds(page);

    await undoButton(page, /^Undo: applied this list to Ranch in /).click();
    await expect
      .poll(
        async () =>
          (await heard(page)).filter(
            (each) =>
              each.startsWith("Undone. ") && each.endsWith(" is as it was."),
          ).length,
      )
      .toBe(1);
    const back = (
      (await (await fetch(`${standin}/__test/items`)).json()) as typeof dishRows
    ).find((each) => each.id === addedDish.id);
    expect(back?.allergens).toEqual([]);
    expect(back?.allergens_reviewed).toBe(false);

    // From the dish's side: Ranch the dish, checked with none, offers the
    // option in Choose a dressing for House salad.
    await page.goto(restaurantDishPath(code, addedDish.id));
    await page.waitForLoadState("networkidle");
    await hearLog(page);
    await page.getByText(group.checkLabel, { exact: true }).click();
    await expect.poll(() => said(page, saved)).toBe(1);
    const toOption = page.getByRole("button", {
      name: `${group.sameNamed.apply}, Ranch in ${fill(strings.placeIn, { lead: lists.dish.lead, home: dishes.one.name })}, Dinner`,
      exact: true,
    });
    await expect(toOption).toHaveCount(1);
    await toOption.click();
    await expect
      .poll(
        async () =>
          (await heard(page)).filter((each) => each.startsWith("Applied. "))
            .length,
      )
      .toBe(1);
    const option = await row(ranch.id);
    expect(option.allergens, "the option took the dish's empty list").toEqual(
      [],
    );
    expect(option.allergens_reviewed).toBe(true);
    await expectNoMissingIds(page);
  } finally {
    // As it was: Ranch the option with milk and eggs, checked; the dish
    // gone.
    const [ranch] = await (async () => {
      await openList(page, "dish");
      return optionIds(page);
    })();
    if (ranch) {
      await setElsewhere(ranch.id, { allergens: ["milk", "eggs"] });
      await setElsewhere(ranch.id, {
        allergens: ["milk", "eggs"],
        checked: true,
      });
    }
    await page.goto(restaurantDishPath(code, addedDish.id));
    await page.waitForLoadState("networkidle");
    // The dish is deleted from its section's page.
    const { withDishes } = ownerFixture();
    await page.goto(`/app/restaurants/${code}/sections/${withDishes.id}`);
    await page.waitForLoadState("networkidle");
    await hearLog(page);
    await page
      .getByRole("button", {
        name: fill(en.owner.dishes.rowAction, {
          action: en.owner.dishes.remove,
          dish: "Ranch",
        }),
        exact: true,
      })
      .click();
    await expect
      .poll(() => said(page, fill(en.owner.dishes.deleted, { dish: "Ranch" })))
      .toBe(1);
  }
});

test("a tick the server refuses is said once with Try again, and Try again lands it", async ({
  page,
}) => {
  const [, vinaigrette] = await (async () => {
    await openList(page, "dish");
    return optionIds(page);
  })();
  if (!vinaigrette) throw new Error("Vinaigrette");
  const vinGroup = groupOf(page, vinaigrette.id);
  await fetch(`${standin}/__test/fail?times=1`);
  await vinGroup.words("sesame").click();
  const failure = `${forOption(group.notSaved.allergens, "Vinaigrette")} ${editing.problems.failed}`;
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(status(page)).toHaveText(failure);
  await expect(vinGroup.boxOf("sesame")).not.toBeChecked();
  await expect(vinGroup.check, "nothing changed on the server").toBeChecked();
  await tryAgainButton(page).click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect.poll(() => said(page, group.clearedNow)).toBe(1);
  await expect(vinGroup.boxOf("sesame")).toBeChecked();
  await expect(vinGroup.check).not.toBeChecked();
  await expectNoMissingIds(page);

  // As it was.
  await vinGroup.words("sesame").click();
  await expect.poll(() => said(page, saved)).toBe(1);
  await vinGroup.checkWords.click();
  await expect.poll(() => said(page, saved)).toBe(2);
  expect((await row(vinaigrette.id)).allergens_reviewed).toBe(true);
});
