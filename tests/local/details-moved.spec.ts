import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { menuPath } from "../../src/domain/menu-url";
import { fieldId, restaurantDetailsPath } from "../../src/features/owner/paths";
import { ownerEnv, ownerStatePath } from "../a11y/owner-env";
import { saveAndFail, saveAndLand } from "./save";

// Details with two tabs open (D-237, rule 2). A Details save hands back the
// twelve values the page showed and lands only if the restaurant still
// holds all twelve, in one statement. A Save from a tab that is behind is
// refused: the summary takes focus with the sentence that says to reload,
// every field keeps what was typed, and nothing is written.
//
// Details reach diners without Publish (D-84), so a refused Save must also
// clear no diner page. That is read here from a diner's side: a value put
// in the row with no page cleared stays unseen after the refused Save,
// which a Save that cleared the pages would have shown.
//
// What the page showed is held from the moment the form mounts, as its
// fields are. A newer render of the page, which a renewed session or a
// landed save can bring, must not put newer values under a form the owner
// is still looking at: the Save would then name a version the form never
// showed and write over whatever moved. One check brings such a render with
// Next's own router and goes red when the hold is taken out.
//
// The gate cannot land a save, so this runs here. Each check ends with the
// restaurant as it was and its diner pages cleared.

const { code } = ownerEnv();
const details = restaurantDetailsPath(code);
const bare = menuPath(code);
const strings = en.owner.restaurants;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Restaurant = {
  name: string;
  phone: string | null;
  hours: unknown;
  timezone: string;
  allergen_note: string | null;
};

async function knob<Answer = unknown>(
  path: string,
  params: Record<string, string> = {},
): Promise<Answer> {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) {
    throw new Error(`the stand-in refused ${path}: ${await response.text()}`);
  }
  return (await response.json()) as Answer;
}

const stored = () => knob<Restaurant>("restaurant");

// How many times the restaurant's row was sent a write, landed or not.
async function detailsWrites(): Promise<number> {
  return (await knob<string[]>("writes")).filter((each) =>
    each.startsWith("PATCH restaurants "),
  ).length;
}

