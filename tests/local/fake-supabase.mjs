// A stand-in for the few Supabase endpoints the owner screens use: password
// sign-in, the user, sign-out, and a small slice of the Data API over an
// in-memory store that follows migration three's rules for menus,
// migration four's for sections, migration five's for items and its four
// functions, and migration six's for a dish's own texts and price, its
// sizes, and move_item(). It lets saves land on this machine, which the gate can
// never do (D-115): `npm run local` starts it, builds and serves the app
// against it, and runs the checks in tests/local (D-142). It holds no key
// and names no real project: the session it hands out is an unsigned
// token, and the restaurant is a stand-in, not CI Diner. It is not a copy
// of Supabase; a rule the screens rely on is added here when a task needs
// it.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.STANDIN_PORT ?? 54400);
const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-10-01T00:00:00Z",
};
const restaurant = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "12345678",
  name: "Stand-in Diner (test restaurant, not real)",
  address: "1 Main Street",
  city: "Reading",
  region: "PA",
  postal_code: "19601",
  phone: null,
  website: null,
  hours: null,
  timezone: "America/New_York",
  allergen_note: null,
  prep_notes: [],
  status: "trial",
  stripe_customer_id: null,
};

let clock = Date.parse("2026-10-04T12:00:00Z");
const stamp = () => new Date((clock += 1000)).toISOString();
let menus = [];
let sections = [];
let items = [];
let sizes = [];
function seed(withDishes = true) {
  menus = ["Lunch", "Dinner", "Drinks"].map((name, index) => ({
    id: randomUUID(),
    restaurant_id: restaurant.id,
    name,
    sort: index + 1,
    published: false,
    deleted_at: null,
    created_at: stamp(),
  }));
  const dinner = menus[1];
  sections = ["Starters", "Mains", "Desserts"].map((name, index) => ({
    id: randomUUID(),
    menu_id: dinner.id,
    restaurant_id: restaurant.id,
    name,
    sort: index + 1,
    note: null,
    every_item: null,
    deleted_at: null,
    created_at: stamp(),
  }));
  const starters = sections[0];
  const mains = sections[1];
  // Priced one way each, as CI Diner's data file prices them (D-139): the
  // soup by size, the salad at one price, the bread at market price. With
  // their allergens, as the file lists them (D-148): the soup checked with
  // milk, wheat, and celery, the salad checked with none, the bread not
  // checked; and a second Soup of the day in Mains, not checked, for the
  // same-named line on the first (D-129).
  const priced = [
    {
      name: "Soup of the day",
      price_kind: "sizes",
      price_cents: null,
      allergens: ["milk", "wheat"],
      custom_allergens: ["celery"],
      checked: true,
    },
    {
      name: "House salad",
      price_kind: "one",
      price_cents: 900,
      allergens: [],
      custom_allergens: [],
      checked: true,
    },
    {
      name: "Garlic bread",
      price_kind: "market",
      price_cents: null,
      allergens: [],
      custom_allergens: [],
      checked: false,
    },
  ];
  items = (withDishes ? priced : []).map((dish, index) => ({
    id: randomUUID(),
    section_id: starters.id,
    restaurant_id: restaurant.id,
    name: dish.name,
    description: null,
    price_kind: dish.price_kind,
    price_cents: dish.price_cents,
    note: null,
    allergens: dish.allergens,
    custom_allergens: dish.custom_allergens,
    allergens_reviewed: dish.checked,
    allergens_reviewed_by: dish.checked ? user.id : null,
    allergens_reviewed_at: dish.checked ? stamp() : null,
    sort: index + 1,
    deleted_at: null,
    created_at: stamp(),
  }));
  if (withDishes) {
    items.push({
      id: randomUUID(),
      section_id: mains.id,
      restaurant_id: restaurant.id,
      name: "Soup of the day",
      description: null,
      price_kind: "one",
      price_cents: null,
      note: null,
      allergens: [],
      custom_allergens: [],
      allergens_reviewed: false,
      allergens_reviewed_by: null,
      allergens_reviewed_at: null,
      sort: 1,
      deleted_at: null,
      created_at: stamp(),
    });
  }
  const soup = items[0];
  sizes = (
    withDishes
      ? [
          { name: "Cup", price_cents: 500 },
          { name: "Bowl", price_cents: 800 },
        ]
      : []
  ).map((size) => ({
    id: randomUUID(),
    item_id: soup.id,
    restaurant_id: restaurant.id,
    name: size.name,
    price_cents: size.price_cents,
    deleted_at: null,
    created_at: stamp(),
  }));
}
seed();
// Knobs a test can turn: delay every Data API write, or fail the next one.
let delayMs = 0;
let failNext = 0;
// Names whose next insert fails, on menus or sections, once each.
let failNames = new Map();
// Every write the stand-in took, for a test that must prove none was sent.
let writes = [];

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function session() {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24;
  const token = [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp,
    }),
    "c2lnbmF0dXJl",
  ].join(".");
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: exp - now,
    expires_at: exp,
    refresh_token: "fake-refresh-token",
    user,
  };
}

