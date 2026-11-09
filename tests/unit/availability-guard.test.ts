import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D-160: only src/domain/availability.ts decides what a sold-out mark means,
// since a mark whose end has passed reads as available and a reader that
// looked at the column alone would keep a dish sold out for good. Every
// other file under app/ and src/ that names the column is listed here with
// its reason, and none of them reads the mark's meaning.
const root = fileURLToPath(new URL("../../", import.meta.url));
const decider = "src/domain/availability.ts";
const names = /sold_out_at|soldOutAt/;

const allowed: Record<string, string> = {
  [decider]: "decides availability from the mark, the one place that does",
  "src/domain/dish.ts": "the dish's row shape carries the mark to the decider",
  "src/core/supabase/dishes.ts":
    "reads and writes the column, and never reads its meaning",
  "src/features/owner/dish/actions.ts":
    "writes the mark the owner's choice means",
  "src/features/owner/dish/load-dish.ts":
    "hands the row to the decider once per request, for the page nav's Availability line and the Availability page (D-222); no route or frame names the mark",
  "src/domain/snapshot.ts":
    "lists the mark among the keys a published snapshot never holds, since the diner page reads it live (migration 12)",
  "src/core/supabase/diner.ts":
    "reads the column from published_item_states for the diner page and hands it on, never reading its meaning",
  "src/domain/diner.ts":
    "carries each dish's row to the decider, which says whether the dish shows and reads sold out",
  "src/features/diner/load.ts":
    "maps the read's rows into the state the view model and the timed ends take",
};

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

describe("the one reader of a sold-out mark (D-160)", () => {
  it("finds the decider and the files to scan", () => {
    expect(files).toContain(decider);
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(Object.entries(allowed))(
    "%s names the mark, because it %s",
    (file) => {
      expect(files, `${file} is listed but not on disk`).toContain(file);
      expect(names.test(readFileSync(join(root, file), "utf8"))).toBe(true);
    },
  );

  it.each(files.filter((file) => !(file in allowed)))(
    "%s never names the mark",
    (file) => {
      const source = readFileSync(join(root, file), "utf8");
      expect(names.test(source)).toBe(false);
    },
  );
});
