import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeSnapshot,
  SNAPSHOT_DIR,
  snapshotFromRaw,
} from "../a11y/snapshot-files.mjs";

// The committed aria snapshot files (D-194), one per page the gate visits,
// follow the rules in tests/a11y/snapshot-files.mjs: no url line, and
// dates in words, the owner's address, the menu link's origin, and the
// dish page's schedule sentence as patterns. A file Playwright rewrote
// outside `npm run local -- --update-snapshots` fails here before it fails
// on CI, and the Dinner page keeps a file for each state of the clock, so
// a regeneration that missed the night window fails here, not at 11 pm.

const files = readdirSync(SNAPSHOT_DIR)
  .filter((name) => name.endsWith(".aria.yml"))
  .sort();

// Every page the gate visits, by the name tests/a11y gives its file.
const pages = [
  "a11y-code",
  "app",
  "app-restaurants-new",
  "app-sign-in",
  "app-sign-in-error-link",
  "feedback-code",
  "home",
  "m-code",
  "m-code-brunch",
  "m-code-drinks",
  "m-code-made-up",
  "m-code-night",
  "owner-app",
  "owner-app-checkout-success",
  "owner-app-restaurants-code-details",
  "owner-app-restaurants-code-details-created-1",
  "owner-app-restaurants-code-details-saved-1",
  "owner-app-restaurants-code-menus",
  "owner-app-restaurants-new",
  "owner-choices-dish",
  "owner-choices-section",
  "owner-dishes-market",
  "owner-dishes-one",
  "owner-dishes-sizes",
  "owner-menus-empty",
  "owner-menus-with-sections",
  "owner-sections-empty",
  "owner-sections-with-dishes",
];

describe("the aria snapshot files (D-194)", () => {
  it("holds one file per page the gate visits, the Dinner page's two by the clock", () => {
    expect(files).toEqual(pages.map((name) => `${name}.aria.yml`).sort());
  });

  it.each(files)("%s follows the rules", (name) => {
    const text = readFileSync(join(SNAPSHOT_DIR, name), "utf8");
    expect(normalizeSnapshot(text)).toBe(text);
    expect(text).not.toMatch(/^\s*- \/url:/m);
    expect(text.endsWith("\n")).toBe(true);
  });
});

// A file from the raw tree: every text child kept, Playwright's own
// patterns on names and values, the url lines gone, the rules applied.
describe("a snapshot written from the raw tree", () => {
  it("keeps the text a control repeats, patterns the numbers, drops the urls, and applies the rules", () => {
    const raw = [
      '- link "Skip to main content":',
      '  - /url: "#main"',
      "- main:",
      '  - heading "Open 24 hours on Monday" [level=2]',
      '  - checkbox "Open 24 hours on Monday" [checked]',
      '  - textbox "Option name for Buttered roll": Buttered roll',
      '  - textbox "Added price for Buttered roll": "2.00"',
      '  - button "Move up, Buttered roll" [disabled]: Move up',
      "  - 'link \"Feedback: about this menu\"':",
      "    - /url: /feedback/12345678",
      "  - paragraph: Signed in as owner@example.test",
      '  - paragraph: "Diners read: \"Every day, 4 to 9 pm.\" Shows now, until 9 pm."',
      "  - paragraph: Published on October 4, 2026. Nothing has changed since.",
      '  - group "Monday":',
      "    - text: Monday",
      "- alert",
    ].join("\n");
    expect(snapshotFromRaw(raw)).toBe(
      [
        '- link "Skip to main content"',
        "- main:",
        "  - heading /Open \\d+ hours on Monday/ [level=2]",
        "  - checkbox /Open \\d+ hours on Monday/ [checked]",
        '  - textbox "Option name for Buttered roll": Buttered roll',
        '  - textbox "Added price for Buttered roll": /\\d+\\.\\d+/',
        '  - button "Move up, Buttered roll" [disabled]: Move up',
        "  - 'link \"Feedback: about this menu\"'",
        "  - paragraph: /Signed in as \\S+/",
        '  - paragraph: "/Diners read: \\"Every day, 4 to 9 pm\\\\.\\" (Shows now, [^.]+|Next shows [^.]+)\\\\./"',
        "  - paragraph: /Published on \\w+ \\d+, \\d+\\. Nothing has changed since\\./",
        '  - group "Monday":',
        "    - text: Monday",
        "- alert",
        "",
      ].join("\n"),
    );
  });

  it("is its own fixed point under the rules", () => {
    const written = snapshotFromRaw(
      [
        '- button "Move up, Lunch": Move up',
        "  - /url: /x",
        "- paragraph: Published on October 4, 2026.",
      ].join("\n"),
    );
    expect(normalizeSnapshot(written)).toBe(written);
  });
});

