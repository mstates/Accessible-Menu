import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copy } from "../../src/copy";

// D-220: Undo left the owner screens on November 8, 2026. Saving as you go
// stays (D-111), Publish is the one explicit step between a slip and a
// diner, and every row delete asks first (D-221). Nothing brings Undo back
// by halves: no copy key or string names it, no owner component imports an
// Undo stack, and no owner page keeps state in session storage, which is
// where the stack lived.
const root = fileURLToPath(new URL("../../", import.meta.url));
const undo = /undo/i;
const scanned = ["app/app", "src/features/owner", "src/ui"];

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

function sourceFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

const files = scanned
  .flatMap((dir) => sourceFiles(dir))
  .map((file) => relative(root, join(root, file)));

describe("Undo stays out of the owner screens (D-220)", () => {
  const strings = leaves(copy, "copy");

  it("finds copy and files to check", () => {
    expect(strings.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(10);
  });

  it("names Undo in no copy key and in no string", () => {
    expect(
      strings.filter(({ path, text }) => undo.test(path) || undo.test(text)),
    ).toEqual([]);
  });

  it.each(files)(
    "%s imports no Undo stack and keeps nothing in session storage",
    (file) => {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} imports an Undo module`).not.toMatch(
        /from\s*["'][^"']*undo[^"']*["']/i,
      );
      expect(source, `${file} reaches session storage`).not.toMatch(
        /sessionStorage/,
      );
    },
  );
});
