import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fieldId, restaurantDetailsPath } from "../../src/features/owner/paths";
import { expectNoAxeViolations, expectNoMissingIds } from "../a11y/checks";
import { ownerEnv } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { chromeName, expectNamedByOneLabel } from "./chrome-name";

// The address finder on the details form (D-83, D-87) against the stand-in,
// whose fake Places endpoints answer the route with no key and no network:
// typing lists the matches, a pick fills the four fields and says so, an
// edit after the pick stays, the save sends the parts, and a lookup that
// fails says once that matches are not available. Then what the finder is
// heard as (D-187): named once by its label, with the hint as its
// description and the button under its own name; a second lookup silent
// until the third character brings the new count; an open list closed, not
// emptied, under three characters; zero said once for a text with no match;
// and a list that never reopens on a keystroke, nor when a reply lands for
// a list the owner closed. And a pick from a reply with several matches
// (D-188): the match's words, then the words with "selected", no count
// between, since the list keeps its items while it is open. The gate never
// sees the finder on the preview until the key is set there, and never
// types into it (write-guard.ts).

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

async function placesLog(): Promise<PlacesCall[]> {
  return (await (await knob("places-log")).json()) as PlacesCall[];
}

async function writes(): Promise<string[]> {
  return (await (await knob("writes")).json()) as string[];
}

async function said(page: Page, sentence: string): Promise<number> {
  return (await heard(page)).filter((each) => each === sentence).length;
}

// React Aria's own announcer, where the combobox says how many options the
// list holds: a div put before everything in body on its first message,
// holding two logs, assertive and polite, each message a child removed
// after seven seconds. The div is not there until something is said, so
// the observer watches body and keeps what lands in those logs.
async function hearReactAria(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __announced: string[] };
    w.__announced = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const log = record.target as Element;
        if (log.getAttribute?.("role") !== "log") continue;
        if (!log.closest('[data-live-announcer="true"]')) continue;
        for (const node of record.addedNodes) {
          w.__announced.push(node.textContent ?? "");
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

// Everything React Aria said, in order: the counts, and, on what React
// Aria takes for an Apple platform, the focused option's words and the
// pick's words with "selected".
async function announced(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __announced: string[] }).__announced,
  );
}