function send(res, status, body, headers = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(text);
}

const check = (table, name) => [
  400,
  {
    code: "23514",
    message: `new row for relation "${table}" violates check constraint "${name}"`,
  },
];
const unique = (name) => [
  409,
  {
    code: "23505",
    message: `duplicate key value violates unique constraint "${name}"`,
  },
];

const nameKey = (name) => name.trim().toLowerCase();
function menuProblem(name, exceptId) {
  if (
    typeof name !== "string" ||
    !/\S/.test(name) ||
    /\p{Cc}/u.test(name) ||
    name.length > 60
  ) {
    return check("menus", "menus_name_text");
  }
  const taken = menus.some(
    (m) =>
      m.id !== exceptId &&
      m.deleted_at === null &&
      nameKey(m.name) === nameKey(name),
  );
  return taken ? unique("menus_name_key") : null;
}

// Migration four's rules for one section row, as it would be after a write.
function sectionProblem(row) {
  const { name, note, every_item: line } = row;
  if (
    typeof name !== "string" ||
    !/\S/.test(name) ||
    /\p{Cc}/u.test(name) ||
    name.length > 60
  ) {
    return check("sections", "sections_name_text");
  }
  if (
    note !== null &&
    (typeof note !== "string" ||
      !/\S/.test(note) ||
      /[^\P{Cc}\n]/u.test(note) ||
      note.length > 500)
  ) {
    return check("sections", "sections_note_text");
  }
  if (
    line !== null &&
    (typeof line !== "string" ||
      !/\S/.test(line) ||
      /\p{Cc}/u.test(line) ||
      line.length > 120)
  ) {
    return check("sections", "sections_every_item_text");
  }
  if (row.deleted_at === null) {
    const taken = sections.some(
      (s) =>
        s.id !== row.id &&
        s.menu_id === row.menu_id &&
        s.deleted_at === null &&
        nameKey(s.name) === nameKey(name),
    );
    if (taken) return unique("sections_name_key");
  }
  return null;
}

const PRICE_KINDS = ["one", "sizes", "market"];
const PRICE_CAP = 9999999;
const badEnum = (value) => [
  400,
  {
    code: "22P02",
    message: `invalid input value for enum price_kind: "${value}"`,
  },
];

const named = (message) => [
  400,
  { code: "P0001", message, details: null, hint: null },
];

const US_NINE = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame",
];
const MAJOR_WORDS = [
  "milk",
  "dairy",
  "egg",
  "eggs",
  "fish",
  "shellfish",
  "crustaceans",
  "tree nut",
  "tree nuts",
  "tree-nuts",
  "nuts",
  "peanut",
  "peanuts",
  "wheat",
  "soy",
  "soya",
  "soybean",
  "soybeans",
  "sesame",
];

// Migration seven's rules for a dish's two allergen lists: the nine the US
// offers, each once; another allergen one line of 40 characters at most,
// with no outer space, once whatever the case, never one of the nine, and
// ten at most.
function allergenListsProblem(row) {
  const { allergens, custom_allergens: others } = row;
  if (!Array.isArray(allergens) || !Array.isArray(others)) {
    return check("items", "items_allergens_offered");
  }
  if (allergens.some((id) => !US_NINE.includes(id))) {
    return check("items", "items_allergens_offered");
  }
  if (new Set(allergens).size !== allergens.length) {
    return named("allergens_repeated");
  }
  if (others.length > 10) return check("items", "items_other_allergens_count");
  const seen = new Set();
  for (const other of others) {
    if (
      typeof other !== "string" ||
      !/\S/.test(other) ||
      /\p{Cc}/u.test(other) ||
      other !== other.trim() ||
      other.length > 40
    ) {
      return named("other_allergen_text");
    }
    if (MAJOR_WORDS.includes(other.toLowerCase())) {
      return named("other_allergen_major");
    }
    if (seen.has(other.toLowerCase())) return named("other_allergen_repeated");
    seen.add(other.toLowerCase());
  }
  return null;
}

