import type { MacOSKeyCodeCommand } from "@guidepup/guidepup";
import { voiceOverTest, type VoiceOverPlaywright } from "@guidepup/playwright";
import { expect, type Page } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { en } from "../../src/copy";
import { fill } from "../../src/copy/fill";
import {
  restaurantDetailsPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../../src/features/owner/paths";
import { ownerEnv, ownerFixture } from "../a11y/owner-env";
import { listRows } from "../a11y/owner-lists";
import { savedBanner } from "../a11y/saved-banner";

// VoiceOver on macOS, driven through Guidepup against the stand-in (D-194
// (b), D-202). Run by npm run hear on this Mac, never in CI; the projects
// exist only under A11Y_HEAR (playwright.config.ts). Three readings that were
// first made by ear: the one-node label (D-193, D-140), a dialog's first
// focus (D-136), and "Saved." after a rename with Enter (D-118, D-140). Each
// was proven able to go red against a one-line undo before it was trusted.
// A fourth, Details' save as a page load with its banner (D-211, D-214,
// D-216), is read as the Mac reads it (D-217): an alert served in the HTML
// is not said at the load, so the words come two VO-Right steps on. It
// carries its own negative control (HEAR_CONTROL=1), run by hand, which
// must turn it red at its count, its log written apart from the run's.
// D-202's fourth, a Select opened after an in-page move (Q-127, D-201), was
// heard here with D-201's mark on and off and never read the title in either
// engine, so it cannot go red on the Mac and is not a reading; what it heard
// is on Q-127's row, and D-201 stays pinned by route-announcer.spec.ts.
//
// Every step whose reading is checked is driven by keys VoiceOver receives
// through Guidepup. Playwright only loads pages, waits, reads the words to
// expect, and puts a name back. Every check is that a phrase contains words,
// never that it equals them, since VoiceOver's phrasing shifts between macOS
// versions. Delete is opened with a typed Enter on the focused control, the
// keyboard route, which VoiceOver follows into the dialog. VO-Space,
// VoiceOver's own press of the item, opened the same dialog here but left
// VoiceOver's cursor on the button as it went inert ("no action available",
// then "empty main") and read nothing of the dialog, where by hand in Chrome
// it read Keep every time (D-136); that is Q-133, heard by hand, not a
// reading here.
//
// How the speech is read. Guidepup logs only what follows its own commands:
// after the keys it polls VoiceOver's last phrase every 50 ms
// (VoiceOverClient.js), and when nothing new comes in its first 13 polls it
// records the phrase that was already there as the command's own, with
// capture "initial" as with true. So seek() treats a phrase equal to the one
// read just before the press as nothing new, never as a hit. Speech that
// lands between keys, as "Saved." does once the server answers, never
// reaches Guidepup's log, so listen() polls VoiceOver's last phrase itself
// over a window, every 50 ms as Guidepup does, and records each change in
// order. Polling cannot tell one phrase from the same phrase said twice with
// nothing between, so "once" is held as "in one phrase, never in two".
//
// Each test writes what VoiceOver said to tests/local/hear-logs, one file
// per test and project, a control run's named with .control before the
// project, so it never overwrites the run it controls; the macOS version,
// the browser, and the commit at the top; the chat reads them there.

const { code } = ownerEnv();
const exec = promisify(execFile);
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Guidepup's own clean up of a phrase (cleanSpokenPhrase.js).
const clean = (phrase: string) =>
  phrase
    .trim()
    .replace(/^missing value$/, "")
    .replaceAll("@VOModifier()", "Control-Option")
    .replace(/\s\s+/g, " ");

const has = (phrase: string, words: string) =>
  phrase.toLowerCase().includes(words.toLowerCase());

// VoiceOver's last phrase, read with the AppleScript Guidepup reads it with
// (lastSpokenPhrase.js).
async function lastPhrase(): Promise<string> {
  try {
    const { stdout } = await exec(
      "/usr/bin/osascript",
      [
        "-e",
        'tell application "VoiceOver"',
        "-e",
        "with transaction",
        "-e",
        "return content of last phrase",
        "-e",
        "end transaction",
        "-e",
        "end tell",
      ],
      { timeout: 5_000 },
    );
    return clean(stdout);
  } catch {
    return "";
  }
}

// Polls VoiceOver's last phrase every 50 ms inside one osascript, so no
// process start sits between two reads. The script reads the phrase it starts
// from itself, raw, before its first poll, and returns it as poll 0, so a
// phrase from before the key is never compared in another form and taken
// for a new one. Then it returns each change with the poll it came at, one
// record apart (character 30), since a phrase may hold a line break; case
// counts as a change.
const POLL_SCRIPT = [
  "on run argv",
  "set pollCount to (item 1 of argv) as integer",
  "set heardWords to {}",
  'tell application "VoiceOver"',
  'set priorWords to ""',
  "try",
  "with transaction",
  "set priorWords to content of last phrase",
  "end transaction",
  "end try",
  'if priorWords is missing value then set priorWords to ""',
  'set end of heardWords to ("0" & tab & priorWords)',
  "repeat with pollNumber from 1 to pollCount",
  'set spokenWords to ""',
  "try",
  "with transaction",
  "set spokenWords to content of last phrase",
  "end transaction",
  "end try",
  'if spokenWords is missing value then set spokenWords to ""',
  "considering case",
  'if spokenWords is not "" and spokenWords is not priorWords then',
  "set end of heardWords to ((pollNumber as text) & tab & spokenWords)",
  "set priorWords to spokenWords",
  "end if",
  "end considering",
  "delay 0.05",
  "end repeat",
  "end tell",
  "set AppleScript's text item delimiters to (character id 30)",
  "return heardWords as text",
  "end run",
].flatMap((line) => ["-e", line]);

type Heard = { poll: number; phrase: string };
const LEAD_MS = 300;

class Hear {
  readonly steps: { label: string; lines: string[] }[] = [];

  constructor(private readonly voiceOver: VoiceOverPlaywright) {}

  // Presses a VoiceOver find command until its phrase holds the words.
  async seek(
    label: string,
    command: MacOSKeyCodeCommand,
    words: string,
    tries = 40,
  ): Promise<string> {
    const lines: string[] = [];
    this.steps.push({ label, lines });
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const before = await lastPhrase();
      await this.voiceOver.perform(command);
      const phrase = clean(await this.voiceOver.lastSpokenPhrase());
      if (phrase === before) {
        lines.push(`(nothing new) ${phrase}`);
        continue;
      }
      lines.push(phrase);
      if (has(phrase, words)) return phrase;
    }
    throw new Error(`VoiceOver never reached "${words}" in ${tries} presses`);
  }

  // Runs a key, then records every phrase VoiceOver says for the window.
  async listen(
    label: string,
    key: () => Promise<void>,
    ms: number,
  ): Promise<string[]> {
    const lines: string[] = [];
    this.steps.push({ label, lines });
    const polling = exec(
      "/usr/bin/osascript",
      [...POLL_SCRIPT, String(Math.round((ms + LEAD_MS) / 50))],
      { timeout: ms * 3 + 10_000 },
    );
    // The loop starts before the key, so its first reads are of the phrase
    // as it was.
    await wait(LEAD_MS);
    await key();
    const { stdout } = await polling;
    const records: Heard[] = stdout
      .split("\u001e")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const [poll = "", ...rest] = line.split("\t");
        return { poll: Number(poll), phrase: clean(rest.join("\t")) };
      });
    const heard = records.filter(({ poll }) => poll > 0);
    for (const { poll, phrase } of records)
      lines.push(
        poll === 0 ? `[before] ${phrase}` : `[poll ${poll}] ${phrase}`,
      );
    return heard.map(({ phrase }) => phrase);
  }

  note(label: string, line: string) {
    this.steps.push({ label, lines: [line] });
  }
}