// What React Aria said about the count of options, in order. The focus and
// selection messages it also says on Apple platforms are left out.
async function counted(page: Page): Promise<string[]> {
  const all = await announced(page);
  return all.filter((each) => /^\d+ options? available\.$/.test(each));
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function finderField(page: Page) {
  return page.getByRole("combobox", { name: finder.label, exact: true });
}

function finderButton(page: Page) {
  return page.getByRole("button", { name: finder.buttonLabel, exact: true });
}

function option(page: Page, text: string) {
  return page.getByRole("option", { name: text, exact: true });
}

function options(page: Page) {
  return page.getByRole("option");
}

async function openDetails(page: Page) {
  await page.goto(restaurantDetailsPath(code));
  await page.waitForLoadState("networkidle");
  await hearLog(page);
  await hearReactAria(page);
}

test.afterEach(async () => {
  await knob("reset-details");
  await knob("places-log");
});

test("typing in the finder lists the stand-in's matches, a pick fills the four fields and says so, an edit after the pick stays, the save sends the parts, and the next lookup gets a new session", async ({
  page,
}) => {
  await openDetails(page);
  const writesBefore = (await writes()).length;
  const box = finderField(page);
  await expect(box).toBeVisible();
  await box.fill("2 Mai");
  await expect(option(page, mainStreet)).toBeVisible();
  await page.keyboard.press("ArrowDown");
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
  await expect(box).toHaveValue(mainStreet);
  await expect(box).toBeFocused();
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

  await box.fill("bistro");
  await expect(option(page, bistro)).toBeVisible();
  const second = await placesLog();
  expect(second.every((each) => each.call === "suggest")).toBe(true);
  expect(second[0]?.session).toMatch(/^[0-9a-f-]{36}$/);
  expect(second[0]?.session).not.toBe(token);
  await page.keyboard.press("Escape");
  await expect(options(page)).toHaveCount(0);

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
  await expect(options(page)).toHaveCount(0);

  // The next lookup is answered, and the sentence is not said again.
  await box.pressSequentially("n");
  await expect(option(page, mainStreet)).toBeVisible();
  expect(await said(page, finder.unavailable), "said once").toBe(1);
  // While the list is open React Aria hides the rest of the page from
  // assistive technology, so the list is closed before the field is read.
  await page.keyboard.press("Escape");
  await expect(options(page)).toHaveCount(0);
  await expect(field(page, restaurants.fields.address)).toHaveValue(
    "9 Hand Street",
  );
});

test("the finder is named once by its label, which is for the input, the hint describes it, the button keeps its own name, and axe finds nothing with the list closed", async ({
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

  // React Aria would name the button with the field's label after its own
  // words; the button's words are its whole name (D-187).
  await expect(finderButton(page)).toHaveCount(1);
  await expect(finderButton(page)).not.toHaveAttribute("aria-labelledby");

  await expectNoMissingIds(page);
  await expectNoAxeViolations(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.incomplete.map((each) => each.id),
    "axe has nothing to review either",
  ).toEqual([]);
});

test("a second lookup in the finder is silent: after a pick nothing opens the gone list, one and two characters say nothing, and the third brings the new count once", async ({
  page,
}) => {
  await openDetails(page);
  const box = finderField(page);
  await box.fill("2 Mai");
  await expect(option(page, mainStreet)).toBeVisible();
  await expect.poll(() => counted(page)).toEqual(["1 option available."]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, finder.filled)).toBe(1);
  await expect(options(page)).toHaveCount(0);
  await expect(box).toBeFocused();

  // The picked list is gone: the arrow keys and the button open nothing.
  await page.keyboard.press("ArrowDown");
  await expect(options(page)).toHaveCount(0);
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await finderButton(page).click();
  await expect(options(page)).toHaveCount(0);
  await expect(box).toBeFocused();

  await box.fill("b");
  await box.pressSequentially("i");
  await expect(options(page)).toHaveCount(0);
  await box.pressSequentially("s");
  await expect(option(page, bistro)).toBeVisible();
  await expect
    .poll(() => counted(page), {
      message: "one count a reply, and nothing said between",
    })
    .toEqual(["1 option available.", "1 option available."]);
  const suggests = (await placesLog())
    .filter((each) => each.call === "suggest")
    .map((each) => each.input);
  expect(suggests, "no lookup under three characters").toEqual([
    "2 Mai",
    "bis",
  ]);
});

test("under three characters the finder closes an open list and nothing opens it, typing back brings the count once, and a text with no match says zero once", async ({
  page,
}) => {
  await openDetails(page);
  const box = finderField(page);
  await box.fill("2 Mai");
  await expect(option(page, mainStreet)).toBeVisible();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(box).toHaveValue("2 ");
  await expect(options(page)).toHaveCount(0);
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(options(page)).toHaveCount(0);

  await box.pressSequentially("Ma");
  await expect(option(page, mainStreet)).toBeVisible();
  await expect
    .poll(() => counted(page), {
      message: "closing under three characters says nothing",
    })
    .toEqual(["1 option available.", "1 option available."]);

  // A reply with no match is the one time zero is said: once, when the
  // reply lands, and the list closes.
  await box.pressSequentially("xyz");
  await expect(options(page)).toHaveCount(0);
  await expect
    .poll(() => counted(page), { message: "zero once, for the reply" })
    .toEqual([
      "1 option available.",
      "1 option available.",
      "0 options available.",
    ]);
});

test("the finder's list never reopens on a keystroke: a list closed with Escape stays closed when the lookup in flight lands, and typing on opens it only through the next reply", async ({
  page,
}) => {
  await openDetails(page);
  // Every lookup for "2 Main" waits here until the test lets it through,
  // so a keystroke can be seen on its own, before its reply.
  const held: (() => void)[] = [];
  await page.route("**/api/address", async (route) => {
    const body = route.request().postDataJSON() as {
      kind?: string;
      input?: string;
    };
    if (body.kind === "suggest" && body.input === "2 Main") {
      await new Promise<void>((resolve) => held.push(resolve));
    }
    await route.continue();
  });
  const box = finderField(page);
  await box.fill("2 Mai");
  await expect(option(page, mainStreet)).toBeVisible();

  await box.pressSequentially("n");
  await expect.poll(() => held.length).toBe(1);
  await page.keyboard.press("Escape");
  await expect(options(page)).toHaveCount(0);
  const landed = page.waitForResponse("**/api/address");
  held.shift()?.();
  await landed;
  await expect(
    options(page),
    "the reply does not reopen a list the owner closed",
  ).toHaveCount(0);

  await box.pressSequentially(" ");
  await expect.poll(() => held.length).toBe(1);
  await expect(options(page), "a keystroke opens nothing").toHaveCount(0);
  held.shift()?.();
  await expect(option(page, mainStreet)).toBeVisible();
  await expect
    .poll(() => counted(page), { message: "one count per list opened" })
    .toEqual(["1 option available.", "1 option available."]);
});

test("a pick from a reply with several matches is said with no count: the count once when the list opened, and nothing counted on the pick", async ({
  page,
}) => {
  await openDetails(page);
  const box = finderField(page);
  // Both of the stand-in's places hold "Reading".
  await box.fill("Rea");
  await expect(option(page, mainStreet)).toBeVisible();
  await expect(option(page, bistro)).toBeVisible();
  await expect.poll(() => counted(page)).toEqual(["2 options available."]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(field(page, restaurants.fields.address)).toHaveValue(
    "2 Main Street, Suite 2",
  );
  await expect.poll(() => said(page, finder.filled)).toBe(1);
  await expect(options(page)).toHaveCount(0);
  await expect(box).toHaveValue(mainStreet);
  await expect(box).toBeFocused();

  // The count is said once, when the list opened, and never on the pick:
  // on 750b09b the pick's render handed the list over as nothing while it
  // was still open, React Aria filtered the reply it still held by the
  // picked text, and said "1 option available." before "selected". The
  // match's words and the pick's "selected" are said on Apple platforms
  // only, by React Aria's own test, which this Chromium does not pass, so
  // they are read when they are there and heard on the iPhone otherwise.
  expect(
    await counted(page),
    "the count was said once, when the list opened",
  ).toEqual(["2 options available."]);
  const all = await announced(page);
  const words = all.indexOf(mainStreet);
  const selected = all.indexOf(`${mainStreet}, selected`);
  if (words !== -1 || selected !== -1) {
    expect(words, "the match's words, when the arrow reached them").toBe(1);
    expect(selected, "the pick, right after the words").toBe(2);
  }
});
