import { expect, test, type Page } from "@playwright/test";
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
import {
  scheduleSentence,
  showingAt,
  showingSentence,
  type Schedule,
} from "../../src/domain/schedule";
import { formatTime } from "../../src/domain/time";
import { restaurantDishPath } from "../../src/features/owner/paths";
import { expectNoMissingIds } from "../a11y/checks";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { hearLog, heard } from "../a11y/owner-lists";

// The dietary tags, availability, and the schedule on a dish's page with
// saves that land for real against the stand-in (task 5, D-66, D-159,
// D-160): a tag tick said once and kept after a reload, with its Undo; a
// page whose tags moved under it, from another tab, refused with one
// sentence and no Try again; a failed tick with Try again; Sold out today
// with the line saying when it comes back, from the restaurant's hours,
// and Off the menu for now, each with its Undo; a mark that has ended
// reading as available; a day, the hours pair as one commit, dates in
// their forms, Today only, a week with no day refused unsent, the last
// day unticked taking the weeks with it, a month, a schedule that moved
// under the page, and an Undo after another tab changed it. The gate
// cannot land a save, so this runs here. Each check leaves the stand-in as
// it found it, so the checks run in any order.

const { code } = ownerEnv();
const strings = en.owner.dish;
const tags = strings.tags;
const availability = strings.availability;
const schedule = strings.schedule;
const editing = en.owner.editing;
const saved = editing.fieldSaved;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const zone = "America/New_York";
const words = { ...en.schedule, day: en.owner.restaurants.days };

type Priced = "sizes" | "one" | "market";

function dishPath(which: Priced): string {
  return restaurantDishPath(code, ownerFixture().dishes[which].id);
}

async function openDish(page: Page, which: Priced): Promise<void> {
  await page.goto(dishPath(which));
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

function radio(page: Page, name: string) {
  return page.getByRole("radio", { name, exact: true });
}

// Ticks a box or chooses a radio by its visible words: React Aria keeps
// the input under the label, where a pointer cannot reach it directly.
async function press(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).click();
}

function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

function status(page: Page) {
  return page.locator('main [role="status"]');
}

function tryAgainButton(page: Page) {
  return page.getByRole("button", { name: editing.tryAgain, exact: true });
}

function undoButton(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
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

type Row = {
  id: string;
  name: string;
  dietary_tags: string[];
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

test("a tag tick says Saved. once, reads under the group, holds after a reload, and Undo unticks it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market");
  await expect(box(page, vegan)).not.toBeChecked();
  await expect(tagsLine(page)).toHaveCount(0);
  await press(page, vegan);
  await expect(box(page, vegan)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(tagsLine(page)).toHaveText(
    fill(tags.dinersRead, { sentence: `"${vegan}."` }),
  );
  expect((await row(dishes.market.id)).dietary_tags).toEqual(["vegan"]);
  await expectNoMissingIds(page);
  await reload(page);
  await expect(box(page, vegan)).toBeChecked();

  await undoButton(
    page,
    fill(tags.undo.ticked, { tag: vegan, dish: dishes.market.name }),
  ).click();
  await expect
    .poll(() => said(page, fill(tags.undo.tickedBack, { tag: vegan })))
    .toBe(1);
  await expect(box(page, vegan)).not.toBeChecked();
  await expect(tagsLine(page)).toHaveCount(0);
  expect((await row(dishes.market.id)).dietary_tags).toEqual([]);
  await reload(page);
  await expect(box(page, vegan)).not.toBeChecked();
});

test("a tick on a page whose tags moved under it is refused once, with no Try again, and the page shows the tags as they are now", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "market");
  await knob("set-tags", { id: dishes.market.id, tags: "vegetarian" });
  await press(page, en.dietary.names.vegan);
  await expect.poll(() => said(page, tags.tagsMoved)).toBe(1);
  await expect(tryAgainButton(page)).toHaveCount(0);
  await expect(box(page, en.dietary.names.vegetarian)).toBeChecked();
  await expect(box(page, en.dietary.names.vegan)).not.toBeChecked();
  expect((await row(dishes.market.id)).dietary_tags).toEqual(["vegetarian"]);
  await expectNoMissingIds(page);
  // As it was.
  await knob("set-tags", { id: dishes.market.id, tags: "" });
});

