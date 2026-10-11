import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AllergenLists } from "@/domain/allergens";
import { caloriesInputText, type Calories } from "@/domain/calories";
import type {
  ChoiceHome,
  OwnerChoiceList,
  OwnerOption,
} from "@/domain/choices";
import { nameKey, type Held } from "@/domain/menu";
import { priceInputText } from "@/domain/money";
import { ALLERGEN_IDS, type AllergenId } from "@/domain/types";
import { shaped } from "./log";

// Owner-side reads and writes on choice lists and their options (D-166,
// D-167), through the owner's own client so row level security decides
// what is visible (D-75) and the table constraints and triggers decide
// what is valid (migration 11). The tables are called choice_lists and
// choice_options; this is the only file that names them, and the only
// place the row shapes are known. Features see OwnerChoiceList as a row on
// a dish's or a section's page and OwnerOption on the list's own page. A
// delete marks the row and keeps it, so Undo can bring it back; reads
// leave marked rows out. Owners write a list's lead, sort, and deleted_at,
// and an option's name, added price, calories, the two allergen lists, the
// check, sort, and deleted_at, and nothing else: never a list's home or an
// option's list after the insert, and never who checked an option's list
// or when, which the database stamps (D-148). A list's delete goes through
// delete_with_contents(), which counts its live options in the statement
// that marks it (D-119). Nothing here can publish.

const listColumns = "id, item_id, section_id, lead, sort";

const listSchema = z.object({
  id: z.string(),
  item_id: z.string().nullable(),
  section_id: z.string().nullable(),
  lead: z.string(),
  sort: z.number(),
});

type ListRow = z.infer<typeof listSchema>;

// The column a list hangs from for its home: a dish or a section, never
// both (choice_lists_one_home).
function homeColumn(home: ChoiceHome): "item_id" | "section_id" {
  return home.kind === "dish" ? "item_id" : "section_id";
}

function homeOf(row: ListRow): ChoiceHome | null {
  if (row.item_id !== null) return { kind: "dish", id: row.item_id };
  if (row.section_id !== null) return { kind: "section", id: row.section_id };
  return null;
}

// A list as its own page reads it: with its home, which the page reads
// up to its menu.
export type OwnerChoiceListDetail = {
  id: string;
  lead: string;
  home: ChoiceHome;
};

const optionColumns =
  "id, choice_list_id, name, added_price_cents, calories_low, calories_high, allergens, custom_allergens, allergens_reviewed, allergens_reviewed_by, allergens_reviewed_at, sort";

const optionSchema = z.object({
  id: z.string(),
  choice_list_id: z.string(),
  name: z.string(),
  added_price_cents: z.number().nullable(),
  calories_low: z.number().nullable(),
  calories_high: z.number().nullable(),
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  custom_allergens: z.array(z.string()),
  allergens_reviewed: z.boolean(),
  allergens_reviewed_by: z.string().nullable(),
  allergens_reviewed_at: z.string().nullable(),
  sort: z.number(),
});

type OptionRow = z.infer<typeof optionSchema>;

// viewer is the signed-in person, so the page can say a check is theirs.
function toOption(
  row: OptionRow,
  viewer: string | null,
): OwnerOption & { listId: string } {
  return {
    id: row.id,
    listId: row.choice_list_id,
    name: row.name,
    price: priceInputText(row.added_price_cents),
    calories: caloriesInputText(row.calories_low, row.calories_high),
    allergens: row.allergens,
    otherAllergens: row.custom_allergens,
    check:
      row.allergens_reviewed && row.allergens_reviewed_at !== null
        ? {
            at: row.allergens_reviewed_at,
            byYou:
              viewer !== null &&
              row.allergens_reviewed_by !== null &&
              row.allergens_reviewed_by === viewer,
          }
        : null,
  };
}

// Postgres's code for a unique index refusing a row: choice_lists_lead_key
// or choice_options_name_key.
const UNIQUE_VIOLATION = "23505";
// Postgres's code for an error a trigger raises by name.
const RAISED = "P0001";
// Postgres's code for a check constraint refusing a row; the constraint's
// name is the rule.
const CHECK_VIOLATION = "23514";
// What the copy triggers say when the caller cannot read the home or the
// list.
const NO_HOME = "A choice list needs an existing dish or section.";
const NO_LIST = "An option needs an existing choice list.";