// Migration seven's trigger: any change to a list clears the check and its
// stamp; a check that begins is stamped with the person and now; an
// uncheck clears the stamp. The stamp is never what the caller wrote.
function withAllergenCheck(row, next) {
  const out = { ...next };
  out.allergens_reviewed_by = row.allergens_reviewed_by;
  out.allergens_reviewed_at = row.allergens_reviewed_at;
  const listChanged =
    JSON.stringify(next.allergens) !== JSON.stringify(row.allergens) ||
    JSON.stringify(next.custom_allergens) !==
      JSON.stringify(row.custom_allergens);
  if (listChanged) out.allergens_reviewed = false;
  if (out.allergens_reviewed && !row.allergens_reviewed) {
    out.allergens_reviewed_by = user.id;
    out.allergens_reviewed_at = stamp();
  } else if (!out.allergens_reviewed) {
    out.allergens_reviewed_by = null;
    out.allergens_reviewed_at = null;
  }
  return out;
}

// Migration five's rules for one item row, migration six's for its texts
// and price, and migration seven's for its allergen lists, as it would be
// after a write.
function itemProblem(row) {
  const { name, description, note, price_cents: price, price_kind: kind } = row;
  if (
    typeof name !== "string" ||
    !/\S/.test(name) ||
    /\p{Cc}/u.test(name) ||
    name.length > 120
  ) {
    return check("items", "items_name_text");
  }
  if (
    description !== null &&
    (typeof description !== "string" ||
      !/\S/.test(description) ||
      /[^\P{Cc}\n]/u.test(description) ||
      description.length > 500)
  ) {
    return check("items", "items_description_text");
  }
  if (
    note !== null &&
    (typeof note !== "string" ||
      !/\S/.test(note) ||
      /\p{Cc}/u.test(note) ||
      note.length > 120)
  ) {
    return check("items", "items_note_text");
  }
  if (price !== null && (!Number.isInteger(price) || price < 0)) {
    return check("items", "items_price_cents_check");
  }
  if (price !== null && price > PRICE_CAP) {
    return check("items", "items_price_cents_range");
  }
  if (!PRICE_KINDS.includes(kind)) return badEnum(kind);
  const lists = allergenListsProblem(row);
  if (lists) return lists;
  if (row.deleted_at === null) {
    const taken = items.some(
      (i) =>
        i.id !== row.id &&
        i.section_id === row.section_id &&
        i.deleted_at === null &&
        nameKey(i.name) === nameKey(name),
    );
    if (taken) return unique("items_name_key");
  }
  return null;
}

// Migration six's rules for one size row, as it would be after a write.
function sizeProblem(row) {
  const { name, price_cents: price } = row;
  if (
    name !== null &&
    (typeof name !== "string" ||
      !/\S/.test(name) ||
      /\p{Cc}/u.test(name) ||
      name.length > 40)
  ) {
    return check("item_sizes", "item_sizes_name_text");
  }
  if (
    price !== null &&
    (!Number.isInteger(price) || price < 0 || price > PRICE_CAP)
  ) {
    return check("item_sizes", "item_sizes_price_cents");
  }
  if (row.deleted_at === null && name !== null) {
    const taken = sizes.some(
      (z) =>
        z.id !== row.id &&
        z.item_id === row.item_id &&
        z.deleted_at === null &&
        z.name !== null &&
        nameKey(z.name) === nameKey(name),
    );
    if (taken) return unique("item_sizes_name_key");
  }
  return null;
}

const raised = (res, message) =>
  send(res, 400, { code: "P0001", message, details: null, hint: null });

const liveSectionsOf = (menuId) =>
  sections.filter((s) => s.menu_id === menuId && s.deleted_at === null);
const liveItemsOf = (sectionId) =>
  items.filter((i) => i.section_id === sectionId && i.deleted_at === null);

// A Postgres array literal as the app sends one to compare an array column
// against the lists the page showed: {"milk","wheat"}, each element quoted,
// with its quotes and backslashes escaped.
function parseArrayLiteral(text) {
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  const inner = text.slice(1, -1);
  if (inner === "") return [];
  const out = [];
  let current = "";
  let quoted = false;
  let started = false;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (quoted) {
      if (char === "\\") {
        current += inner[index + 1] ?? "";
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      started = true;
    } else if (char === ",") {
      out.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started || out.length > 0) out.push(current);
  return out;
}

// PostgREST's like pattern as a regular expression: * and % match anything,
// _ one character, and a backslash keeps the next character literal.
function likeToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "\\") {
      source += (pattern[index + 1] ?? "").replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      index += 1;
    } else if (char === "%" || char === "*") {
      source += ".*";
    } else if (char === "_") {
      source += ".";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "is");
}