test("a tick that fails is said once with Try again, and Try again lands it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const vegan = en.dietary.names.vegan;
  await openDish(page, "market");
  await knob("fail", { times: "1" });
  await press(page, vegan);
  const failure = `${fill(tags.notSaved, { dish: dishes.market.name })} ${editing.problems.failed}`;
  await expect(status(page)).toHaveText(failure);
  await expect.poll(() => said(page, failure)).toBe(1);
  await expect(box(page, vegan)).not.toBeChecked();
  await expect(box(page, vegan)).toHaveAttribute("aria-invalid", "true");
  await tryAgainButton(page).click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect(box(page, vegan)).toBeChecked();
  expect((await row(dishes.market.id)).dietary_tags).toEqual(["vegan"]);
  // As it was.
  await press(page, vegan);
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row(dishes.market.id)).dietary_tags).toEqual([]);
});

test("Sold out today says Saved. once, the group's line says when it comes back, it holds after a reload, and Undo makes the dish available", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  // With no hours the mark ends at midnight; the stand-in carries CI
  // Diner's hours, so they are taken away for this check and put back at
  // its end.
  await knob("set-hours", { hours: "null" });
  await openDish(page, "one");
  await expect(radio(page, availability.available)).toBeChecked();
  await expect(availabilityGroup(page)).toHaveAccessibleDescription("");
  await press(page, availability.soldOut);
  await expect(radio(page, availability.soldOut)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
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

  await undoButton(
    page,
    fill(availability.undo.markedSoldOut, { dish: dishes.one.name }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(availability.undo.availableBack, { dish: dishes.one.name }),
      ),
    )
    .toBe(1);
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
    await openDish(page, "one");

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
    await expect.poll(() => said(page, saved)).toBe(1);
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

test("Off the menu for now says Saved. once and that diners do not see the dish, and Undo makes it available again", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "sizes");
  await press(page, availability.off);
  await expect(radio(page, availability.off)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(availabilityGroup(page)).toHaveAccessibleDescription(
    availability.hidden,
  );
  expect((await row(dishes.sizes.id)).available).toBe(false);
  await undoButton(
    page,
    fill(availability.undo.markedOff, { dish: dishes.sizes.name }),
  ).click();
  await expect
    .poll(() =>
      said(
        page,
        fill(availability.undo.availableBack, { dish: dishes.sizes.name }),
      ),
    )
    .toBe(1);
  await expect(radio(page, availability.available)).toBeChecked();
  expect((await row(dishes.sizes.id)).available).toBe(true);
});

test("a sold-out mark whose day has ended reads as available, and a new mark lands over it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await knob("set-availability", {
    id: dishes.one.id,
    available: "1",
    sold_out_at: yesterday,
  });
  try {
    await openDish(page, "one");
    await expect(radio(page, availability.available)).toBeChecked();
    await expect(availabilityGroup(page)).toHaveAccessibleDescription("");
    await press(page, availability.soldOut);
    await expect.poll(() => said(page, saved)).toBe(1);
    const mark = (await row(dishes.one.id)).sold_out_at ?? "";
    expect(mark > yesterday).toBe(true);
  } finally {
    await knob("set-availability", {
      id: dishes.one.id,
      available: "1",
      sold_out_at: "",
    });
  }
});

test("a day tick says Saved. once, the sentence and the next day read under the group, it holds after a reload, and Undo takes it back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const tuesday = en.owner.restaurants.days.tue;
  await openDish(page, "one");
  await expect(scheduleLine(page)).toHaveText(schedule.none);
  await press(page, tuesday);
  await expect(box(page, tuesday)).toBeChecked();
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(scheduleLine(page)).toHaveText(reads({ days: ["tue"] }));
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["tue"],
  });
  await expectNoMissingIds(page);
  await reload(page);
  await expect(box(page, tuesday)).toBeChecked();
  await expect(scheduleLine(page)).toHaveText(reads({ days: ["tue"] }));

  await undoButton(
    page,
    fill(schedule.undo.ticked, { box: tuesday, dish: dishes.one.name }),
  ).click();
  await expect
    .poll(() => said(page, fill(schedule.undo.back, { dish: dishes.one.name })))
    .toBe(1);
  await expect(box(page, tuesday)).not.toBeChecked();
  await expect(scheduleLine(page)).toHaveText(schedule.none);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
});

