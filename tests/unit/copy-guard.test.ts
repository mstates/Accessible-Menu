import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copy } from "../../src/copy";
import { demoCity, demoRestaurant } from "../../src/core/data/demo";

const root = fileURLToPath(new URL("../../", import.meta.url));
const EM_DASH = String.fromCodePoint(0x2014);

// Never in product copy: Spec 7, D-4, D-41, D-43.
const banned: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "em dash", pattern: new RegExp(EM_DASH) },
  { rule: '"AI"', pattern: /\bAI\b/ },
  { rule: '"compliant"', pattern: /compliant/i },
  { rule: '"certified"', pattern: /certified/i },
  { rule: '"guarantee"', pattern: /guarantee/i },
  { rule: '"100%"', pattern: /100%/ },
  { rule: '"lawsuit-proof"', pattern: /lawsuit-proof/i },
  // D-41: allowed only after the first paid tester panel has run.
  {
    rule: '"Tested by disabled diners"',
    pattern: /tested by disabled diners/i,
  },
  // D-43: the brand is never abbreviated. Screen readers say "me".
  { rule: '"ME"', pattern: /\bME\b/ },
];

type Leaf = { path: string; text: string };

function leaves(value: unknown, path: string): Leaf[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, `${path}.${key}`),
    );
  }
  return [];
}

describe("copy guard: product copy", () => {
  // The demo restaurant is content diners read, so it is checked like copy.
  const strings = [
    ...leaves(copy, "copy"),
    ...leaves(demoRestaurant, "demoRestaurant"),
    ...leaves(demoCity, "demoCity"),
  ];

  it("finds copy to check", () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it("contains no banned words and no em dash", () => {
    const violations = strings.flatMap(({ path, text }) =>
      banned
        .filter(({ pattern }) => pattern.test(text))
        .map(({ rule }) => ({ path, rule, text })),
    );
    expect(violations).toEqual([]);
  });
});

// Em dashes are banned in every file, code comments included (CLAUDE.md).
// Banned words are checked only in copy, because "width: 100%" is valid CSS.
const scanDirs = ["app", "src", "tests", "supabase", ".githooks"];
const textExtensions = new Set([
  "",
  ".css",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
]);
const skipNames = new Set([
  ".DS_Store",
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "package-lock.json",
  "playwright-report",
  "test-results",
]);

function textFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (skipNames.has(entry.name)) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return textFiles(full);
    return textExtensions.has(extname(entry.name)) ? [full] : [];
  });
}

describe("copy guard: repository text", () => {
  const rootFiles = readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !skipNames.has(entry.name) &&
        textExtensions.has(extname(entry.name)),
    )
    .map((entry) => join(root, entry.name));
  const files = [
    ...rootFiles,
    ...scanDirs.flatMap((dir) => textFiles(join(root, dir))),
  ];

  it("finds files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("scans every git hook", () => {
    const hooks = readdirSync(join(root, ".githooks")).map((name) =>
      join(root, ".githooks", name),
    );
    expect(hooks.length).toBeGreaterThan(0);
    expect(files).toEqual(expect.arrayContaining(hooks));
  });

  it("contains no em dash in any file", () => {
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes(EM_DASH))
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });
});
