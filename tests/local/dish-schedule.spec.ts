import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  formatDate,
  formatDayAndDate,
  parseDate,
  todayIn,
} from "../../src/domain/date";
import { shiftDay } from "../../src/domain/timezones";
import { dayKeyOf } from "../../src/domain/hours";
import { menuPath } from "../../src/domain/menu-url";
import {
  scheduleSentence,
  showingAt,
  showingSentence,
  type Schedule,
} from "../../src/domain/schedule";
import { formatTime } from "../../src/domain/time";
import {
  restaurantDishPagePath,
  type DishPageSlug,
} from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture, ownerStatePath } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";
import { saveAndFail, saveAndLand, summary } from "./save";

// The dietary tags with Cooked to order, and availability with the
// schedule, on a dish's two pages that save by one press (task 5, D-66,
// D-159, D-160, D-223, D-229), with saves that land for real against the
// stand-in: a tag and Cooked to order in one save, kept after the reload
// the save brings, and undone the same way; a page whose tags moved under
// it refused with one sentence in the summary and nothing written; a save
// the server refuses kept and landed by the next press; Sold out today
// with the line saying when it comes back, from the restaurant's hours,
// and Off the menu for now, each put back to Available; a mark that has
// ended reading as available; a schedule-only save that keeps the mark; a
// day, the hours pair saved as one and shown in one format, dates in their
// forms, Today only filling the fields for Save, a week with no day refused
// unsent, a month, and a schedule that moved under the page. Then each
// page with two tabs open (D-237): Cooked to order and the availability
// choice changed in a second tab each refuse this tab's Save, with nothing
// written and no diner page cleared; tags stored out of the enum's order
// and a mark stamped to the microsecond are handed back as they were read,
// so a Save still lands; and a newer render of either page that arrives
// under its form changes nothing the Save hands back. The gate cannot land
// a save, so this runs here. Each check leaves the stand-in as it found it,
// so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const tags = strings.tags;
const availability = strings.availability;
const schedule = strings.schedule;
const cookedToOrder = strings.cookedToOrder;
const editing = en.owner.editing;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const zone = "America/New_York";
const words = { ...en.schedule, day: en.owner.restaurants.days };

type Priced = "sizes" | "one" | "market";

// The tags live on the dish's Dietary tags page, availability and the
// schedule on its Availability page (D-222).
function dishPath(which: Priced, at: DishPageSlug): string {
  return restaurantDishPagePath(code, ownerFixture().dishes[which].id, at);
}

async function openDish(
  page: Page,
  which: Priced,
  at: DishPageSlug,
): Promise<void> {
  await page.goto(dishPath(which, at));
  await page.waitForLoadState("networkidle");
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForLoadState("networkidle");
}

function box(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

function radio(page: Page, name: string) {
  return page.getByRole("radio", { name, exact: true });
}

// Ticks a box or chooses a radio by its visible words: React Aria keeps
// the input under the label, where a pointer cannot reach it directly.
async function press(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
}

// The Cooked to order box by its words, inside its wrapper: the heading
// above says the same words (D-167).
async function pressCooked(page: Page): Promise<void> {
  await page
    .locator("#dish-cooked-to-order")
    .getByText(cookedToOrder.label, { exact: true })
    .click();
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function tagsLine(page: Page) {
  return page.locator("#dish-tags-sentence");
}

function scheduleLine(page: Page) {
  return page.locator("#dish-schedule-sentence");
}

function availabilityGroup(page: Page) {
  return page.getByRole("radiogroup", {
    name: availability.heading,
    exact: true,
  });
}

function saveTags(page: Page) {
  return saveAndLand(page, tags.submit, tags.saved);
}

function saveAvailability(page: Page) {
  return saveAndLand(page, availability.submit, availability.saved);
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: availability.submit, exact: true });
}