test("the two time fields commit together: Tab between them sends nothing, Enter sends one write, each refusal is unsent, and a saved time comes back in one format", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  const starts = field(page, schedule.starts);
  const ends = field(page, schedule.ends);
  await expect(starts).toHaveAccessibleDescription(schedule.hoursHint);
  await expect(ends).toHaveAccessibleDescription(schedule.hoursHint);
  const before = await writesSoFar();
  await starts.fill("4 pm");
  await page.keyboard.press("Tab");
  await expect(ends).toBeFocused();
  expect(await writesSoFar(), "Tab between the pair sends nothing").toBe(
    before,
  );
  await ends.fill("9 pm");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  expect(await writesSoFar()).toBe(before + 1);
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    hours: { open: "16:00", close: "21:00" },
  });
  await expect(scheduleLine(page)).toHaveText(
    reads({ hours: { open: "16:00", close: "21:00" } }),
  );

  await starts.fill("17:30");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(starts, "a saved time comes back in one format").toHaveValue(
    "5:30 pm",
  );
  await expect(ends).toHaveValue("9 pm");

  const sent = await writesSoFar();
  const notSaved = fill(schedule.notSaved.hours, { dish: dishes.one.name });
  await starts.fill("4");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${notSaved} ${schedule.errors.timeAmPmStarts}`,
  );
  await expect(starts).toHaveAttribute("aria-invalid", "true");
  await ends.fill("");
  await starts.fill("4 pm");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${notSaved} ${schedule.errors.timePairEnds}`,
  );
  await expect(ends).toHaveAttribute("aria-invalid", "true");
  await ends.fill("4 pm");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${notSaved} ${schedule.errors.sameTime}`,
  );
  expect(await writesSoFar(), "every refusal is unsent").toBe(sent);
  await expect
    .poll(
      async () =>
        (await heard(page)).filter((each) => each.startsWith(notSaved)).length,
    )
    .toBe(3);
  await expectNoMissingIds(page);

  // As it was: both blank is all day, which with nothing else is no
  // schedule.
  await starts.fill("");
  await ends.fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
  await expect(scheduleLine(page)).toHaveText(schedule.none);
});

// D-164: the pair refused on both sides at once, each problem under its own
// field, said once together, Starts first, and nothing sent until both are
// fixed.
test("the hours pair left with two problems shows both at once, each under its own field, says them once together with Starts first, and sends nothing until both are fixed", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  await openDish(page, "one");
  const starts = field(page, schedule.starts);
  const ends = field(page, schedule.ends);
  const notSaved = fill(schedule.notSaved.hours, { dish: dishes.one.name });
  const sent = await writesSoFar();

  // "4" in Starts with Ends blank, D-164's own case.
  await starts.fill("4");
  await page.keyboard.press("Enter");
  const both = `${notSaved} ${schedule.errors.timeAmPmStarts} ${schedule.errors.timePairEnds}`;
  await expect(status(page)).toHaveText(both);
  await expect.poll(() => said(page, both)).toBe(1);
  await expect(starts).toHaveAttribute("aria-invalid", "true");
  await expect(starts).toHaveAccessibleDescription(
    `${schedule.errors.timeAmPmStarts} ${schedule.hoursHint}`,
  );
  await expect(ends).toHaveAttribute("aria-invalid", "true");
  await expect(ends).toHaveAccessibleDescription(
    `${schedule.errors.timePairEnds} ${schedule.hoursHint}`,
  );
  await expectNoMissingIds(page);

  // Starts fixed alone: only the Ends problem stands, and nothing is sent.
  await starts.fill("4 pm");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${notSaved} ${schedule.errors.timePairEnds}`,
  );
  await expect(starts).not.toHaveAttribute("aria-invalid", "true");
  await expect(starts).toHaveAccessibleDescription(schedule.hoursHint);
  await expect(ends).toHaveAttribute("aria-invalid", "true");

  // Ends fixed alone: only the Starts problem stands.
  await starts.fill("4");
  await ends.fill("9 pm");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${notSaved} ${schedule.errors.timeAmPmStarts}`,
  );
  await expect(ends).not.toHaveAttribute("aria-invalid", "true");

  // Two problems of other kinds: Starts blank and an Ends that does not
  // read, whose sentence names its side (Q-73).
  await starts.fill("");
  await ends.fill("abc");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${notSaved} ${schedule.errors.timePairStarts} ${schedule.errors.timeFormatEnds}`,
  );
  await expect(starts).toHaveAccessibleDescription(
    `${schedule.errors.timePairStarts} ${schedule.hoursHint}`,
  );
  await expect(ends).toHaveAccessibleDescription(
    `${schedule.errors.timeFormatEnds} ${schedule.hoursHint}`,
  );
  expect(await writesSoFar(), "nothing is sent until both are fixed").toBe(
    sent,
  );
  await expect
    .poll(
      async () =>
        (await heard(page)).filter((each) => each.startsWith(notSaved)).length,
    )
    .toBe(4);
  await expectNoMissingIds(page);

  // Both fixed: one write lands.
  await starts.fill("4 pm");
  await ends.fill("9 pm");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  expect(await writesSoFar()).toBe(sent + 1);
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    hours: { open: "16:00", close: "21:00" },
  });

  // As it was.
  await starts.fill("");
  await ends.fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
});

