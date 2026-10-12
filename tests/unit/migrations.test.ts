import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DAY_KEYS } from "../../src/domain/hours";
import { MONTH_KEYS, WEEK_KEYS } from "../../src/domain/schedule";
import { TIME_PATTERN } from "../../src/domain/time";

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
// Every view a migration made, and the ones that are live after every
// migration: each create, minus a later drop. The published views were
// made in migration one, published_items was made again in six, and
// twelve retires two and remakes two (D-82, D-85).
const viewEvents = [
  ...sql.matchAll(/(create (?:or replace )?view|drop view) public\.(\w+)/g),
].map((match) => ({
  dropped: (match[1] ?? "").startsWith("drop"),
  name: match[2] ?? "",
}));
const views = [
  ...new Set(viewEvents.filter((e) => !e.dropped).map((e) => e.name)),
];
const liveViews = viewEvents.reduce<string[]>(
  (live, e) =>
    e.dropped
      ? live.filter((name) => name !== e.name)
      : [...live.filter((name) => name !== e.name), e.name],
  [],
);

// Columns that must never reach a diner page (D-26, Spec 8), who checked a
// dish's allergens and when among them (D-148).
const privateColumns = [
  "allergen_suggestions",
  "allergens_reviewed_by",
  "allergens_reviewed_at",
  "every_item_allergens_reviewed_by",
  "every_item_allergens_reviewed_at",
  "import_confidence",
  "external_ids",
  "stripe_customer_id",
  "plan",
  "phone",
  "address",
  "contact",
];

