// A stand-in for the few Supabase endpoints the owner screens use: password
// sign-in, the user, sign-out, and a small slice of the Data API over an
// in-memory store that follows migration three's rules for menus,
// migration four's for sections, migration five's for items and its four
// functions, migration six's for a dish's own texts and price, its sizes,
// and move_item(), migration seven's for a dish's allergen lists and their
// check, migration nine's for a dish's tags, availability with its
// sold-out mark, and schedule, and migration eleven's for choice lists and
// their options, calories on a dish, a size, and an option, and the Cooked
// to order mark (D-166, D-167); migration eight's line shown with every
// dish left with eleven. It lets saves land on this machine, which the
// gate can never do (D-115): `npm run local` starts it, builds and serves
// the app against it, and runs the checks in tests/local (D-142). It holds no key
// and names no real project: the session it hands out is an unsigned
// token, and the restaurant is a stand-in, not CI Diner. It is not a copy
// of Supabase; a rule the screens rely on is added here when a task needs
// it. It also answers as Google's Places API (New) for the address finder
// (D-83), two endpoints and a log, so the finder's lookups land here with
// no key and no network.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { menuSnapshot, publishProblems } from "./menu-snapshot.mjs";
import { rowMakers, seedStore } from "./standin-seed.mjs";

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
// The stand-in's restaurant, its live details as CI Diner's data file
// sets them (the diner page task): the time zone, a closed Monday, a split
// Tuesday, an overnight Saturday, an around-the-clock Sunday, and the
// shared-fryer sentence, so the details and diner checks run on the same
// hours here as on the preview, and icons on (D-189), so the public gate
// reads the on state here as on CI Diner. A reset puts the details back.
const restaurantDefaults = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "12345678",
  name: "Stand-in Diner (test restaurant, not real)",
  address: "1 Main Street",
  city: "Reading",
  region: "PA",
  postal_code: "19601",
  phone: null,
  website: null,
  hours: {
    mon: [],
    tue: [
      { open: "11:00", close: "14:00" },
      { open: "17:00", close: "21:00" },
    ],
    wed: [{ open: "11:00", close: "21:00" }],
    thu: [{ open: "11:00", close: "21:00" }],
    fri: [{ open: "11:00", close: "21:00" }],
    sat: [{ open: "17:00", close: "02:00" }],
    sun: [{ open: "00:00", close: "00:00" }],
  },
  timezone: "America/New_York",
  allergen_note: null,
  prep_notes: ["shared-fryer"],
  status: "trial",
  stripe_customer_id: null,
  city_slug: null,
  country: "US",
  enabled_languages: [],
  show_icons: true,
};
const restaurant = structuredClone(restaurantDefaults);
// Restaurants a test created through create_restaurant(), each with a
// code of its own, drawn at random as generate_menu_code() draws one, so no
// cached page from an earlier run can answer for it; a reset or
// remove-created drops them.
let created = [];
// The code the next create_restaurant() will mint, once a test has asked
// for it through the next-code knob, so the test can read that code's page
// before the restaurant exists.
let nextCode = null;
const restaurants = () => [restaurant, ...created];
function freshCode() {
  for (;;) {
    const code = String(10_000_000 + Math.floor(Math.random() * 90_000_000));
    if (!restaurants().some((row) => row.code === code)) return code;
  }
}

let clock = Date.parse("2026-10-04T12:00:00Z");
const stamp = () => new Date((clock += 1000)).toISOString();
let menus = [];
let sections = [];
let items = [];
let sizes = [];
let lists = [];
let options = [];
const { listRow, optionRow } = rowMakers({ restaurant, user, stamp });
// The rows as a store, for the snapshot builder, read fresh since a reset
// makes new arrays.
const store = () => ({ menus, sections, items, sizes, lists, options });
function seed(withDishes = true) {
  ({ menus, sections, items, sizes, lists, options } = seedStore(
    { restaurant, user, stamp },
    withDishes,
  ));
}
seed();
// Knobs a test can turn: delay every Data API write, or fail the next one,
// or fail the next reads of the published views.
let delayMs = 0;
let failNext = 0;
let failReads = 0;
// Names whose next insert fails, on menus or sections, once each.
let failNames = new Map();
// Every write the stand-in took, for a test that must prove none was sent.
let writes = [];