// A diner's read of the menu page.
async function served(page: Page): Promise<string> {
  const response = await page.request.get(bare, {
    headers: { accept: "text/html" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  return response.text();
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

const zone = (page: Page) => page.locator(`#${fieldId("timezone")}`);

async function openDetails(page: Page): Promise<void> {
  await page.goto(details);
  await page.waitForLoadState("networkidle");
}

const save = (page: Page) =>
  saveAndLand(page, strings.details.submit, strings.details.saved);

const saveRefused = (page: Page) =>
  saveAndFail(
    page,
    strings.details.submit,
    strings.errors.moved,
    strings.errors.summary,
  );

// A second tab, signed in as the same owner, opened now: after the first
// tab loaded Details, and before the first tab's own change.
async function inAnotherTab(
  browser: Browser,
  page: Page,
  work: (other: Page) => Promise<void>,
): Promise<void> {
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  try {
    const other = await context.newPage();
    await other.goto(`${origin}${details}`);
    await other.waitForLoadState("networkidle");
    await work(other);
  } finally {
    await context.close();
  }
}

// As it was: the row put back, then one Save from a fresh page, which
// changes nothing and clears the diner pages, so no later check reads a
// page this file left behind.
test.afterEach(async ({ page }) => {
  await knob("reset-details");
  await openDetails(page);
  await save(page);
});

test("Details changed in a second tab refuses this tab's Save: the summary takes focus with the sentence that says to reload, every field keeps what was typed, one statement is sent and nothing is written, and no diner page is cleared", async ({
  page,
  browser,
}) => {
  await openDetails(page);
  const note = field(page, strings.fields.allergenNote);
  const phone = field(page, strings.fields.phone);
  await expect(note).toHaveValue("");

  const theirs = "The other tab's allergen note.";
  await inAnotherTab(browser, page, async (other) => {
    await field(other, strings.fields.allergenNote).fill(theirs);
    await save(other);
  });
  await expect
    .poll(() => served(page), { message: "diners read the other tab's note" })
    .toContain(theirs);

  // A value put in the row with no diner page cleared: a diner's page keeps
  // the other tab's note until something clears it.
  const unseen = "Changed with no page cleared.";
  const response = await fetch(
    `${standin}/rest/v1/restaurants?code=eq.${code}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allergen_note: unseen }),
    },
  );
  expect(response.ok).toBe(true);
  expect(await served(page), "nothing cleared the page").toContain(theirs);

  const before = await stored();
  const writes = await detailsWrites();
  const mine = "This tab's allergen note.";
  await note.fill(mine);
  await phone.fill("(610) 555-0100");
  await saveRefused(page);
  await expect(note, "what was typed is kept").toHaveValue(mine);
  await expect(phone).toHaveValue("(610) 555-0100");
  expect(await detailsWrites(), "one statement, which matched no row").toBe(
    writes + 1,
  );
  expect(await stored(), "nothing was written").toEqual(before);

  const read = await served(page);
  expect(read, "the refused Save cleared no diner page").toContain(theirs);
  expect(read).not.toContain(unseen);
  expect(read).not.toContain(mine);

  // Loaded again, the page shows the row as it is, and its Save lands.
  await openDetails(page);
  await expect(note).toHaveValue(unseen);
  await note.fill(mine);
  await save(page);
  expect((await stored()).allergen_note).toBe(mine);
  await expect.poll(() => served(page)).toContain(mine);
});

test("a newer render of Details that arrives under the form changes nothing the form shows and nothing its Save hands back: the Save is refused as moved, and the other tab's name and time zone stand", async ({
  page,
  browser,
}) => {
  await openDetails(page);
  const mounted = await stored();
  const name = field(page, strings.fields.name);
  await expect(name).toHaveValue(mounted.name);
  await expect(zone(page)).toContainText(strings.timezones["America/New_York"]);

  const theirs = "CI Diner renamed (test restaurant, not real)";
  await inAnotherTab(browser, page, async (other) => {
    await field(other, strings.fields.name).fill(theirs);
    await zone(other).click();
    await other
      .getByRole("option", {
        name: strings.timezones["America/Chicago"],
        exact: true,
      })
      .click();
    await save(other);
  });

  // The server renders this tab's page again, under the form, as a renewed
  // session or a landed save can: Next's own router, asked from the page.
  await page.evaluate(() => {
    const { next } = window as unknown as {
      next: { router: { refresh: () => void } };
    };
    next.router.refresh();
  });
  await expect(
    page.getByRole("navigation", { name: theirs, exact: true }),
    "the newer render arrived: the bar above the page names the restaurant as it is now",
  ).toHaveCount(1);
  await expect(name, "the form still shows what it mounted with").toHaveValue(
    mounted.name,
  );
  await expect(
    zone(page),
    "the time zone stays the one the form mounted with",
  ).toContainText(strings.timezones["America/New_York"]);

  const writes = await detailsWrites();
  await field(page, strings.fields.allergenNote).fill("Typed after it.");
  await saveRefused(page);
  expect(await detailsWrites(), "one statement, which matched no row").toBe(
    writes + 1,
  );
  expect(await stored(), "the other tab's save stands").toMatchObject({
    name: theirs,
    timezone: "America/Chicago",
    allergen_note: null,
  });
});

test("hours stored in a shape the page does not read, as SQL or an import could leave them, are handed back as the text they were read as, so a Save still lands", async ({
  page,
}) => {
  await knob("set-hours", {
    hours: JSON.stringify({ zebra: [3, 2, 1], mon: "closed", apple: null }),
  });
  await openDetails(page);
  await field(page, strings.fields.allergenNote).fill("Hours are on the door.");
  await save(page);
  expect(await stored()).toMatchObject({
    allergen_note: "Hours are on the door.",
    // The form read no hours it knows, so it posted none.
    hours: null,
  });
});

test.describe("with the browser in Chicago", () => {
  test.use({ timezoneId: "America/Chicago" });

  test("the form for a new restaurant still starts on the browser's time zone, and Details shows the stored one", async ({
    page,
  }) => {
    await page.goto("/app/restaurants/new");
    await page.waitForLoadState("networkidle");
    await expect(zone(page)).toContainText(
      strings.timezones["America/Chicago"],
    );
    await openDetails(page);
    await expect(zone(page)).toContainText(
      strings.timezones["America/New_York"],
    );
  });
});