type Row = {
  id: string;
  name: string;
  dietary_tags: string[];
  cooked_to_order: boolean;
  available: boolean;
  sold_out_at: string | null;
  special_schedule: Schedule | null;
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

async function writesSoFar(): Promise<number> {
  const response = await fetch(`${standin}/__test/writes`);
  return ((await response.json()) as unknown[]).length;
}

async function knob(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${standin}/__test/${path}?${query}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
}

// What diners read for a schedule, and the line after it, as the page
// builds them from the same functions, with today in the restaurant's zone.
function reads(value: Schedule): string {
  const now = new Date();
  const today = todayIn(zone, now);
  const sentence = scheduleSentence(value, today, "en", words, en.time);
  const showing = showingSentence(
    showingAt(value, now, zone),
    value,
    now,
    zone,
    "en",
    schedule,
    en.time,
  );
  return `${fill(schedule.dinersRead, { sentence: `"${sentence}"` })} ${showing}`;
}

// A Save the browser refuses (D-229): nothing sent, the first field at
// fault focused with its problem, or the summary with three or more. The
// field is described by its problem alone while it stands, never its hint
// (D-230).
async function expectRefusedInField(
  page: Page,
  at: ReturnType<Page["getByRole"]>,
  message: string,
  sent: number,
) {
  await saveButton(page).click();
  await expect(at, "the first field at fault is focused").toBeFocused();
  await expect(at).toHaveAttribute("aria-invalid", "true");
  await expect(at).toHaveAccessibleDescription(message);
  await expect(summary(page)).toHaveCount(0);
  expect(await writesSoFar(), "nothing is sent").toBe(sent);
}

test("a tag tick and Cooked to order save together in one press, read under the group after the reload, hold, and the unticks save back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market", "tags");
  await expect(box(page, vegan)).not.toBeChecked();
  await expect(box(page, cookedToOrder.label)).toBeChecked();
  await expect(tagsLine(page)).toHaveCount(0);
  const sent = await writesSoFar();
  await press(page, vegan);
  await pressCooked(page);
  await expect(box(page, vegan)).toBeChecked();
  await expect(box(page, cookedToOrder.label)).not.toBeChecked();
  await expect(tagsLine(page), "the line follows the saved tags").toHaveCount(
    0,
  );
  expect(await writesSoFar(), "the ticks send nothing").toBe(sent);
  await saveTags(page);
  expect(await writesSoFar(), "one write for both").toBe(sent + 1);
  await expect(box(page, vegan)).toBeChecked();
  await expect(box(page, cookedToOrder.label)).not.toBeChecked();
  await expect(tagsLine(page)).toHaveText(
    fill(tags.dinersRead, { sentence: `"${vegan}."` }),
  );
  const saved = await row(dishes.market.id);
  expect(saved.dietary_tags).toEqual(["vegan"]);
  expect(saved.cooked_to_order).toBe(false);
  await expectNoMissingIds(page);
  await reload(page);
  await expect(box(page, vegan)).toBeChecked();

  // As it was.
  await press(page, vegan);
  await pressCooked(page);
  await saveTags(page);
  await expect(box(page, vegan)).not.toBeChecked();
  await expect(box(page, cookedToOrder.label)).toBeChecked();
  await expect(tagsLine(page)).toHaveCount(0);
  const back = await row(dishes.market.id);
  expect(back.dietary_tags).toEqual([]);
  expect(back.cooked_to_order).toBe(true);
});

test("a Save on a page whose tags moved under it is refused with one sentence in the summary, keeps the tick, changes nothing on the server, and a reload shows the tags as they are now", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  const vegetarian = en.dietary.names.vegetarian;
  await openDish(page, "market", "tags");
  await knob("set-tags", { id: dishes.market.id, tags: "vegetarian" });
  const sent = await writesSoFar();
  await press(page, vegan);
  await saveAndFail(page, tags.submit, tags.tagsMoved);
  await expect(box(page, vegan), "the tick is kept").toBeChecked();
  await expect(box(page, vegetarian)).not.toBeChecked();
  expect(
    await writesSoFar(),
    "one statement, refused by its condition, and no second",
  ).toBe(sent + 1);
  expect((await row(dishes.market.id)).dietary_tags).toEqual(["vegetarian"]);
  await expectNoMissingIds(page);
  await reload(page);
  await expect(box(page, vegetarian)).toBeChecked();
  await expect(box(page, vegan)).not.toBeChecked();
  // As it was.
  await knob("set-tags", { id: dishes.market.id, tags: "" });
});

