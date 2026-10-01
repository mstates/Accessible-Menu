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

// Function headers: from create function to the body's opening $$.
const functionHeaders = [
  ...sql.matchAll(
    /create (?:or replace )?function public\.(\w+)\(([\s\S]*?)\) returns [\s\S]*? as \$\$/g,
  ),
].map((match) => ({ name: match[1] ?? "", header: match[0] }));

const definers = functionHeaders.filter(({ header }) =>
  header.includes("security definer"),
);

describe("security definer functions (D-67, D-95)", () => {
  it("finds the definer functions", () => {
    expect(definers.map((fn) => fn.name)).toEqual(
      expect.arrayContaining(["is_owner", "owns_object", "create_restaurant"]),
    );
  });

  it.each(definers.map((fn) => fn.name))(
    "%s runs with an empty search_path and is revoked from public",
    (name) => {
      const fn = definers.find((candidate) => candidate.name === name);
      expect(fn?.header).toMatch(/set search_path = ''/);
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\(`),
      );
    },
  );

  it("grants create_restaurant to authenticated and nobody else", () => {
    expect(sql).toMatch(
      /grant execute on function public\.create_restaurant\([\s\S]*?\) to authenticated;/,
    );
    const grants = [...sql.matchAll(/grant [^;]*create_restaurant[^;]*;/g)].map(
      (match) => match[0],
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/to (anon|public)\b/);
  });

  it("keeps generate_menu_code off the Data API", () => {
    expect(sql).not.toMatch(/grant [^;]*generate_menu_code/);
  });
});

describe("the owner boundary on restaurants (D-88, D-95)", () => {
  const forbidden = [
    "id",
    "code",
    "slug",
    "city_slug",
    "country",
    "status",
    "plan",
    "stripe_customer_id",
    "created_at",
    "updated_at",
  ];

  it("replaces the table-wide update grant with a column list", () => {
    expect(sql).toMatch(
      /revoke update on public\.restaurants from authenticated;/,
    );
    const match = sql.match(
      /grant update \(([^)]*)\) on public\.restaurants to authenticated;/,
    );
    expect(match).not.toBeNull();
    const columns = (match?.[1] ?? "").split(",").map((c) => c.trim());
    for (const column of forbidden) {
      expect(columns).not.toContain(column);
    }
    expect(columns).toEqual(
      expect.arrayContaining(["name", "address", "hours", "allergen_note"]),
    );
  });

  it("locks the menu code after insert", () => {
    expect(sql).toMatch(
      /restaurants_code_format check \(code ~ '\^\[1-9\]\[0-9\]\{7\}\$'\)/,
    );
    expect(sql).toMatch(
      /restaurants_code_lower check \(code = lower\(code\)\)/,
    );
    expect(sql).toMatch(
      /create trigger restaurants_keep_code before update of code on public\.restaurants/,
    );
    expect(sql).toMatch(/create unique index restaurants_code_key/);
  });

  it("holds the field rules as table constraints", () => {
    expect(sql).toMatch(/restaurants_country_us check \(country = 'US'\)/);
    expect(sql).toMatch(/restaurants_website_format/);
    expect(sql).toMatch(/website ~\* '\^https\?:\/\/\\S\+\$'/);
    expect(sql).toMatch(/btrim\(address\) <> ''/);
    expect(sql).toMatch(/btrim\(city\) <> ''/);
    expect(sql).toMatch(
      /restaurants_region_format check \(region ~ '\^\[A-Z\]\{2\}\$'\)/,
    );
    expect(sql).toMatch(/restaurants_postal_code_format/);
    expect(sql).toMatch(/restaurants_phone_format/);
    expect(sql).toMatch(/restaurants_timezone_known/);
    expect(sql).toMatch(/restaurants_hours_object/);
  });

  it("keeps timezone and country not null", () => {
    expect(sql).toMatch(/timezone text not null/);
    expect(sql).toMatch(/country text not null/);
  });

  it("brings existing rows inside every rule before adding it", () => {
    const normalize = sql.indexOf(
      "update public.restaurants set\n  name = left(name, 120)",
    );
    const constraints = sql.indexOf("add constraint restaurants_name_length");
    expect(normalize).toBeGreaterThan(-1);
    expect(constraints).toBeGreaterThan(normalize);
  });
});