// The address finder's Google (D-83): run.mjs points GOOGLE_PLACES_ORIGIN
// here with this key, so a call with another key is refused as Google
// refuses one, and a details call without the address mask too. Two
// places, matched by a word in what was typed; every call is logged with
// its session token, for a test that reads the tokens.
const PLACES_KEY = "standin-places-key";
const component = (types, longText, shortText = longText) => ({
  longText,
  shortText,
  types,
  languageCode: "en",
});
const places = [
  {
    id: "standin-2-main",
    match: "main",
    text: "2 Main Street, Reading, PA, USA",
    components: [
      component(["street_number"], "2"),
      component(["route"], "Main Street", "Main St"),
      component(["subpremise"], "Suite 2"),
      component(["locality", "political"], "Reading"),
      component(["administrative_area_level_2", "political"], "Berks County"),
      component(
        ["administrative_area_level_1", "political"],
        "Pennsylvania",
        "PA",
      ),
      component(["country", "political"], "United States", "US"),
      component(["postal_code"], "19601"),
      component(["postal_code_suffix"], "1234"),
    ],
  },
  {
    id: "standin-bistro",
    match: "bistro",
    text: "Stand-in Bistro, Penn Street, Reading, PA, USA",
    components: [
      component(["street_number"], "500"),
      component(["route"], "Penn Street", "Penn St"),
      component(["locality", "political"], "Reading"),
      component(
        ["administrative_area_level_1", "political"],
        "Pennsylvania",
        "PA",
      ),
      component(["country", "political"], "United States", "US"),
      component(["postal_code"], "19602"),
    ],
  },
];
let placesLog = [];
let failPlaces = 0;
const googleError = (res, status, word, message) =>
  send(res, status, { error: { code: status, message, status: word } });

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
  const { name, note } = row;
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

// The commas that read as separators to a diner (D-151, Q-65): plain,
// fullwidth, ideographic.
const COMMA = /[,\uFF0C\u3001]/u;

// Migration eight's one rule for a pair of allergen lists, a dish's or an
// option's (migration seven's rules, the comma among them): the nine the US
// offers, each once; another allergen one line of 40 characters at most,
// with no outer space, no comma, once whatever the case, never one of the
// nine, and ten at most. The two constraints are named for the table.
function allergenListsProblem(allergens, others, table, offered, count) {
  if (!Array.isArray(allergens) || !Array.isArray(others)) {
    return check(table, offered);
  }
  if (allergens.some((id) => !US_NINE.includes(id))) {
    return check(table, offered);
  }
  if (new Set(allergens).size !== allergens.length) {
    return named("allergens_repeated");
  }
  if (others.length > 10) return check(table, count);
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
    if (COMMA.test(other)) return named("other_allergen_comma");
    if (MAJOR_WORDS.includes(other.toLowerCase())) {
      return named("other_allergen_major");
    }
    if (seen.has(other.toLowerCase())) return named("other_allergen_repeated");
    seen.add(other.toLowerCase());
  }
  return null;
}

// Migration seven's check trigger, and migration eleven's for an option:
// any change to a list clears the check and its stamp; a check that begins
// is stamped with the person and now; an uncheck clears the stamp. The
// stamp is never what the caller wrote.
function withAllergenCheck(row, next, prefix = "") {
  const lists = `${prefix}allergens`;
  const others = `${prefix}custom_allergens`;
  const flag = `${prefix}allergens_reviewed`;
  const by = `${prefix}allergens_reviewed_by`;
  const at = `${prefix}allergens_reviewed_at`;
  const out = { ...next };
  out[by] = row[by];
  out[at] = row[at];
  const listChanged =
    JSON.stringify(next[lists]) !== JSON.stringify(row[lists]) ||
    JSON.stringify(next[others]) !== JSON.stringify(row[others]);
  if (listChanged) out[flag] = false;
  if (out[flag] && !row[flag]) {
    out[by] = user.id;
    out[at] = stamp();
  } else if (!out[flag]) {
    out[by] = null;
    out[at] = null;
  }
  return out;
}

// Migration eleven's check trigger for an option: a change to the name
// clears the check too, since the name is all that names the food
// (Michael, October 10, 2026), and then migration seven's rules apply.
function withOptionCheck(row, next) {
  const out = { ...next };
  if (out.name !== row.name) out.allergens_reviewed = false;
  return withAllergenCheck(row, out);
}