function matches(row, params) {
  for (const [key, raw] of params) {
    if (
      ["select", "order", "limit", "offset", "columns", "on_conflict"].includes(
        key,
      )
    )
      continue;
    const value = row[key];
    if (raw === "is.null") {
      if (value !== null) return false;
    } else if (raw === "not.is.null") {
      if (value === null) return false;
    } else if (raw.startsWith("eq.")) {
      const wanted = raw.slice(3);
      if (Array.isArray(value)) {
        const literal = parseArrayLiteral(wanted);
        if (literal === null) throw new Error(`bad array literal: ${wanted}`);
        if (JSON.stringify(literal) !== JSON.stringify(value)) return false;
      } else if (String(value) !== wanted) return false;
    } else if (raw.startsWith("ilike.")) {
      if (typeof value !== "string" || !likeToRegExp(raw.slice(6)).test(value))
        return false;
    } else {
      throw new Error(`filter not supported: ${key}=${raw}`);
    }
  }
  return true;
}

// PostgREST's order: column.asc|desc, with nullsfirst or nullslast as a
// third part. As in Postgres, nulls come last when ascending and first
// when descending unless the third part says otherwise.
function ordered(rows, params) {
  const order = params.get("order");
  let out = [...rows];
  if (order) {
    const keys = order.split(",").map((part) => {
      const [column, direction, nulls] = part.split(".");
      const descending = direction === "desc";
      return {
        column,
        descending,
        nullsLast: nulls ? nulls === "nullslast" : !descending,
      };
    });
    out.sort((a, b) => {
      for (const { column, descending, nullsLast } of keys) {
        if (a[column] === b[column]) continue;
        if (a[column] === null) return nullsLast ? 1 : -1;
        if (b[column] === null) return nullsLast ? -1 : 1;
        const less = a[column] < b[column] ? -1 : 1;
        return descending ? -less : less;
      }
      return 0;
    });
  }
  const offset = Number(params.get("offset") ?? 0);
  const limit = params.get("limit");
  return limit ? out.slice(offset, offset + Number(limit)) : out.slice(offset);
}

function pick(row, params) {
  const select = params.get("select");
  if (!select || select === "*") return row;
  return Object.fromEntries(
    select.split(",").map((column) => [column, row[column]]),
  );
}

