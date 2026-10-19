import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { restaurantDetailsPath } from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// The address finder on the details form (D-83, D-87) against the stand-in,
// whose fake Places endpoints answer the route with no key and no network:
// typing lists the matches, a pick fills the four fields and says so, an
// edit after the pick stays, the save sends the parts, and a lookup that
// fails says once that matches are not available. The gate never sees the
// finder on the preview until the key is set there, and never types into
// it (write-guard.ts).

const { code } = ownerEnv();
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const restaurants = en.owner.restaurants;
const finder = restaurants.finder;

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

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function finderField(page: Page) {
  return page.getByRole("combobox", { name: finder.label, exact: true });
}

function option(page: Page, text: string) {
  return page.getByRole("option", { name: text, exact: true });
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

test("typing in the finder lists the stand-in's matches, a pick fills the four fields and says so, an edit after the pick stays, the save sends the parts, and the next lookup gets a new session", async ({
  page,
}) => {
  await openDetails(page);
  const writesBefore = (await writes()).length;
  const box = finderField(page);
  await expect(box).toBeVisible();
  await box.fill("2 Mai");
  await expect(option(page, "2 Main Street, Reading, PA, USA")).toBeVisible();
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
  await expect(box).toHaveValue("2 Main Street, Reading, PA, USA");
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
  await expect(
    option(page, "Stand-in Bistro, Penn Street, Reading, PA, USA"),
  ).toBeVisible();
  const second = await placesLog();
  expect(second.every((each) => each.call === "suggest")).toBe(true);
  expect(second[0]?.session).toMatch(/^[0-9a-f-]{36}$/);
  expect(second[0]?.session).not.toBe(token);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);

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
  await expect(page.getByRole("option")).toHaveCount(0);

  // The next lookup is answered, and the sentence is not said again.
  await box.pressSequentially("n");
  await expect(option(page, "2 Main Street, Reading, PA, USA")).toBeVisible();
  expect(await said(page, finder.unavailable), "said once").toBe(1);
  // While the list is open React Aria hides the rest of the page from
  // assistive technology, so the list is closed before the field is read.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(field(page, restaurants.fields.address)).toHaveValue(
    "9 Hand Street",
  );
});
