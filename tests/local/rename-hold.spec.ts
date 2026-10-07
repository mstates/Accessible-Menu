import { expect, test } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { chromeName } from "./chrome-name";

// A rename saved with Enter, landed for real against the stand-in (D-140,
// D-142). While the field still has focus it keeps the name it had when
// focus arrived, so Chrome does not read the field again over the polite
// "Saved."; the row's heading shows the saved name at once; "Saved." is said
// once; and once the field is left it takes the saved name. Chrome's own
// name for the field is read through the DevTools Protocol. Each row gets
// its name back before the check ends.
//
// The gate cannot land a save, so this runs here. It must run on any change
// to src/ui/TextField.tsx or src/features/owner/editing, and in the session
// that reads each month's Dependabot run whenever React, React Aria, or Next
// moves (D-142).

const { code } = ownerEnv();
const saved = en.owner.editing.fieldSaved;

type ListUnderTest = {
  noun: "menu" | "section" | "dish";
  words: { nameLabel: string; labelFor: string };
  path: () => string;
};

const lists: readonly ListUnderTest[] = [
  {
    noun: "menu",
    words: en.owner.menus,
    path: () => restaurantMenusPath(code),
  },
  {
    noun: "section",
    words: en.owner.sections,
    path: () => restaurantMenuPath(code, ownerFixture().withSections.id),
  },
  {
    noun: "dish",
    words: en.owner.dishes,
    path: () => restaurantSectionPath(code, ownerFixture().withDishes.id),
  },
];

for (const list of lists) {
  test(`a ${list.noun} renamed with Enter keeps its field's name in Chrome until the field is left, and says "${saved}" once`, async ({
    page,
  }) => {
    const nameOf = (row: string) =>
      `${list.words.nameLabel} ${fill(list.words.labelFor, { [list.noun]: row })}`;
    await page.goto(list.path());
    await page.waitForLoadState("networkidle");
    await hearLog(page);
    const savedTimes = async () =>
      (await heard(page)).filter((said) => said === saved).length;

    const row = page.locator("main ul > li").nth(1);
    const heading = row.getByRole("heading", { level: 2 });
    const field = row.locator('input[id$="-name"]');
    const id = (await field.getAttribute("id")) ?? "";
    const before = await field.inputValue();
    const after = `${before} renamed`;

    await field.focus();
    expect(await chromeName(page, id), "the field names its row").toBe(
      nameOf(before),
    );
    await field.fill(after);
    await page.keyboard.press("Enter");
    await expect(heading, "the row's heading shows the saved name").toHaveText(
      after,
    );
    await expect
      .poll(savedTimes, { message: `"${saved}" is said once` })
      .toBe(1);
    await expect(field, "focus stays in the field").toBeFocused();
    expect(
      await chromeName(page, id),
      "while it has focus, the field keeps the name it had when focus arrived",
    ).toBe(nameOf(before));

    await page.keyboard.press("Tab");
    await expect(field).not.toBeFocused();
    await expect
      .poll(() => chromeName(page, id), {
        message: "once it is left, the field takes the saved name",
      })
      .toBe(nameOf(after));
    expect(await savedTimes(), `"${saved}" is still said once`).toBe(1);

    // The row gets its name back, so the stand-in is as it was.
    await field.fill(before);
    await page.keyboard.press("Enter");
    await expect(heading).toHaveText(before);
    await expect.poll(savedTimes).toBe(2);
    await page.keyboard.press("Tab");
    await expect.poll(() => chromeName(page, id)).toBe(nameOf(before));
  });
}
