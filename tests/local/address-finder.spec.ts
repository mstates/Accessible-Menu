import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import { fieldId, restaurantDetailsPath } from "../../src/features/owner/paths";
import { expectNoAxeViolations, expectNoMissingIds } from "../a11y/checks";
import { ownerEnv } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { chromeName, expectNamedByOneLabel } from "./chrome-name";

// The address finder on the details form (D-83, D-87, D-200) against the
// stand-in, whose fake Places endpoints answer the route with no key and
// no network: a search field with the last reply's matches listed under it
// in the page flow, as buttons. Typing lists the matches and says their
// count once through the page's polite log; a pick fills the four fields,
// says so, empties the list, keeps the match's text in the field, and
// moves focus to Street address; an edit after the pick stays; the save
// sends the parts; a lookup that fails says once that matches are not
// available; Return runs the lookup at once and never saves the page;
// Escape and the clear button empty the field and the list and stop a
// lookup in flight; the last list stays until the next reply lands; and
// the field is named once by its label with the hint as its description.
// Everything said is read from the page's own log, never from React Aria's
// announcer, which the finder no longer uses. The owner gate renders the
// finder on the stand-in and on the preview but never types into it
// (write-guard.ts).

const { code } = ownerEnv();
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const restaurants = en.owner.restaurants;
const finder = restaurants.finder;
const mainStreet = "2 Main Street, Reading, PA, USA";
const bistro = "Stand-in Bistro, Penn Street, Reading, PA, USA";

type PlacesCall = {
  call: "suggest" | "pick";
  input?: string | null;
  id?: string;
  session: string | null;
};

async function knob(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response;
}

// The stand-in's places log, cleared by the read.
async function placesLog(): Promise<PlacesCall[]> {
  return (await (await knob("places-log")).json()) as PlacesCall[];
}

// The inputs of the suggests in the log, in order; the read clears it.
async function suggests(): Promise<(string | null | undefined)[]> {
  return (await placesLog())
    .filter((each) => each.call === "suggest")
    .map((each) => each.input);
}