function respondRows(
  req,
  res,
  rows,
  params,
  status = 200,
  total = rows.length,
) {
  const picked = rows.map((row) => pick(row, params));
  const wantsObject = (req.headers.accept ?? "").includes(
    "vnd.pgrst.object+json",
  );
  if (wantsObject) {
    if (picked.length !== 1) {
      return send(res, 406, {
        code: "PGRST116",
        details: `The result contains ${picked.length} rows`,
        hint: null,
        message: "JSON object requested, multiple (or no) rows returned",
      });
    }
    return send(res, status, picked[0]);
  }
  const headers = {};
  if ((req.headers.prefer ?? "").includes("count=exact")) {
    headers["content-range"] = picked.length
      ? `0-${picked.length - 1}/${total}`
      : `*/${total}`;
  }
  if (req.method === "HEAD") {
    res.writeHead(status, headers);
    return res.end();
  }
  return send(res, status, picked, headers);
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const denied = (res, what) =>
  send(res, 403, { code: "42501", message: `permission denied for ${what}` });

// A write waits if told to, and fails if told to. Returns true when it has
// answered already.
async function knobs(res) {
  if (delayMs) await wait(delayMs);
  if (failNext > 0) {
    failNext -= 1;
    send(res, 500, { code: "XX000", message: "the stand-in was told to fail" });
    return true;
  }
  return false;
}

function failByName(res, name) {
  const left = failNames.get(name) ?? 0;
  if (left <= 0) return false;
  failNames.set(name, left - 1);
  send(res, 500, {
    code: "XX000",
    message: `the stand-in was told to fail ${name}`,
  });
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const params = url.searchParams;

    // Test knobs.
    if (path === "/__test/reset") {
      seed(params.get("dishes") !== "0");
      delayMs = 0;
      failNext = 0;
      failNames = new Map();
      writes = [];
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/items") return send(res, 200, items);
    if (path === "/__test/sizes") return send(res, 200, sizes);
    // A dish added somewhere else: another tab, another person.
    if (path === "/__test/add-dish") {
      const section = sections.find((s) => s.name === params.get("section"));
      if (!section) return send(res, 404, { message: "no such section" });
      const row = {
        id: randomUUID(),
        section_id: section.id,
        restaurant_id: section.restaurant_id,
        name: params.get("name"),
        description: null,
        price_kind: "one",
        price_cents: null,
        note: null,
        allergens: [],
        custom_allergens: [],
        allergens_reviewed: false,
        allergens_reviewed_by: null,
        allergens_reviewed_at: null,
        sort: 99,
        deleted_at: null,
        created_at: stamp(),
      };
      items.push(row);
      return send(res, 200, row);
    }
    // A dish's allergen lists changed somewhere else: another tab, another
    // person. The trigger's rules apply, so a check standing on the dish
    // clears (D-148).
    if (path === "/__test/set-allergens") {
      const dish = items.find((i) => i.id === params.get("id"));
      if (!dish) return send(res, 404, { message: "no such dish" });
      const split = (text) => (text ? text.split(",").filter(Boolean) : []);
      const next = withAllergenCheck(dish, {
        ...dish,
        allergens: split(params.get("allergens")),
        custom_allergens: split(params.get("others")),
        allergens_reviewed: params.get("checked") === "1",
      });
      const problem = itemProblem(next);
      if (problem) return send(res, ...problem);
      Object.assign(dish, next);
      return send(res, 200, dish);
    }
    // A menu deleted somewhere else, by a plain mark.
    if (path === "/__test/delete-menu") {
      const menu = menus.find(
        (m) => m.name === params.get("name") && m.deleted_at === null,
      );
      if (!menu) return send(res, 404, { message: "no such menu" });
      menu.deleted_at = stamp();
      return send(res, 200, menu);
    }
    if (path === "/__test/delay") {
      delayMs = Number(params.get("ms") ?? 0);
      return send(res, 200, { delayMs });
    }
    if (path === "/__test/fail-name") {
      const name = params.get("name");
      failNames.set(
        name,
        (failNames.get(name) ?? 0) + Number(params.get("times") ?? 1),
      );
      return send(res, 200, Object.fromEntries(failNames));
    }
    if (path === "/__test/fail") {
      failNext = Number(params.get("times") ?? 1);
      return send(res, 200, { failNext });
    }
    // The restaurant row as stored, and its hours set straight, for the
    // Open 24 hours checks (D-124).
    if (path === "/__test/restaurant") return send(res, 200, restaurant);
    if (path === "/__test/set-hours") {
      restaurant.hours = JSON.parse(params.get("hours") ?? "null");
      return send(res, 200, restaurant);
    }
    if (path === "/__test/menus") return send(res, 200, menus);
    if (path === "/__test/sections") return send(res, 200, sections);
    if (path === "/__test/writes") return send(res, 200, writes);
    if (path === "/__test/add") {
      const row = {
        id: randomUUID(),
        restaurant_id: restaurant.id,
        name: params.get("name"),
        sort: 99,
        published: false,
        deleted_at: null,
        created_at: stamp(),
      };
      menus.push(row);
      return send(res, 200, row);
    }
    // A section added somewhere else: another tab, another person.
    if (path === "/__test/add-section") {
      const menu = menus.find((m) => m.name === params.get("menu"));
      if (!menu) return send(res, 404, { message: "no such menu" });
      const row = {
        id: randomUUID(),
        menu_id: menu.id,
        restaurant_id: menu.restaurant_id,
        name: params.get("name"),
        sort: 99,
        note: null,
        every_item: null,
        deleted_at: null,
        created_at: stamp(),
      };
      sections.push(row);
      return send(res, 200, row);
    }

    // Auth.
    if (path === "/auth/v1/token") return send(res, 200, session());
    if (path === "/auth/v1/user") return send(res, 200, user);
    if (path === "/auth/v1/logout") {
      res.writeHead(204);
      return res.end();
    }

    // Data API.
    const reading = req.method === "GET" || req.method === "HEAD";
    if (path === "/rest/v1/restaurants" && reading) {
      return respondRows(
        req,
        res,
        [restaurant].filter((row) => matches(row, params)),
        params,
      );
    }
    // Save details: the eleven columns the owner may update.
    if (path === "/rest/v1/restaurants" && req.method === "PATCH") {
      const payload = await body(req);
      writes.push(`PATCH restaurants ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      const found = [restaurant].filter((row) => matches(row, params));
      for (const row of found) Object.assign(row, payload);
      return respondRows(req, res, found, params);
    }
    if (path === "/rest/v1/owners") {
      return send(res, 200, [
        {
          restaurant_id: restaurant.id,
          restaurants: { code: restaurant.code },
        },
      ]);
    }
    if (path === "/rest/v1/menus") {
      if (reading) {
        const all = menus.filter((row) => matches(row, params));
        return respondRows(
          req,
          res,
          ordered(all, params),
          params,
          200,
          all.length,
        );
      }
      const payload = await body(req);
      writes.push(`${req.method} menus ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      if (req.method === "POST" && failByName(res, payload.name)) return;
      if (req.method === "POST") {
        const allowed = ["restaurant_id", "name", "sort"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const problem = menuProblem(payload.name, null);
        if (problem) return send(res, ...problem);
        const row = {
          id: randomUUID(),
          restaurant_id: payload.restaurant_id,
          name: payload.name,
          sort: payload.sort ?? 0,
          published: false,
          deleted_at: null,
          created_at: stamp(),
        };
        menus.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = ["name", "sort", "deleted_at"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const targets = menus.filter((row) => matches(row, params));
        for (const row of targets) {
          const next = { ...row, ...payload };
          if (next.deleted_at === null) {
            const problem = menuProblem(next.name, row.id);
            if (problem) return send(res, ...problem);
          }
        }
        for (const row of targets) Object.assign(row, payload);
        return respondRows(req, res, targets, params);
      }
      if (req.method === "DELETE") return denied(res, "table menus");
    }
    if (path === "/rest/v1/rpc/set_menu_order" && req.method === "POST") {
      const { p_restaurant, p_ids } = await body(req);
      writes.push(`rpc set_menu_order ${JSON.stringify(p_ids)}`);
      if (await knobs(res)) return;
      const live = menus.filter(
        (m) => m.restaurant_id === p_restaurant && m.deleted_at === null,
      );
      const ids = Array.isArray(p_ids) ? p_ids : [];
      const distinct = new Set(
        ids.filter((id) => live.some((m) => m.id === id)),
      );
      if (
        live.length === 0 ||
        ids.length !== live.length ||
        distinct.size !== live.length
      ) {
        return send(res, 400, {
          code: "P0001",
          message: "order_mismatch",
          details: null,
          hint: null,
        });
      }
      ids.forEach((id, index) => {
        const row = menus.find((m) => m.id === id);
        row.sort = index + 1;
      });
      res.writeHead(204);
      return res.end();
    }

    if (path === "/rest/v1/sections") {
      if (reading) {
        const all = sections.filter((row) => matches(row, params));
        return respondRows(
          req,
          res,
          ordered(all, params),
          params,
          200,
          all.length,
        );
      }
      const payload = await body(req);
      writes.push(`${req.method} sections ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      if (req.method === "POST" && failByName(res, payload.name)) return;
      if (req.method === "POST") {
        const allowed = ["menu_id", "name", "sort"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        // The copy trigger: the restaurant comes from the menu, which the
        // caller must be able to read.
        const menu = menus.find((m) => m.id === payload.menu_id);
        if (!menu) {
          return send(res, 400, {
            code: "P0001",
            message: "A section needs an existing menu.",
            details: null,
            hint: null,
          });
        }
        const row = {
          id: randomUUID(),
          menu_id: menu.id,
          restaurant_id: menu.restaurant_id,
          name: payload.name,
          sort: payload.sort ?? 0,
          note: null,
          every_item: null,
          deleted_at: null,
          created_at: stamp(),
        };
        const problem = sectionProblem(row);
        if (problem) return send(res, ...problem);
        sections.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = ["name", "note", "every_item", "sort", "deleted_at"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const targets = sections.filter((row) => matches(row, params));
        for (const row of targets) {
          const problem = sectionProblem({ ...row, ...payload });
          if (problem) return send(res, ...problem);
        }
        for (const row of targets) Object.assign(row, payload);
        return respondRows(req, res, targets, params);
      }
      if (req.method === "DELETE") return denied(res, "table sections");
    }
    if (path === "/rest/v1/rpc/set_section_order" && req.method === "POST") {
      const { p_menu, p_ids } = await body(req);
      writes.push(`rpc set_section_order ${JSON.stringify(p_ids)}`);
      if (await knobs(res)) return;
      const live = sections.filter(
        (s) => s.menu_id === p_menu && s.deleted_at === null,
      );
      const ids = Array.isArray(p_ids) ? p_ids : [];
      const distinct = new Set(
        ids.filter((id) => live.some((s) => s.id === id)),
      );
      if (
        live.length === 0 ||
        ids.length !== live.length ||
        distinct.size !== live.length
      ) {
        return send(res, 400, {
          code: "P0001",
          message: "order_mismatch",
          details: null,
          hint: null,
        });
      }
      ids.forEach((id, index) => {
        const row = sections.find((s) => s.id === id);
        row.sort = index + 1;
      });
      res.writeHead(204);
      return res.end();
    }

    if (path === "/rest/v1/items") {
      if (reading) {
        const all = items.filter((row) => matches(row, params));
        return respondRows(
          req,
          res,
          ordered(all, params),
          params,
          200,
          all.length,
        );
      }
      const payload = await body(req);
      writes.push(`${req.method} items ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      if (req.method === "POST" && failByName(res, payload.name)) return;
      if (req.method === "POST") {
        const allowed = ["section_id", "name", "sort"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        // The copy trigger: the restaurant comes from the section, which the
        // caller must be able to read.
        const section = sections.find((s) => s.id === payload.section_id);
        if (!section) return raised(res, "An item needs an existing section.");
        const row = {
          id: randomUUID(),
          section_id: section.id,
          restaurant_id: section.restaurant_id,
          name: payload.name,
          description: null,
          price_kind: "one",
          price_cents: null,
          note: null,
          allergens: [],
          custom_allergens: [],
          allergens_reviewed: false,
          allergens_reviewed_by: null,
          allergens_reviewed_at: null,
          sort: payload.sort ?? 0,
          deleted_at: null,
          created_at: stamp(),
        };
        const problem = itemProblem(row);
        if (problem) return send(res, ...problem);
        items.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = [
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
        ];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const targets = items.filter((row) => matches(row, params));
        const nexts = new Map();
        for (const row of targets) {
          const next = withAllergenCheck(row, { ...row, ...payload });
          const problem = itemProblem(next);
          if (problem) return send(res, ...problem);
          nexts.set(row, next);
        }
        for (const row of targets) Object.assign(row, nexts.get(row));
        return respondRows(req, res, targets, params);
      }
      if (req.method === "DELETE") return denied(res, "table items");
    }
    // A dish's sizes (migration 6): read, added blank or named, written,
    // and marked deleted, under the owner's column lists.
    if (path === "/rest/v1/item_sizes") {
      if (reading) {
        const all = sizes.filter((row) => matches(row, params));
        return respondRows(
          req,
          res,
          ordered(all, params),
          params,
          200,
          all.length,
        );
      }
      const payload = await body(req);
      writes.push(`${req.method} item_sizes ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      if (req.method === "POST") {
        const allowed = ["item_id", "name", "price_cents"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        // The copy trigger: the restaurant comes from the dish, which the
        // caller must be able to read.
        const dish = items.find((i) => i.id === payload.item_id);
        if (!dish) return raised(res, "A size needs an existing dish.");
        const row = {
          id: randomUUID(),
          item_id: dish.id,
          restaurant_id: dish.restaurant_id,
          name: payload.name ?? null,
          price_cents: payload.price_cents ?? null,
          deleted_at: null,
          created_at: stamp(),
        };
        const problem = sizeProblem(row);
        if (problem) return send(res, ...problem);
        sizes.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = ["name", "price_cents", "deleted_at"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const targets = sizes.filter((row) => matches(row, params));
        for (const row of targets) {
          const problem = sizeProblem({ ...row, ...payload });
          if (problem) return send(res, ...problem);
        }
        for (const row of targets) Object.assign(row, payload);
        return respondRows(req, res, targets, params);
      }
      if (req.method === "DELETE") return denied(res, "table item_sizes");
    }
    if (path === "/rest/v1/rpc/set_item_order" && req.method === "POST") {
      const { p_section, p_ids } = await body(req);
      writes.push(`rpc set_item_order ${JSON.stringify(p_ids)}`);
      if (await knobs(res)) return;
      const live = liveItemsOf(p_section);
      const ids = Array.isArray(p_ids) ? p_ids : [];
      const distinct = new Set(
        ids.filter((id) => live.some((i) => i.id === id)),
      );
      if (
        live.length === 0 ||
        ids.length !== live.length ||
        distinct.size !== live.length
      ) {
        return raised(res, "order_mismatch");
      }
      ids.forEach((id, index) => {
        const row = items.find((i) => i.id === id);
        row.sort = index + 1;
      });
      res.writeHead(204);
      return res.end();
    }
    // A read, sent as a POST: it is not counted among the writes.
    if (path === "/rest/v1/rpc/section_dish_counts" && req.method === "POST") {
      const { p_restaurant } = await body(req);
      const rows = menus
        .filter(
          (m) => m.restaurant_id === p_restaurant && m.deleted_at === null,
        )
        .flatMap((m) =>
          liveSectionsOf(m.id).map((s) => ({
            menu_id: m.id,
            section_id: s.id,
            dishes: liveItemsOf(s.id).length,
          })),
        )
        .filter((row) => matches(row, params));
      return respondRows(req, res, rows, params);
    }
    if (path === "/rest/v1/rpc/delete_with_contents" && req.method === "POST") {
      const payload = await body(req);
      writes.push(`rpc delete_with_contents ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      const { p_kind, p_parent, p_id } = payload;
      const sectionsTold = payload.p_sections ?? 0;
      const dishesTold = payload.p_dishes ?? 0;
      if (p_kind === "menu") {
        const menu = menus.find(
          (m) =>
            m.id === p_id &&
            m.restaurant_id === p_parent &&
            m.deleted_at === null,
        );
        if (!menu) return raised(res, "delete_not_found");
        const held = liveSectionsOf(menu.id);
        const dishes = held.reduce(
          (sum, s) => sum + liveItemsOf(s.id).length,
          0,
        );
        if (held.length > sectionsTold || dishes > dishesTold)
          return raised(res, "delete_grew");
        menu.deleted_at = stamp();
      } else if (p_kind === "section") {
        const section = sections.find(
          (s) =>
            s.id === p_id && s.menu_id === p_parent && s.deleted_at === null,
        );
        if (!section) return raised(res, "delete_not_found");
        if (liveItemsOf(section.id).length > dishesTold)
          return raised(res, "delete_grew");
        section.deleted_at = stamp();
      } else {
        return raised(res, "delete_unknown_kind");
      }
      res.writeHead(204);
      return res.end();
    }
    if (path === "/rest/v1/rpc/move_section" && req.method === "POST") {
      const { p_section, p_menu } = await body(req);
      writes.push(`rpc move_section ${JSON.stringify({ p_section, p_menu })}`);
      if (await knobs(res)) return;
      const found = sections.find((s) => s.id === p_section);
      if (!found || found.restaurant_id !== restaurant.id)
        return raised(res, "move_not_found");
      const target = menus.find(
        (m) =>
          m.id === p_menu &&
          m.restaurant_id === found.restaurant_id &&
          m.deleted_at === null,
      );
      if (!target) return raised(res, "move_menu_gone");
      const from = menus.find(
        (m) => m.id === found.menu_id && m.deleted_at === null,
      );
      if (found.deleted_at !== null || !from)
        return raised(res, "move_not_found");
      if (found.menu_id === p_menu) return raised(res, "move_same_menu");
      const live = liveSectionsOf(target.id);
      if (live.some((s) => nameKey(s.name) === nameKey(found.name))) {
        return raised(res, "move_name_taken");
      }
      found.menu_id = target.id;
      found.sort = live.reduce((top, s) => Math.max(top, s.sort), 0) + 1;
      res.writeHead(204);
      return res.end();
    }

    if (path === "/rest/v1/rpc/move_item" && req.method === "POST") {
      const { p_item, p_section } = await body(req);
      writes.push(`rpc move_item ${JSON.stringify({ p_item, p_section })}`);
      if (await knobs(res)) return;
      const found = items.find((i) => i.id === p_item);
      if (!found || found.restaurant_id !== restaurant.id)
        return raised(res, "move_not_found");
      const liveSection = (id) => {
        const section = sections.find(
          (s) =>
            s.id === id &&
            s.restaurant_id === found.restaurant_id &&
            s.deleted_at === null,
        );
        if (!section) return null;
        const menu = menus.find(
          (m) => m.id === section.menu_id && m.deleted_at === null,
        );
        return menu ? section : null;
      };
      const target = liveSection(p_section);
      if (!target) return raised(res, "move_section_gone");
      if (found.deleted_at !== null || !liveSection(found.section_id))
        return raised(res, "move_not_found");
      if (found.section_id === p_section)
        return raised(res, "move_same_section");
      const live = liveItemsOf(target.id);
      if (live.some((i) => nameKey(i.name) === nameKey(found.name))) {
        return raised(res, "move_name_taken");
      }
      found.section_id = target.id;
      found.sort = live.reduce((top, i) => Math.max(top, i.sort), 0) + 1;
      res.writeHead(204);
      return res.end();
    }

    console.log(`unhandled ${req.method} ${req.url}`);
    return send(res, 404, { message: "not handled by the stand-in" });
  } catch (error) {
    console.log(`error on ${req.method} ${req.url}: ${error}`);
    return send(res, 500, { message: String(error) });
  }
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`stand-in listening on ${PORT}`),
);