test("a save the server refuses is kept with the failure in the summary, focused, and the next press lands it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market", "tags");
  await knob("fail", { times: "1" });
  await press(page, vegan);
  const failure = `${fill(tags.notSaved, { dish: dishes.market.name })} ${editing.problems.failed}`;
  await saveAndFail(page, tags.submit, failure);
  await expect(box(page, vegan), "the tick is kept").toBeChecked();
  await expect(box(page, vegan)).not.toHaveAttribute("aria-invalid");
  expect((await row(dishes.market.id)).dietary_tags).toEqual([]);
  await saveTags(page);
  await expect(box(page, vegan)).toBeChecked();
  expect((await row(dishes.market.id)).dietary_tags).toEqual(["vegan"]);
  // As it was.
  await press(page, vegan);
  await saveTags(page);
  expect((await row(dishes.market.id)).dietary_tags).toEqual([]);
});

test("Sold out today saved reads when it comes back under the group, holds after a reload, and Available saved clears the mark", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  // With no hours the mark ends at midnight; the stand-in carries CI
  // Diner's hours, so they are taken away for this check and put back at
  // its end.
  await knob("set-hours", { hours: "null" });
  await openDish(page, "one", "availability");
  await expect(radio(page, availability.available)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription("");
  await press(page, availability.soldOut);
  await expect(radio(page, availability.soldOut)).toBeChecked();
  await expect(
    availabilityGroup(page),
    "the line follows the saved choice",
  ).toHaveAccessibleDescription("");
  await saveAvailability(page);
  await expect(radio(page, availability.soldOut)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription(
    availability.endsMidnight,
  );
  expect((await row(dishes.one.id)).sold_out_at).not.toBeNull();
  expect((await row(dishes.one.id)).available).toBe(true);
  await expectNoMissingIds(page);
  await reload(page);
  await expect(radio(page, availability.soldOut)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription(
    availability.endsMidnight,
  );

  // As it was.
  await press(page, availability.available);
  await saveAvailability(page);
  await expect(radio(page, availability.available)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription("");
  expect((await row(dishes.one.id)).sold_out_at).toBeNull();
  await knob("reset-details", {});
});

test("the line reads the end of the restaurant's day from its hours: today by its time, tomorrow after midnight, and a named day when closed until then", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const today = todayIn(zone, new Date());
  const weekday = dayKeyOf(today);
  const inThreeDays = shiftDay(today, 3);
  try {
    await openDish(page, "one", "availability");

    await knob("set-hours", {
      hours: JSON.stringify({
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        [weekday]: [{ open: "00:30", close: "23:59" }],
      }),
    });
    await press(page, availability.soldOut);
    await saveAvailability(page);
    await expect(availabilityGroup(page)).toHaveAccessibleDescription(
      fill(availability.endsToday, { time: formatTime("23:59", en.time) }),
    );

    await knob("set-hours", {
      hours: JSON.stringify({
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        [weekday]: [{ open: "18:00", close: "02:00" }],
      }),
    });
    await reload(page);
    await expect(availabilityGroup(page)).toHaveAccessibleDescription(
      fill(availability.endsTomorrow, { time: formatTime("02:00", en.time) }),
    );

    await knob("set-hours", {
      hours: JSON.stringify({
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        [dayKeyOf(inThreeDays)]: [{ open: "11:00", close: "22:00" }],
      }),
    });
    await reload(page);
    await expect(availabilityGroup(page)).toHaveAccessibleDescription(
      fill(availability.endsOn, {
        date: formatDayAndDate(inThreeDays, today, "en"),
        time: formatTime("22:00", en.time),
      }),
    );
  } finally {
    await knob("set-hours", { hours: "null" });
    await knob("set-availability", {
      id: dishes.one.id,
      available: "1",
      sold_out_at: "",
    });
  }
});

test("Off the menu for now saved says diners do not see the dish, and Available saved brings it back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes", "availability");
  await press(page, availability.off);
  await saveAvailability(page);
  await expect(radio(page, availability.off)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription(
    availability.hidden,
  );
  expect((await row(dishes.sizes.id)).available).toBe(false);
  // As it was.
  await press(page, availability.available);
  await saveAvailability(page);
  await expect(radio(page, availability.available)).toBeChecked();
  expect((await row(dishes.sizes.id)).available).toBe(true);
});

test("a sold-out mark whose day has ended reads as available, a new mark saved lands over it, and a save that changes only the schedule keeps the mark", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const tuesday = en.owner.restaurants.days.tue;
  const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await knob("set-availability", {
    id: dishes.one.id,
    available: "1",
    sold_out_at: yesterday,
  });
  try {
    await openDish(page, "one", "availability");
    await expect(radio(page, availability.available)).toBeChecked();
    await expect(availabilityGroup(page)).toHaveAccessibleDescription("");
    await press(page, availability.soldOut);
    await saveAvailability(page);
    const mark = (await row(dishes.one.id)).sold_out_at ?? "";
    expect(mark > yesterday).toBe(true);

    // A schedule-only save never restamps the mark (D-229).
    await press(page, tuesday);
    await saveAvailability(page);
    const after = await row(dishes.one.id);
    expect(after.sold_out_at, "the mark is kept as it was").toBe(mark);
    expect(after.special_schedule).toEqual({ days: ["tue"] });
    await expect(radio(page, availability.soldOut)).toBeChecked();

    await press(page, tuesday);
    await saveAvailability(page);
    expect((await row(dishes.one.id)).special_schedule).toBeNull();
  } finally {
    await knob("set-availability", {
      id: dishes.one.id,
      available: "1",
      sold_out_at: "",
    });
  }
});