async function writes(): Promise<string[]> {
  return (await (await knob("writes")).json()) as string[];
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

// The count sentence for a reply, as the finder builds it.
function counted(count: number): string {
  return fill(count === 1 ? finder.count.one : finder.count.other, { count });
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function finderField(page: Page) {
  return page.getByRole("searchbox", { name: finder.label, exact: true });
}

function matchList(page: Page) {
  return page.getByRole("list", { name: finder.matchesLabel, exact: true });
}

function match(page: Page, text: string) {
  return matchList(page).getByRole("button", { name: text, exact: true });
}

function clearButton(page: Page) {
  return page.getByRole("button", { name: finder.clearLabel, exact: true });
}

async function openDetails(page: Page) {
  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
}

test.afterEach(async () => {
  await knob("reset-details");
  await knob("places-log");
});

test("typing in the finder lists the stand-in's matches under the field and says their count, a pick by keyboard fills the four fields, says so, and moves focus to Street address, an edit after the pick stays, the save sends the parts, and the next lookup gets a new session", async ({
  page,
}) => {
  await openDetails(page);
  const writesBefore = (await writes()).length;
  const box = finderField(page);
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("type", "search");
  await expect(box).toHaveAttribute("enterkeyhint", "search");
  await expect(
    clearButton(page),
    "no clear button while the field is empty",
  ).toHaveCount(0);
  await expect(matchList(page), "no list until a reply").toHaveCount(0);

  await box.fill("2 Mai");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect.poll(() => said(page, counted(1))).toBe(1);
  await expect(clearButton(page)).toBeVisible();

  // Tab from the field lands on the match: the clear button is out of the
  // tab order.
  await page.keyboard.press("Tab");
  await expect(match(page, mainStreet)).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(field(page, restaurants.fields.address)).toHaveValue(
    "2 Main Street, Suite 2",
  );
  await expect(field(page, restaurants.fields.city)).toHaveValue("Reading");
  await expect(page.locator('select[name="region"]')).toHaveValue("PA");
  await expect(
    page.getByRole("button").filter({ hasText: restaurants.states.PA }),
  ).toBeVisible();
  await expect(field(page, restaurants.fields.postalCode)).toHaveValue(
    "19601-1234",
  );
  await expect.poll(() => said(page, finder.filled)).toBe(1);
  await expect(matchList(page), "the list is gone").toHaveCount(0);
  await expect(box).toHaveValue(mainStreet);
  await expect(
    clearButton(page),
    "the field keeps the match's text",
  ).toBeVisible();
  await expect(
    field(page, restaurants.fields.address),
    "focus moves to Street address",
  ).toBeFocused();
  expect(
    (await writes()).length,
    "the finder writes nothing to the restaurant",
  ).toBe(writesBefore);

  // One session a lookup: every suggest and the pick carried the same
  // token, a UUID the browser made; the pick spent it.
  const first = await placesLog();
  expect(first.at(-1)).toMatchObject({ call: "pick", id: "standin-2-main" });
  expect(
    first.filter((each) => each.call === "suggest").length,
  ).toBeGreaterThan(0);
  const tokens = new Set(first.map((each) => each.session));
  expect(tokens.size).toBe(1);
  const [token] = tokens;
  expect(token).toMatch(/^[0-9a-f-]{36}$/);

  // The next lookup gets a new token; Escape in the field empties it and
  // the list, with focus kept in the field.
  await box.fill("bistro");
  await expect(match(page, bistro)).toBeVisible();
  const second = await placesLog();
  expect(second.every((each) => each.call === "suggest")).toBe(true);
  expect(second[0]?.session).toMatch(/^[0-9a-f-]{36}$/);
  expect(second[0]?.session).not.toBe(token);
  await page.keyboard.press("Escape");
  await expect(box).toHaveValue("");
  await expect(matchList(page)).toHaveCount(0);
  await expect(box).toBeFocused();

  // What the finder filled is the owner's to change, and the save sends
  // the four parts as the form holds them.
  await field(page, restaurants.fields.city).fill("West Reading");
  await page
    .getByRole("button", { name: restaurants.details.submit, exact: true })
    .click();
  await page.waitForURL(/saved=/);
  const patch = (await writes())
    .filter((each) => each.startsWith("PATCH restaurants "))
    .at(-1);
  expect(patch).toBeDefined();
  const payload = JSON.parse(
    String(patch).slice("PATCH restaurants ".length),
  ) as Record<string, unknown>;
  expect(payload).toMatchObject({
    address: "2 Main Street, Suite 2",
    city: "West Reading",
    region: "PA",
    postal_code: "19601-1234",
  });
  await expect(field(page, restaurants.fields.city)).toHaveValue(
    "West Reading",
  );
});

test("a lookup that fails says once that matches are not available, lists nothing, and leaves the fields as typed", async ({
  page,
}) => {
  await openDetails(page);
  await field(page, restaurants.fields.address).fill("9 Hand Street");
  await knob("places-fail");
  const box = finderField(page);
  await box.fill("2 Mai");
  await expect.poll(() => said(page, finder.unavailable)).toBe(1);
  await expect(matchList(page)).toHaveCount(0);

  // The next lookup is answered, and the sentence is not said again.
  await box.pressSequentially("n");
  await expect(match(page, mainStreet)).toBeVisible();
  expect(await said(page, finder.unavailable), "said once").toBe(1);
  await expect(field(page, restaurants.fields.address)).toHaveValue(
    "9 Hand Street",
  );
});

test("the finder is a search field named once by its label, which is for the input, the hint describes it, the matches are a list of buttons in the Location group between the field and Street address, Return runs the lookup at once and never saves, and axe finds nothing with the matches listed", async ({
  page,
}) => {
  await openDetails(page);
  const box = finderField(page);
  const id = fieldId("addressFinder");
  await expect(box).toHaveAttribute("id", id);
  await expect(box).not.toHaveAttribute("aria-label");
  const labelledBy = await box.getAttribute("aria-labelledby");
  expect(labelledBy, "named by one label").toMatch(/^\S+$/);
  const label = page.locator(`[id="${labelledBy}"]`);
  await expect(label).toHaveText(finder.label);
  await expect(label).toHaveAttribute("for", id);
  expect(
    await chromeName(page, id),
    "Chrome names the field by its label alone",
  ).toBe(finder.label);
  // A label of plain visible words is one node already (D-193).
  await expectNamedByOneLabel(page, id, finder.label);

  await expect(box).toHaveAccessibleDescription(finder.hint);
  const hintId = await page
    .getByText(finder.hint, { exact: true })
    .getAttribute("id");
  expect(hintId).toBeTruthy();
  expect((await box.getAttribute("aria-describedby"))?.split(/\s+/)).toContain(
    hintId,
  );

  // No combobox and nothing of one: the field expands nothing and opens no
  // popup.
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(box).not.toHaveAttribute("aria-expanded");
  await expect(box).not.toHaveAttribute("aria-haspopup");

  // Both of the stand-in's places hold "Reading".
  await box.fill("Rea");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect(match(page, bistro)).toBeVisible();
  await expect.poll(() => said(page, counted(2))).toBe(1);

  // The matches: a ul named from copy inside the Location group, after the
  // finder and before Street address, each item one button and nothing
  // else; no listbox, no option, nothing hidden around them.
  const list = matchList(page);
  await expect(
    page
      .getByRole("group", { name: restaurants.sections.location })
      .getByRole("list", { name: finder.matchesLabel, exact: true }),
  ).toHaveCount(1);
  expect(await list.evaluate((element) => element.tagName)).toBe("UL");
  await expect(list.locator("> li")).toHaveCount(2);
  await expect(list.locator("> li > button")).toHaveCount(2);
  expect(
    await list.evaluate((element) =>
      Array.from(element.querySelectorAll("li")).every(
        (item) =>
          item.children.length === 1 &&
          item.children[0]?.tagName === "BUTTON" &&
          item.textContent?.trim() === item.children[0].textContent?.trim(),
      ),
    ),
    "each item holds one button and nothing else",
  ).toBe(true);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(0);
  const order = await list.evaluate(
    (element, ids) => {
      const finderInput = document.getElementById(ids.finder);
      const street = document.getElementById(ids.street);
      if (!finderInput || !street) return null;
      const following = Node.DOCUMENT_POSITION_FOLLOWING;
      return {
        afterFinder: Boolean(
          finderInput.compareDocumentPosition(element) & following,
        ),
        beforeStreet: Boolean(
          element.compareDocumentPosition(street) & following,
        ),
      };
    },
    { finder: id, street: fieldId("address") },
  );
  expect(order, "after the finder, before Street address").toEqual({
    afterFinder: true,
    beforeStreet: true,
  });

  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.incomplete.map((each) => each.id),
    "axe has nothing to review either",
  ).toEqual([]);

  // Return runs the lookup at once and says the count again; the form
  // never submits, so nothing is saved and the page stays.
  const writesBefore = (await writes()).length;
  const url = page.url();
  expect(await suggests()).toEqual(["Rea"]);
  await box.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, counted(2))).toBe(2);
  expect(page.url()).toBe(url);
  expect(await suggests(), "the lookup went at once").toEqual(["Rea"]);
  expect((await writes()).length, "Return saves nothing").toBe(writesBefore);

  // Under three characters Return sends nothing and saves nothing; the
  // next character's lookup is the only one in the log after it.
  await box.fill("Re");
  await expect(matchList(page)).toHaveCount(0);
  await page.keyboard.press("Enter");
  await box.pressSequentially("a");
  await expect(match(page, bistro)).toBeVisible();
  expect(await suggests(), "nothing was sent for two characters").toEqual([
    "Rea",
  ]);
  expect(page.url()).toBe(url);
  expect((await writes()).length).toBe(writesBefore);
});

