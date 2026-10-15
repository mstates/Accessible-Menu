import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// One focus ring (Q-100): the :focus-visible rule in app/globals.css, which
// every Tab stop and every target that code focuses wears. Tailwind 4's
// outline-none and outline-hidden set --tw-outline-style to none, and every
// outline width utility (outline, outline-3) takes its style from that
// variable, so a variant's width beside outline-none draws nothing even while
// the variant matches: the section headings, the choices block, the error
// page's heading, the result message, and the error summary all showed no
// ring that way from the day they were built. A class string that holds both
// must name the style under the same variant.
const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = "app/globals.css";

const hidesStyle = new Set(["outline-none", "outline-hidden"]);
const widthUnder = /^(.+:)outline(?:-\d+(?:\.\d+)?)?$/;
const styles = ["solid", "dashed", "dotted", "double"];

// The width classes in one class string that draw nothing.
function silentWidths(classes: string): string[] {
  const names = classes.split(/\s+/).filter((name) => name !== "");
  if (!names.some((name) => hidesStyle.has(name))) return [];
  return names.filter((name) => {
    const variant = widthUnder.exec(name)?.[1];
    if (variant === undefined) return false;
    return !styles.some((style) =>
      names.includes(`${variant}outline-${style}`),
    );
  });
}

// Every string and template literal in a file. A class string sits on one
// line, so a quote never runs past the end of its line.
function literals(source: string): string[] {
  return [
    ...source.matchAll(
      /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
    ),
  ].map((match) => match[0].slice(1, -1));
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

const files = [...sourceFiles("app"), ...sourceFiles("src")].map((file) =>
  relative(root, join(root, file)),
);

describe("one focus ring (Q-100)", () => {
  it("catches a width beside outline-none with no style, and nothing else", () => {
    expect(silentWidths("outline-none focus-visible:outline-3")).toEqual([
      "focus-visible:outline-3",
    ]);
    expect(silentWidths("mt-3 outline-none focus-visible:outline")).toEqual([
      "focus-visible:outline",
    ]);
    expect(
      silentWidths("outline-hidden data-[focus-visible]:outline-2"),
    ).toEqual(["data-[focus-visible]:outline-2"]);
    expect(
      silentWidths(
        "outline-none focus-visible:outline-solid focus-visible:outline-3",
      ),
    ).toEqual([]);
    expect(silentWidths("mx-auto max-w-menu px-4 py-8 outline-none")).toEqual(
      [],
    );
    expect(
      silentWidths(
        "border-2 group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus",
      ),
    ).toEqual([]);
    expect(silentWidths("outline-none focus-visible:outline-offset-2")).toEqual(
      [],
    );
  });

  it("finds the files to scan", () => {
    expect(files).toContain("src/features/diner/MenuPage.tsx");
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s draws every outline width it asks for", (file) => {
    const source = readFileSync(join(root, file), "utf8");
    const silent = literals(source).flatMap(silentWidths);
    expect(silent, `${file} hides the outline it asks for`).toEqual([]);
  });

  it("keeps the one ring every focus target wears, solid in the focus color", () => {
    const css = readFileSync(join(root, globals), "utf8");
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(
      /outline:\s*\d+(?:\.\d+)?px\s+solid\s+var\(--color-focus\)\s*;/,
    );
    expect(rule).toMatch(/outline-offset:\s*\d+(?:\.\d+)?px\s*;/);
  });
});