test("a day tick saved reads the sentence and the next day under the group, holds after a reload, and the untick saved clears it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const tuesday = en.owner.restaurants.days.tue;
  await openDish(page, "one", "availability");
  await expect(scheduleLine(page)).toHaveText(schedule.none);
  await press(page, tuesday);
  await expect(box(page, tuesday)).toBeChecked();
  await expect(
    scheduleLine(page),
    "the line follows the saved schedule",
  ).toHaveText(schedule.none);
  await saveAvailability(page);
  await expect(box(page, tuesday)).toBeChecked();
  await expect(scheduleLine(page)).toHaveText(reads({ days: ["tue"] }));
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["tue"],
  });
  await expectNoMissingIds(page);
  await reload(page);
  await expect(box(page, tuesday)).toBeChecked();
  await expect(scheduleLine(page)).toHaveText(reads({ days: ["tue"] }));

  // As it was.
  await press(page, tuesday);
  await saveAvailability(page);
  await expect(box(page, tuesday)).not.toBeChecked();
  await expect(scheduleLine(page)).toHaveText(schedule.none);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
});

test("the hours pair saves as one and comes back in one format, each refusal is unsent under the first field at fault with both sides marked when both are wrong, and both blank is no schedule", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one", "availability");
  const starts = field(page, schedule.starts);
  const ends = field(page, schedule.ends);
  await expect(starts).toHaveAccessibleDescription(schedule.hoursHint);
  await expect(ends).toHaveAccessibleDescription(schedule.hoursHint);
  const before = await writesSoFar();
  await starts.fill("4 pm");
  await page.keyboard.press("Tab");
  await expect(ends).toBeFocused();
  await ends.fill("9 pm");
  expect(await writesSoFar(), "typing sends nothing").toBe(before);
  await saveAvailability(page);
  expect(await writesSoFar()).toBe(before + 1);
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    hours: { open: "16:00", close: "21:00" },
  });
  await expect(scheduleLine(page)).toHaveText(
    reads({ hours: { open: "16:00", close: "21:00" } }),
  );

  await field(page, schedule.starts).fill("17:30");
  await saveAvailability(page);
  await expect(
    field(page, schedule.starts),
    "a saved time comes back in one format",
  ).toHaveValue("5:30 pm");
  await expect(field(page, schedule.ends)).toHaveValue("9 pm");

  // Each refusal, unsent (D-164 for the pair): Starts without am or pm,
  // Ends blank, the same time twice.
  const sent = await writesSoFar();
  await field(page, schedule.starts).fill("4");
  await expectRefusedInField(
    page,
    field(page, schedule.starts),
    schedule.errors.timeAmPmStarts,
    sent,
  );
  await field(page, schedule.starts).fill("4 pm");
  await field(page, schedule.ends).fill("");
  await expectRefusedInField(
    page,
    field(page, schedule.ends),
    schedule.errors.timePairEnds,
    sent,
  );
  await field(page, schedule.ends).fill("4 pm");
  await expectRefusedInField(
    page,
    field(page, schedule.ends),
    schedule.errors.sameTime,
    sent,
  );

  // Both wrong at once: both marked, Starts first, Starts focused.
  await field(page, schedule.starts).fill("");
  await field(page, schedule.ends).fill("abc");
  await expectRefusedInField(
    page,
    field(page, schedule.starts),
    schedule.errors.timePairStarts,
    sent,
  );
  await expect(field(page, schedule.ends)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(field(page, schedule.ends)).toHaveAccessibleDescription(
    schedule.errors.timeFormatEnds,
  );
  await expectNoMissingIds(page);

  // As it was: both blank is all day, which with nothing else is no
  // schedule.
  await field(page, schedule.ends).fill("");
  await saveAvailability(page);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
  await expect(scheduleLine(page)).toHaveText(schedule.none);
});