// A view's newest definition: the last create across the migrations.
function viewBody(name: string): string {
  const matches = [
    ...sql.matchAll(
      new RegExp(
        `create (?:or replace )?view public\\.${name}[\\s\\S]*?;`,
        "g",
      ),
    ),
  ];
  return matches.at(-1)?.[0] ?? "";
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
        "published_item_states",
      ]),
    );
    expect([...liveViews].sort()).toEqual([
      "published_item_states",
      "published_menus",
      "published_restaurants",
    ]);
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

  it("required alt text while an item could have a photo, until the Publish task dropped both columns with the rule (D-165)", () => {
    expect(sql).toMatch(
      /photo_url is null or length\(trim\(coalesce\(photo_alt, ''\)\)\) > 0/,
    );
    expect(sql).toMatch(
      /alter table public\.items drop constraint items_photo_requires_alt;\s*alter table public\.items drop column photo_url;\s*alter table public\.items drop column photo_alt;/,
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
    "%s runs with an empty search_path",
    (name) => {
      const fn = definers.find((candidate) => candidate.name === name);
      expect(fn?.header).toMatch(/set search_path = ''/);
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
});

// CLAUDE.md rule 14: every function a migration creates or replaces in
// public, other than trigger and event trigger functions, is revoked from
// public by name in that same migration. PUBLIC holds execute on every new
// function through Postgres's global default, which migration one's
// per-schema default-privilege revoke cannot remove, and a replace with new
// parameters is a new function. This checks what the migrations declare,
// not the live database; the boundary script still runs by hand (D-95).
const callableByFile = files.flatMap((file) => {
  const text = readFileSync(join(dir, file), "utf8");
  return [
    ...text.matchAll(
      /create (?:or replace )?function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(\S+)/gi,
    ),
  ]
    .map((match) => ({
      file,
      text,
      name: match[1] ?? "",
      returns: (match[3] ?? "").toLowerCase(),
    }))
    .filter((fn) => fn.returns !== "trigger" && fn.returns !== "event_trigger");
});

// Every grant on a function, in any form: execute or all, on one function
// by name or on every function in the schema.
const functionGrants = [
  ...sql.matchAll(
    /grant\s+(?:execute|all(?:\s+privileges)?)\s+on\s+(?:function\s+public\.\w+\s*\([\s\S]*?\)|all\s+functions\s+in\s+schema\s+public)\s+to\s+([^;]+);/gi,
  ),
].map((match) => ({
  grant: match[0],
  roles: (match[1] ?? "").split(",").map((role) => role.trim().toLowerCase()),
}));

describe("function privileges (CLAUDE.md rule 14)", () => {
  it("finds the callable functions", () => {
    expect(callableByFile.map((fn) => fn.name)).toEqual(
      expect.arrayContaining([
        "is_owner",
        "owns_object",
        "generate_menu_code",
        "create_restaurant",
      ]),
    );
  });

  it.each(callableByFile.map((fn) => [fn.name, fn.file] as const))(
    "%s is revoked from public by name in %s",
    (name, file) => {
      const fn = callableByFile.find(
        (candidate) => candidate.name === name && candidate.file === file,
      );
      const revokes = [
        ...(fn?.text ?? "").matchAll(
          new RegExp(
            `revoke all on function public\\.${name}\\s*\\([\\s\\S]*?\\)\\s+from\\s+([^;]+);`,
            "gi",
          ),
        ),
      ].map((match) => match[1] ?? "");
      expect(
        revokes.length,
        `${file} creates or replaces ${name} without a revoke`,
      ).toBeGreaterThan(0);
      expect(
        revokes.some((roles) => /\bpublic\b/i.test(roles)),
        `${file} revokes ${name}, but not from public`,
      ).toBe(true);
    },
  );

  it("grants functions only to authenticated or service_role", () => {
    expect(functionGrants.length).toBeGreaterThan(0);
    for (const { grant, roles } of functionGrants) {
      expect(roles, grant).not.toEqual([]);
      for (const role of roles) {
        expect(["authenticated", "service_role"], grant).toContain(role);
      }
    }
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

describe("the owner boundary on menus (D-82, D-85)", () => {
  const menus = readFileSync(join(dir, "20261004000001_menus.sql"), "utf8");
  const neverWritten = [
    "id",
    "published",
    "published_at",
    "source",
    "created_at",
    "updated_at",
  ];

  function columnsOf(privilege: string): string[] {
    const match = sql.match(
      new RegExp(
        `grant ${privilege} \\(([^)]*)\\) on public\\.menus to authenticated;`,
      ),
    );
    expect(match, `no ${privilege} column list on menus`).not.toBeNull();
    return (match?.[1] ?? "").split(",").map((column) => column.trim());
  }

  it("replaces the table-wide writes with column lists", () => {
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.menus from authenticated;/,
    );
    expect(columnsOf("insert")).toEqual(["restaurant_id", "name", "sort"]);
    expect(columnsOf("update")).toEqual(["name", "sort", "deleted_at"]);
    for (const column of neverWritten) {
      expect(columnsOf("insert")).not.toContain(column);
      expect(columnsOf("update")).not.toContain(column);
    }
    expect(columnsOf("update")).not.toContain("restaurant_id");
  });

  it("gives owners no delete on menus from this migration on", () => {
    const from = files.indexOf("20261004000001_menus.sql");
    expect(from).toBeGreaterThan(-1);
    const later = files
      .slice(from)
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    expect(later).not.toMatch(/grant [^;]*\bdelete\b[^;]*public\.menus\b/);
  });

  it("let nothing publish until the Publish task, whose migration alone drops the constraint", () => {
    const unpublish = menus.indexOf(
      "update public.menus set published = false, published_at = null where published;",
    );
    const constraint = menus.indexOf(
      "add constraint menus_not_published_yet check (not published);",
    );
    expect(unpublish).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(unpublish);
    const dropping = files.filter((name) =>
      readFileSync(join(dir, name), "utf8").includes(
        "drop constraint menus_not_published_yet",
      ),
    );
    expect(dropping).toEqual(["20261012000001_publish.sql"]);
  });

  it("leaves the published views alone", () => {
    expect(menus).not.toMatch(/\bview\b/);
  });

  it("holds the name rule as a table constraint", () => {
    const normalize = menus.indexOf("update public.menus\n  set name =");
    const constraint = menus.indexOf("add constraint menus_name_text");
    expect(normalize).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(normalize);
    expect(menus).toMatch(
      /check \(name ~ '\\S' and name !~ '\[\[:cntrl:\]\]' and length\(name\) <= 60\)/,
    );
  });

  it("keeps a deleted menu and frees its name", () => {
    expect(menus).toMatch(
      /alter table public\.menus add column deleted_at timestamptz;/,
    );
    const numbering = menus.indexOf("do $$");
    const index = menus.indexOf("create unique index menus_name_key");
    expect(numbering).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(numbering);
    expect(menus).toMatch(
      /create unique index menus_name_key\s+on public\.menus \(restaurant_id, lower\(btrim\(name\)\)\)\s+where deleted_at is null;/,
    );
  });

  it("orders menus through one function, open to authenticated only", () => {
    const grants = [...sql.matchAll(/grant [^;]*set_menu_order[^;]*;/g)].map(
      (match) => match[0],
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/to authenticated;$/);
    const body = menus.slice(
      menus.indexOf("create function public.set_menu_order"),
    );
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/for update;/);
    expect(body).toMatch(/coalesce\(array_ndims\(p_ids\), 0\) <> 1/);
    expect(body).toMatch(/cardinality\(p_ids\) <> live/);
    expect(body).toMatch(/m\.deleted_at is null/);
  });
});

describe("the owner boundary on sections (D-85, D-121)", () => {
  const file = "20261004000002_sections.sql";
  const sections = readFileSync(join(dir, file), "utf8");
  const neverWritten = ["id", "restaurant_id", "created_at", "updated_at"];

  function columnsOf(privilege: string): string[] {
    const match = sql.match(
      new RegExp(
        `grant ${privilege} \\(([^)]*)\\) on public\\.sections to authenticated;`,
      ),
    );
    expect(match, `no ${privilege} column list on sections`).not.toBeNull();
    return (match?.[1] ?? "").split(",").map((column) => column.trim());
  }

  it("replaces the table-wide writes with column lists", () => {
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.sections from authenticated;/,
    );
    expect(columnsOf("insert")).toEqual(["menu_id", "name", "sort"]);
    expect(columnsOf("update")).toEqual([
      "name",
      "note",
      "every_item",
      "sort",
      "deleted_at",
    ]);
    for (const column of neverWritten) {
      expect(columnsOf("insert")).not.toContain(column);
      expect(columnsOf("update")).not.toContain(column);
    }
  });

  // The gap the menus plan named: a member of two restaurants pointing a
  // section at the other one. Neither link is writable after insert, and the
  // restaurant is never writable at all, since the trigger fills it.
  it("never lets an owner write a section's menu or restaurant after insert", () => {
    expect(columnsOf("update")).not.toContain("menu_id");
    expect(columnsOf("update")).not.toContain("restaurant_id");
    expect(columnsOf("insert")).not.toContain("restaurant_id");
  });

  it("brings every section in line with its menu before the column lists, and its items after it", () => {
    const realign = sections.indexOf(
      "update public.sections s\n  set restaurant_id = m.restaurant_id",
    );
    const follow = sections.indexOf(
      "update public.items i\n  set restaurant_id = s.restaurant_id",
    );
    const revoke = sections.indexOf(
      "revoke insert, update, delete on public.sections from authenticated;",
    );
    expect(realign).toBeGreaterThan(-1);
    expect(follow).toBeGreaterThan(realign);
    expect(revoke).toBeGreaterThan(follow);
  });

  it("gives owners no delete on sections from this migration on", () => {
    const from = files.indexOf(file);
    expect(from).toBeGreaterThan(-1);
    const later = files
      .slice(from)
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    expect(later).not.toMatch(/grant [^;]*\bdelete\b[^;]*public\.sections\b/);
  });

  it("leaves the published views alone, and names the line in none", () => {
    expect(sections).not.toMatch(/\bview\b/);
    for (const view of views) {
      expect(viewBody(view)).not.toMatch(/\bevery_item\b/);
    }
  });

  it("adds the line shown with every dish", () => {
    expect(sections).toMatch(
      /alter table public\.sections add column every_item text;/,
    );
  });

  it("holds the three text rules as table constraints, with existing rows brought inside first", () => {
    const fixName = sections.indexOf("update public.sections\n  set name =");
    const fixNote = sections.indexOf("update public.sections\n  set note =");
    const constraints = sections.indexOf("add constraint sections_name_text");
    expect(fixName).toBeGreaterThan(-1);
    expect(fixNote).toBeGreaterThan(fixName);
    expect(constraints).toBeGreaterThan(fixNote);
    expect(sections).toMatch(
      /sections_name_text\s+check \(name ~ '\\S' and name !~ '\[\[:cntrl:\]\]' and length\(name\) <= 60\)/,
    );
    expect(sections).toMatch(
      /sections_note_text\s+check \(note ~ '\\S'\s+and translate\(note, chr\(10\), ' '\) !~ '\[\[:cntrl:\]\]'\s+and length\(note\) <= 500\)/,
    );
    expect(sections).toMatch(
      /sections_every_item_text\s+check \(every_item ~ '\\S' and every_item !~ '\[\[:cntrl:\]\]'\s+and length\(every_item\) <= 120\)/,
    );
  });

  it("keeps a deleted section and frees its name", () => {
    expect(sections).toMatch(
      /alter table public\.sections add column deleted_at timestamptz;/,
    );
    const numbering = sections.indexOf("do $$");
    const index = sections.indexOf("create unique index sections_name_key");
    expect(numbering).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(numbering);
    expect(sections).toMatch(
      /create unique index sections_name_key\s+on public\.sections \(menu_id, lower\(btrim\(name\)\)\)\s+where deleted_at is null;/,
    );
  });

  it("orders sections through one function, open to authenticated only", () => {
    const grants = [...sql.matchAll(/grant [^;]*set_section_order[^;]*;/g)].map(
      (match) => match[0],
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/to authenticated;$/);
    expect(sections).toMatch(
      /revoke all on function public\.set_section_order\(uuid, uuid\[\]\) from public, anon;/,
    );
    const body = sections.slice(
      sections.indexOf("create function public.set_section_order"),
    );
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/for update;/);
    expect(body).toMatch(/coalesce\(array_ndims\(p_ids\), 0\) <> 1/);
    expect(body).toMatch(/cardinality\(p_ids\) <> live/);
    expect(body).toMatch(/s\.deleted_at is null/);
    expect(body).toMatch(/s\.menu_id = p_menu/);
  });
});

describe("the owner boundary on items (D-85, task 3a)", () => {
  const file = "20261005000001_items.sql";
  const items = readFileSync(join(dir, file), "utf8");
  const neverWritten = [
    "id",
    "restaurant_id",
    "description",
    "price_cents",
    "price_text",
    "allergens",
    "custom_allergens",
    "allergens_reviewed",
    "allergen_suggestions",
    "dietary_tags",
    "note",
    "photo_url",
    "photo_alt",
    "available",
    "special_schedule",
    "import_confidence",
    "external_ids",
    "created_at",
    "updated_at",
  ];

  // The lists this file granted, not the newest list in all the files:
  // the dish page's migration grants again (D-85).
  function columnsOf(privilege: string): string[] {
    const match = items.match(
      new RegExp(
        `grant ${privilege} \\(([^)]*)\\) on public\\.items to authenticated;`,
      ),
    );
    expect(match, `no ${privilege} column list on items`).not.toBeNull();
    return (match?.[1] ?? "").split(",").map((column) => column.trim());
  }

  function bodyOf(name: string): string {
    const from = items.indexOf(`create function public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return items.slice(from, items.indexOf("\n$$;", from));
  }

  it("replaces the table-wide writes with column lists", () => {
    expect(items).toMatch(
      /revoke insert, update, delete on public\.items from authenticated;/,
    );
    expect(columnsOf("insert")).toEqual(["section_id", "name", "sort"]);
    expect(columnsOf("update")).toEqual(["name", "sort", "deleted_at"]);
    for (const column of neverWritten) {
      expect(columnsOf("insert")).not.toContain(column);
      expect(columnsOf("update")).not.toContain(column);
    }
  });

  // The gap the sections migration closed, one level down: a member of two
  // restaurants pointing a dish at the other one.
  it("never lets an owner write a dish's section or restaurant after insert", () => {
    expect(columnsOf("update")).not.toContain("section_id");
    expect(columnsOf("update")).not.toContain("restaurant_id");
    expect(columnsOf("insert")).not.toContain("restaurant_id");
  });

  it("brings every dish in line with its section before the column lists", () => {
    const realign = items.indexOf(
      "update public.items i\n  set restaurant_id = s.restaurant_id",
    );
    const revoke = items.indexOf(
      "revoke insert, update, delete on public.items from authenticated;",
    );
    expect(realign).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(realign);
  });

  it("gives owners no delete on items from this migration on", () => {
    const from = files.indexOf(file);
    expect(from).toBeGreaterThan(-1);
    const later = files
      .slice(from)
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    expect(later).not.toMatch(/grant [^;]*\bdelete\b[^;]*public\.items\b/);
  });

  it("leaves the published views alone", () => {
    expect(items).not.toMatch(/\bview\b/);
    expect(items).not.toMatch(/drop constraint menus_not_published_yet/);
  });

  it("holds the name rule as a table constraint, with existing rows brought inside first and trimmed again after the cut", () => {
    const fix = items.indexOf("update public.items\n  set name =");
    const constraint = items.indexOf("add constraint items_name_text");
    expect(fix).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(fix);
    expect(items).toMatch(
      /items_name_text\s+check \(name ~ '\\S' and name !~ '\[\[:cntrl:\]\]' and length\(name\) <= 120\)/,
    );
    expect(items.slice(fix, constraint)).toMatch(
      /regexp_replace\(left\([\s\S]*?, 120\), '\\s\+\$', ''\)/,
    );
  });

  it("keeps a deleted dish and frees its name", () => {
    expect(items).toMatch(
      /alter table public\.items add column deleted_at timestamptz;/,
    );
    const numbering = items.indexOf("do $$");
    const index = items.indexOf("create unique index items_name_key");
    expect(numbering).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(numbering);
    expect(items).toMatch(
      /create unique index items_name_key\s+on public\.items \(section_id, lower\(btrim\(name\)\)\)\s+where deleted_at is null;/,
    );
  });

  // delete_with_contents is made again with a sixth parameter in migration
  // eleven, so it carries one grant per signature; the others one.
  it.each([
    ["set_item_order", "uuid, uuid\\[\\]", 1],
    ["section_dish_counts", "uuid", 1],
    ["delete_with_contents", "\\s*text, uuid, uuid, integer, integer", 2],
    ["move_section", "uuid, uuid", 1],
  ])("opens %s to authenticated only", (name, parameters, signatures) => {
    const grants = [
      ...sql.matchAll(new RegExp(`grant [^;]*\\b${name}\\b[^;]*;`, "g")),
    ].map((match) => match[0]);
    expect(grants).toHaveLength(signatures);
    for (const grant of grants) expect(grant).toMatch(/to authenticated;$/);
    expect(items).toMatch(
      new RegExp(
        `revoke all on function public\\.${name}\\(${parameters}\\) from public, anon;`,
      ),
    );
  });

  it("orders dishes through one function that runs as the caller", () => {
    const body = bodyOf("set_item_order");
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/for update;/);
    expect(body).toMatch(/coalesce\(array_ndims\(p_ids\), 0\) <> 1/);
    expect(body).toMatch(/cardinality\(p_ids\) <> live/);
    expect(body).toMatch(/i\.deleted_at is null/);
    expect(body).toMatch(/i\.section_id = p_section/);
  });

  it("counts dishes through a function that only reads, as the caller", () => {
    const body = bodyOf("section_dish_counts");
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/language sql stable/);
    expect(body).not.toMatch(/\b(insert|update|delete)\b/);
    expect(body).toMatch(/i\.deleted_at is null/);
    expect(body).toMatch(/s\.deleted_at is null/);
    expect(body).toMatch(/m\.deleted_at is null/);
  });

  // D-119: the count sits inside the statement that marks the row, and the
  // row and everything under it are locked first.
  it("counts and marks in one statement, under locks, as the caller", () => {
    const body = bodyOf("delete_with_contents");
    expect(body).not.toMatch(/security definer/);
    const marks = [
      ...body.matchAll(
        /update public\.(menus|sections) \w\s+set deleted_at = now\(\)[\s\S]*?;/g,
      ),
    ];
    expect(marks.map((match) => match[1])).toEqual(["menus", "sections"]);
    const [menu, section] = marks.map((match) => match[0]);
    expect(menu).toMatch(/<= coalesce\(p_sections, 0\)/);
    expect(menu).toMatch(/<= coalesce\(p_dishes, 0\)/);
    expect(menu).toMatch(/m\.restaurant_id = p_parent/);
    expect(section).toMatch(/<= coalesce\(p_dishes, 0\)/);
    expect(section).toMatch(/s\.menu_id = p_parent/);
    for (const mark of [menu, section]) {
      expect(mark).toMatch(/deleted_at is null/);
      expect(body.indexOf("for update")).toBeLessThan(body.indexOf(mark ?? ""));
    }
    expect(body.match(/for update/g)).toHaveLength(5);
    expect(body).toMatch(/raise exception 'delete_grew'/);
    expect(body).toMatch(/raise exception 'delete_not_found'/);
  });

  // D-129: menu_id is not a column owners write, so the move runs as the
  // table owner and has to check the caller and the restaurant itself.
  it("moves a section as a definer that checks the caller and keeps the restaurant", () => {
    const body = bodyOf("move_section");
    expect(body).toMatch(/security definer set search_path = ''/);
    const membership = body.indexOf("not public.is_owner(home)");
    const firstLock = body.search(/for (key share|update)/);
    expect(membership).toBeGreaterThan(-1);
    expect(firstLock).toBeGreaterThan(membership);
    expect(body).toMatch(
      /where m\.id = p_menu\s+and m\.restaurant_id = home\s+and m\.deleted_at is null\s+for key share;/,
    );
    expect(body).toMatch(
      /where s\.id = p_section\s+and s\.restaurant_id = home\s+and s\.deleted_at is null\s+for update;/,
    );
    expect(body).toMatch(/exception when unique_violation then/);
    expect(body).toMatch(/set menu_id = p_menu, sort = place/);
    expect(body, "the move never writes the restaurant").not.toMatch(
      /\bset\b[^;]*restaurant_id/,
    );
  });

  it("still lets owners write neither link of a section as a column", () => {
    expect(items).not.toMatch(/grant [^;]*public\.sections\b/);
    expect(items).not.toMatch(/grant [^;]*public\.menus\b/);
  });
});

describe("the dish page's migration (D-85, D-129, D-139, task 3b)", () => {
  const file = "20261007000001_dish_page.sql";
  const dish = readFileSync(join(dir, file), "utf8");
  // Never written by an owner, on this page or before it: each joins the
  // list in the task that builds it.
  const neverWritten = [
    "id",
    "section_id",
    "restaurant_id",
    "allergens",
    "custom_allergens",
    "allergens_reviewed",
    "allergen_suggestions",
    "dietary_tags",
    "photo_url",
    "photo_alt",
    "available",
    "special_schedule",
    "import_confidence",
    "external_ids",
    "created_at",
    "updated_at",
  ];

  function columnsOf(table: string, privilege: string): string[] {
    const matches = [
      ...dish.matchAll(
        new RegExp(
          `grant ${privilege} \\(([^)]*)\\) on public\\.${table} to authenticated;`,
          "g",
        ),
      ),
    ];
    expect(matches, `no ${privilege} column list on ${table}`).toHaveLength(1);
    return (matches[0]?.[1] ?? "").split(",").map((column) => column.trim());
  }

  function bodyOf(name: string): string {
    const from = dish.indexOf(`create function public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return dish.slice(from, dish.indexOf("\n$$;", from));
  }

  it("adds the price choice as an enum with one price as the default", () => {
    expect(dish).toMatch(
      /create type public\.price_kind as enum \('one', 'sizes', 'market'\);/,
    );
    expect(dish).toMatch(
      /add column price_kind public\.price_kind not null default 'one';/,
    );
    expect(sql).not.toMatch(/price_max_cents/);
  });

  it("opens a dish's description, price choice, price, and note to owners, and nothing else new", () => {
    expect(dish).toMatch(/revoke update on public\.items from authenticated;/);
    expect(dish).not.toMatch(/grant insert [^;]*public\.items/);
    expect(columnsOf("items", "update")).toEqual([
      "name",
      "description",
      "price_kind",
      "price_cents",
      "note",
      "sort",
      "deleted_at",
    ]);
    for (const column of neverWritten) {
      expect(columnsOf("items", "update")).not.toContain(column);
    }
  });

  it("holds the text and price rules as table constraints, with existing rows brought inside first", () => {
    const fixDescription = dish.indexOf(
      "update public.items\n  set description =",
    );
    const fixNote = dish.indexOf("update public.items\n  set note =");
    const fixPrice = dish.indexOf(
      "update public.items set price_cents = 9999999 where price_cents > 9999999;",
    );
    const constraints = dish.indexOf("add constraint items_description_text");
    expect(fixDescription).toBeGreaterThan(-1);
    expect(fixNote).toBeGreaterThan(fixDescription);
    expect(fixPrice).toBeGreaterThan(fixNote);
    expect(constraints).toBeGreaterThan(fixPrice);
    expect(dish).toMatch(
      /items_description_text\s+check \(description ~ '\\S'\s+and translate\(description, chr\(10\), ' '\) !~ '\[\[:cntrl:\]\]'\s+and length\(description\) <= 500\)/,
    );
    expect(dish).toMatch(
      /items_note_text\s+check \(note ~ '\\S' and note !~ '\[\[:cntrl:\]\]' and length\(note\) <= 120\)/,
    );
    expect(dish).toMatch(
      /items_price_cents_range\s+check \(price_cents <= 9999999\)/,
    );
  });

  it("retires price_text after the view that names it, and makes the view again under its grant with nothing new", () => {
    const worded = dish.indexOf("set price_kind = 'market'");
    const dropView = dish.indexOf("drop view public.published_items;");
    const dropColumn = dish.indexOf(
      "alter table public.items drop column price_text;",
    );
    const view = dish.indexOf("create view public.published_items");
    const grant = dish.indexOf(
      "grant select on public.published_items to anon, authenticated;",
    );
    expect(worded).toBeGreaterThan(-1);
    expect(dropView).toBeGreaterThan(worded);
    expect(dropColumn).toBeGreaterThan(dropView);
    expect(view).toBeGreaterThan(dropColumn);
    expect(grant).toBeGreaterThan(view);
    const body = dish.slice(view, dish.indexOf(";", view));
    expect(body).toMatch(/with \(security_barrier = true\)/);
    expect(body).not.toMatch(/price_text|price_kind|deleted_at/);
    for (const column of privateColumns) {
      expect(body).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("keeps sizes in a table of their own, in D-131's shape, with no sort column", () => {
    expect(tables).toContain("item_sizes");
    expect(dish).toMatch(
      /item_id uuid not null references public\.items \(id\) on delete cascade/,
    );
    expect(dish).toMatch(
      /restaurant_id uuid not null references public\.restaurants \(id\) on delete cascade/,
    );
    expect(dish).toMatch(
      /item_sizes_name_text\s+check \(name ~ '\\S' and name !~ '\[\[:cntrl:\]\]' and length\(name\) <= 40\)/,
    );
    expect(dish).toMatch(
      /item_sizes_price_cents\s+check \(price_cents >= 0 and price_cents <= 9999999\)/,
    );
    expect(dish).toMatch(
      /create unique index item_sizes_name_key\s+on public\.item_sizes \(item_id, lower\(btrim\(name\)\)\)\s+where deleted_at is null and name is not null;/,
    );
    const table = dish.slice(
      dish.indexOf("create table public.item_sizes"),
      dish.indexOf(");", dish.indexOf("create table public.item_sizes")),
    );
    expect(table).not.toMatch(/\bsort\b/);
    expect(table).toMatch(/deleted_at timestamptz/);
    expect(dish).toMatch(
      /create trigger item_sizes_restaurant\s+before insert or update of item_id on public\.item_sizes/,
    );
    expect(dish).toMatch(
      /create trigger item_sizes_updated_at before update on public\.item_sizes/,
    );
  });

  it("gives owners column lists and no delete on sizes, and service_role every column", () => {
    expect(columnsOf("item_sizes", "insert")).toEqual([
      "item_id",
      "name",
      "price_cents",
    ]);
    expect(columnsOf("item_sizes", "update")).toEqual([
      "name",
      "price_cents",
      "deleted_at",
    ]);
    expect(dish).not.toMatch(
      /grant [^;]*\bdelete\b[^;]*public\.item_sizes to authenticated/,
    );
    expect(dish).toMatch(
      /grant select on public\.item_sizes to authenticated;/,
    );
    expect(dish).toMatch(
      /grant select, insert, update, delete on public\.item_sizes to service_role;/,
    );
    expect(dish).toMatch(
      /create policy "owners read sizes" on public\.item_sizes\s+for select to authenticated using \(public\.is_owner\(restaurant_id\)\);/,
    );
    expect(dish).toMatch(
      /create policy "owners add sizes" on public\.item_sizes/,
    );
    expect(dish).toMatch(
      /create policy "owners update sizes" on public\.item_sizes/,
    );
    expect(dish).not.toMatch(/for delete to authenticated/);
  });

  it("opens move_item to authenticated only", () => {
    const grants = [...sql.matchAll(/grant [^;]*\bmove_item\b[^;]*;/g)].map(
      (match) => match[0],
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/to authenticated;$/);
    expect(dish).toMatch(
      /revoke all on function public\.move_item\(uuid, uuid\) from public, anon;/,
    );
  });

  // D-129: section_id is not a column owners write, so the move runs as the
  // table owner and has to check the caller and the restaurant itself.
  it("moves a dish as a definer that checks the caller and keeps the restaurant", () => {
    const body = bodyOf("move_item");
    expect(body).toMatch(/security definer set search_path = ''/);
    const membership = body.indexOf("not public.is_owner(home)");
    const firstLock = body.search(/for (key share|update)/);
    expect(membership).toBeGreaterThan(-1);
    expect(firstLock).toBeGreaterThan(membership);
    expect(body).toMatch(
      /where s\.id = p_section\s+and s\.restaurant_id = home\s+and s\.deleted_at is null\s+and m\.deleted_at is null\s+for key share of s;/,
    );
    expect(body).toMatch(
      /where i\.id = p_item\s+and i\.restaurant_id = home\s+and i\.deleted_at is null\s+for update;/,
    );
    expect(body).toMatch(/exception when unique_violation then/);
    expect(body).toMatch(/set section_id = p_section, sort = place/);
    expect(body).toMatch(/raise exception 'move_section_gone'/);
    expect(body).toMatch(/raise exception 'move_same_section'/);
    expect(body).toMatch(/raise exception 'move_not_found'/);
    expect(body).toMatch(/raise exception 'move_name_taken'/);
    expect(body, "the move never writes the restaurant").not.toMatch(
      /\bset\b[^;]*restaurant_id/,
    );
  });

  it("still lets owners write no link of a dish, a section, or a menu as a column", () => {
    expect(dish).not.toMatch(/grant [^;]*public\.sections\b/);
    expect(dish).not.toMatch(/grant [^;]*public\.menus\b/);
    expect(columnsOf("items", "update")).not.toContain("section_id");
    expect(columnsOf("item_sizes", "update")).not.toContain("item_id");
  });
});

describe("the allergens migration (D-85, D-148, task 4)", () => {
  const file = "20261008000001_allergens.sql";
  const text = readFileSync(join(dir, file), "utf8");
  // Never written by an owner: the stamp the database writes, and what
  // later tasks build.
  const neverWritten = [
    "id",
    "section_id",
    "restaurant_id",
    "allergens_reviewed_by",
    "allergens_reviewed_at",
    "allergen_suggestions",
    "dietary_tags",
    "photo_url",
    "photo_alt",
    "available",
    "special_schedule",
    "import_confidence",
    "external_ids",
    "created_at",
    "updated_at",
  ];

  function columnsOf(privilege: string): string[] {
    const matches = [
      ...text.matchAll(
        new RegExp(
          `grant ${privilege} \\(([^)]*)\\) on public\\.items to authenticated;`,
          "g",
        ),
      ),
    ];
    expect(matches, `no ${privilege} column list on items`).toHaveLength(1);
    return (matches[0]?.[1] ?? "").split(",").map((column) => column.trim());
  }

  function bodyOf(name: string): string {
    const from = text.indexOf(`create function public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return text.slice(from, text.indexOf("\n$$;", from));
  }

  it("adds who and when, with no foreign key, and keeps the three in step on every row", () => {
    expect(text).toMatch(
      /update public\.items set allergens_reviewed = false where allergens_reviewed;/,
    );
    expect(text).toMatch(/add column allergens_reviewed_by uuid,/);
    expect(text).toMatch(/add column allergens_reviewed_at timestamptz,/);
    expect(text).not.toMatch(/allergens_reviewed_by uuid references/);
    expect(text).toMatch(
      /items_allergen_check_whole check \(\s+\(allergens_reviewed\s+and allergens_reviewed_by is not null\s+and allergens_reviewed_at is not null\)\s+or \(not allergens_reviewed\s+and allergens_reviewed_by is null\s+and allergens_reviewed_at is null\)\s+\)/,
    );
  });

  it("keeps the list to the nine the US offers, each once, and ten other allergens at most, and stops rather than rewrite an allergen", () => {
    const stop = text.indexOf("raise exception 'migration 7:");
    const offered = text.indexOf("add constraint items_allergens_offered");
    expect(stop).toBeGreaterThan(-1);
    expect(offered).toBeGreaterThan(stop);
    expect(text).toMatch(
      /items_allergens_offered check \(\s+allergens <@ '\{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame\}'::public\.allergen\[\]\s+\)/,
    );
    expect(text).toMatch(
      /items_other_allergens_count check \(\s+cardinality\(custom_allergens\) <= 10\s+\)/,
    );
    expect(text, "a migration never rewrites an allergen (D-7)").not.toMatch(
      /update public\.items\s+set (allergens|custom_allergens) =/,
    );
  });

  it("holds the lists' rules in a trigger that is revoked by name", () => {
    const body = bodyOf("check_item_allergen_lists");
    expect(body).toMatch(/returns trigger/);
    expect(body).toMatch(/set search_path = ''/);
    for (const name of [
      "allergens_repeated",
      "other_allergen_text",
      "other_allergen_major",
      "other_allergen_repeated",
    ]) {
      expect(body).toContain(
        `raise exception '${name}' using errcode = 'P0001'`,
      );
    }
    expect(text).toMatch(
      /revoke all on function public\.check_item_allergen_lists\(\)\s+from public, anon, authenticated;/,
    );
    expect(text).toMatch(
      /create trigger items_allergen_lists\s+before insert or update of allergens, custom_allergens on public\.items/,
    );
  });

  it("stamps and clears the check in a trigger that is revoked by name, needs a person, and refuses a dish born checked", () => {
    const body = bodyOf("set_item_allergen_check");
    expect(body).toMatch(/returns trigger/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/person uuid := auth\.uid\(\);/);
    expect(body).toContain(
      "raise exception 'allergen_check_on_insert' using errcode = 'P0001'",
    );
    expect(body).toContain(
      "raise exception 'allergen_check_needs_person' using errcode = 'P0001'",
    );
    // The stamp is always the trigger's: it starts from the old row's and
    // only the two branches below write it.
    expect(body).toMatch(
      /new\.allergens_reviewed_by := old\.allergens_reviewed_by;\s+new\.allergens_reviewed_at := old\.allergens_reviewed_at;/,
    );
    expect(body).toMatch(
      /if new\.allergens is distinct from old\.allergens\s+or new\.custom_allergens is distinct from old\.custom_allergens then\s+new\.allergens_reviewed := false;/,
    );
    expect(body).toMatch(
      /if new\.allergens_reviewed and not old\.allergens_reviewed then[\s\S]*?new\.allergens_reviewed_by := person;\s+new\.allergens_reviewed_at := now\(\);/,
    );
    expect(text).toMatch(
      /revoke all on function public\.set_item_allergen_check\(\)\s+from public, anon, authenticated;/,
    );
    expect(text).toMatch(
      /create trigger items_allergen_check\s+before insert or update on public\.items/,
    );
  });

  it("opens the two lists and the check to owners, and never who or when", () => {
    expect(text).toMatch(/revoke update on public\.items from authenticated;/);
    expect(text).not.toMatch(/grant insert [^;]*public\.items/);
    expect(columnsOf("update")).toEqual([
      "name",
      "description",
      "price_kind",
      "price_cents",
      "note",
      "allergens",
      "custom_allergens",
      "allergens_reviewed",
      "sort",
      "deleted_at",
    ]);
    for (const column of neverWritten) {
      expect(columnsOf("update")).not.toContain(column);
    }
  });

  it("touches no view, adds no callable function, and grants anon nothing", () => {
    expect(text).not.toMatch(/create (or replace )?view/);
    expect(text).not.toMatch(/drop view/);
    expect(text).not.toMatch(/to anon/);
    const callable = [
      ...text.matchAll(
        /create (?:or replace )?function public\.(\w+)\s*\([\s\S]*?\)\s*returns\s+(\S+)/gi,
      ),
    ].filter((match) => (match[2] ?? "").toLowerCase() !== "trigger");
    expect(callable).toEqual([]);
  });
});

describe("the line's allergens migration (D-85, D-151 to D-153, task 4b)", () => {
  const file = "20261008000002_line_allergens.sql";
  const text = readFileSync(join(dir, file), "utf8");
  // Never written by an owner: the links, the stamp the database writes,
  // and the timestamps.
  const neverWritten = [
    "id",
    "menu_id",
    "restaurant_id",
    "every_item_allergens_reviewed_by",
    "every_item_allergens_reviewed_at",
    "created_at",
    "updated_at",
  ];

  function columnsOf(privilege: string): string[] {
    const matches = [
      ...text.matchAll(
        new RegExp(
          `grant ${privilege} \\(([^)]*)\\) on public\\.sections to authenticated;`,
          "g",
        ),
      ),
    ];
    expect(matches, `no ${privilege} column list on sections`).toHaveLength(1);
    return (matches[0]?.[1] ?? "").split(",").map((column) => column.trim());
  }

  function bodyOf(name: string): string {
    const from = text.indexOf(`function public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return text.slice(from, text.indexOf("\n$$;", from));
  }

  it("stops rather than rewrite an allergen with a comma, before anything else", () => {
    const stop = text.indexOf("raise exception 'migration 8:");
    const rule = text.indexOf("create function public.allergen_lists_problem");
    expect(stop).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(stop);
    expect(text, "a migration never rewrites an allergen (D-7)").not.toMatch(
      /update public\.(items|sections)\s+set/,
    );
  });

  it("gives the line the five columns in a dish's shape with no foreign key, and holds the check whole, the nine, the count, and a blank line holding nothing", () => {
    expect(text).toMatch(
      /add column every_item_allergens public\.allergen\[\] not null default '\{\}',/,
    );
    expect(text).toMatch(
      /add column every_item_custom_allergens text\[\] not null default '\{\}',/,
    );
    expect(text).toMatch(
      /add column every_item_allergens_reviewed boolean not null default false,/,
    );
    expect(text).toMatch(/add column every_item_allergens_reviewed_by uuid,/);
    expect(text).toMatch(
      /add column every_item_allergens_reviewed_at timestamptz,/,
    );
    expect(text).not.toMatch(/reviewed_by uuid references/);
    expect(text).toMatch(
      /sections_line_check_whole check \(\s+\(every_item_allergens_reviewed\s+and every_item_allergens_reviewed_by is not null\s+and every_item_allergens_reviewed_at is not null\)\s+or \(not every_item_allergens_reviewed\s+and every_item_allergens_reviewed_by is null\s+and every_item_allergens_reviewed_at is null\)\s+\)/,
    );
    expect(text).toMatch(
      /sections_line_allergens_offered check \(\s+every_item_allergens <@ '\{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame\}'::public\.allergen\[\]\s+\)/,
    );
    expect(text).toMatch(
      /sections_line_other_allergens_count check \(\s+cardinality\(every_item_custom_allergens\) <= 10\s+\)/,
    );
    expect(text).toMatch(
      /sections_line_blank_holds_nothing check \(\s+every_item is not null\s+or \(every_item_allergens = '\{\}'\s+and every_item_custom_allergens = '\{\}'\s+and not every_item_allergens_reviewed\)\s+\)/,
    );
  });

  it("holds the lists' rule once, in a function that returns the refusal's name, reads no table, and is revoked by name with no grant", () => {
    const body = bodyOf("allergen_lists_problem");
    expect(body).toMatch(/returns text/);
    expect(body).toMatch(/immutable set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).not.toMatch(/\bfrom public\./);
    for (const name of [
      "allergens_repeated",
      "other_allergen_text",
      "other_allergen_comma",
      "other_allergen_major",
      "other_allergen_repeated",
    ]) {
      expect(body).toContain(`return '${name}'`);
    }
    expect(text).toMatch(
      /revoke all on function public\.allergen_lists_problem\(public\.allergen\[\], text\[\]\)\s+from public, anon, authenticated;/,
    );
    expect(text).not.toMatch(/grant [^;]*allergen_lists_problem/);
  });

  it("makes both lists triggers call it as their owner, revoked by name, on the right columns", () => {
    for (const [name, lists] of [
      ["check_item_allergen_lists", "new.allergens, new.custom_allergens"],
      [
        "check_section_line_allergen_lists",
        "new.every_item_allergens, new.every_item_custom_allergens",
      ],
    ] as const) {
      const body = bodyOf(name);
      expect(body).toMatch(/returns trigger/);
      expect(body).toMatch(/security definer set search_path = ''/);
      expect(body.replace(/\s+/g, " ").replace(/\( /g, "(")).toContain(
        `public.allergen_lists_problem(${lists})`,
      );
      expect(body).toContain(
        "raise exception '%', problem using errcode = 'P0001'",
      );
      expect(text).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\(\\)\\s+from public, anon, authenticated;`,
        ),
      );
    }
    expect(text).toMatch(
      /create or replace function public\.check_item_allergen_lists\(\)/,
    );
    expect(text, "the items trigger stays").not.toMatch(
      /create trigger items_allergen_lists/,
    );
    expect(text).toMatch(
      /create trigger sections_line_allergen_lists\s+before insert or update of every_item_allergens, every_item_custom_allergens\s+on public\.sections/,
    );
  });

  it("stamps and clears the line's check in a trigger that is revoked by name: a change to the words or a list clears it, a cleared line holds nothing, a blank line takes nothing, and a check needs a person", () => {
    const body = bodyOf("set_section_line_allergen_check");
    expect(body).toMatch(/returns trigger/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/person uuid := auth\.uid\(\);/);
    for (const name of [
      "allergen_check_on_insert",
      "line_blank_holds_nothing",
      "allergen_check_needs_person",
    ]) {
      expect(body).toContain(
        `raise exception '${name}' using errcode = 'P0001'`,
      );
    }
    expect(body).toMatch(
      /new\.every_item_allergens_reviewed_by := old\.every_item_allergens_reviewed_by;\s+new\.every_item_allergens_reviewed_at := old\.every_item_allergens_reviewed_at;/,
    );
    expect(body).toMatch(
      /if new\.every_item is null then\s+if old\.every_item is not null then\s+new\.every_item_allergens := '\{\}';\s+new\.every_item_custom_allergens := '\{\}';\s+new\.every_item_allergens_reviewed := false;/,
    );
    expect(body).toMatch(
      /if new\.every_item is distinct from old\.every_item\s+or new\.every_item_allergens is distinct from old\.every_item_allergens\s+or new\.every_item_custom_allergens\s+is distinct from old\.every_item_custom_allergens then\s+new\.every_item_allergens_reviewed := false;/,
    );
    expect(body).toMatch(
      /if new\.every_item_allergens_reviewed\s+and not old\.every_item_allergens_reviewed then[\s\S]*?new\.every_item_allergens_reviewed_by := person;\s+new\.every_item_allergens_reviewed_at := now\(\);/,
    );
    expect(text).toMatch(
      /revoke all on function public\.set_section_line_allergen_check\(\)\s+from public, anon, authenticated;/,
    );
    expect(text).toMatch(
      /create trigger sections_line_allergen_check\s+before insert or update on public\.sections/,
    );
  });

  it("opens the line's two lists and its check to owners, and never who or when", () => {
    expect(text).toMatch(
      /revoke update on public\.sections from authenticated;/,
    );
    expect(text).not.toMatch(/grant insert [^;]*public\.sections/);
    expect(columnsOf("update")).toEqual([
      "name",
      "note",
      "every_item",
      "sort",
      "deleted_at",
      "every_item_allergens",
      "every_item_custom_allergens",
      "every_item_allergens_reviewed",
    ]);
    for (const column of neverWritten) {
      expect(columnsOf("update")).not.toContain(column);
    }
  });

  it("touches no view, grants anon nothing, and adds one function that nobody can call", () => {
    expect(text).not.toMatch(/create (or replace )?view/);
    expect(text).not.toMatch(/drop view/);
    expect(text).not.toMatch(/to anon/);
    expect(text).not.toMatch(/grant execute/);
    const callable = [
      ...text.matchAll(
        /create (?:or replace )?function public\.(\w+)\s*\([\s\S]*?\)\s*returns\s+(\S+)/gi,
      ),
    ]
      .filter((match) => (match[2] ?? "").toLowerCase() !== "trigger")
      .map((match) => match[1]);
    expect(callable).toEqual(["allergen_lists_problem"]);
  });
});

describe("the schedule and availability migration (D-85, D-159, D-160, task 5)", () => {
  const file = "20261009000001_schedule_availability.sql";
  const text = readFileSync(join(dir, file), "utf8");
  // Never written by an owner: the links, the stamp the database writes,
  // what later tasks build, and the timestamps.
  const neverWritten = [
    "id",
    "section_id",
    "restaurant_id",
    "allergens_reviewed_by",
    "allergens_reviewed_at",
    "allergen_suggestions",
    "photo_url",
    "photo_alt",
    "import_confidence",
    "external_ids",
    "created_at",
    "updated_at",
  ];

  function columnsOf(privilege: string): string[] {
    const matches = [
      ...text.matchAll(
        new RegExp(
          `grant ${privilege} \\(([^)]*)\\) on public\\.items to authenticated;`,
          "g",
        ),
      ),
    ];
    expect(matches, `no ${privilege} column list on items`).toHaveLength(1);
    return (matches[0]?.[1] ?? "").split(",").map((column) => column.trim());
  }

  function checkBody(name: string): string {
    const from = text.indexOf(`add constraint ${name} check (`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    const next = text.indexOf("add constraint", from + 1);
    return text.slice(from, next === -1 ? undefined : next);
  }

  it("stops rather than touch a row that already holds a schedule or a tag, and moves no data", () => {
    const stop = text.indexOf("raise exception 'migration 9:");
    const shape = text.indexOf("add constraint items_special_schedule_shape");
    expect(stop).toBeGreaterThan(-1);
    expect(shape).toBeGreaterThan(stop);
    expect(text).not.toMatch(/update public\.\w+\s+set/);
  });

  it("holds the schedule's shape in one check on the column migration one made, every branch under a case, and no cast", () => {
    const body = checkBody("items_special_schedule_shape");
    expect(text).not.toMatch(/add column special_schedule/);
    expect(text).not.toMatch(/alter column special_schedule/);
    expect(body).not.toMatch(/::date/);
    expect(body).toMatch(
      /special_schedule is null\s+or case when jsonb_typeof\(special_schedule\) = 'object' then/,
    );
    expect(body).toMatch(
      /special_schedule\s+- array\['days', 'weeks', 'months', 'hours', 'from', 'until'\]\s+= '\{\}'::jsonb/,
    );
    for (const [part, keys] of [
      ["days", DAY_KEYS],
      ["weeks", WEEK_KEYS],
      ["months", MONTH_KEYS],
    ] as const) {
      expect(body).toContain(
        `<@ '[${keys.map((key) => `"${key}"`).join(", ")}]'`,
      );
      expect(body).toMatch(
        new RegExp(
          `when special_schedule -> '${part}' is null then true[\\s\\S]*?when jsonb_typeof\\(special_schedule -> '${part}'\\) = 'array' then`,
        ),
      );
      expect(body).toContain(
        `jsonb_array_length(special_schedule -> '${part}') >= 1`,
      );
      for (const key of keys) {
        expect(body).toContain(
          `(special_schedule -> '${part}' @> '["${key}"]')::int`,
        );
      }
    }
    expect(body).toMatch(
      /when special_schedule -> 'weeks' is null then true\s+when special_schedule -> 'days' is null then false/,
    );
    // Binary minus binds tighter than the arrow, so the hours object is
    // taken in parentheses before its keys are removed (Michael, at the
    // plan's approval).
    expect(body).toContain(
      "(special_schedule -> 'hours') - array['open', 'close'] = '{}'::jsonb",
    );
    expect(body.split(`~ '${TIME_PATTERN.source}'`)).toHaveLength(3);
    expect(body).toMatch(
      /->> 'open'\s+<> special_schedule -> 'hours' ->> 'close'/,
    );
    for (const side of ["from", "until"]) {
      expect(body).toContain(
        `when jsonb_typeof(special_schedule -> '${side}') = 'string' then\n          special_schedule ->> '${side}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'\n          and pg_input_is_valid(special_schedule ->> '${side}', 'date')`,
      );
    }
    expect(body).toMatch(
      /special_schedule ->> 'from' <= special_schedule ->> 'until'/,
    );
    // Every list and every case closes on false, never on nothing.
    expect(body.match(/else false end/g)).toHaveLength(7);
  });

  it("keeps each dietary tag to once, with the enum named inline and its type unchanged", () => {
    expect(text).not.toMatch(/alter column dietary_tags/);
    expect(text).toMatch(
      /items_dietary_tags_once check \(\s+cardinality\(dietary_tags\) =\s+\(dietary_tags @> '\{vegan\}'::public\.dietary_tag\[\]\)::int\s+\+ \(dietary_tags @> '\{vegetarian\}'::public\.dietary_tag\[\]\)::int\s+\+ \(dietary_tags @> '\{made-without-gluten\}'::public\.dietary_tag\[\]\)::int\s+\)/,
    );
  });

  it("adds the sold-out mark with no default and ties it to available", () => {
    expect(text).toMatch(/add column sold_out_at timestamptz,/);
    expect(text).not.toMatch(/sold_out_at timestamptz (not null|default)/);
    expect(text).toMatch(
      /items_sold_out_needs_available check \(\s+sold_out_at is null or available\s+\)/,
    );
  });

  it("opens tags, availability with its mark, and the schedule to owners, and nothing else new", () => {
    expect(text).toMatch(/revoke update on public\.items from authenticated;/);
    expect(text).not.toMatch(/grant insert [^;]*public\.items/);
    expect(columnsOf("update")).toEqual([
      "name",
      "description",
      "price_kind",
      "price_cents",
      "note",
      "allergens",
      "custom_allergens",
      "allergens_reviewed",
      "dietary_tags",
      "available",
      "sold_out_at",
      "special_schedule",
      "sort",
      "deleted_at",
    ]);
    for (const column of neverWritten) {
      expect(columnsOf("update")).not.toContain(column);
    }
  });

  it("touches no view, adds no function, trigger, or policy, and grants anon nothing", () => {
    expect(text).not.toMatch(/create (or replace )?view/);
    expect(text).not.toMatch(/drop view/);
    expect(text).not.toMatch(/create (or replace )?function/);
    expect(text).not.toMatch(/create trigger/);
    expect(text).not.toMatch(/create policy/);
    expect(text).not.toMatch(/to anon/);
    expect(text).not.toMatch(/grant execute/);
  });
});

describe("the Storage writes migration (D-85, D-165, the small task after task 5)", () => {
  const file = "20261010000001_close_storage_writes.sql";
  const text = readFileSync(join(dir, file), "utf8");
  // What the file does once its comment lines are gone.
  const statements = text
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("--"));

  it("drops migration one's policy on storage.objects by name, with a plain drop, and nothing else", () => {
    expect(statements).toEqual([
      'drop policy "owners manage their restaurant files" on storage.objects;',
    ]);
  });

  it("creates that policy once and drops it once across the migrations, so none is left on storage.objects", () => {
    const created = [
      ...sql.matchAll(/create policy "([^"]+)" on storage\.objects/g),
    ].map((match) => match[1]);
    const dropped = [
      ...sql.matchAll(/drop policy "([^"]+)" on storage\.objects/g),
    ].map((match) => match[1]);
    expect(created).toEqual(["owners manage their restaurant files"]);
    expect(dropped).toEqual(created);
  });

  it("keeps the buckets and owns_object()", () => {
    expect(sql).toMatch(/insert into storage\.buckets/);
    expect(sql).not.toMatch(/delete from storage\.buckets/);
    expect(sql).not.toMatch(/drop function public\.owns_object/);
  });
});

describe("the choices migration (D-85, D-166, D-167, task 7)", () => {
  const file = "20261011000001_choices.sql";
  const text = readFileSync(join(dir, file), "utf8");
  // Never written by an owner on either new table: the links, the stamp
  // the database writes, and the timestamps.
  const neverWritten = [
    "id",
    "restaurant_id",
    "item_id",
    "section_id",
    "choice_list_id",
    "allergens_reviewed_by",
    "allergens_reviewed_at",
    "created_at",
    "updated_at",
  ];
  const caloriesShape =
    /check \(\s+\(calories_low is null and calories_high is null\)\s+or \(calories_low is not null\s+and calories_low between 0 and 99999\s+and \(calories_high is null\s+or calories_high between calories_low and 99999\)\)\s+\)/;

  function columnsOf(table: string, privilege: string): string[] {
    const matches = [
      ...text.matchAll(
        new RegExp(
          `grant ${privilege} \\(([^)]*)\\) on public\\.${table} to authenticated;`,
          "g",
        ),
      ),
    ];
    expect(matches, `no ${privilege} column list on ${table}`).toHaveLength(1);
    return (matches[0]?.[1] ?? "").split(",").map((column) => column.trim());
  }

  function bodyOf(name: string): string {
    const from = text.indexOf(`create function public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return text.slice(from, text.indexOf("\n$$;", from));
  }

  function tableOf(name: string): string {
    const from = text.indexOf(`create table public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return text.slice(from, text.indexOf("\n);", from));
  }

  it("stops while any section holds a line, deleted or not, before anything else, and moves no data", () => {
    const stop = text.indexOf("raise exception 'migration 11:");
    const firstDrop = text.indexOf("drop trigger");
    expect(stop).toBeGreaterThan(-1);
    expect(firstDrop).toBeGreaterThan(stop);
    expect(text).toMatch(
      /where s\.every_item is not null\s+or s\.every_item_allergens <> '\{\}'\s+or s\.every_item_custom_allergens <> '\{\}'\s+or s\.every_item_allergens_reviewed;/,
    );
    expect(text).not.toMatch(/update public\.\w+\s+set/);
    expect(text).not.toMatch(/deleted_at is null/.source + "[^;]*every_item");
  });

  it("drops the line's two triggers, then their functions, then the five constraints and six columns by name, with plain drops", () => {
    const order = [
      "drop trigger sections_line_allergen_check on public.sections;",
      "drop trigger sections_line_allergen_lists on public.sections;",
      "drop function public.set_section_line_allergen_check();",
      "drop function public.check_section_line_allergen_lists();",
      "drop constraint sections_line_blank_holds_nothing,",
      "drop constraint sections_line_other_allergens_count,",
      "drop constraint sections_line_allergens_offered,",
      "drop constraint sections_line_check_whole,",
      "drop constraint sections_every_item_text,",
      "drop column every_item_allergens_reviewed_at,",
      "drop column every_item_allergens_reviewed_by,",
      "drop column every_item_allergens_reviewed,",
      "drop column every_item_custom_allergens,",
      "drop column every_item_allergens,",
      "drop column every_item;",
    ];
    let last = -1;
    for (const statement of order) {
      const at = text.indexOf(statement);
      expect(at, statement).toBeGreaterThan(last);
      last = at;
    }
    expect(text, "plain drops").not.toMatch(/drop [^;]*\bcascade\b/);
    expect(text).not.toMatch(/if exists/);
    expect(text, "the one lists rule stays (D-155)").not.toMatch(
      /drop function public\.allergen_lists_problem/,
    );
    const dropped = [
      ...text.matchAll(
        /drop (trigger|function|constraint|column|view|policy)/g,
      ),
    ];
    expect(dropped).toHaveLength(16);
    expect(text).toMatch(
      /drop function public\.delete_with_contents\(text, uuid, uuid, integer, integer\);/,
    );
  });

  it("restates the sections grant without the line, and keeps the insert list", () => {
    expect(text).toMatch(
      /revoke update on public\.sections from authenticated;/,
    );
    expect(text).not.toMatch(/grant insert [^;]*public\.sections/);
    expect(columnsOf("sections", "update")).toEqual([
      "name",
      "note",
      "sort",
      "deleted_at",
    ]);
  });

  it("adds calories on dishes, sizes, and options with one shape that names the low number's presence, and the mark with no null", () => {
    expect(text).toMatch(
      /add column calories_low integer,\s+add column calories_high integer,\s+add column cooked_to_order boolean not null default false,/,
    );
    expect(text).toMatch(/add constraint items_calories_shape /);
    expect(text).toMatch(/add constraint item_sizes_calories_shape /);
    expect(tableOf("choice_options")).toMatch(
      /constraint choice_options_calories_shape /,
    );
    expect(text.match(caloriesShape)).not.toBeNull();
    expect(text.match(new RegExp(caloriesShape.source, "g"))).toHaveLength(3);
    expect(text).toMatch(
      /grant update \([^)]*\bcalories_low, calories_high, cooked_to_order\b[^)]*\) on public\.items to authenticated;/,
    );
  });

  it("keeps the two tables in D-144's shape: one home exactly, the lead and name rules, leads and names that differ among live rows, the restaurant copied from the home, and timestamps", () => {
    expect(tables).toContain("choice_lists");
    expect(tables).toContain("choice_options");
    const lists = tableOf("choice_lists");
    expect(lists).toMatch(
      /restaurant_id uuid not null references public\.restaurants \(id\) on delete cascade/,
    );
    expect(lists).toMatch(
      /item_id uuid references public\.items \(id\) on delete cascade/,
    );
    expect(lists).toMatch(
      /section_id uuid references public\.sections \(id\) on delete cascade/,
    );
    expect(lists).toMatch(/lead text not null/);
    expect(lists).toMatch(
      /choice_lists_one_home\s+check \(num_nonnulls\(item_id, section_id\) = 1\)/,
    );
    expect(lists).toMatch(
      /choice_lists_lead_text\s+check \(lead ~ '\\S' and lead !~ '\[\[:cntrl:\]\]' and length\(lead\) <= 120\)/,
    );
    expect(lists).toMatch(/sort integer not null default 0/);
    expect(lists).toMatch(/deleted_at timestamptz/);
    expect(text).toMatch(
      /create unique index choice_lists_lead_key\s+on public\.choice_lists \(coalesce\(item_id, section_id\), lower\(btrim\(lead\)\)\)\s+where deleted_at is null;/,
    );
    const options = tableOf("choice_options");
    expect(options).toMatch(
      /choice_list_id uuid not null references public\.choice_lists \(id\) on delete cascade/,
    );
    expect(options).toMatch(/name text not null/);
    expect(options).toMatch(
      /choice_options_name_text\s+check \(name ~ '\\S' and name !~ '\[\[:cntrl:\]\]' and length\(name\) <= 60\)/,
    );
    expect(options).toMatch(
      /choice_options_added_price_cents\s+check \(added_price_cents >= 0 and added_price_cents <= 9999999\)/,
    );
    expect(options).toMatch(
      /choice_options_allergens_offered check \(\s+allergens <@ '\{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame\}'::public\.allergen\[\]\s+\)/,
    );
    expect(options).toMatch(
      /choice_options_other_allergens_count check \(\s+cardinality\(custom_allergens\) <= 10\s+\)/,
    );
    expect(options).toMatch(
      /choice_options_allergen_check_whole check \(\s+\(allergens_reviewed\s+and allergens_reviewed_by is not null\s+and allergens_reviewed_at is not null\)\s+or \(not allergens_reviewed\s+and allergens_reviewed_by is null\s+and allergens_reviewed_at is null\)\s+\)/,
    );
    expect(options).not.toMatch(/reviewed_by uuid references/);
    expect(text).toMatch(
      /create unique index choice_options_name_key\s+on public\.choice_options \(choice_list_id, lower\(btrim\(name\)\)\)\s+where deleted_at is null;/,
    );
    for (const table of ["choice_lists", "choice_options"]) {
      expect(text).toMatch(
        new RegExp(
          `create trigger ${table}_updated_at before update on public\\.${table}\\s+for each row execute function public\\.set_updated_at\\(\\);`,
        ),
      );
    }
    expect(text).toMatch(
      /create trigger choice_lists_restaurant\s+before insert or update of item_id, section_id on public\.choice_lists/,
    );
    expect(text).toMatch(
      /create trigger choice_options_restaurant\s+before insert or update of choice_list_id on public\.choice_options/,
    );
    for (const name of [
      "set_choice_list_restaurant",
      "set_choice_option_restaurant",
    ]) {
      const body = bodyOf(name);
      expect(body).toMatch(/returns trigger/);
      expect(body).toMatch(/set search_path = ''/);
      expect(body).not.toMatch(/security definer/);
      expect(text).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\(\\)\\s+from public, anon, authenticated;`,
        ),
      );
    }
    expect(bodyOf("set_choice_list_restaurant")).toContain(
      "raise exception 'A choice list needs an existing dish or section.'",
    );
    expect(bodyOf("set_choice_option_restaurant")).toContain(
      "raise exception 'An option needs an existing choice list.'",
    );
  });

  it("gives owners column lists and no delete on both tables, and service_role every column", () => {
    expect(columnsOf("choice_lists", "insert")).toEqual([
      "item_id",
      "section_id",
      "lead",
      "sort",
    ]);
    expect(columnsOf("choice_lists", "update")).toEqual([
      "lead",
      "sort",
      "deleted_at",
    ]);
    expect(columnsOf("choice_options", "insert")).toEqual([
      "choice_list_id",
      "name",
      "sort",
    ]);
    expect(columnsOf("choice_options", "update")).toEqual([
      "name",
      "added_price_cents",
      "calories_low",
      "calories_high",
      "allergens",
      "custom_allergens",
      "allergens_reviewed",
      "sort",
      "deleted_at",
    ]);
    for (const table of ["choice_lists", "choice_options"]) {
      for (const column of neverWritten) {
        expect(columnsOf(table, "update")).not.toContain(column);
      }
      expect(columnsOf(table, "insert")).not.toContain("restaurant_id");
      expect(text).not.toMatch(
        new RegExp(
          `grant [^;]*\\bdelete\\b[^;]*public\\.${table} to authenticated`,
        ),
      );
      expect(text).toMatch(
        new RegExp(`grant select on public\\.${table} to authenticated;`),
      );
      expect(text).toMatch(
        new RegExp(
          `grant select, insert, update, delete on public\\.${table} to service_role;`,
        ),
      );
      expect(text).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security;`),
      );
    }
    expect(text).toMatch(
      /create policy "owners read choice lists" on public\.choice_lists\s+for select to authenticated using \(public\.is_owner\(restaurant_id\)\);/,
    );
    expect(text).toMatch(
      /create policy "owners add choice lists" on public\.choice_lists/,
    );
    expect(text).toMatch(
      /create policy "owners update choice lists" on public\.choice_lists/,
    );
    expect(text).toMatch(
      /create policy "owners read options" on public\.choice_options\s+for select to authenticated using \(public\.is_owner\(restaurant_id\)\);/,
    );
    expect(text).toMatch(
      /create policy "owners add options" on public\.choice_options/,
    );
    expect(text).toMatch(
      /create policy "owners update options" on public\.choice_options/,
    );
    expect(text).not.toMatch(/for delete to authenticated/);
  });

  it("grows the sizes grant by calories and keeps the insert list", () => {
    expect(text).toMatch(
      /revoke update on public\.item_sizes from authenticated;/,
    );
    expect(text).not.toMatch(/grant insert [^;]*public\.item_sizes/);
    expect(columnsOf("item_sizes", "update")).toEqual([
      "name",
      "price_cents",
      "calories_low",
      "calories_high",
      "deleted_at",
    ]);
  });

  it("opens calories and the mark on dishes to owners, and nothing else new", () => {
    expect(text).toMatch(/revoke update on public\.items from authenticated;/);
    expect(text).not.toMatch(/grant insert [^;]*public\.items/);
    expect(columnsOf("items", "update")).toEqual([
      "name",
      "description",
      "price_kind",
      "price_cents",
      "calories_low",
      "calories_high",
      "cooked_to_order",
      "note",
      "allergens",
      "custom_allergens",
      "allergens_reviewed",
      "dietary_tags",
      "available",
      "sold_out_at",
      "special_schedule",
      "sort",
      "deleted_at",
    ]);
  });

  it("makes the option's lists trigger call the one rule as its owner, revoked by name, on the two list columns", () => {
    const body = bodyOf("check_choice_option_allergen_lists");
    expect(body).toMatch(/returns trigger/);
    expect(body).toMatch(/security definer set search_path = ''/);
    expect(body.replace(/\s+/g, " ").replace(/\( /g, "(")).toContain(
      "public.allergen_lists_problem(new.allergens, new.custom_allergens)",
    );
    expect(body).toContain(
      "raise exception '%', problem using errcode = 'P0001'",
    );
    expect(text).toMatch(
      /revoke all on function public\.check_choice_option_allergen_lists\(\)\s+from public, anon, authenticated;/,
    );
    expect(text).toMatch(
      /create trigger choice_options_allergen_lists\s+before insert or update of allergens, custom_allergens on public\.choice_options/,
    );
    expect(text, "the migration repeats no word list").not.toMatch(
      /other_allergen_major/,
    );
  });

  it("stamps and clears the option's check in a trigger that is revoked by name: a change to the name or a list clears it, a check needs a person, and an option is never born checked", () => {
    const body = bodyOf("set_choice_option_allergen_check");
    expect(body).toMatch(/returns trigger/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/person uuid := auth\.uid\(\);/);
    for (const name of [
      "allergen_check_on_insert",
      "allergen_check_needs_person",
    ]) {
      expect(body).toContain(
        `raise exception '${name}' using errcode = 'P0001'`,
      );
    }
    expect(body).toMatch(
      /new\.allergens_reviewed_by := old\.allergens_reviewed_by;\s+new\.allergens_reviewed_at := old\.allergens_reviewed_at;/,
    );
    // D-152's reason, Michael at the plan's tabs: the name is all that
    // names the food, so a rename clears the check as the line's words did.
    expect(body).toMatch(
      /if new\.name is distinct from old\.name\s+or new\.allergens is distinct from old\.allergens\s+or new\.custom_allergens is distinct from old\.custom_allergens then\s+new\.allergens_reviewed := false;/,
    );
    expect(body).toMatch(
      /if new\.allergens_reviewed and not old\.allergens_reviewed then[\s\S]*?new\.allergens_reviewed_by := person;\s+new\.allergens_reviewed_at := now\(\);/,
    );
    expect(text).toMatch(
      /revoke all on function public\.set_choice_option_allergen_check\(\)\s+from public, anon, authenticated;/,
    );
    expect(text).toMatch(
      /create trigger choice_options_allergen_check\s+before insert or update on public\.choice_options/,
    );
  });

  it("orders lists and options through two functions in set_item_order's shape, each open to authenticated only", () => {
    for (const [name, table, column, alias] of [
      [
        "set_choice_list_order",
        "choice_lists",
        "coalesce\\(l\\.item_id, l\\.section_id\\) = p_home",
        "l",
      ],
      [
        "set_choice_option_order",
        "choice_options",
        "o\\.choice_list_id = p_list",
        "o",
      ],
    ] as const) {
      const grants = [
        ...sql.matchAll(new RegExp(`grant [^;]*\\b${name}\\b[^;]*;`, "g")),
      ].map((match) => match[0]);
      expect(grants).toHaveLength(1);
      expect(grants[0]).toMatch(/to authenticated;$/);
      expect(text).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\(uuid, uuid\\[\\]\\) from public, anon;`,
        ),
      );
      const body = bodyOf(name);
      expect(body).not.toMatch(/security definer/);
      expect(body).toMatch(
        new RegExp(
          `from public\\.${table} ${alias}\\s+where ${column}\\s+order by ${alias}\\.id\\s+for update;`,
        ),
      );
      expect(body).toMatch(/coalesce\(array_ndims\(p_ids\), 0\) <> 1/);
      expect(body).toMatch(/cardinality\(p_ids\) <> live/);
      expect(body).toMatch(/matched <> live/);
      expect(body).toMatch(
        /raise exception 'order_mismatch' using errcode = 'P0001'/,
      );
      expect(body).toMatch(new RegExp(`${alias}\\.deleted_at is null`));
      expect(body).toMatch(/is distinct from \w+\.ord;/);
    }
  });

  it("makes delete_with_contents again with a list branch and an options count, as the caller, under locks, with the old branches kept", () => {
    const body = bodyOf("delete_with_contents");
    expect(body).toMatch(
      /p_kind text,\s+p_parent uuid,\s+p_id uuid,\s+p_sections integer,\s+p_dishes integer,\s+p_options integer\s+\) returns void/,
    );
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/if p_kind = 'menu' then/);
    expect(body).toMatch(/elsif p_kind = 'section' then/);
    expect(body).toMatch(/elsif p_kind = 'list' then/);
    expect(body.match(/for update/g)).toHaveLength(7);
    expect(body).toMatch(
      /where l\.id = p_id and coalesce\(l\.item_id, l\.section_id\) = p_parent\s+for update;/,
    );
    expect(body).toMatch(
      /\(\s+select count\(\*\) from public\.choice_options o\s+where o\.choice_list_id = l\.id and o\.deleted_at is null\s+\) <= coalesce\(p_options, 0\);/,
    );
    for (const name of [
      "delete_grew",
      "delete_not_found",
      "delete_unknown_kind",
    ]) {
      expect(body).toContain(
        `raise exception '${name}' using errcode = 'P0001'`,
      );
    }
    expect(text).toMatch(
      /revoke all on function public\.delete_with_contents\(\s+text, uuid, uuid, integer, integer, integer\) from public, anon;/,
    );
    expect(text).toMatch(
      /grant execute on function public\.delete_with_contents\(\s+text, uuid, uuid, integer, integer, integer\) to authenticated;/,
    );
    const grants = [
      ...sql.matchAll(/grant [^;]*\bdelete_with_contents\b[^;]*;/g),
    ].map((match) => match[0]);
    expect(grants, "one grant per signature, the old and the new").toHaveLength(
      2,
    );
  });

  it("touches no view, grants anon nothing, and adds three callable functions", () => {
    expect(text).not.toMatch(/create (or replace )?view/);
    expect(text).not.toMatch(/drop view/);
    expect(text).not.toMatch(/to anon/);
    const callable = [
      ...text.matchAll(
        /create (?:or replace )?function public\.(\w+)\s*\([\s\S]*?\)\s*returns\s+(\S+)/gi,
      ),
    ]
      .filter((match) => (match[2] ?? "").toLowerCase() !== "trigger")
      .map((match) => match[1]);
    expect(callable).toEqual([
      "set_choice_list_order",
      "set_choice_option_order",
      "delete_with_contents",
    ]);
    for (const view of views) {
      expect(viewBody(view)).not.toMatch(
        /\b(calories_low|calories_high|cooked_to_order|choice_lists|choice_options)\b/,
      );
    }
  });
});

