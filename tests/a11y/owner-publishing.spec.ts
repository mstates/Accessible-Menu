import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  dashboardPath,
  restaurantMenuPath,
} from "../../src/features/owner/paths";
import { expectNoAxeViolations, expectNoMissingIds, open } from "./checks";
import { ownerEnv, ownerFixture } from "./owner-env";
import { hearLog, heard } from "./owner-lists";
import { expectWrites, guardWrites } from "./write-guard";

// Publish and Unpublish on a menu's page, and the dashboard's sentence,
// signed in as the test owner (D-100), on the menus the data file gave the
// test restaurant (D-126): the menu with sections is published and the
// empty one is not, set by the data file through publish_menu(), since the
// gate never writes (D-115). What is checked here is what the page shows
// and says in each state, the empty menu's page naming what blocks Publish
// (D-177), and what a press does when it cannot land; the presses that
// land run in tests/local against the stand-in. The arrival pass for the
// menu page, with Publish and Unpublish among its controls, runs from
// owner-sections.spec.ts.

const { code } = ownerEnv();
const strings = en.owner.publishing;
const editing = en.owner.editing;

guardWrites();

function group(page: Page) {
  return page.getByRole("region", { name: strings.heading, exact: true });
}

function button(page: Page, name: string) {
  return group(page).getByRole("button", { name, exact: true });
}

// The hint a button is described by, read through the ids it points at.
async function describedBy(page: Page, name: string): Promise<string> {
  return button(page, name).evaluate((element) =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" "),
  );
}

test("a published menu's page says when it was published, shows Publish and Unpublish with their hints, and is clean", async ({
  page,
}) => {
  const { withSections } = ownerFixture();
  await open(page, restaurantMenuPath(code, withSections.id));
  await expect(group(page).getByRole("heading", { level: 2 })).toHaveText(
    strings.heading,
  );
  await expect(group(page).getByText(/^Published on /)).toBeVisible();
  await expect(group(page).getByText(strings.waitingLead)).toHaveCount(0);
  await expect(button(page, strings.publish)).toBeVisible();
  await expect(button(page, strings.unpublish)).toBeVisible();
  expect(await describedBy(page, strings.publish)).toBe(strings.publishHint);
  expect(await describedBy(page, strings.unpublish)).toBe(
    strings.unpublishHint,
  );
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("an unpublished menu's page says so and shows Publish alone, before the sections, and a menu with no dishes names that as what Publish waits on", async ({
  page,
}) => {
  const { empty } = ownerFixture();
  await open(page, restaurantMenuPath(code, empty.id));
  await expect(group(page).getByText(strings.state.notPublished)).toBeVisible();
  // The empty menu has no dishes, so Publish waits on the menu itself
  // (D-177, migration 14): one sentence naming it, and nothing else.
  await expect(group(page).getByText(strings.waitingLead)).toBeVisible();
  await expect(group(page).getByRole("listitem")).toHaveText([
    fill(strings.problems.noDishes, { menu: empty.name }),
  ]);
  await expect(button(page, strings.publish)).toBeVisible();
  await expect(button(page, strings.unpublish)).toHaveCount(0);
  // The group comes first after the h1, then the lead, then the status.
  const headings = await page
    .locator("main h1, main h2")
    .evaluateAll((all) => all.map((h) => (h.textContent ?? "").trim()));
  expect(headings[0]).toBe(empty.name);
  expect(headings[1]).toBe(strings.heading);
  const order = await page
    .locator('main [aria-labelledby], main p, main [role="status"]')
    .evaluateAll((all) =>
      all
        .map((node) =>
          node.getAttribute("role") === "status"
            ? "status"
            : (node.textContent ?? "").trim(),
        )
        .filter((text) => text !== ""),
    );
  const leadAt = order.indexOf(en.owner.sections.lead);
  const statusAt = order.indexOf("status");
  expect(leadAt, "the lead follows the group").toBeGreaterThan(-1);
  expect(statusAt, "the saved status follows the lead").toBeGreaterThan(leadAt);
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});

test("the dashboard says which menus are published", async ({ page }) => {
  const { withSections, published } = ownerFixture();
  expect(published).toContain(withSections.name);
  const list = new Intl.ListFormat("en", { type: "conjunction" });
  await open(page, dashboardPath);
  await expect(
    page.getByText(
      fill(
        published.length === 1
          ? strings.summary.published.one
          : strings.summary.published.other,
        { names: list.format(published) },
      ),
      { exact: true },
    ),
  ).toBeVisible();
});

// A press that cannot land (Q-41): the write guard answers it inside the
// browser as an action the server does not know, so the page says it is
// out of date once, shows the sentence in its status, and offers Reload;
// nothing reaches the server.
test("a Publish press the server does not know is said once, shown in the status, and offers Reload", async ({
  page,
}) => {
  const { empty } = ownerFixture();
  await open(page, restaurantMenuPath(code, empty.id));
  await hearLog(page);
  expectWrites(page);
  await button(page, strings.publish).click();
  const sentence = `${fill(strings.refused.notPublished, { menu: empty.name })} ${editing.problems.outOfDate}`;
  await expect
    .poll(async () => (await heard(page)).filter((s) => s === sentence).length)
    .toBe(1);
  await expect(page.locator('main [role="status"]')).toHaveText(sentence);
  await expect(
    page.getByRole("button", { name: editing.reload, exact: true }),
  ).toBeVisible();
  await expect(group(page).getByText(strings.state.notPublished)).toBeVisible();
  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
});