test("a date reads in each of its forms and comes back with its year, a day-first number and a last day before the first are refused unsent, and Today only fills both days for Save with its own sentence", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const today = todayIn(zone, new Date());
  await openDish(page, "one", "availability");
  await hearLog(page);
  await expect(field(page, schedule.firstDay)).toHaveAccessibleDescription(
    schedule.dateHint,
  );

  await field(page, schedule.firstDay).fill("10/31/2099");
  await saveAvailability(page);
  await expect(field(page, schedule.firstDay)).toHaveValue("October 31, 2099");
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    from: "2099-10-31",
  });

  const sent = await writesSoFar();
  await field(page, schedule.lastDay).fill("31/10/2099");
  await expectRefusedInField(
    page,
    field(page, schedule.lastDay),
    schedule.errors.dateFormat,
    sent,
  );
  await field(page, schedule.lastDay).fill("Oct 30, 2099");
  await expectRefusedInField(
    page,
    field(page, schedule.lastDay),
    schedule.errors.dateOrder,
    sent,
  );

  await field(page, schedule.lastDay).fill("November 5, 2099");
  await saveAvailability(page);
  await expect(field(page, schedule.lastDay)).toHaveValue("November 5, 2099");
  await expect(scheduleLine(page)).toHaveText(
    reads({ from: "2099-10-31", until: "2099-11-05" }),
  );

  // A date typed with no year is the next such day on or after today.
  const typed = parseDate("October 31", today);
  if (!typed.ok) throw new Error("October 31 did not read");
  await field(page, schedule.firstDay).fill("October 31");
  await saveAvailability(page);
  await expect(field(page, schedule.firstDay)).toHaveValue(
    formatDate(typed.day, "en"),
  );
  await field(page, schedule.firstDay).fill("10/31/2099");
  await saveAvailability(page);
  await hearLog(page);

  // Today only fills both fields in the page and says so once; nothing is
  // written until Save (D-229).
  const written = await writesSoFar();
  await page
    .getByRole("button", { name: schedule.todayOnly, exact: true })
    .click();
  const prefix = schedule.todayOnlyFilled.split("{date}")[0] ?? "";
  await expect
    .poll(
      async () =>
        (await heard(page)).filter((each) => each.startsWith(prefix)).length,
    )
    .toBe(1);
  await expect(field(page, schedule.firstDay)).toHaveValue(
    formatDate(today, "en"),
  );
  await expect(field(page, schedule.lastDay)).toHaveValue(
    formatDate(today, "en"),
  );
  await expect(
    scheduleLine(page),
    "the line follows the saved schedule",
  ).toHaveText(reads({ from: "2099-10-31", until: "2099-11-05" }));
  expect(await writesSoFar(), "the press writes nothing").toBe(written);
  await saveAvailability(page);
  await expect(scheduleLine(page)).toHaveText(
    reads({ from: today, until: today }),
  );
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    from: today,
    until: today,
  });
  await expectNoMissingIds(page);

  // As it was.
  await field(page, schedule.firstDay).fill("");
  await field(page, schedule.lastDay).fill("");
  await saveAvailability(page);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
});

