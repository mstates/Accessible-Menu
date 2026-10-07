import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CI Diner's data file is run by hand in the SQL editor and grows with later
// tasks (D-126). What it promises in its header holds for every version: it
// touches one restaurant, deletes nothing, and creates nothing.

const file = fileURLToPath(
  new URL("../../supabase/checks/ci_diner.sql", import.meta.url),
);
const text = readFileSync(file, "utf8");
// The statements alone. Comments and the report's sentences say what the
// file never does, and what to do by hand, in words.
const code = text
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("CI Diner's data file (D-126)", () => {
  it("names no restaurant but CI Diner", () => {
    const codes = new Set(text.match(/\b\d{8}\b/g) ?? []);
    expect([...codes]).toEqual(["56097672"]);
  });

  it("deletes nothing, by statement or by mark", () => {
    expect(code).not.toMatch(/\b(delete|truncate|drop)\b/i);
    expect(code).not.toMatch(/\bdeleted_at\s*=/i);
  });

  it("creates nothing and grants nothing", () => {
    expect(code).not.toMatch(/\b(create|alter|grant|revoke)\b/i);
  });

  it("writes only through inserts, sort updates, and the three dishes' prices", () => {
    const updates = code.match(/\bupdate\s+public\.\w+\s+\w+\s+set\s+\w+/gi);
    expect(updates).toEqual([
      "update public.menus m\n  set sort",
      "update public.sections s\n  set sort",
      "update public.items i\n  set sort",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set price_kind",
    ]);
  });

  // The price updates touch only Starters' three dishes, by id, and write
  // only the choice and the price (D-139).
  it("prices the three dishes by id and writes nothing else to them", () => {
    const prices = [
      ...code.matchAll(/update public\.items i\n  set price_kind[^;]*;/g),
    ].map((match) => match[0]);
    expect(prices).toHaveLength(3);
    for (const statement of prices) {
      expect(statement).toMatch(/where i\.id = (soup|salad|bread)/);
      expect(statement).not.toMatch(/\b(name|sort|description|note)\s*=/);
    }
  });
});