function sh(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return "(could not read)";
  }
}

const version = (name: string) =>
  (
    JSON.parse(
      readFileSync(
        join(process.cwd(), "node_modules", name, "package.json"),
        "utf8",
      ),
    ) as { version: string }
  ).version;

const test = voiceOverTest.extend<{ hear: Hear }>({
  // A VoiceOver already on is refused by run.mjs, and none is started again
  // after the run, so VoiceOver is off when a run ends.
  voiceOverStartOptions: { capture: "initial", restoreUserScreenReader: false },
  // The fixture's second argument is named provide, not use, so the lint
  // rule for React's use() does not read it as a hook.
  hear: async ({ voiceOver, browser, browserName }, provide, testInfo) => {
    const hear = new Hear(voiceOver);
    await provide(hear);
    // Written before VoiceOver stops, failed or not.
    const own = await voiceOver.spokenPhraseLog().catch(() => []);
    const changed = sh("git", ["status", "--porcelain"]);
    const slug = (testInfo.title.split(":")[0] ?? testInfo.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const control = process.env.HEAR_CONTROL === "1" ? ".control" : "";
    const folder = join(testInfo.project.testDir, "hear-logs");
    mkdirSync(folder, { recursive: true });
    const text = [
      `npm run hear: ${testInfo.title}`,
      `project: ${testInfo.project.name}, ${testInfo.status ?? "unknown"}`,
      `macOS ${sh("sw_vers", ["-productVersion"])} (${sh("sw_vers", ["-buildVersion"])})`,
      `browser: ${browserName} ${browser.version()}`,
      `commit: ${sh("git", ["rev-parse", "--short", "HEAD"])}, working tree ${
        changed === "" ? "clean" : `changed:\n${changed}`
      }`,
      `Guidepup: @guidepup/guidepup ${version("@guidepup/guidepup")}, @guidepup/playwright ${version("@guidepup/playwright")}`,
      `at: ${new Date().toISOString()}`,
      "Phrases are VoiceOver's last phrase, polled every 50 ms; a phrase said twice with nothing between shows once.",
      "",
      ...hear.steps.flatMap(({ label, lines }) => [
        `== ${label}`,
        ...lines.map((line) => `  ${line}`),
      ]),
      "",
      "== Guidepup's own log, one entry per command",
      ...own.map((line) => `  ${line}`),
      "",
    ].join("\n");
    writeFileSync(
      join(folder, `${slug}${control}.${testInfo.project.name}.txt`),
      text,
    );
  },
});

const commands = (voiceOver: VoiceOverPlaywright) => voiceOver.keyboardCommands;
// Enter on the focused control: keyboard focus follows VoiceOver's cursor, so
// the control a find command landed on is the one Enter reaches.
const enter = (voiceOver: VoiceOverPlaywright) => () =>
  voiceOver.press("Enter", { capture: false });
const escape = (voiceOver: VoiceOverPlaywright) => () =>
  voiceOver.press("Escape", { capture: false });
// VO-Right, uncaptured: the phrase it brings is read by listen(), whose poll
// starts from VoiceOver's own last phrase. Guidepup's capture starts from its
// own last entry, which after a listen() window is a phrase VoiceOver said
// long before, so a stale phrase still on screen would pass for the move's.
const next = (voiceOver: VoiceOverPlaywright) => () =>
  voiceOver.perform(commands(voiceOver).moveToNext, { capture: false });

async function arrive(
  page: Page,
  path: string,
  voiceOver: VoiceOverPlaywright,
) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await voiceOver.navigateToWebContent();
}