test("a week with no day is refused unsent on Save with the week's box focused, lands with a day, and the day unticked alone is refused the same way until the week goes too", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const monday = en.owner.restaurants.days.mon;
  const first = schedule.weeks.first;
  await openDish(page, "one", "availability");
  const sent = await writesSoFar();
  await press(page, first);
  await expect(box(page, first)).toBeChecked();
  await saveButton(page).click();
  await expect(box(page, first), "the week's box is focused").toBeFocused();
  await expect(box(page, first), "the tick is kept").toBeChecked();
  await expect(box(page, first)).toHaveAttribute("aria-invalid", "true");
  await expect(box(page, first)).toHaveAccessibleDescription(
    schedule.errors.weeksNeedDay,
  );
  await expect(summary(page)).toHaveCount(0);
  expect(await writesSoFar(), "nothing was sent").toBe(sent);
  await expectNoMissingIds(page);

  await press(page, monday);
  await saveAvailability(page);
  await expect(box(page, first)).toBeChecked();
  await expect(box(page, monday)).toBeChecked();
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["mon"],
    weeks: ["first"],
  });
  await expect(scheduleLine(page)).toHaveText(
    reads({ days: ["mon"], weeks: ["first"] }),
  );

  // The day unticked with the week kept is the same problem.
  const landed = await writesSoFar();
  await press(page, monday);
  await saveButton(page).click();
  await expect(box(page, first)).toBeFocused();
  await expect(box(page, first)).toHaveAttribute("aria-invalid", "true");
  expect(await writesSoFar()).toBe(landed);

  // As it was.
  await press(page, first);
  await saveAvailability(page);
  await expect(box(page, first)).not.toBeChecked();
  await expect(box(page, monday)).not.toBeChecked();
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
  await expectNoMissingIds(page);
});

test("a month tick saved reads, and a Save on a page whose schedule moved under it is refused with one sentence in the summary, keeps the tick, changes nothing on the server, and a reload shows the schedule as it is now", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const january = "January";
  const monday = en.owner.restaurants.days.mon;
  const friday = en.owner.restaurants.days.fri;
  await openDish(page, "one", "availability");
  await press(page, january);
  await saveAvailability(page);
  await expect(box(page, january)).toBeChecked();
  await expect(scheduleLine(page)).toHaveText(reads({ months: ["jan"] }));
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    months: ["jan"],
  });

  await knob("set-schedule", {
    id: dishes.one.id,
    schedule: JSON.stringify({ days: ["fri"] }),
  });
  const sent = await writesSoFar();
  await press(page, monday);
  await saveAndFail(page, availability.submit, schedule.scheduleMoved);
  await expect(box(page, monday), "the tick is kept").toBeChecked();
  await expect(box(page, january)).toBeChecked();
  expect(
    await writesSoFar(),
    "one statement, refused by its condition, and no second",
  ).toBe(sent + 1);
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["fri"],
  });
  await expectNoMissingIds(page);

  await reload(page);
  await expect(box(page, friday)).toBeChecked();
  await expect(box(page, monday)).not.toBeChecked();
  await expect(box(page, january)).not.toBeChecked();

  // As it was.
  await knob("set-schedule", { id: dishes.one.id, schedule: "null" });
});

// Two tabs (D-237, rule 2). Each page's Save hands back everything the
// page writes, as the page showed it, and lands only if the dish still
// holds all of it: the tags with Cooked to order, the schedule with the
// availability choice.

// A second tab, signed in as the same owner, opened now: after the first
// tab loaded its page, and before the first tab's own change.
async function inAnotherTab(
  browser: Browser,
  page: Page,
  path: string,
  work: (other: Page) => Promise<void>,
): Promise<void> {
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ storageState: ownerStatePath });
  try {
    const other = await context.newPage();
    await other.goto(`${origin}${path}`);
    await other.waitForLoadState("networkidle");
    await work(other);
  } finally {
    await context.close();
  }
}

// The server renders this tab's page again, under its form, as a renewed
// session can: Next's own router, asked from the page.
async function renderAgain(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { next } = window as unknown as {
      next: { router: { refresh: () => void } };
    };
    next.router.refresh();
  });
}

// A page's link in the dish's page nav, by its name and the state line
// after it, which follows what the server holds on every render.
function navLink(page: Page, name: string, state: string) {
  return page.getByRole("link", { name: `${name} ${state}`, exact: true });
}