export type ChoiceWriteError =
  | { kind: "name-taken" }
  | { kind: "not-found" }
  | { kind: "mismatch" }
  // A delete would have taken more options than the owner was told about.
  | { kind: "grew" }
  // The database refused the row by a named rule of its own; the name is
  // the rule.
  | { kind: "refused"; rule: string }
  | { kind: "failed" };

export type ChoiceWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: ChoiceWriteError };

function refused(
  code: string | undefined,
  message = "",
): ChoiceWriteResult<never> {
  if (code === UNIQUE_VIOLATION)
    return { ok: false, error: { kind: "name-taken" } };
  if (code === RAISED && /^[a-z_]+$/.test(message)) {
    return { ok: false, error: { kind: "refused", rule: message } };
  }
  if (code === CHECK_VIOLATION) {
    const rule = /violates check constraint "([a-z_]+)"/.exec(message)?.[1];
    if (rule) return { ok: false, error: { kind: "refused", rule } };
  }
  return { ok: false, error: { kind: "failed" } };
}

const notFound: ChoiceWriteResult<never> = {
  ok: false,
  error: { kind: "not-found" },
};

const failed: ChoiceWriteResult<never> = {
  ok: false,
  error: { kind: "failed" },
};

// The home's lists that are not deleted, in the owner's order, each with
// how many of its options are not deleted, which decides whether its
// delete asks first and what the question says (D-119). sort alone is not
// a total order, since owners can write it directly, so created_at and id
// settle ties the same way every time. A home's options are few, so they
// are read in one go and counted here. A read that fails throws: an error
// must never look like an empty list.
export async function listOwnerChoiceLists(
  client: SupabaseClient,
  home: ChoiceHome,
): Promise<OwnerChoiceList[]> {
  const { data, error, count } = await client
    .from("choice_lists")
    .select(listColumns, { count: "exact" })
    .eq(homeColumn(home), home.id)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error("choice lists could not be read");
  const rows = shaped(z.array(listSchema), data, "choice_lists");
  if (!rows) throw new Error("choice lists could not be read");
  if (count !== rows.length) {
    throw new Error("choice lists could not be read: the read was cut short");
  }
  if (rows.length === 0) return [];
  const options = await client
    .from("choice_options")
    .select("choice_list_id")
    .in(
      "choice_list_id",
      rows.map((row) => row.id),
    )
    .is("deleted_at", null);
  if (options.error) throw new Error("options could not be counted");
  const counted = shaped(
    z.array(z.object({ choice_list_id: z.string() })),
    options.data,
    "choice_options",
  );
  if (!counted) throw new Error("options could not be counted");
  const held = new Map<string, number>();
  for (const row of counted) {
    held.set(row.choice_list_id, (held.get(row.choice_list_id) ?? 0) + 1);
  }
  return rows.map((row) => ({
    id: row.id,
    lead: row.lead,
    options: held.get(row.id) ?? 0,
  }));
}

// One list of the restaurant that is not deleted, with its home, for its
// own page and for every write on its options. Row level security hides a
// list that is not this owner's, so that, a deleted list, and an id that
// matches nothing all read the same. Whether its home is still there is
// the caller's next question. A read that failed is told apart, so a save
// can say which it was and a page can throw.
export async function findOwnerChoiceList(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
): Promise<OwnerChoiceListDetail | "not-found" | "failed"> {
  const { data, error } = await client
    .from("choice_lists")
    .select(listColumns)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return "failed";
  if (!data) return "not-found";
  const row = shaped(listSchema, data, "choice_lists");
  if (!row) return "failed";
  const home = homeOf(row);
  return home ? { id: row.id, lead: row.lead, home } : "failed";
}