const firstField = (page: Page) =>
  listRows(page).first().locator('input[id$="-name"]');

// One: every row field on the three lists is named by one label holding the
// whole name as one node, so VoiceOver in Chrome reads "Menu name for
// Lunch" in one phrase, where the label in two pieces read "Menu namefor
// Lunch" (D-140, D-193).
const lists = [
  {
    where: "Menus",
    words: en.owner.menus,
    noun: "menu",
    path: () => restaurantMenusPath(code),
  },
  {
    where: "a menu's sections",
    words: en.owner.sections,
    noun: "section",
    path: () => restaurantMenuPath(code, ownerFixture().withSections.id),
  },
  {
    where: "a section's dishes",
    words: en.owner.dishes,
    noun: "dish",
    path: () => restaurantSectionPath(code, ownerFixture().withDishes.id),
  },
] as const;

for (const list of lists) {
  test(`reading 1 on ${list.where}: the first row's name field is read with its whole name in one phrase, and nothing reads "namefor" (D-193, D-140)`, async ({
    page,
    voiceOver,
    hear,
  }) => {
    await arrive(page, list.path(), voiceOver);
    const row = (await firstField(page).inputValue()).trim();
    const whole = `${list.words.nameLabel} ${fill(list.words.labelFor, { [list.noun]: row })}`;
    hear.note("expected", whole);
    const phrase = await hear.seek(
      `VO-Command-J to the first ${list.noun} name field`,
      commands(voiceOver).findNextControl,
      list.words.nameLabel,
    );
    expect(has(phrase, whole), "the field is read with its whole name").toBe(
      true,
    );
    const every = hear.steps.flatMap(({ lines }) => lines);
    expect(
      every.filter((line) => has(line, "namefor")),
      'nothing reads "namefor"',
    ).toEqual([]);
  });
}

