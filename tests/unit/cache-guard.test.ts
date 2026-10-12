import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// core/cache is the only caller of Next's revalidation API (the diner page
// task): a writer that reached it on its own could clear the wrong tag or
// none, and a missed one is a stale menu with nothing saying so. Every
// other file under app/ and src/ may import refresh() from next/cache,
// which re-renders the owner's own page and touches no cache, and nothing
// else from it. core/cache is also the only file that reaches into Next's
// internals (next/dist): it reads the render store to end a page's
// lifetime (Q-95), and a second such coupling anywhere else would go
// unnoticed at the next Next update.
const root = fileURLToPath(new URL("../../", import.meta.url));
const cacheModule = "src/core/cache/index.ts";
const forbidden = [
  "updateTag",
  "revalidateTag",
  "revalidatePath",
  "unstable_cache",
  "cacheTag",
  "cacheLife",
];

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

// What a file imports from next/cache, as the names inside the braces.
function cacheImports(source: string): string[] {
  return [
    ...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']next\/cache["']/g),
  ].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0] ?? "")
      .filter((name) => name !== ""),
  );
}

describe("the one caller of Next's revalidation API (core/cache)", () => {
  it("finds the module and the files to scan", () => {
    expect(files).toContain(cacheModule);
    expect(files.length).toBeGreaterThan(10);
  });

  it("imports the revalidation API itself, and the render store from Next's internals", () => {
    const source = readFileSync(join(root, cacheModule), "utf8");
    expect(cacheImports(source)).toEqual(
      expect.arrayContaining(["revalidateTag", "unstable_cache", "updateTag"]),
    );
    expect(source).toMatch(
      /import\s*\{\s*workUnitAsyncStorage\s*\}\s*from\s*["']next\/dist\/server\/app-render\/work-unit-async-storage\.external["']/,
    );
  });

  it.each(files.filter((file) => file !== cacheModule))(
    "%s imports nothing from next/cache but refresh",
    (file) => {
      const source = readFileSync(join(root, file), "utf8");
      const names = cacheImports(source);
      expect(names.filter((name) => name !== "refresh")).toEqual([]);
      for (const name of forbidden) {
        expect(source, `${file} names ${name}`).not.toMatch(
          new RegExp(`\\b${name}\\s*\\(`),
        );
      }
      expect(source, `${file} reaches into next/dist`).not.toMatch(
        /from\s*["']next\/dist\//,
      );
    },
  );
});
