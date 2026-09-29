import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(root, "supabase/migrations");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = files
  .map((name) => readFileSync(join(dir, name), "utf8"))
  .join("\n");

const tables = [
  ...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g),
].map((match) => match[1] ?? "");
const views = [
  ...sql.matchAll(/create (?:or replace )?view public\.(\w+)/g),
].map((match) => match[1] ?? "");

// Columns that must never reach a diner page (D-26, Spec 8).
const privateColumns = [
  "allergen_suggestions",
  "import_confidence",
  "external_ids",
  "stripe_customer_id",
  "plan",
  "phone",
  "address",
  "contact",
];

function viewBody(name: string): string {
  const match = sql.match(
    new RegExp(`create (?:or replace )?view public\\.${name}[\\s\\S]*?;`),
  );
  return match?.[0] ?? "";
}

describe("migrations", () => {
  it("has numbered migration files", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("creates the Spec 8 tables and nothing parked", () => {
    expect(tables).toEqual(
      expect.arrayContaining([
        "restaurants",
        "owners",
        "menus",
        "sections",
        "items",
        "translations",
        "feedback",
        "imports",
        "scan_stats",
      ]),
    );
    expect(tables).not.toContain("sign_orders");
  });

  it.each(tables)("enables row level security on %s", (table) => {
    expect(sql).toMatch(
      new RegExp(`alter table public\\.${table} enable row level security;`),
    );
  });

  it.each(tables)("gives owners a policy on %s", (table) => {
    expect(sql).toMatch(
      new RegExp(`create policy "[^"]+" on public\\.${table}`),
    );
  });

  it("exposes published data through views only", () => {
    expect(views).toEqual(
      expect.arrayContaining([
        "published_restaurants",
        "published_menus",
        "published_sections",
        "published_items",
      ]),
    );
    for (const view of views) {
      expect(sql).toMatch(
        new RegExp(
          `grant select on[^;]*public\\.${view}[^;]*to anon, authenticated;`,
        ),
      );
    }
  });

  it.each(views)("%s never exposes private columns", (view) => {
    const body = viewBody(view);
    expect(body.length).toBeGreaterThan(0);
    for (const column of privateColumns) {
      expect(body).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("never grants anon anything but the published views", () => {
    // Schema usage is the one grant anon needs besides the views.
    const anonGrants = [...sql.matchAll(/grant [^;]*to anon[^;]*;/g)]
      .map((match) => match[0])
      .filter((grant) => !grant.startsWith("grant usage on schema"));
    expect(anonGrants.length).toBeGreaterThan(0);
    for (const grant of anonGrants) {
      expect(grant).toMatch(/^grant select on/);
      expect(grant).not.toMatch(
        /public\.(restaurants|owners|menus|sections|items|translations|feedback|imports|scan_stats)\b/,
      );
    }
  });

  it("requires alt text when an item has a photo", () => {
    expect(sql).toMatch(
      /photo_url is null or length\(trim\(coalesce\(photo_alt, ''\)\)\) > 0/,
    );
  });

  it("keeps allergens unreviewed by default", () => {
    expect(sql).toMatch(/allergens_reviewed boolean not null default false/);
  });
});