// A new list goes last under its home, with its lead. The trigger takes its
// restaurant from the home, which the caller must be able to read. The
// same read counts the home's live lists, so an add can say how many there
// are once it is in (D-125).
export async function addOwnerChoiceList(
  client: SupabaseClient,
  home: ChoiceHome,
  lead: string,
): Promise<ChoiceWriteResult<{ list: OwnerChoiceList; total: number }>> {
  const last = await client
    .from("choice_lists")
    .select("sort", { count: "exact" })
    .eq(homeColumn(home), home.id)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error || last.count === null) return failed;
  const highest = shaped(
    z.array(z.object({ sort: z.number() })),
    last.data,
    "choice_lists",
  );
  const top = highest?.[0];
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("choice_lists")
    .insert({ [homeColumn(home)]: home.id, lead, sort })
    .select(listColumns)
    .single();
  if (error) {
    return error.message === NO_HOME
      ? notFound
      : refused(error.code, error.message);
  }
  const row = shaped(listSchema, data, "choice_lists");
  return row
    ? {
        ok: true,
        value: {
          list: { id: row.id, lead: row.lead, options: 0 },
          total: last.count + 1,
        },
      }
    : failed;
}

// Writes a list's lead, scoped to the home the page read it under. Under
// row level security a list the caller does not own matches zero rows
// without an error, so the write asks for the row back and reads an empty
// answer as not found. With expected, the write happens only if the lead
// is still that value: an Undo never writes over a newer change.
export async function setOwnerChoiceListLead(
  client: SupabaseClient,
  home: ChoiceHome,
  id: string,
  lead: string,
  expected?: string,
): Promise<ChoiceWriteResult<OwnerChoiceList>> {
  let update = client
    .from("choice_lists")
    .update({ lead })
    .eq("id", id)
    .eq(homeColumn(home), home.id)
    .is("deleted_at", null);
  if (expected !== undefined) update = update.eq("lead", expected);
  const { data, error } = await update.select(listColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(listSchema, data, "choice_lists");
  return row
    ? { ok: true, value: { id: row.id, lead: row.lead, options: 0 } }
    : failed;
}

// Marks a list deleted, through delete_with_contents(): the database counts
// the list's live options in the statement that marks it, and refuses when
// it holds more than the owner was told about (D-119). A list that is not
// under this home, is already deleted, or is not this owner's is not
// found.
export async function deleteOwnerChoiceList(
  client: SupabaseClient,
  home: ChoiceHome,
  id: string,
  told: Held,
): Promise<ChoiceWriteResult<null>> {
  const { error } = await client.rpc("delete_with_contents", {
    p_kind: "list",
    p_parent: home.id,
    p_id: id,
    p_sections: 0,
    p_dishes: 0,
    p_options: told.options,
  });
  if (!error) return { ok: true, value: null };
  if (error.message === "delete_grew") {
    return { ok: false, error: { kind: "grew" } };
  }
  return error.message === "delete_not_found" ? notFound : failed;
}

// Brings a deleted list back, with its options. It fails with name-taken
// while another list of the home has its lead.
export async function restoreOwnerChoiceList(
  client: SupabaseClient,
  home: ChoiceHome,
  id: string,
): Promise<ChoiceWriteResult<OwnerChoiceList>> {
  const { data, error } = await client
    .from("choice_lists")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq(homeColumn(home), home.id)
    .not("deleted_at", "is", null)
    .select(listColumns)
    .maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(listSchema, data, "choice_lists");
  return row
    ? { ok: true, value: { id: row.id, lead: row.lead, options: 0 } }
    : failed;
}

// set_choice_list_order() takes the whole list or nothing: a list that is
// not exactly the home's live lists comes back as a mismatch, which is how
// a page that is out of date finds out.
export async function setOwnerChoiceListOrder(
  client: SupabaseClient,
  home: ChoiceHome,
  ids: readonly string[],
): Promise<ChoiceWriteResult<null>> {
  const { error } = await client.rpc("set_choice_list_order", {
    p_home: home.id,
    p_ids: ids,
  });
  if (!error) return { ok: true, value: null };
  return {
    ok: false,
    error: { kind: error.message === "order_mismatch" ? "mismatch" : "failed" },
  };
}

// The list's options that are not deleted, in the owner's order. The API
// caps how many rows one read returns, so the read asks for the exact
// total too; a read cut short is an error here. A read that fails throws.
export async function listOwnerOptions(
  client: SupabaseClient,
  listId: string,
  viewer: string | null = null,
): Promise<OwnerOption[]> {
  const { data, error, count } = await client
    .from("choice_options")
    .select(optionColumns, { count: "exact" })
    .eq("choice_list_id", listId)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error("options could not be read");
  const rows = shaped(z.array(optionSchema), data, "choice_options");
  if (!rows) throw new Error("options could not be read");
  if (count !== rows.length) {
    throw new Error("options could not be read: the read was cut short");
  }
  return rows.map((row) => {
    const { listId: own, ...option } = toOption(row, viewer);
    void own;
    return option;
  });
}

// One option of the restaurant that is not deleted, with the list it is
// in, for the same-named Apply (D-129). The same things read the same: an
// option that is not this owner's, a deleted one, and an id that matches
// nothing.
export async function findOwnerOption(
  client: SupabaseClient,
  restaurantId: string,
  id: string,
  viewer: string | null = null,
): Promise<(OwnerOption & { listId: string }) | "not-found" | "failed"> {
  const { data, error } = await client
    .from("choice_options")
    .select(optionColumns)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return "failed";
  if (!data) return "not-found";
  const row = shaped(optionSchema, data, "choice_options");
  return row ? toOption(row, viewer) : "failed";
}

// A new option goes last, with a name only (Michael, October 10, 2026).
// The trigger takes its restaurant from the list. The same read counts the
// live options, so an add can say how many there are once it is in.
export async function addOwnerOption(
  client: SupabaseClient,
  listId: string,
  name: string,
): Promise<ChoiceWriteResult<{ option: OwnerOption; total: number }>> {
  const last = await client
    .from("choice_options")
    .select("sort", { count: "exact" })
    .eq("choice_list_id", listId)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error || last.count === null) return failed;
  const highest = shaped(
    z.array(z.object({ sort: z.number() })),
    last.data,
    "choice_options",
  );
  const top = highest?.[0];
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("choice_options")
    .insert({ choice_list_id: listId, name, sort })
    .select(optionColumns)
    .single();
  if (error) {
    return error.message === NO_LIST
      ? notFound
      : refused(error.code, error.message);
  }
  const row = shaped(optionSchema, data, "choice_options");
  return row
    ? {
        ok: true,
        value: { option: toOption(row, null), total: last.count + 1 },
      }
    : failed;
}