test("under three characters the list empties and nothing is said, typing back brings the count once, and a text with no match empties the list and says so once", async ({
  page,
}) => {
  await openDetails(page);
  const box = finderField(page);
  await box.fill("2 Mai");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect.poll(() => said(page, counted(1))).toBe(1);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(box).toHaveValue("2 ");
  await expect(matchList(page)).toHaveCount(0);
  await expect(clearButton(page), "the field still holds text").toBeVisible();

  await box.pressSequentially("Ma");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect
    .poll(() => said(page, counted(1)), {
      message: "emptying under three characters says nothing",
    })
    .toBe(2);
  expect(await said(page, finder.noMatches)).toBe(0);

  // A reply with no match empties the list and says so, once, when the
  // reply lands.
  await box.pressSequentially("xyz");
  await expect(matchList(page)).toHaveCount(0);
  await expect
    .poll(() => said(page, finder.noMatches), {
      message: "no matches, once, for the reply",
    })
    .toBe(1);
  expect(await said(page, counted(1))).toBe(2);
  expect(await suggests(), "no lookup under three characters").toEqual([
    "2 Mai",
    "2 Ma",
    "2 Maxyz",
  ]);
});

test("Escape and the clear button empty the field and the list with focus kept in the field, the last list stays until the next reply lands, and a lookup in flight when the field is cleared never lands", async ({
  page,
}) => {
  await openDetails(page);
  // Every lookup for "2 Main" waits here until the test lets it through.
  const held: (() => void)[] = [];
  let continued = 0;
  await page.route("**/api/address", async (route) => {
    const body = route.request().postDataJSON() as {
      kind?: string;
      input?: string;
    };
    if (body.kind === "suggest" && body.input === "2 Main") {
      await new Promise<void>((resolve) => held.push(resolve));
    }
    await route.continue();
    continued += 1;
  });
  const box = finderField(page);
  await box.fill("2 Mai");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect.poll(() => said(page, counted(1))).toBe(1);

  // Escape empties the field and the list; the clear button goes with the
  // text; focus stays in the field.
  await page.keyboard.press("Escape");
  await expect(box).toHaveValue("");
  await expect(matchList(page)).toHaveCount(0);
  await expect(clearButton(page)).toHaveCount(0);
  await expect(box).toBeFocused();

  // The clear button: shown while the field holds text, out of the tab
  // order, named from copy and not by React Aria's own words, and a press
  // empties the field and the list with focus kept in the field.
  await box.fill("2 Mai");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect.poll(() => said(page, counted(1))).toBe(2);
  const clear = clearButton(page);
  await expect(clear).toBeVisible();
  await expect(clear).toHaveAttribute("tabindex", "-1");
  await expect(clear).toHaveAccessibleName(finder.clearLabel);
  await expect(clear).not.toHaveAttribute("aria-label", "Clear search");
  await clear.click();
  await expect(box).toHaveValue("");
  await expect(matchList(page)).toHaveCount(0);
  await expect(clear).toHaveCount(0);
  await expect(box).toBeFocused();

  // A lookup in flight: the last list stays until the reply lands (Q-112);
  // a clear aborts the lookup, so nothing lands once it is let through.
  await box.fill("2 Mai");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect.poll(() => said(page, counted(1))).toBe(3);
  await box.pressSequentially("n");
  await expect.poll(() => held.length).toBe(1);
  await expect(
    match(page, mainStreet),
    "the last list stays while the lookup is in flight",
  ).toBeVisible();
  const aborted = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/api/address"),
  );
  await page.keyboard.press("Escape");
  await aborted;
  await expect(box).toHaveValue("");
  await expect(matchList(page)).toHaveCount(0);
  const before = continued;
  held.shift()?.();
  await expect.poll(() => continued).toBe(before + 1);
  await expect(matchList(page), "nothing lands after the clear").toHaveCount(0);
  expect(await said(page, counted(1)), "nothing said after the clear").toBe(3);
  expect(
    await suggests(),
    "the aborted lookup never reached the stand-in",
  ).toEqual(["2 Mai", "2 Mai", "2 Mai"]);
});

test("a reply with several matches says their count once, and a pick by pointer fills the fields, keeps the match's text, moves focus to Street address, and counts nothing", async ({
  page,
}) => {
  await openDetails(page);
  const box = finderField(page);
  await box.fill("Rea");
  await expect(match(page, mainStreet)).toBeVisible();
  await expect(match(page, bistro)).toBeVisible();
  await expect.poll(() => said(page, counted(2))).toBe(1);
  await match(page, mainStreet).click();
  await expect(field(page, restaurants.fields.address)).toHaveValue(
    "2 Main Street, Suite 2",
  );
  await expect.poll(() => said(page, finder.filled)).toBe(1);
  await expect(matchList(page)).toHaveCount(0);
  await expect(box).toHaveValue(mainStreet);
  await expect(field(page, restaurants.fields.address)).toBeFocused();
  expect(
    await said(page, counted(2)),
    "the count once, when the reply landed",
  ).toBe(1);
  expect(await said(page, counted(1)), "nothing counted on the pick").toBe(0);
  expect((await placesLog()).at(-1)).toMatchObject({
    call: "pick",
    id: "standin-2-main",
  });
});