// Migration eleven's calories shape, on a dish, a size, and an option: both
// null, or the low one a whole number from 0 to 99,999 and the high one
// null or at least the low and at most 99,999.
function caloriesOk(low, high) {
  if (low === null && high === null) return true;
  if (low === null) return false;
  if (!Number.isInteger(low) || low < 0 || low > 99999) return false;
  if (high === null) return true;
  return Number.isInteger(high) && high >= low && high <= 99999;
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
  if (!caloriesOk(row.calories_low, row.calories_high)) {
    return check("items", "items_calories_shape");
  }
  if (typeof row.cooked_to_order !== "boolean") {
    return check("items", "items_cooked_to_order_not_null");
  }
  const lists = allergenListsProblem(
    row.allergens,
    row.custom_allergens,
    "items",
    "items_allergens_offered",
    "items_other_allergens_count",
  );
  if (lists) return lists;
  const showing = showingProblem(row);
  if (showing) return showing;
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

// Migration nine's rules for a dish's tags, its sold-out mark, and its
// schedule (D-159, D-160): each tag one of the three and once; a mark only
// on a dish that is available; a schedule null or an object of any of its
// six keys, each list non-empty with every value allowed and once, weeks
// only with days, hours a range in HH:MM that opens and closes at different
// times, dates real and in order.
const DIETARY_TAGS = ["vegan", "vegetarian", "made-without-gluten"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEK_KEYS = ["first", "second", "third", "fourth", "last"];
const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const SCHEDULE_KEYS = ["days", "weeks", "months", "hours", "from", "until"];
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function onceOf(list, keys) {
  return (
    Array.isArray(list) &&
    list.length >= 1 &&
    list.every((key) => keys.includes(key)) &&
    new Set(list).size === list.length
  );
}

function realDay(day) {
  if (!DATE.test(day)) return false;
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}

function scheduleShapeOk(schedule) {
  if (schedule === null) return true;
  if (typeof schedule !== "object" || Array.isArray(schedule)) return false;
  const keys = Object.keys(schedule);
  if (keys.length === 0) return false;
  if (keys.some((key) => !SCHEDULE_KEYS.includes(key))) return false;
  if ("days" in schedule && !onceOf(schedule.days, DAY_KEYS)) return false;
  if (
    "weeks" in schedule &&
    (!("days" in schedule) || !onceOf(schedule.weeks, WEEK_KEYS))
  ) {
    return false;
  }
  if ("months" in schedule && !onceOf(schedule.months, MONTH_KEYS)) {
    return false;
  }
  if ("hours" in schedule) {
    const range = schedule.hours;
    if (!range || typeof range !== "object" || Array.isArray(range)) {
      return false;
    }
    if (Object.keys(range).some((key) => !["open", "close"].includes(key))) {
      return false;
    }
    if (
      typeof range.open !== "string" ||
      typeof range.close !== "string" ||
      !TIME.test(range.open) ||
      !TIME.test(range.close) ||
      range.open === range.close
    ) {
      return false;
    }
  }
  for (const side of ["from", "until"]) {
    if (side in schedule) {
      const day = schedule[side];
      if (typeof day !== "string" || !realDay(day)) return false;
    }
  }
  if (
    "from" in schedule &&
    "until" in schedule &&
    schedule.from > schedule.until
  ) {
    return false;
  }
  return true;
}

function showingProblem(row) {
  const tags = row.dietary_tags;
  if (!Array.isArray(tags)) return check("items", "items_dietary_tags_once");
  const outside = tags.find((tag) => !DIETARY_TAGS.includes(tag));
  if (outside !== undefined) return badEnum(outside);
  if (new Set(tags).size !== tags.length) {
    return check("items", "items_dietary_tags_once");
  }
  if (row.sold_out_at !== null && !row.available) {
    return check("items", "items_sold_out_needs_available");
  }
  if (!scheduleShapeOk(row.special_schedule)) {
    return check("items", "items_special_schedule_shape");
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
  if (!caloriesOk(row.calories_low, row.calories_high)) {
    return check("item_sizes", "item_sizes_calories_shape");
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

// Migration eleven's rules for one choice list row, as it would be after a
// write: one home, a lead of one line and 120 characters at most, and
// leads that are not deleted differing within a home.
function listProblem(row) {
  const homes = [row.item_id, row.section_id].filter((id) => id !== null);
  if (homes.length !== 1) return check("choice_lists", "choice_lists_one_home");
  const { lead } = row;
  if (
    typeof lead !== "string" ||
    !/\S/.test(lead) ||
    /\p{Cc}/u.test(lead) ||
    lead.length > 120
  ) {
    return check("choice_lists", "choice_lists_lead_text");
  }
  if (row.deleted_at === null) {
    const taken = lists.some(
      (l) =>
        l.id !== row.id &&
        l.deleted_at === null &&
        homeOf(l) === homeOf(row) &&
        nameKey(l.lead) === nameKey(lead),
    );
    if (taken) return unique("choice_lists_lead_key");
  }
  return null;
}

const homeOf = (list) => list.item_id ?? list.section_id;
const liveListsOf = (homeId) =>
  lists.filter((l) => homeOf(l) === homeId && l.deleted_at === null);
const liveOptionsOf = (listId) =>
  options.filter((o) => o.choice_list_id === listId && o.deleted_at === null);

// Migration eleven's rules for one option row: a name of one line and 60
// characters at most, names that are not deleted differing within a list,
// an added price from 0 to 9,999,999 cents or none, the calories shape, and
// migration seven's allergen lists under the option's constraint names.
function optionProblem(row) {
  const { name, added_price_cents: price } = row;
  if (
    typeof name !== "string" ||
    !/\S/.test(name) ||
    /\p{Cc}/u.test(name) ||
    name.length > 60
  ) {
    return check("choice_options", "choice_options_name_text");
  }
  if (
    price !== null &&
    (!Number.isInteger(price) || price < 0 || price > PRICE_CAP)
  ) {
    return check("choice_options", "choice_options_added_price_cents");
  }
  if (!caloriesOk(row.calories_low, row.calories_high)) {
    return check("choice_options", "choice_options_calories_shape");
  }
  const problem = allergenListsProblem(
    row.allergens,
    row.custom_allergens,
    "choice_options",
    "choice_options_allergens_offered",
    "choice_options_other_allergens_count",
  );
  if (problem) return problem;
  if (row.deleted_at === null) {
    const taken = options.some(
      (o) =>
        o.id !== row.id &&
        o.choice_list_id === row.choice_list_id &&
        o.deleted_at === null &&
        nameKey(o.name) === nameKey(name),
    );
    if (taken) return unique("choice_options_name_key");
  }
  return null;
}

const raised = (res, message) =>
  send(res, 400, { code: "P0001", message, details: null, hint: null });

// Publish and Unpublish as publish_menu() and unpublish_menu() do them
// (migration 12): the flag, the time, and the snapshot together, refused
// by name for a stranger's or a deleted menu, and while a size has no name
// or no price. Null when it landed.
function publish(menuId) {
  const menu = menus.find(
    (m) =>
      m.id === menuId &&
      m.restaurant_id === restaurant.id &&
      m.deleted_at === null,
  );
  if (!menu) return "publish_not_found";
  if (publishProblems(store(), menuId).length > 0) return "publish_blocked";
  menu.published = true;
  menu.published_at = stamp();
  menu.published_snapshot = menuSnapshot(store(), menuId);
  return null;
}

function unpublish(menuId) {
  const menu = menus.find(
    (m) =>
      m.id === menuId &&
      m.restaurant_id === restaurant.id &&
      m.deleted_at === null,
  );
  if (!menu) return "unpublish_not_found";
  menu.published = false;
  menu.published_at = null;
  menu.published_snapshot = null;
  return null;
}

// The three views diners read (migration 12), over every restaurant the
// stand-in holds.
const readable = (row) => row.status === "trial" || row.status === "active";
const publishedMenuRows = (row) =>
  menus.filter(
    (m) => m.restaurant_id === row.id && m.published && m.deleted_at === null,
  );

function publishedRestaurants() {
  return restaurants()
    .filter((row) => readable(row) && publishedMenuRows(row).length > 0)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      city: row.city,
      city_slug: row.city_slug,
      country: row.country,
      hours: row.hours,
      website: row.website,
      timezone: row.timezone,
      enabled_languages: row.enabled_languages,
      allergen_note: row.allergen_note,
      prep_notes: row.prep_notes,
      show_icons: row.show_icons,
    }));
}

function publishedMenus() {
  return restaurants()
    .filter(readable)
    .flatMap((row) =>
      publishedMenuRows(row).map((m) => ({
        id: m.id,
        restaurant_id: row.id,
        code: row.code,
        sort: m.sort,
        published_at: m.published_at,
        published_snapshot: m.published_snapshot,
      })),
    );
}

function publishedItemStates() {
  return publishedMenus().flatMap((pm) =>
    (pm.published_snapshot?.sections ?? [])
      .flatMap((section) => section.items)
      .flatMap((dish) => {
        const row = items.find((i) => i.id === dish.id);
        return row
          ? [
              {
                id: row.id,
                menu_id: pm.id,
                available: row.available,
                sold_out_at: row.sold_out_at,
                special_schedule: row.special_schedule,
              },
            ]
          : [];
      }),
  );
}

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

// JSON text with its keys in one order at every level, so two values that
// jsonb would call equal give the same text.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
      } else if (value !== null && typeof value === "object") {
        // A jsonb column compares by value, whatever order its keys came
        // in, so a schedule the page showed matches the stored one.
        if (canonical(JSON.parse(wanted)) !== canonical(value)) return false;
      } else if (String(value) !== wanted) return false;
    } else if (raw.startsWith("ilike.")) {
      if (typeof value !== "string" || !likeToRegExp(raw.slice(6)).test(value))
        return false;
    } else if (raw.startsWith("in.(") && raw.endsWith(")")) {
      // in.(a,b,c): ids, which hold no comma or quote.
      const wanted = raw.slice(4, -1).split(",").filter(Boolean);
      if (!wanted.includes(String(value))) return false;
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
      Object.assign(restaurant, structuredClone(restaurantDefaults));
      created = [];
      delayMs = 0;
      failNext = 0;
      failReads = 0;
      failNames = new Map();
      writes = [];
      placesLog = [];
      failPlaces = 0;
      return send(res, 200, { ok: true });
    }
    // The diner page's knobs (the diner page task).
    if (path === "/__test/reset-details") {
      Object.assign(restaurant, structuredClone(restaurantDefaults));
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/remove-created") {
      created = [];
      nextCode = null;
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/next-code") {
      nextCode = freshCode();
      return send(res, 200, { code: nextCode });
    }
    if (path === "/__test/set-status") {
      restaurant.status = params.get("status") ?? "trial";
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/set-sold-out") {
      const dish = items.find((i) => i.id === params.get("dish"));
      if (!dish) return send(res, 404, { message: "no such dish" });
      dish.available = true;
      dish.sold_out_at = params.get("at") ?? new Date().toISOString();
      return send(res, 200, dish);
    }
    if (path === "/__test/publish") {
      const problem = publish(params.get("menu"));
      return problem
        ? send(res, 400, { message: problem })
        : send(res, 200, { ok: true });
    }
    if (path === "/__test/unpublish") {
      const problem = unpublish(params.get("menu"));
      return problem
        ? send(res, 400, { message: problem })
        : send(res, 200, { ok: true });
    }
    if (path === "/__test/fail-read") {
      failReads = Number(params.get("times") ?? "1");
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/items") return send(res, 200, items);
    if (path === "/__test/sizes") return send(res, 200, sizes);
    if (path === "/__test/lists") return send(res, 200, lists);
    if (path === "/__test/options") return send(res, 200, options);
    // A choice list added somewhere else, under a dish or a section named
    // by id: another tab, another person.
    if (path === "/__test/add-list") {
      const kind = params.get("home");
      const homeId = params.get("id");
      const row = listRow(
        kind === "dish" ? { item_id: homeId } : { section_id: homeId },
        params.get("lead") ?? "",
        liveListsOf(homeId).length + 1,
      );
      const problem = listProblem(row);
      if (problem) return send(res, ...problem);
      lists.push(row);
      return send(res, 200, row);
    }
    // An option added somewhere else, to a list named by id.
    if (path === "/__test/add-option") {
      const list = lists.find((l) => l.id === params.get("list"));
      if (!list) return send(res, 404, { message: "no such list" });
      const row = optionRow(
        list,
        params.get("name") ?? "",
        liveOptionsOf(list.id).length + 1,
      );
      const problem = optionProblem(row);
      if (problem) return send(res, ...problem);
      options.push(row);
      return send(res, 200, row);
    }
    // An option's allergen lists changed somewhere else; the trigger's
    // rules apply, so a check standing on the option clears.
    if (path === "/__test/set-option-allergens") {
      const option = options.find((o) => o.id === params.get("id"));
      if (!option) return send(res, 404, { message: "no such option" });
      const split = (text) => (text ? text.split(",").filter(Boolean) : []);
      const next = withOptionCheck(option, {
        ...option,
        allergens: split(params.get("allergens")),
        custom_allergens: split(params.get("others")),
        allergens_reviewed: params.get("checked") === "1",
      });
      const problem = optionProblem(next);
      if (problem) return send(res, ...problem);
      Object.assign(option, next);
      return send(res, 200, option);
    }
    // An option renamed somewhere else, which clears its check (D-166).
    if (path === "/__test/rename-option") {
      const option = options.find((o) => o.id === params.get("id"));
      if (!option) return send(res, 404, { message: "no such option" });
      const next = withOptionCheck(option, {
        ...option,
        name: params.get("name") ?? "",
      });
      const problem = optionProblem(next);
      if (problem) return send(res, ...problem);
      Object.assign(option, next);
      return send(res, 200, option);
    }
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
        calories_low: null,
        calories_high: null,
        cooked_to_order: false,
        note: null,
        allergens: [],
        custom_allergens: [],
        allergens_reviewed: false,
        allergens_reviewed_by: null,
        allergens_reviewed_at: null,
        dietary_tags: [],
        available: true,
        sold_out_at: null,
        special_schedule: null,
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
    // A dish's tags, schedule, or availability changed somewhere else:
    // another tab, another person. Migration nine's rules apply.
    if (path === "/__test/set-tags") {
      const dish = items.find((i) => i.id === params.get("id"));
      if (!dish) return send(res, 404, { message: "no such dish" });
      const tags = params.get("tags");
      const next = { ...dish, dietary_tags: tags ? tags.split(",") : [] };
      const problem = itemProblem(next);
      if (problem) return send(res, ...problem);
      Object.assign(dish, next);
      return send(res, 200, dish);
    }
    if (path === "/__test/set-schedule") {
      const dish = items.find((i) => i.id === params.get("id"));
      if (!dish) return send(res, 404, { message: "no such dish" });
      const next = {
        ...dish,
        special_schedule: JSON.parse(params.get("schedule") ?? "null"),
      };
      const problem = itemProblem(next);
      if (problem) return send(res, ...problem);
      Object.assign(dish, next);
      return send(res, 200, dish);
    }
    if (path === "/__test/set-availability") {
      const dish = items.find((i) => i.id === params.get("id"));
      if (!dish) return send(res, 404, { message: "no such dish" });
      const next = {
        ...dish,
        available: params.get("available") !== "0",
        sold_out_at: params.get("sold_out_at") || null,
      };
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
    // The address finder's Google (D-83): what it was asked, read and
    // cleared, and the next Places call told to fail.
    if (path === "/__test/places-log") {
      const log = placesLog;
      placesLog = [];
      return send(res, 200, log);
    }
    if (path === "/__test/places-fail") {
      failPlaces = Number(params.get("times") ?? 1);
      return send(res, 200, { failPlaces });
    }
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
        deleted_at: null,
        created_at: stamp(),
      };
      sections.push(row);
      return send(res, 200, row);
    }
    // Google's Places API (New), for the address finder (D-83).
    if (path === "/v1/places:autocomplete" && req.method === "POST") {
      if (req.headers["x-goog-api-key"] !== PLACES_KEY) {
        return googleError(
          res,
          403,
          "PERMISSION_DENIED",
          "The request is missing a valid API key.",
        );
      }
      const asked = await body(req);
      placesLog.push({
        call: "suggest",
        input: asked.input ?? null,
        session: asked.sessionToken ?? null,
      });
      if (failPlaces > 0) {
        failPlaces -= 1;
        return googleError(
          res,
          500,
          "INTERNAL",
          "the stand-in was told to fail",
        );
      }
      // A match as Google would give one: the typed text is a piece of the
      // place's line, or holds its key word.
      const typed = String(asked.input ?? "").toLowerCase();
      const suggestions = places
        .filter(
          (place) =>
            place.text.toLowerCase().includes(typed) ||
            typed.includes(place.match),
        )
        .map((place) => ({
          placePrediction: {
            place: `places/${place.id}`,
            placeId: place.id,
            text: { text: place.text, matches: [] },
          },
        }));
      return send(res, 200, suggestions.length ? { suggestions } : {});
    }
    if (path.startsWith("/v1/places/") && req.method === "GET") {
      if (req.headers["x-goog-api-key"] !== PLACES_KEY) {
        return googleError(
          res,
          403,
          "PERMISSION_DENIED",
          "The request is missing a valid API key.",
        );
      }
      if (req.headers["x-goog-fieldmask"] !== "addressComponents") {
        return googleError(
          res,
          400,
          "INVALID_ARGUMENT",
          "Unsupported field mask.",
        );
      }
      const id = path.slice("/v1/places/".length);
      placesLog.push({
        call: "pick",
        id,
        session: params.get("sessionToken"),
      });
      if (failPlaces > 0) {
        failPlaces -= 1;
        return googleError(
          res,
          500,
          "INTERNAL",
          "the stand-in was told to fail",
        );
      }
      const place = places.find((each) => each.id === id);
      if (!place) {
        return googleError(res, 404, "NOT_FOUND", "No place was found.");
      }
      return send(res, 200, { addressComponents: place.components });
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
    // The three views anon reads and the one function it runs (migration
    // 12, migration 13): a published restaurant on trial or active with a
    // published menu that is not deleted, each such menu with its snapshot
    // by code and sort, each published dish's state by the menu's id, and
    // the name behind a code whatever the status. A read told to fail
    // answers 500, so a test can prove a failed read is never cached.
    const publishedView =
      path === "/rest/v1/published_restaurants" ||
      path === "/rest/v1/published_menus" ||
      path === "/rest/v1/published_item_states";
    if (publishedView && reading && failReads > 0) {
      failReads -= 1;
      return send(res, 500, {
        code: "XX000",
        message: "the stand-in was told to fail a read",
      });
    }
    if (path === "/rest/v1/published_restaurants" && reading) {
      const rows = publishedRestaurants().filter((row) => matches(row, params));
      return respondRows(req, res, rows, params);
    }
    if (path === "/rest/v1/published_menus" && reading) {
      const rows = publishedMenus().filter((row) => matches(row, params));
      return respondRows(req, res, ordered(rows, params), params);
    }
    if (path === "/rest/v1/published_item_states" && reading) {
      const rows = publishedItemStates().filter((row) => matches(row, params));
      return respondRows(req, res, rows, params);
    }
    if (
      path === "/rest/v1/rpc/restaurant_name_by_code" &&
      req.method === "POST"
    ) {
      const { p_code } = await body(req);
      const found = restaurants().find((row) => row.code === p_code);
      return send(res, 200, found ? [{ name: found.name }] : []);
    }
    // create_restaurant() (migration 2): the caller's new restaurant with
    // the next stand-in code, so a test can prove a code's page clears
    // once the restaurant exists.
    if (path === "/rest/v1/rpc/create_restaurant" && req.method === "POST") {
      const input = await body(req);
      writes.push(`rpc create_restaurant ${JSON.stringify(input.p_name)}`);
      if (await knobs(res)) return;
      if (created.length >= 2) return raised(res, "restaurant_cap");
      const code = nextCode ?? freshCode();
      nextCode = null;
      const row = {
        ...structuredClone(restaurantDefaults),
        id: randomUUID(),
        code,
        name: input.p_name,
        address: input.p_address,
        city: input.p_city,
        region: input.p_region,
        postal_code: input.p_postal_code,
        phone: input.p_phone ?? null,
        website: input.p_website ?? null,
        hours: input.p_hours ?? null,
        timezone: input.p_timezone,
        allergen_note: input.p_allergen_note ?? null,
        prep_notes: input.p_prep_notes ?? [],
        // The column's own default (migration one): a new restaurant
        // starts with icons off, whatever the stand-in's restaurant holds.
        show_icons: false,
      };
      created.push(row);
      return respondRows(req, res, [row], params);
    }
    if (path === "/rest/v1/restaurants" && reading) {
      return respondRows(
        req,
        res,
        restaurants().filter((row) => matches(row, params)),
        params,
      );
    }
    // Save details: the twelve columns the owner may update (migration
    // two's eleven and migration fifteen's show_icons, D-189); any other
    // column is refused as the grant refuses it.
    if (path === "/rest/v1/restaurants" && req.method === "PATCH") {
      const payload = await body(req);
      writes.push(`PATCH restaurants ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      const allowed = [
        "name",
        "address",
        "city",
        "region",
        "postal_code",
        "phone",
        "website",
        "hours",
        "timezone",
        "allergen_note",
        "prep_notes",
        "show_icons",
      ];
      const extra = Object.keys(payload).filter(
        (key) => !allowed.includes(key),
      );
      if (extra.length) return denied(res, `column ${extra[0]}`);
      const found = restaurants().filter((row) => matches(row, params));
      for (const row of found) Object.assign(row, payload);
      return respondRows(req, res, found, params);
    }
    if (path === "/rest/v1/owners") {
      return send(
        res,
        200,
        restaurants().map((row) => ({
          restaurant_id: row.id,
          restaurants: { code: row.code },
        })),
      );
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
          published_at: null,
          published_snapshot: null,
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
    // Publish (migration 12, D-82): the states of a restaurant's live menus,
    // what would block Publish on one, and the two presses, in the database
    // functions' shape. changed is a value comparison of the snapshot the
    // draft would make against the one published, as it is in SQL.
    if (path === "/rest/v1/rpc/menu_publish_states" && req.method === "POST") {
      const { p_restaurant } = await body(req);
      const rows = menus
        .filter(
          (m) => m.restaurant_id === p_restaurant && m.deleted_at === null,
        )
        .sort(
          (a, b) =>
            a.sort - b.sort ||
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        )
        .map((m) => ({
          menu: m.id,
          menu_name: m.name,
          published: m.published,
          published_at: m.published_at ?? null,
          changed: m.published
            ? canonical(menuSnapshot(store(), m.id)) !==
              canonical(m.published_snapshot)
            : null,
        }))
        .filter((row) => matches(row, params));
      return respondRows(req, res, rows, params);
    }
    if (path === "/rest/v1/rpc/publish_problems" && req.method === "POST") {
      const { p_menu } = await body(req);
      const rows = publishProblems(store(), p_menu).filter((row) =>
        matches(row, params),
      );
      return respondRows(req, res, rows, params);
    }
    if (path === "/rest/v1/rpc/publish_menu" && req.method === "POST") {
      const { p_menu } = await body(req);
      writes.push(`rpc publish_menu ${p_menu}`);
      if (await knobs(res)) return;
      const problem = publish(p_menu);
      if (problem) return raised(res, problem);
      res.writeHead(204);
      return res.end();
    }
    if (path === "/rest/v1/rpc/unpublish_menu" && req.method === "POST") {
      const { p_menu } = await body(req);
      writes.push(`rpc unpublish_menu ${p_menu}`);
      if (await knobs(res)) return;
      const problem = unpublish(p_menu);
      if (problem) return raised(res, problem);
      res.writeHead(204);
      return res.end();
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
          deleted_at: null,
          created_at: stamp(),
        };
        const problem = sectionProblem(row);
        if (problem) return send(res, ...problem);
        sections.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = ["name", "note", "sort", "deleted_at"];
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
          calories_low: null,
          calories_high: null,
          cooked_to_order: false,
          note: null,
          allergens: [],
          custom_allergens: [],
          allergens_reviewed: false,
          allergens_reviewed_by: null,
          allergens_reviewed_at: null,
          dietary_tags: [],
          available: true,
          sold_out_at: null,
          special_schedule: null,
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
          calories_low: null,
          calories_high: null,
          deleted_at: null,
          created_at: stamp(),
        };
        const problem = sizeProblem(row);
        if (problem) return send(res, ...problem);
        sizes.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = [
          "name",
          "price_cents",
          "calories_low",
          "calories_high",
          "deleted_at",
        ];
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
      const optionsTold = payload.p_options ?? 0;
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
      } else if (p_kind === "list") {
        const list = lists.find(
          (l) =>
            l.id === p_id && homeOf(l) === p_parent && l.deleted_at === null,
        );
        if (!list) return raised(res, "delete_not_found");
        if (liveOptionsOf(list.id).length > optionsTold)
          return raised(res, "delete_grew");
        list.deleted_at = stamp();
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

    // Choice lists and their options (migration 11, D-166): read, added,
    // written, and marked deleted under the owner's column lists.
    if (path === "/rest/v1/choice_lists") {
      if (reading) {
        const all = lists.filter((row) => matches(row, params));
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
      writes.push(`${req.method} choice_lists ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      if (req.method === "POST" && failByName(res, payload.lead)) return;
      if (req.method === "POST") {
        const allowed = ["item_id", "section_id", "lead", "sort"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        // The copy trigger: the restaurant comes from the home, which the
        // caller must be able to read.
        const home = payload.item_id
          ? items.find((i) => i.id === payload.item_id)
          : sections.find((s) => s.id === payload.section_id);
        if (!home) {
          return raised(
            res,
            "A choice list needs an existing dish or section.",
          );
        }
        const row = {
          id: randomUUID(),
          restaurant_id: home.restaurant_id,
          item_id: payload.item_id ?? null,
          section_id: payload.section_id ?? null,
          lead: payload.lead,
          sort: payload.sort ?? 0,
          deleted_at: null,
          created_at: stamp(),
        };
        const problem = listProblem(row);
        if (problem) return send(res, ...problem);
        lists.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = ["lead", "sort", "deleted_at"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const targets = lists.filter((row) => matches(row, params));
        for (const row of targets) {
          const problem = listProblem({ ...row, ...payload });
          if (problem) return send(res, ...problem);
        }
        for (const row of targets) Object.assign(row, payload);
        return respondRows(req, res, targets, params);
      }
      if (req.method === "DELETE") return denied(res, "table choice_lists");
    }
    if (path === "/rest/v1/choice_options") {
      if (reading) {
        const all = options.filter((row) => matches(row, params));
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
      writes.push(`${req.method} choice_options ${JSON.stringify(payload)}`);
      if (await knobs(res)) return;
      if (req.method === "POST" && failByName(res, payload.name)) return;
      if (req.method === "POST") {
        const allowed = ["choice_list_id", "name", "sort"];
        const extra = Object.keys(payload).filter(
          (key) => !allowed.includes(key),
        );
        if (extra.length) return denied(res, `column ${extra[0]}`);
        const list = lists.find((l) => l.id === payload.choice_list_id);
        if (!list)
          return raised(res, "An option needs an existing choice list.");
        const row = optionRow(list, payload.name, payload.sort ?? 0);
        const problem = optionProblem(row);
        if (problem) return send(res, ...problem);
        options.push(row);
        return respondRows(req, res, [row], params, 201);
      }
      if (req.method === "PATCH") {
        const allowed = [
          "name",
          "added_price_cents",
          "calories_low",
          "calories_high",
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
        const targets = options.filter((row) => matches(row, params));
        const nexts = new Map();
        for (const row of targets) {
          const next = withOptionCheck(row, { ...row, ...payload });
          const problem = optionProblem(next);
          if (problem) return send(res, ...problem);
          nexts.set(row, next);
        }
        for (const row of targets) Object.assign(row, nexts.get(row));
        return respondRows(req, res, targets, params);
      }
      if (req.method === "DELETE") return denied(res, "table choice_options");
    }
    if (
      path === "/rest/v1/rpc/set_choice_list_order" &&
      req.method === "POST"
    ) {
      const { p_home, p_ids } = await body(req);
      writes.push(`rpc set_choice_list_order ${JSON.stringify(p_ids)}`);
      if (await knobs(res)) return;
      const live = liveListsOf(p_home);
      const ids = Array.isArray(p_ids) ? p_ids : [];
      const distinct = new Set(
        ids.filter((id) => live.some((l) => l.id === id)),
      );
      if (
        live.length === 0 ||
        ids.length !== live.length ||
        distinct.size !== live.length
      ) {
        return raised(res, "order_mismatch");
      }
      ids.forEach((id, index) => {
        const row = lists.find((l) => l.id === id);
        row.sort = index + 1;
      });
      res.writeHead(204);
      return res.end();
    }
    if (
      path === "/rest/v1/rpc/set_choice_option_order" &&
      req.method === "POST"
    ) {
      const { p_list, p_ids } = await body(req);
      writes.push(`rpc set_choice_option_order ${JSON.stringify(p_ids)}`);
      if (await knobs(res)) return;
      const live = liveOptionsOf(p_list);
      const ids = Array.isArray(p_ids) ? p_ids : [];
      const distinct = new Set(
        ids.filter((id) => live.some((o) => o.id === id)),
      );
      if (
        live.length === 0 ||
        ids.length !== live.length ||
        distinct.size !== live.length
      ) {
        return raised(res, "order_mismatch");
      }
      ids.forEach((id, index) => {
        const row = options.find((o) => o.id === id);
        row.sort = index + 1;
      });
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