// Writes one column of an option, scoped to the list the page read it in.
// Under row level security an option the caller does not own matches zero
// rows without an error, so the write asks for the row back and reads an
// empty answer as not found. With expected, the write happens only if the
// value is still that one: an Undo never writes over a newer change.
async function writeOption(
  client: SupabaseClient,
  listId: string,
  id: string,
  viewer: string | null,
  values: Record<string, unknown>,
  expected: Record<string, string | number | boolean | null>,
): Promise<ChoiceWriteResult<OwnerOption>> {
  let update = client
    .from("choice_options")
    .update(values)
    .eq("id", id)
    .eq("choice_list_id", listId)
    .is("deleted_at", null);
  for (const [column, value] of Object.entries(expected)) {
    update =
      value === null ? update.is(column, null) : update.eq(column, value);
  }
  const { data, error } = await update.select(optionColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(optionSchema, data, "choice_options");
  return row ? { ok: true, value: toOption(row, viewer) } : failed;
}

// An option's name. The database clears the option's check on a rename
// (migration 11), and the answer carries the option whole, so the page
// learns the check as the server holds it now (D-153).
export function renameOwnerOption(
  client: SupabaseClient,
  listId: string,
  id: string,
  viewer: string | null,
  name: string,
  expected?: string,
): Promise<ChoiceWriteResult<OwnerOption>> {
  return writeOption(
    client,
    listId,
    id,
    viewer,
    { name },
    expected === undefined ? {} : { name: expected },
  );
}

// An option's added price, in cents, or null for none.
export function setOwnerOptionPrice(
  client: SupabaseClient,
  listId: string,
  id: string,
  cents: number | null,
  expected?: number | null,
): Promise<ChoiceWriteResult<OwnerOption>> {
  return writeOption(
    client,
    listId,
    id,
    null,
    { added_price_cents: cents },
    expected === undefined ? {} : { added_price_cents: expected },
  );
}

// The two calorie columns a pair of calories lives in, and what a write
// expects of each when the pair is the one the page showed (D-167).
function calorieColumns(calories: Calories | null) {
  return {
    calories_low: calories?.low ?? null,
    calories_high: calories?.high ?? null,
  };
}

// An option's calories, both columns in one statement, or none.
export function setOwnerOptionCalories(
  client: SupabaseClient,
  listId: string,
  id: string,
  calories: Calories | null,
  expected?: Calories | null,
): Promise<ChoiceWriteResult<OwnerOption>> {
  return writeOption(
    client,
    listId,
    id,
    null,
    calorieColumns(calories),
    expected === undefined ? {} : calorieColumns(expected),
  );
}

// Marks an option removed, or brings it back with its lists and its check
// as they were. Bringing one back fails with name-taken while another
// option of the list has its name.
export async function setOwnerOptionDeleted(
  client: SupabaseClient,
  listId: string,
  id: string,
  deleted: boolean,
): Promise<ChoiceWriteResult<OwnerOption>> {
  const update = client
    .from("choice_options")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("choice_list_id", listId);
  const { data, error } = await (
    deleted
      ? update.is("deleted_at", null)
      : update.not("deleted_at", "is", null)
  )
    .select(optionColumns)
    .maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(optionSchema, data, "choice_options");
  return row ? { ok: true, value: toOption(row, null) } : failed;
}

// set_choice_option_order() takes the whole list or nothing.
export async function setOwnerOptionOrder(
  client: SupabaseClient,
  listId: string,
  ids: readonly string[],
): Promise<ChoiceWriteResult<null>> {
  const { error } = await client.rpc("set_choice_option_order", {
    p_list: listId,
    p_ids: ids,
  });
  if (!error) return { ok: true, value: null };
  return {
    ok: false,
    error: { kind: error.message === "order_mismatch" ? "mismatch" : "failed" },
  };
}

// A Postgres array literal, for comparing an array column against the value
// the page showed: {"milk","wheat"}. Every element is quoted, with its
// quotes and backslashes escaped, so any name travels whole. The same as
// the one in dishes.ts, its second use; the third lifts it (module rule
// 12).
function arrayLiteral(values: readonly string[]): string {
  const quoted = values.map(
    (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${quoted.join(",")}}`;
}

// What a write on an option's allergens may set: one or both lists, or the
// check (D-148). Who and when are never written here: the database stamps
// them.
export type OptionAllergenPatch = {
  allergens?: readonly AllergenId[];
  custom_allergens?: readonly string[];
  allergens_reviewed?: boolean;
};

// What the option must still hold for the write to land (D-153): the name
// and the lists the page showed, for every write in the option's group;
// the flag, for an uncheck; the stamp's time, for the Undo of an apply. A
// miss comes back as not found, which the caller reads as the option
// having changed.
export type OptionAllergenExpected = {
  name?: string;
  lists?: AllergenLists;
  allergens_reviewed?: boolean;
  allergens_reviewed_at?: string;
};

// Writes an option's allergen lists or its check, scoped to the list the
// page read the option in, and lands only if the option still holds what
// the page showed (D-153). The database clears the check on any change to
// the name or a list and stamps who and when on a check, in the same
// statement, and answers with the row as it is now. A rule the trigger
// refuses by name comes back as refused with that name.
export async function writeOwnerOptionAllergens(
  client: SupabaseClient,
  listId: string,
  id: string,
  viewer: string | null,
  patch: OptionAllergenPatch,
  expected: OptionAllergenExpected,
): Promise<ChoiceWriteResult<OwnerOption>> {
  const values: Record<string, unknown> = {};
  if (patch.allergens !== undefined) values.allergens = [...patch.allergens];
  if (patch.custom_allergens !== undefined) {
    values.custom_allergens = [...patch.custom_allergens];
  }
  if (patch.allergens_reviewed !== undefined) {
    values.allergens_reviewed = patch.allergens_reviewed;
  }
  let update = client
    .from("choice_options")
    .update(values)
    .eq("id", id)
    .eq("choice_list_id", listId)
    .is("deleted_at", null);
  if (expected.name !== undefined) update = update.eq("name", expected.name);
  if (expected.lists) {
    update = update
      .eq("allergens", arrayLiteral(expected.lists.allergens))
      .eq("custom_allergens", arrayLiteral(expected.lists.others));
  }
  if (expected.allergens_reviewed !== undefined) {
    update = update.eq("allergens_reviewed", expected.allergens_reviewed);
  }
  if (expected.allergens_reviewed_at !== undefined) {
    update = update.eq("allergens_reviewed_at", expected.allergens_reviewed_at);
  }
  const { data, error } = await update.select(optionColumns).maybeSingle();
  if (error) return refused(error.code, error.message);
  if (!data) return notFound;
  const row = shaped(optionSchema, data, "choice_options");
  return row ? { ok: true, value: toOption(row, viewer) } : failed;
}

// A live option elsewhere in the restaurant with the same name as the
// subject, as the same-named offer reads it (D-129, D-166): its lists and
// its check, and the list it is in with that list's home, which the caller
// reads against the live dishes, sections, and menus. Names match the way
// the unique index reads them, whatever the case or outer spaces.
export type SameNamedOption = {
  id: string;
  name: string;
  listId: string;
  lead: string;
  home: ChoiceHome;
  allergens: AllergenId[];
  otherAllergens: string[];
  reviewed: boolean;
};

const sameNamedSchema = z.object({
  id: z.string(),
  name: z.string(),
  choice_list_id: z.string(),
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  custom_allergens: z.array(z.string()),
  allergens_reviewed: z.boolean(),
});

// The restaurant's live options whose name is this one, other than the
// subject itself, each with its live list. The read is narrowed with a
// pattern first, as the dishes' is: the name's backslashes, percent signs,
// and underscores are escaped, and the exact match is made here. A read
// that fails throws.
export async function listOwnerSameNamedOptions(
  client: SupabaseClient,
  restaurantId: string,
  name: string,
  excluding: string | null,
): Promise<SameNamedOption[]> {
  const pattern = `%${name.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await client
    .from("choice_options")
    .select(
      "id, name, choice_list_id, allergens, custom_allergens, allergens_reviewed",
    )
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .ilike("name", pattern);
  if (error) throw new Error("options could not be read");
  const rows = shaped(z.array(sameNamedSchema), data, "choice_options");
  if (!rows) throw new Error("options could not be read");
  const key = nameKey(name);
  const same = rows.filter(
    (row) => row.id !== excluding && nameKey(row.name) === key,
  );
  if (same.length === 0) return [];
  const lists = await client
    .from("choice_lists")
    .select(listColumns)
    .in("id", [...new Set(same.map((row) => row.choice_list_id))])
    .is("deleted_at", null);
  if (lists.error) throw new Error("choice lists could not be read");
  const listRows = shaped(z.array(listSchema), lists.data, "choice_lists");
  if (!listRows) throw new Error("choice lists could not be read");
  const byId = new Map(listRows.map((row) => [row.id, row]));
  return same.flatMap((row) => {
    const list = byId.get(row.choice_list_id);
    const home = list ? homeOf(list) : null;
    if (!list || !home) return [];
    return [
      {
        id: row.id,
        name: row.name,
        listId: list.id,
        lead: list.lead,
        home,
        allergens: row.allergens,
        otherAllergens: row.custom_allergens,
        reviewed: row.allergens_reviewed,
      },
    ];
  });
}

// The other allergens the restaurant's live options already name, as
// stored, repeats included; the domain ranks them with the dishes' (D-149).
// A read that fails throws.
export async function listOwnerOptionOtherAllergenNames(
  client: SupabaseClient,
  restaurantId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("choice_options")
    .select("custom_allergens")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null);
  if (error) throw new Error("other allergens could not be read");
  const rows = shaped(
    z.array(z.object({ custom_allergens: z.array(z.string()) })),
    data,
    "choice_options",
  );
  if (!rows) throw new Error("other allergens could not be read");
  return rows.flatMap((row) => row.custom_allergens);
}