test("a date reads in each of its forms and comes back with its year, a day-first number and a last day before the first are refused unsent, Today only fills both days with its own sentence, and Undo takes it back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const today = todayIn(zone, new Date());
  await openDish(page, "one");
  const first = field(page, schedule.firstDay);
  const last = field(page, schedule.lastDay);
  await expect(first).toHaveAccessibleDescription(schedule.dateHint);

  await first.fill("10/31/2099");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(first).toHaveValue("October 31, 2099");
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    from: "2099-10-31",
  });

  const sent = await writesSoFar();
  await last.fill("31/10/2099");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(schedule.notSaved.until, { dish: dishes.one.name })} ${schedule.errors.dateFormat}`,
  );
  await expect(last).toHaveAttribute("aria-invalid", "true");
  await last.fill("Oct 30, 2099");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    `${fill(schedule.notSaved.until, { dish: dishes.one.name })} ${schedule.errors.dateOrder}`,
  );
  expect(await writesSoFar(), "the refusals are unsent").toBe(sent);

  await last.fill("November 5, 2099");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect(last).toHaveValue("November 5, 2099");
  await expect(scheduleLine(page)).toHaveText(
    reads({ from: "2099-10-31", until: "2099-11-05" }),
  );

  // A date typed with no year is the next such day on or after today.
  const typed = parseDate("October 31", today);
  if (!typed.ok) throw new Error("October 31 did not read");
  await first.fill("October 31");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect(first).toHaveValue(formatDate(typed.day, "en"));
  await first.fill("10/31/2099");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(3);

  await page
    .getByRole("button", { name: schedule.todayOnly, exact: true })
    .click();
  const set = fill(schedule.todayOnlySet, {
    date: formatDayAndDate(today, today, "en"),
  });
  await expect.poll(() => said(page, set)).toBe(1);
  expect(await said(page, saved), "the press says its own sentence").toBe(3);
  await expect(first).toHaveValue(formatDate(today, "en"));
  await expect(last).toHaveValue(formatDate(today, "en"));
  await expect(scheduleLine(page)).toHaveText(
    reads({ from: today, until: today }),
  );
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    from: today,
    until: today,
  });
  await expectNoMissingIds(page);

  await undoButton(
    page,
    fill(schedule.undo.today, { dish: dishes.one.name }),
  ).click();
  await expect
    .poll(() => said(page, fill(schedule.undo.back, { dish: dishes.one.name })))
    .toBe(1);
  await expect(first).toHaveValue("October 31, 2099");
  await expect(last).toHaveValue("November 5, 2099");

  // As it was.
  await first.fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(4);
  await last.fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => said(page, saved)).toBe(5);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
});

test("a week with no day is refused unsent, lands after a day with Try again, the last day unticked takes the weeks with it and says so, and Undo puts both back", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const monday = en.owner.restaurants.days.mon;
  const first = schedule.weeks.first;
  await openDish(page, "one");
  const sent = await writesSoFar();
  await press(page, first);
  const refused = `${fill(schedule.notSaved.weeks, { dish: dishes.one.name })} ${schedule.errors.weeksNeedDay}`;
  await expect(status(page)).toHaveText(refused);
  await expect.poll(() => said(page, refused)).toBe(1);
  await expect(box(page, first)).not.toBeChecked();
  await expect(box(page, first)).toHaveAttribute("aria-invalid", "true");
  expect(await writesSoFar(), "nothing was sent").toBe(sent);
  await expect(tryAgainButton(page)).toHaveCount(1);

  await press(page, monday);
  await expect.poll(() => said(page, saved)).toBe(1);
  await tryAgainButton(page).click();
  await expect.poll(() => said(page, editing.savedAgain)).toBe(1);
  await expect(box(page, first)).toBeChecked();
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["mon"],
    weeks: ["first"],
  });
  await expect(scheduleLine(page)).toHaveText(
    reads({ days: ["mon"], weeks: ["first"] }),
  );

  await press(page, monday);
  await expect.poll(() => said(page, saved)).toBe(2);
  await expect.poll(() => said(page, schedule.weeksCleared)).toBe(1);
  await expect(box(page, first)).not.toBeChecked();
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
  await expectNoMissingIds(page);

  await undoButton(
    page,
    fill(schedule.undo.unticked, { box: monday, dish: dishes.one.name }),
  ).click();
  await expect
    .poll(() => said(page, fill(schedule.undo.back, { dish: dishes.one.name })))
    .toBe(1);
  await expect(box(page, monday)).toBeChecked();
  await expect(box(page, first)).toBeChecked();
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["mon"],
    weeks: ["first"],
  });

  // As it was.
  await press(page, monday);
  await expect.poll(() => said(page, saved)).toBe(3);
  expect((await row(dishes.one.id)).special_schedule).toBeNull();
});

test("a month tick lands and reads, and a tick on a page whose schedule moved under it is refused once, with no Try again, as is an Undo after another tab changed it", async ({
  page,
}) => {
  const { dishes } = ownerFixture();
  const january = "January";
  const monday = en.owner.restaurants.days.mon;
  await openDish(page, "one");
  await press(page, january);
  await expect.poll(() => said(page, saved)).toBe(1);
  await expect(scheduleLine(page)).toHaveText(reads({ months: ["jan"] }));
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    months: ["jan"],
  });

  await knob("set-schedule", {
    id: dishes.one.id,
    schedule: JSON.stringify({ days: ["fri"] }),
  });
  await press(page, monday);
  await expect.poll(() => said(page, schedule.scheduleMoved)).toBe(1);
  await expect(tryAgainButton(page)).toHaveCount(0);
  await expect(box(page, en.owner.restaurants.days.fri)).toBeChecked();
  await expect(box(page, monday)).not.toBeChecked();
  await expect(box(page, january)).not.toBeChecked();
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["fri"],
  });

  await undoButton(
    page,
    fill(schedule.undo.ticked, { box: january, dish: dishes.one.name }),
  ).click();
  await expect.poll(() => said(page, schedule.undo.scheduleChanged)).toBe(1);
  expect((await row(dishes.one.id)).special_schedule).toEqual({
    days: ["fri"],
  });
  await expectNoMissingIds(page);

  // As it was.
  await knob("set-schedule", { id: dishes.one.id, schedule: "null" });
});
