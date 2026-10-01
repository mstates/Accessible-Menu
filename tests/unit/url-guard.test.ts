import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D-88: every menu URL comes from one builder. Nothing else under app/ or
// src/ writes the menu path prefix.
const root = fileURLToPath(new URL("../../", import.meta.url));
const builder = "src/domain/menu-url.ts";
const prefix = "/m/";

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

describe("the one URL builder (D-88)", () => {
  it("finds the builder and the files to scan", () => {
    expect(files).toContain(builder);
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.filter((file) => file !== builder))(
    "%s never writes the menu path itself",
    (file) => {
      const source = readFileSync(join(root, file), "utf8");
      expect(source.includes(prefix)).toBe(false);
    },
  );
});