describe("the Publish migration (D-82, D-85, the Publish task)", () => {
  const file = "20261012000001_publish.sql";
  const publish = readFileSync(join(dir, file), "utf8");
  const before = files
    .slice(0, files.indexOf(file))
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");

  function bodyOf(name: string): string {
    const from = publish.indexOf(`create function public.${name}`);
    expect(from, `${name} is not in ${file}`).toBeGreaterThan(-1);
    return publish.slice(from, publish.indexOf("\n$$;", from));
  }

  it("is the twelfth migration, after choices", () => {
    expect(files.indexOf(file)).toBe(11);
    expect(files[10]).toBe("20261011000001_choices.sql");
  });

  it("adds the snapshot, drops the hold on publishing, and keeps the three publish columns whole, with any stray time cleared first", () => {
    const column = publish.indexOf(
      "alter table public.menus add column published_snapshot jsonb;",
    );
    const drop = publish.indexOf(
      "alter table public.menus drop constraint menus_not_published_yet;",
    );
    const clear = publish.indexOf(
      "update public.menus set published_at = null\n  where not published and published_at is not null;",
    );
    const whole = publish.indexOf(
      "add constraint menus_published_whole check (\n  (published and published_at is not null and published_snapshot is not null)\n  or (not published and published_at is null and published_snapshot is null)\n);",
    );
    expect(column).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(column);
    expect(clear).toBeGreaterThan(drop);
    expect(whole).toBeGreaterThan(clear);
  });

  it("drops migration one's trigger that stamped published_at, with its function", () => {
    expect(publish).toMatch(
      /drop trigger menus_published_at on public\.menus;/,
    );
    expect(publish).toMatch(/drop function public\.set_menu_published_at\(\);/);
    expect(before).toMatch(/create trigger menus_published_at/);
  });

  it("grants owners nothing new on menus: published, published_at, and the snapshot stay the functions' alone", () => {
    expect(publish).not.toMatch(/grant [^;]*on public\.menus\b/);
    expect(publish).not.toMatch(/create policy/);
    expect(publish).not.toMatch(/create trigger/);
  });

  it("retires the views that read drafts first, then the columns they kept alive, then remakes the two that stay", () => {
    const dropItems = publish.indexOf("drop view public.published_items;");
    const dropSections = publish.indexOf(
      "drop view public.published_sections;",
    );
    const dropMenus = publish.indexOf("drop view public.published_menus;");
    const dropRestaurants = publish.indexOf(
      "drop view public.published_restaurants;",
    );
    const photos = publish.indexOf(
      "alter table public.items drop constraint items_photo_requires_alt;",
    );
    const slug = publish.indexOf(
      "drop trigger restaurants_keep_slug on public.restaurants;\ndrop function public.keep_slug();\nalter table public.restaurants drop column slug;",
    );
    const restaurants = publish.indexOf(
      "create view public.published_restaurants",
    );
    const menus = publish.indexOf("create view public.published_menus");
    const states = publish.indexOf("create view public.published_item_states");
    expect(dropItems).toBeGreaterThan(-1);
    expect(dropSections).toBeGreaterThan(dropItems);
    expect(dropMenus).toBeGreaterThan(dropSections);
    expect(dropRestaurants).toBeGreaterThan(dropMenus);
    expect(photos).toBeGreaterThan(dropRestaurants);
    expect(slug).toBeGreaterThan(photos);
    expect(restaurants).toBeGreaterThan(slug);
    expect(menus).toBeGreaterThan(restaurants);
    expect(states).toBeGreaterThan(menus);
    expect(publish).not.toMatch(/create view public\.published_sections/);
    expect(publish).not.toMatch(/create view public\.published_items\b/);
  });

  it("keeps the three views behind a security barrier, under one grant to anon and authenticated, and nothing else to anon", () => {
    for (const view of liveViews) {
      expect(viewBody(view)).toMatch(/with \(security_barrier = true\)/);
      expect(viewBody(view)).not.toMatch(/security_invoker/);
    }
    expect(publish).toMatch(
      /grant select on public\.published_restaurants, public\.published_menus,\s*public\.published_item_states to anon, authenticated;/,
    );
    const toAnon = [...publish.matchAll(/grant [^;]*to anon[^;]*;/g)];
    expect(toAnon).toHaveLength(1);
  });

  it("shows the restaurant by code with no slug, and the menu by code with its snapshot and no draft name, both for menus that are not deleted", () => {
    const restaurants = viewBody("published_restaurants");
    expect(restaurants).toMatch(/\br\.code\b/);
    expect(restaurants).not.toMatch(/\bslug\b/);
    expect(restaurants).toMatch(/m\.published and m\.deleted_at is null/);
    expect(restaurants).toMatch(/r\.status in \('trial', 'active'\)/);
    const menus = viewBody("published_menus");
    expect(menus).toMatch(
      /select m\.id, m\.restaurant_id, r\.code, m\.sort, m\.published_at,\s*m\.published_snapshot/,
    );
    expect(menus).not.toMatch(/m\.name/);
    expect(menus).toMatch(/m\.published and m\.deleted_at is null/);
    expect(menus).toMatch(/r\.status in \('trial', 'active'\)/);
  });

  it("keys a dish's state by the ids inside each published snapshot, with no deleted_at filter, and carries only the state", () => {
    const states = viewBody("published_item_states");
    expect(states).toMatch(
      /select i\.id, pm\.id as menu_id, i\.available, i\.sold_out_at, i\.special_schedule/,
    );
    expect(states).toMatch(/from public\.published_menus pm/);
    expect(states).toMatch(
      /jsonb_path_query\(pm\.published_snapshot,\s*'\$\.sections\[\*\]\.items\[\*\]\.id'\)/,
    );
    expect(states).toMatch(
      /join public\.items i on i\.id = \(d\.id #>> '\{\}'\)::uuid/,
    );
    expect(states).not.toMatch(/deleted_at/);
    expect(states).not.toMatch(
      /\b(name|description|price_cents|allergens|custom_allergens|note|cooked_to_order|dietary_tags)\b/,
    );
  });

  it("builds the snapshot as the caller, with every array ordered, deleted rows and empty lists out, lists only when checked, and never a private column", () => {
    const body = bodyOf("menu_snapshot");
    expect(body).toMatch(/language sql stable set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/'v', 1,/);
    expect(body).toMatch(/order by o\.sort, o\.created_at, o\.id/);
    expect(body).toMatch(/order by ls\.sort, ls\.created_at, ls\.id/);
    expect(body).toMatch(/order by li\.sort, li\.created_at, li\.id/);
    expect(body).toMatch(
      /order by z\.price_cents nulls last, z\.created_at, z\.id/,
    );
    expect(body).toMatch(/order by i\.sort, i\.created_at, i\.id/);
    expect(body).toMatch(/order by s\.sort, s\.created_at, s\.id/);
    for (const table of ["l", "o", "z", "i", "s", "m"]) {
      expect(body).toMatch(new RegExp(`\\b${table}\\.deleted_at is null`));
    }
    expect(body).toMatch(/\) o on o\.options is not null/);
    expect(body).toMatch(
      /case when o\.allergens_reviewed\s*then jsonb_build_object\('checked', true,\s*'major', to_jsonb\(o\.allergens\), 'other', to_jsonb\(o\.custom_allergens\)\)\s*else jsonb_build_object\('checked', false\) end/,
    );
    expect(body).toMatch(
      /case when i\.allergens_reviewed\s*then jsonb_build_object\('checked', true,\s*'major', to_jsonb\(i\.allergens\), 'other', to_jsonb\(i\.custom_allergens\)\)\s*else jsonb_build_object\('checked', false\) end/,
    );
    expect(body).toMatch(/'price_cents', i\.price_cents/);
    expect(body).toMatch(/'kind', 'sizes', 'sizes', coalesce\(/);
    for (const column of [
      ...privateColumns,
      "available",
      "sold_out_at",
      "special_schedule",
      "photo_url",
      "photo_alt",
      "source",
      "updated_at",
    ]) {
      expect(body, column).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("reports what blocks Publish as the caller: a live size with no name or no price under a live dish by size", () => {
    const body = bodyOf("publish_problems");
    expect(body).toMatch(/language sql stable set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/'size_unnamed' else 'size_unpriced'/);
    expect(body).toMatch(/i\.price_kind = 'sizes'/);
    expect(body).toMatch(/z\.name is null or z\.price_cents is null/);
    for (const table of ["s", "i", "z", "m"]) {
      expect(body).toMatch(new RegExp(`\\b${table}\\.deleted_at is null`));
    }
  });

  it("tells the owner pages each live menu's state as the caller, changed by value and never by a clock", () => {
    const body = bodyOf("menu_publish_states");
    expect(body).toMatch(/language sql stable set search_path = ''/);
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(
      /case when m\.published\s*then public\.menu_snapshot\(m\.id\) is distinct from m\.published_snapshot\s*end/,
    );
    expect(body).toMatch(/m\.deleted_at is null/);
    expect(body).not.toMatch(/updated_at/);
  });

  it("publishes and unpublishes as a definer that checks the caller before any lock, refuses by name, and writes the three columns together", () => {
    const pub = bodyOf("publish_menu");
    expect(pub).toMatch(/security definer set search_path = ''/);
    const owner = pub.indexOf("not public.is_owner(v_restaurant)");
    const lock = pub.indexOf("for update;");
    const blocked = pub.indexOf("raise exception 'publish_blocked'");
    const write = pub.indexOf("set published = true,");
    expect(owner).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(owner);
    expect(blocked).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(blocked);
    expect(pub).toMatch(
      /raise exception 'publish_not_found' using errcode = 'P0001';/,
    );
    expect(pub).toMatch(
      /exists \(select 1 from public\.publish_problems\(p_menu\)\)/,
    );
    expect(pub).toMatch(
      /set published = true,\s*published_at = now\(\),\s*published_snapshot = public\.menu_snapshot\(p_menu\)/,
    );
    const un = bodyOf("unpublish_menu");
    expect(un).toMatch(/security definer set search_path = ''/);
    expect(un).toMatch(/not public\.is_owner\(v_restaurant\)/);
    expect(un).toMatch(
      /raise exception 'unpublish_not_found' using errcode = 'P0001';/,
    );
    expect(un).toMatch(
      /set published = false, published_at = null, published_snapshot = null\s*where m\.id = p_menu and m\.deleted_at is null and m\.published;/,
    );
  });

  it("adds five callable functions, each revoked by name and open to authenticated only, and only the two writers as definers", () => {
    const callable = [
      ...publish.matchAll(
        /create (?:or replace )?function public\.(\w+)\s*\([\s\S]*?\)\s*returns\s+(\S+)/gi,
      ),
    ]
      .filter((match) => (match[2] ?? "").toLowerCase() !== "trigger")
      .map((match) => match[1]);
    expect(callable).toEqual([
      "menu_snapshot",
      "publish_problems",
      "menu_publish_states",
      "publish_menu",
      "unpublish_menu",
    ]);
    for (const name of callable) {
      expect(publish).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\(uuid\\) from public, anon;\\s*grant execute on function public\\.${name}\\(uuid\\) to authenticated;`,
        ),
      );
    }
    expect(
      definers
        .filter((fn) => publish.includes(`create function public.${fn.name}(`))
        .map((fn) => fn.name)
        .sort(),
    ).toEqual(["publish_menu", "unpublish_menu"]);
  });
});