// A diner's read of the menu page.
async function served(page: Page): Promise<string> {
  const response = await page.request.get(menuPath(code), {
    headers: { accept: "text/html" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  return response.text();
}

test("Cooked to order changed in a second tab refuses this tab's Save of a tag with one sentence in the summary, keeps the tick, and writes nothing; a reload shows the box as it is now", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market", "tags");
  await expect(box(page, cookedToOrder.label)).toBeChecked();
  try {
    await inAnotherTab(
      browser,
      page,
      dishPath("market", "tags"),
      async (other) => {
        await pressCooked(other);
        await saveTags(other);
      },
    );
    expect((await row(dishes.market.id)).cooked_to_order).toBe(false);

    const sent = await writesSoFar();
    await press(page, vegan);
    await saveAndFail(page, tags.submit, tags.tagsMoved);
    await expect(box(page, vegan), "the tick is kept").toBeChecked();
    await expect(
      box(page, cookedToOrder.label),
      "the page still shows the box as it loaded it",
    ).toBeChecked();
    expect(await writesSoFar(), "one statement, which matched no row").toBe(
      sent + 1,
    );
    const after = await row(dishes.market.id);
    expect(after.dietary_tags, "nothing was written").toEqual([]);
    expect(after.cooked_to_order, "the other tab's untick stands").toBe(false);

    await reload(page);
    await expect(box(page, cookedToOrder.label)).not.toBeChecked();
    await expect(box(page, vegan)).not.toBeChecked();
  } finally {
    // As it was.
    await knob("set-tags", { id: dishes.market.id, tags: "" });
    if (!(await row(dishes.market.id)).cooked_to_order) {
      await openDish(page, "market", "tags");
      await pressCooked(page);
      await saveTags(page);
    }
  }
  expect((await row(dishes.market.id)).cooked_to_order).toBe(true);
});

test("tags stored out of the enum's order, as SQL or an import could leave them, are handed back in the order they were read, so a Save lands and stores them in order", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await knob("set-tags", {
    id: dishes.market.id,
    tags: "made-without-gluten,vegan",
  });
  try {
    await openDish(page, "market", "tags");
    await expect(box(page, en.dietary.names.vegan)).toBeChecked();
    await expect(
      box(page, en.dietary.names["made-without-gluten"]),
    ).toBeChecked();
    await press(page, en.dietary.names.vegetarian);
    await saveTags(page);
    expect((await row(dishes.market.id)).dietary_tags).toEqual([
      "vegan",
      "vegetarian",
      "made-without-gluten",
    ]);
  } finally {
    // As it was.
    await knob("set-tags", { id: dishes.market.id, tags: "" });
  }
});

test("a newer render of the Dietary tags page that arrives under the form changes nothing the form shows and nothing its Save hands back: the Save is refused, and the other tab's tag stands", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  const vegetarian = en.dietary.names.vegetarian;
  const state = strings.pages.state;
  await openDish(page, "market", "tags");
  await expect(navLink(page, tags.heading, state.none)).toHaveCount(1);
  try {
    await inAnotherTab(
      browser,
      page,
      dishPath("market", "tags"),
      async (other) => {
        await press(other, vegetarian);
        await saveTags(other);
      },
    );
    await renderAgain(page);
    await expect(
      navLink(page, tags.heading, fill(state.tagCount.one, { count: 1 })),
      "the newer render arrived: the page nav counts the other tab's tag",
    ).toHaveCount(1);
    await expect(
      box(page, vegetarian),
      "the form still shows what it mounted with",
    ).not.toBeChecked();
    await expect(tagsLine(page)).toHaveCount(0);

    const sent = await writesSoFar();
    await press(page, vegan);
    await saveAndFail(page, tags.submit, tags.tagsMoved);
    expect(await writesSoFar(), "one statement, which matched no row").toBe(
      sent + 1,
    );
    expect(
      (await row(dishes.market.id)).dietary_tags,
      "the other tab's tag stands, and this tab's was not written",
    ).toEqual(["vegetarian"]);
  } finally {
    // As it was.
    await knob("set-tags", { id: dishes.market.id, tags: "" });
  }
});

// The availability page with the dish put back as it was: Available, no
// schedule, through the page itself, so the diner pages are cleared too.
async function availableAgain(page: Page, id: string): Promise<void> {
  await knob("set-availability", { id, available: "0", sold_out_at: "" });
  await knob("set-schedule", { id, schedule: "null" });
  await openDish(page, "one", "availability");
  await press(page, availability.available);
  await saveAvailability(page);
  const back = await row(id);
  expect(back.available).toBe(true);
  expect(back.sold_out_at).toBeNull();
  expect(back.special_schedule).toBeNull();
}

