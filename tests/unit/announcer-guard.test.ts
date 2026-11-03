import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Next's route announcer kept out of React Aria's hide (Q-127, D-201). React
// Aria leaves every element marked data-live-announcer="true" visible while
// a list is open, a convention it keeps for its own announcer. One file
// marks Next's announcer that way, and the root layout renders it, so the
// mark lands on every page. Reading the mark is anyone's: a selector in
// brackets, [data-live-announcer], is a read and passes. Any other mention,
// the bare attribute name or the dataset's liveAnnouncer, is taken as a
// write and must be the keeper's.
const root = fileURLToPath(new URL("../../", import.meta.url));
const keeper = "src/core/a11y/keep-route-announcer.tsx";
const layout = "app/layout.tsx";

const writesTheMark = /(?<!\[)data-live-announcer|\bliveAnnouncer\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
    },
  );
}

const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("Next's route announcer kept out of React Aria's hide (D-201)", () => {
  it("tells a read of the mark from a write", () => {
    expect(
      writesTheMark.test('"[data-live-announcer] [aria-labelledby]"'),
    ).toBe(false);
    expect(writesTheMark.test('const MARK = "data-live-announcer";')).toBe(
      true,
    );
    expect(writesTheMark.test("node.dataset.liveAnnouncer = 'true';")).toBe(
      true,
    );
  });

  it("sets the mark from one file only", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("src")];
    expect(files.length).toBeGreaterThan(10);
    expect(
      files.filter((file) => writesTheMark.test(read(file))).sort(),
    ).toEqual([keeper]);
  });

  it("marks Next's announcer with the value React Aria reads, and never takes the mark off", () => {
    const source = read(keeper);
    expect(source).toMatch(/^"use client";/);
    expect(source).toContain('"next-route-announcer"');
    expect(source).toMatch(/\.setAttribute\(\s*MARK,\s*"true"\s*\)/);
    expect(source).not.toContain("removeAttribute");
  });

  it("is rendered by the root layout, inside the body", () => {
    const source = read(layout);
    expect(source).toMatch(
      /import\s*\{\s*KeepRouteAnnouncer\s*\}\s*from\s*"@\/core\/a11y\/keep-route-announcer";/,
    );
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(source)?.[1] ?? "";
    expect(body).toContain("<KeepRouteAnnouncer />");
  });
});