// Two: Delete on a menu with sections opens the question; the dialog takes
// focus first, so its name, the question, is read, and a tenth of a second
// later focus moves once to Keep (D-136). Order and count only. Escape goes
// back to the row's Delete. VoiceOver reads the dialog as the focus target,
// its name and its description, then Keep in a phrase of its own that names
// the dialog again, as the container just entered. So the dialog's own
// reading is the phrase holding the question and not Keep, once; a second
// such phrase would be the dialog focused twice.
test("reading 2 on Menus: Delete on a menu with sections reads the question as the dialog's name, then Keep, the question once, and Escape returns to the row's Delete (D-136)", async ({
  page,
  voiceOver,
  hear,
}) => {
  const strings = en.owner.menus;
  const menu = ownerFixture().withSections;
  const counted = (words: { one: string; other: string }, count: number) =>
    fill(count === 1 ? words.one : words.other, { count });
  const question =
    menu.dishes > 0
      ? fill(strings.deleteAskBoth, {
          menu: menu.name,
          sections: counted(strings.sectionCount, menu.sections),
          dishes: counted(strings.dishCount, menu.dishes),
        })
      : fill(strings.deleteAsk, {
          menu: menu.name,
          sections: counted(strings.sectionCount, menu.sections),
        });
  const rowDelete = fill(strings.rowAction, {
    action: strings.remove,
    menu: menu.name,
  });
  hear.note("expected", `${question} / ${strings.keep} / ${rowDelete}`);

  await arrive(page, restaurantMenusPath(code), voiceOver);
  await hear.seek(
    `VO-Command-J to ${rowDelete}`,
    commands(voiceOver).findNextControl,
    rowDelete,
  );
  const opened = await hear.listen(
    "Enter on Delete, then 3 seconds",
    enter(voiceOver),
    3_000,
  );
  const back = await hear.listen(
    "Escape, then 2 seconds",
    escape(voiceOver),
    2_000,
  );
  const asked = opened.flatMap((phrase, index) =>
    has(phrase, question) && !has(phrase, strings.keep) ? [index] : [],
  );
  const kept = opened.findIndex((phrase) => has(phrase, strings.keep));
  expect(asked, "the dialog is read on its own, once").toHaveLength(1);
  expect(kept, "Keep is read").toBeGreaterThan(-1);
  expect(asked[0], "the dialog comes before Keep").toBeLessThan(kept);
  expect(
    back.some((phrase) => has(phrase, rowDelete)),
    "Escape returns to the row's Delete",
  ).toBe(true);
});

// Three: a rename saved with Enter says "Saved." once, and the field, which
// keeps the name it had when focus arrived, is not read again while it keeps
// focus (D-118, D-140): no phrase in the window after Enter holds the field's
// label, before "Saved." or after it. With the held name dropped, VoiceOver
// read "Menu name for Lunchx" the moment the save landed, just before
// "Saved.". The row gets its name back after.
test('reading 3 on Menus: a rename with Enter says "Saved.", and the field is not read again while it keeps focus (D-118, D-140)', async ({
  page,
  voiceOver,
  hear,
}) => {
  const strings = en.owner.menus;
  const saved = en.owner.editing.fieldSaved;
  await arrive(page, restaurantMenusPath(code), voiceOver);
  const field = firstField(page);
  const before = await field.inputValue();

  await hear.seek(
    "VO-Command-J to the first menu name field",
    commands(voiceOver).findNextControl,
    strings.nameLabel,
  );
  await expect(field, "the field has focus").toBeFocused();
  await voiceOver.press("Command+ArrowRight");
  await voiceOver.type("x");
  await expect(field).toHaveValue(`${before}x`);
  const heard = await hear.listen(
    "Enter, then 3 seconds",
    async () => {
      await voiceOver.press("Enter", { capture: false });
    },
    3_000,
  );
  expect(
    heard.some((phrase) => has(phrase, saved)),
    `"${saved}" is said`,
  ).toBe(true);
  expect(
    heard.filter((phrase) => has(phrase, strings.nameLabel)),
    "the field is not read again while it keeps focus",
  ).toEqual([]);
  await expect(field, "focus stays in the field").toBeFocused();

  // The row gets its name back, so the stand-in is as it was.
  const heading = listRows(page).first().getByRole("heading", { level: 2 });
  await field.fill(before);
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText(before);
  await page.keyboard.press("Tab");
});