test("the availability choice changed in a second tab refuses this tab's Save of the schedule with one sentence in the summary, keeps the tick, writes nothing, and clears no diner page", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  const tuesday = en.owner.restaurants.days.tue;
  await openDish(page, "one", "availability");
  await expect(radio(page, availability.available)).toBeChecked();
  try {
    await inAnotherTab(
      browser,
      page,
      dishPath("one", "availability"),
      async (other) => {
        await press(other, availability.soldOut);
        await saveAvailability(other);
      },
    );
    await expect
      .poll(() => served(page), { message: "diners read the dish as sold out" })
      .toContain(en.availability.soldOut);

    // The dish taken off the menu with no diner page cleared: a diner's
    // page keeps the sold-out dish until something clears it.
    await knob("set-availability", {
      id: dishes.one.id,
      available: "0",
      sold_out_at: "",
    });
    expect(await served(page), "nothing cleared the page").toContain(
      en.availability.soldOut,
    );

    const before = await row(dishes.one.id);
    const sent = await writesSoFar();
    await press(page, tuesday);
    await saveAndFail(page, availability.submit, schedule.scheduleMoved);
    await expect(box(page, tuesday), "the tick is kept").toBeChecked();
    await expect(radio(page, availability.available)).toBeChecked();
    expect(await writesSoFar(), "one statement, which matched no row").toBe(
      sent + 1,
    );
    expect(await row(dishes.one.id), "nothing was written").toEqual(before);
    expect(
      await served(page),
      "the refused Save cleared no diner page",
    ).toContain(en.availability.soldOut);
  } finally {
    await availableAgain(page, dishes.one.id);
  }
  await expect.poll(() => served(page)).not.toContain(en.availability.soldOut);
});

test("a sold-out mark stamped to the microsecond, as the database stamps it, is handed back as the text it was read as, so a Save of the schedule lands and keeps the mark", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const tuesday = en.owner.restaurants.days.tue;
  // A minute ago, with the three digits a Date would drop.
  const mark = new Date(Date.now() - 60_000)
    .toISOString()
    .replace(/Z$/, "456+00:00");
  expect(mark).toMatch(/\.\d{6}\+00:00$/);
  await knob("set-availability", {
    id: dishes.one.id,
    available: "1",
    sold_out_at: mark,
  });
  try {
    await openDish(page, "one", "availability");
    await expect(radio(page, availability.soldOut)).toBeChecked();
    await press(page, tuesday);
    await saveAvailability(page);
    const after = await row(dishes.one.id);
    expect(after.sold_out_at, "the mark is kept, to the microsecond").toBe(
      mark,
    );
    expect(after.special_schedule).toEqual({ days: ["tue"] });
  } finally {
    await availableAgain(page, dishes.one.id);
  }
});

test("a newer render of the Availability page that arrives under the form changes nothing the form shows and nothing its Save hands back: the Save is refused, and the other tab's choice stands", async ({
  page,
  browser,
}) => {
  const { dishes } = ownerFixture();
  const state = strings.pages.state;
  const line = (choice: string) =>
    fill(state.availability, { choice, schedule: state.scheduleNone });
  await openDish(page, "one", "availability");
  await expect(
    navLink(page, availability.heading, line(availability.available)),
  ).toHaveCount(1);
  try {
    await inAnotherTab(
      browser,
      page,
      dishPath("one", "availability"),
      async (other) => {
        await press(other, availability.soldOut);
        await saveAvailability(other);
      },
    );
    await renderAgain(page);
    await expect(
      navLink(page, availability.heading, line(availability.soldOut)),
      "the newer render arrived: the page nav says the other tab's choice",
    ).toHaveCount(1);
    await expect(
      radio(page, availability.available),
      "the form still shows what it mounted with",
    ).toBeChecked();

    const sent = await writesSoFar();
    await press(page, availability.off);
    await saveAndFail(page, availability.submit, schedule.scheduleMoved);
    expect(await writesSoFar(), "one statement, which matched no row").toBe(
      sent + 1,
    );
    const after = await row(dishes.one.id);
    expect(after.available, "the other tab's choice stands").toBe(true);
    expect(after.sold_out_at).not.toBeNull();
  } finally {
    await availableAgain(page, dishes.one.id);
  }
});
