import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { timeFieldLabel } from "../../src/features/owner/form-data";
import { fieldId, restaurantDetailsPath } from "../../src/features/owner/paths";
import {
  expectLandedOutline,
  expectNoAxeViolations,
  expectNoMissingIds,
  tabTo,
} from "../a11y/checks";
import { ownerEnv } from "../a11y/owner-env";
import { chromeName, expectNamedByOneLabel } from "./chrome-name";

// The restaurant form against the stand-in. The two focus targets (Q-100,
// D-179): the error summary, which takes focus when a save comes back with
// errors, and a day's first field, its Open 24 hours box, where the
// summary's link for a day-level error lands (D-188). The gate never gets
// an answer with errors, since its saves are answered in the browser
// (D-108), so they are checked here; a range that opens and closes at the
// same time is refused for its day, and nothing is written. Then how
// Details is named (D-188): the box and the two Selects each by one label,
// the shape VoiceOver on iOS folds into the control, with Chrome's own
// reading of the name and of the label's pieces.
const { code } = ownerEnv();
const strings = en.owner.restaurants;
const monday = strings.days.mon;
const allDayName = `${strings.fields.allDay} ${fill(strings.fields.allDayDay, { day: monday })}`;

async function openDetails(page: Page) {
  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
}

test("a save with errors sent from the keyboard focuses the error summary, and its link to a day lands on the day's Open 24 hours box; each shows the focus ring", async ({
  page,
}) => {
  await openDetails(page);
  const opens = page.getByRole("textbox", {
    name: timeFieldLabel(strings.fields, monday, 0, "open"),
    exact: true,
  });
  const closes = page.getByRole("textbox", {
    name: timeFieldLabel(strings.fields, monday, 0, "close"),
    exact: true,
  });
  await opens.fill("9 am");
  await closes.fill("9 am");
  await closes.press("Enter");

  const summary = page.locator("main div[tabindex='-1']").filter({
    has: page.getByRole("heading", { name: strings.errors.summary }),
  });
  await expect(summary).toBeFocused();
  await expectLandedOutline(page);

  const link = summary.getByRole("link");
  await expect(link).toHaveCount(1);
  await tabTo(page, link);
  await page.keyboard.press("Enter");
  const box = page.locator(`#${fieldId("hours.mon")}`);
  await expect(
    box,
    "the day's first field, its Open 24 hours box",
  ).toBeFocused();
  await expect(box).toHaveAttribute("type", "checkbox");
  await expect(box).toHaveAccessibleName(allDayName);
  // The box draws its own ring (D-179): React Aria marks the label while
  // the hidden input has keyboard focus, and the drawn box wears the outline.
  const ring = await box.evaluate((input) => {
    const label = input.closest("label");
    const drawn = label?.querySelector('span[aria-hidden="true"]');
    const probe = document.createElement("span");
    probe.style.color = "var(--focus)";
    document.body.append(probe);
    const focusColor = getComputedStyle(probe).color;
    probe.remove();
    const style = drawn ? getComputedStyle(drawn) : null;
    return {
      marked: label?.hasAttribute("data-focus-visible") ?? false,
      style: style?.outlineStyle,
      width: style?.outlineWidth,
      offset: style?.outlineOffset,
      color: style?.outlineColor,
      focusColor,
    };
  });
  expect(ring.marked, "the label is marked focus-visible").toBe(true);
  expect(ring.style, "the box draws its outline").toBe("solid");
  expect(ring.width).toBe("3px");
  expect(ring.offset).toBe("2px");
  expect(ring.color, "the outline is the focus color").toBe(ring.focusColor);
  await expect(
    page.locator("main fieldset[tabindex]"),
    "no day's fieldset takes focus itself",
  ).toHaveCount(0);
});

test("on Details, the Open 24 hours box and the State and Time zone Selects are each named by one label, which Chrome reads whole, a pick renames the State button, and axe finds nothing", async ({
  page,
}) => {
  await openDetails(page);
  await expectNamedByOneLabel(page, fieldId("hours.mon"), allDayName, true);
  const stateName = (state: string) => `${state} ${strings.fields.region}`;
  await expectNamedByOneLabel(
    page,
    fieldId("region"),
    stateName(strings.states.PA),
  );
  await expectNamedByOneLabel(
    page,
    fieldId("timezone"),
    `${strings.timezones["America/New_York"]} ${strings.fields.timezone}`,
  );

  // A select's name follows its value: a pick renames the button at once.
  const state = page.locator(`#${fieldId("region")}`);
  await state.click();
  await page
    .getByRole("option", { name: strings.states.NY, exact: true })
    .click();
  await expect(state).toContainText(strings.states.NY);
  await expect(state).toBeFocused();
  await expect
    .poll(() => chromeName(page, fieldId("region")))
    .toBe(stateName(strings.states.NY));
  await expectNamedByOneLabel(
    page,
    fieldId("region"),
    stateName(strings.states.NY),
  );

  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.incomplete.map((each) => each.id),
    "axe has nothing to review either",
  ).toEqual([]);
});