// Four: Save details that lands loads Details again as a new document
// (D-211, Q-141), with the banner as GitHub's flash (D-214): its dismiss
// button carries autofocus in the served HTML and takes focus as the page
// loads, and its words sit in an alert with aria-atomic. On the Mac an
// alert served in the HTML is not said at the load, ours or GitHub's,
// unless VoiceOver's automatic page read is on, which Guidepup's
// preferences leave off (D-217, Q-145). So in the window after Enter one
// phrase holds the dismiss button's name with "Success", the region it
// starts, and no phrase holds "Details saved.". Then VO-Right from the
// button reads the banner's heading, and once more its words, since the
// banner reads its dismiss button, its heading, then its words (D-216).
// Each move is judged by the new phrase VoiceOver speaks for it, polled
// from VoiceOver's last phrase before the key, never by VoiceOver's item:
// after the load the item still named the old page's Save details (Q-145).
// The save changes nothing, so the stand-in stays as it was, and the banner
// clears its own cookie.
//
// Its negative control, run by hand: HEAR_CONTROL=1 adds a second alert
// holding the words to the page the save loads, once that page has loaded,
// and VoiceOver says that one (Q-145); the reading must go red at its
// count, the words in one phrase where none is expected.
const strayAlertArm = "hear-control";

// Runs in the page as an init script, so it names the key itself: the same
// words as strayAlertArm.
function strayAlert(words: string) {
  if (sessionStorage.getItem("hear-control") !== "armed") return;
  sessionStorage.removeItem("hear-control");
  addEventListener("load", () => {
    setTimeout(() => {
      const alert = document.createElement("div");
      alert.setAttribute("role", "alert");
      document.body.append(alert);
      setTimeout(() => {
        alert.textContent = words;
      }, 100);
    }, 300);
  });
}

test('reading 4 on Details: Save details loads the page again with focus on the banner\'s dismiss button, VoiceOver says the button and "Success" at the load and "Details saved." in no phrase, then VO-Right says the "Success" heading and VO-Right again the words (D-211, D-214, D-216, D-217)', async ({
  page,
  voiceOver,
  hear,
}) => {
  const strings = en.owner.restaurants;
  const words = strings.details.saved;
  const { dismiss, success } = en.ui.banner;
  const control = process.env.HEAR_CONTROL === "1";
  if (control) await page.addInitScript(strayAlert, words);
  hear.note(
    "expected",
    `focus on ${dismiss}, its phrase with ${success}, and ${words} in no phrase of the load's window; then VO-Right: the ${success} heading, then ${words}${control ? " (control: a late alert with the words, which must go red at one)" : ""}`,
  );

  await arrive(page, restaurantDetailsPath(code), voiceOver);
  await hear.seek(
    `VO-Command-H to the ${strings.sections.allergens} heading`,
    commands(voiceOver).findNextHeading,
    strings.sections.allergens,
  );
  await hear.seek(
    `VO-Command-J to ${strings.details.submit}`,
    commands(voiceOver).findNextControl,
    strings.details.submit,
  );
  const save = page.getByRole("button", {
    name: strings.details.submit,
    exact: true,
  });
  await expect(save, "Save details has focus").toBeFocused();
  if (control) {
    await page.evaluate(
      (key) => sessionStorage.setItem(key, "armed"),
      strayAlertArm,
    );
  }
  const heard = await hear.listen(
    "Enter on Save details, then 6 seconds",
    enter(voiceOver),
    6_000,
  );
  const banner = savedBanner(page);
  await expect(banner, "the new page has the banner").toHaveCount(1);
  await expect(
    banner.getByRole("button", { name: dismiss, exact: true }),
    "the dismiss button has focus",
  ).toBeFocused();
  expect(
    heard.filter((phrase) => has(phrase, dismiss) && has(phrase, success)),
    `one phrase holds "${dismiss}" with "${success}"`,
  ).toHaveLength(1);
  expect(
    heard.filter((phrase) => has(phrase, words)),
    `"${words}" is in no phrase of the load's window`,
  ).toEqual([]);

  // The banner reads its dismiss button, its heading, then its words
  // (D-216), so from the focused button VO-Right says the heading and the
  // next VO-Right "Details saved.". Each move is the first phrase that
  // differs from VoiceOver's last phrase before its key; none means the
  // move said nothing new.
  const toHeading = await hear.listen(
    "VO-Right from the dismiss button, then 2 seconds",
    next(voiceOver),
    2_000,
  );
  const headingPhrase = toHeading[0] ?? "";
  expect(headingPhrase, "VO-Right from the button says something new").not.toBe(
    "",
  );
  expect(
    has(headingPhrase, success) && has(headingPhrase, "heading"),
    `VO-Right from the button says the "${success}" heading`,
  ).toBe(true);
  const toWords = await hear.listen(
    "VO-Right from the heading, then 2 seconds",
    next(voiceOver),
    2_000,
  );
  const wordsPhrase = toWords[0] ?? "";
  expect(wordsPhrase, "VO-Right from the heading says something new").not.toBe(
    "",
  );
  expect(
    has(wordsPhrase, words),
    `VO-Right from the heading says "${words}"`,
  ).toBe(true);
});