// The rules on the lines Playwright writes, and the patterns they leave
// against the words both sides of the gate show.
describe("the snapshot rules", () => {
  const body = (line: string) => {
    const value = line.slice(line.indexOf(": ") + 2);
    const raw = value.startsWith('"') ? (JSON.parse(value) as string) : value;
    return raw.slice(1, -1);
  };

  it("drops url lines and leaves every other line as written", () => {
    const text = [
      '- link "Skip to main content":',
      '  - /url: "#main"',
      '- heading "Accessible menu" [level=1]',
      "- 'link \"Edit menus for CI Diner (test restaurant, not real)\"':",
      "  - /url: /app/restaurants/12345678/menus",
      "- paragraph: Fried items share a fryer with breaded foods.",
    ].join("\n");
    expect(normalizeSnapshot(text)).toBe(
      [
        '- link "Skip to main content"',
        '- heading "Accessible menu" [level=1]',
        "- 'link \"Edit menus for CI Diner (test restaurant, not real)\"'",
        "- paragraph: Fried items share a fryer with breaded foods.",
        "",
      ].join("\n"),
    );
    const nested = [
      "- paragraph:",
      "  - text: Menu by",
      '  - link "Accessible Menu":',
      '    - /url: "/"',
      "- alert",
    ].join("\n");
    expect(normalizeSnapshot(nested)).toBe(
      [
        "- paragraph:",
        "  - text: Menu by",
        '  - link "Accessible Menu"',
        "- alert",
        "",
      ].join("\n"),
    );
  });

  it("reads a date in words as a pattern, the day literal or not", () => {
    const line =
      "- paragraph: /Published on October 4, \\d+\\. Nothing has changed since\\./";
    const out = normalizeSnapshot(line).trimEnd();
    expect(out).toBe(
      "- paragraph: /Published on \\w+ \\d+, \\d+\\. Nothing has changed since\\./",
    );
    expect(
      new RegExp(body(out)).test(
        "Published on November 12, 2026. Nothing has changed since.",
      ),
    ).toBe(true);
    const stamp =
      '- paragraph: "/Diners read: Contains milk, wheat, and celery\\\\. Checked by you on October 8, \\\\d+\\\\./"';
    const stampOut = normalizeSnapshot(stamp).trimEnd();
    expect(stampOut).toBe(
      '- paragraph: "/Diners read: Contains milk, wheat, and celery\\\\. Checked by you on \\\\w+ \\\\d+, \\\\d+\\\\./"',
    );
    expect(
      new RegExp(body(stampOut)).test(
        "Diners read: Contains milk, wheat, and celery. Checked by you on January 3, 2027.",
      ),
    ).toBe(true);
  });

  it("reads the owner's address and the menu link's origin as patterns", () => {
    const signed = normalizeSnapshot(
      "- paragraph: Signed in as owner@example.test",
    ).trimEnd();
    expect(signed).toBe("- paragraph: /Signed in as \\S+/");
    expect(
      new RegExp(body(signed)).test("Signed in as ci-owner@example.org"),
    ).toBe(true);
    const link = normalizeSnapshot(
      "- paragraph: /Menu link http:\\/\\/localhost:\\d+\\/m\\/\\d+/",
    ).trimEnd();
    expect(link).toBe("- paragraph: /Menu link \\S+/");
    expect(
      new RegExp(body(link)).test(
        "Menu link https://accessible-menu-abc123-michael-states-projects.vercel.app/m/56097672",
      ),
    ).toBe(true);
  });

  it("reads the schedule sentence as one pattern for the day and the night", () => {
    const day =
      '- paragraph: "Diners read: \\"Every day, 4 to 9 pm.\\" Shows now, until 9 pm."';
    const night =
      '- paragraph: "/Diners read: \\"Every day, 4 to 9 pm\\\\.\\" Next shows Saturday, October \\\\d+\\\\./"';
    const expected =
      '- paragraph: "/Diners read: \\"Every day, 4 to 9 pm\\\\.\\" (Shows now, [^.]+|Next shows [^.]+)\\\\./"';
    expect(normalizeSnapshot(day).trimEnd()).toBe(expected);
    expect(normalizeSnapshot(night).trimEnd()).toBe(expected);
    const pattern = new RegExp(body(expected));
    for (const words of [
      'Diners read: "Every day, 4 to 9 pm." Shows now, until 9 pm.',
      'Diners read: "Every day, 4 to 9 pm." Next shows Saturday, October 31.',
      'Diners read: "Every day, 4 to 9 pm." Next shows Friday, January 1, 2027.',
      'Diners read: "Every day, 4 to 9 pm." Shows now, all day.',
    ]) {
      expect(pattern.test(words), words).toBe(true);
    }
  });

  it("changes nothing the second time", () => {
    const once = normalizeSnapshot(
      [
        "- paragraph: Signed in as owner@example.test",
        "- paragraph: /Published on October 4, \\d+\\./",
        '- paragraph: "Diners read: \\"Every day, 4 to 9 pm.\\" Shows now, until 9 pm."',
        '- link "Feedback about this menu":',
        "  - /url: /feedback/12345678",
      ].join("\n"),
    );
    expect(normalizeSnapshot(once)).toBe(once);
  });
});
