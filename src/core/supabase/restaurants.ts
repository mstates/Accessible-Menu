import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RESTAURANT_STATUSES } from "@/domain/billing";
import { parseHours } from "@/domain/hours";
import type { RestaurantDetails, RestaurantInput } from "@/domain/restaurant";
import { PREP_NOTE_IDS } from "@/domain/types";
import {
  ADDRESS_BUDGET,
  compareLength,
  holding,
  missed,
  shownTextSchema,
  type Shown,
} from "./compare";
import { compareShed, shaped } from "./log";

// Owner-side reads and writes on restaurants, through the owner's own client
// so row level security decides what is visible (D-75) and the table
// constraints decide what is valid (D-95). The only place the row shape is
// known; features see RestaurantDetails, and the Details page also takes
// the twelve columns it writes as the server returned them, to hand back
// with its save (D-237).

const columns =
  "id, code, name, address, city, region, postal_code, phone, website, hours, timezone, allergen_note, prep_notes, show_icons, status, stripe_customer_id";

// The Details page's read: the same row, with the hours once more as the
// column's own text. A compare of hours is made from that text and never
// from the parsed value: JavaScript's JSON reader rounds a number past
// double precision, and jsonb compares numbers exactly, so an object handed
// back through JSON.parse could fail to match itself.
const detailColumns = `${columns}, hours_text:hours::text`;

const rowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postal_code: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  hours: z.unknown(),
  timezone: z.string(),
  allergen_note: z.string().nullable(),
  prep_notes: z.array(z.enum(PREP_NOTE_IDS)),
  show_icons: z.boolean(),
  status: z.enum(RESTAURANT_STATUSES),
  stripe_customer_id: z.string().nullable(),
});

type Row = z.infer<typeof rowSchema>;

function toDetails(row: Row): RestaurantDetails {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    phone: row.phone,
    website: row.website,
    // A value that is not the hours shape reads as no hours (D-92).
    hours: parseHours(row.hours),
    timezone: row.timezone,
    allergenNote: row.allergen_note,
    prepNotes: row.prep_notes,
    showIcons: row.show_icons,
    status: row.status,
    hasStripeCustomer: row.stripe_customer_id !== null,
  };
}

function readRow(data: unknown): RestaurantDetails | null {
  const row = shaped(rowSchema, data, "restaurants");
  return row ? toDetails(row) : null;
}

// What the Details page showed (D-237): the twelve columns its save writes,
// each as the server returned it, the hours as the column's own text. The
// page holds it from the moment its form mounts and posts it back
// untouched. It is not RestaurantDetails: hours that are not the shape
// read as none there (D-92), and a compare built from that would name
// nothing against a stored object and refuse every save. A text is checked
// for its type and one generous bound, never by its field's rule.
export const restaurantShownSchema = z.strictObject({
  name: shownTextSchema,
  address: shownTextSchema.nullable(),
  city: shownTextSchema.nullable(),
  region: shownTextSchema.nullable(),
  postal_code: shownTextSchema.nullable(),
  phone: shownTextSchema.nullable(),
  website: shownTextSchema.nullable(),
  hours: shownTextSchema.nullable(),
  timezone: shownTextSchema,
  allergen_note: shownTextSchema.nullable(),
  prep_notes: z.array(shownTextSchema).max(32),
  show_icons: z.boolean(),
});

export type RestaurantShown = z.infer<typeof restaurantShownSchema>;

const detailRowSchema = rowSchema.extend({ hours_text: z.string().nullable() });

function toShown(row: z.infer<typeof detailRowSchema>): RestaurantShown {
  return {
    name: row.name,
    address: row.address,
    city: row.city,
    region: row.region,
    postal_code: row.postal_code,
    phone: row.phone,
    website: row.website,
    hours: row.hours_text,
    timezone: row.timezone,
    allergen_note: row.allergen_note,
    prep_notes: row.prep_notes,
    show_icons: row.show_icons,
  };
}

// Every optional field goes over as an explicit null. JSON.stringify drops
// undefined, and a cleared field must reach the column.
function toRow(input: RestaurantInput) {
  return {
    name: input.name,
    address: input.address,
    city: input.city,
    region: input.region,
    postal_code: input.postalCode,
    phone: input.phone ?? null,
    website: input.website ?? null,
    hours: input.hours ?? null,
    timezone: input.timezone,
    allergen_note: input.allergenNote ?? null,
    prep_notes: input.prepNotes,
    // Migration fifteen's column grant (D-189); create_restaurant() has no
    // parameter for it and leaves the column's default, false.
    show_icons: input.showIcons,
  };
}

type RestaurantValues = ReturnType<typeof toRow>;
type DetailsColumn = keyof RestaurantValues & keyof RestaurantShown;

// The twelve columns a Details save writes, in the row's order.
const DETAILS_COLUMNS = [
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
] as const satisfies readonly DetailsColumn[];

// JSON text with its keys in one order at every level, so two values that
// jsonb would call equal give the same text.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries
      .map(([key, each]) => `${JSON.stringify(key)}:${canonical(each)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// Whether the value a save would write is the one the page showed, so the
// column can be left out of a write that would otherwise not fit.
function unchanged(
  column: DetailsColumn,
  values: RestaurantValues,
  shown: RestaurantShown,
): boolean {
  if (column === "hours") {
    if (values.hours === null || shown.hours === null) {
      return values.hours === null && shown.hours === null;
    }
    try {
      return canonical(JSON.parse(shown.hours)) === canonical(values.hours);
    } catch {
      return false;
    }
  }
  if (column === "prep_notes") {
    const next: readonly string[] = values.prep_notes;
    return (
      next.length === shown.prep_notes.length &&
      next.every((note, index) => note === shown.prep_notes[index])
    );
  }
  return values[column] === shown[column];
}

// What one Details save sends: the columns it sets, the compares it names,
// and the columns whose compare it had to leave out.
export type DetailsWrite = {
  set: Partial<RestaurantValues>;
  compares: [DetailsColumn, Shown][];
  shed: DetailsColumn[];
};

// A Details save sets its twelve columns and names all twelve as the page
// showed them (D-237). The compares travel in the request's address, which
// has a ceiling; only a row of several long texts can reach it, an
// allergen note near its cap in a script of three bytes a character among
// them. Past the budget, and only then:
// 1. a column whose value to write is the value shown is left out of both
//    the write and the compare, longest first, until the request fits.
//    Nothing is written to it, so nothing of it can be written over;
// 2. still over, which takes long columns the owner changed in this very
//    save, the compare on the longest of those is left out, and the caller
//    logs its name. This is rule 2's one named exception.
export function planDetailsWrite(
  values: RestaurantValues,
  shown: RestaurantShown,
  budget: number = ADDRESS_BUDGET,
): DetailsWrite {
  const set: Partial<RestaurantValues> = { ...values };
  let compares = DETAILS_COLUMNS.map((column): [DetailsColumn, Shown] => [
    column,
    shown[column],
  ]);
  const size = () =>
    compares.reduce(
      (sum, [column, value]) => sum + compareLength(column, value),
      0,
    );
  const longestFirst = (columns: readonly DetailsColumn[]) =>
    [...columns].sort(
      (a, b) => compareLength(b, shown[b]) - compareLength(a, shown[a]),
    );

  const untouched = longestFirst(
    DETAILS_COLUMNS.filter((column) => unchanged(column, values, shown)),
  );
  for (const column of untouched) {
    if (size() <= budget || compares.length === 1) break;
    delete set[column];
    compares = compares.filter(([each]) => each !== column);
  }

  const shed: DetailsColumn[] = [];
  for (const column of longestFirst(compares.map(([each]) => each))) {
    if (size() <= budget) break;
    compares = compares.filter(([each]) => each !== column);
    shed.push(column);
  }
  return { set, compares, shed };
}

export type RestaurantWriteError =
  | { kind: "cap" }
  | { kind: "not-found" }
  // A Details save found the restaurant holding other values than the page
  // showed (D-237).
  | { kind: "moved" }
  | { kind: "failed" };

export type RestaurantWriteResult =
  | { ok: true; restaurant: RestaurantDetails }
  | { ok: false; error: RestaurantWriteError };

export async function listOwnerRestaurants(
  client: SupabaseClient,
): Promise<RestaurantDetails[]> {
  const { data, error } = await client
    .from("restaurants")
    .select(columns)
    .order("name");
  if (error || !data) return [];
  return data.flatMap((row) => {
    const details = readRow(row);
    return details ? [details] : [];
  });
}

// One restaurant by its code, as the pages under it read it, with what the
// Details page hands back with its save: the twelve columns as returned.
export async function getOwnerRestaurantByCode(
  client: SupabaseClient,
  code: string,
): Promise<{ restaurant: RestaurantDetails; shown: RestaurantShown } | null> {
  const { data, error } = await client
    .from("restaurants")
    .select(detailColumns)
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;
  const row = shaped(detailRowSchema, data, "restaurants");
  return row ? { restaurant: toDetails(row), shown: toShown(row) } : null;
}

// The id behind a code, for writes on the restaurant's own rows. Unlike the
// read above, a read that failed is told apart from a code this owner does
// not hold, so a save can say which it was.
export async function findOwnerRestaurantId(
  client: SupabaseClient,
  code: string,
): Promise<{ id: string } | "not-found" | "failed"> {
  const { data, error } = await client
    .from("restaurants")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) return "failed";
  if (!data) return "not-found";
  const row = shaped(z.object({ id: z.string() }), data, "restaurants");
  return row ?? "not-found";
}

// The Details page's one write (D-237): the twelve columns in one statement
// that lands only if the restaurant still holds the twelve values the page
// showed. Under row level security a code the caller does not own matches
// zero rows without an error, so the update asks for the row back; an empty
// answer is then read once more by code alone, to tell a restaurant that is
// not there from one that moved under the page.
export async function updateOwnerRestaurant(
  client: SupabaseClient,
  code: string,
  input: RestaurantInput,
  shown: RestaurantShown,
): Promise<RestaurantWriteResult> {
  const plan = planDetailsWrite(toRow(input), shown);
  if (plan.shed.length > 0) compareShed("restaurants", plan.shed);
  let update = client.from("restaurants").update(plan.set).eq("code", code);
  for (const [column, value] of plan.compares) {
    update = holding(update, column, value);
  }
  const { data, error } = await update.select(columns).maybeSingle();
  if (error) return { ok: false, error: { kind: "failed" } };
  if (!data) {
    const now = await missed(
      client.from("restaurants").select("id").eq("code", code).maybeSingle(),
      (found) => found,
      () => false,
    );
    const kind = now.kind === "landed" ? "moved" : now.kind;
    return { ok: false, error: { kind } };
  }
  const restaurant = readRow(data);
  if (!restaurant) return { ok: false, error: { kind: "failed" } };
  return { ok: true, restaurant };
}

// create_restaurant() generates the code and makes the caller the first
// member (D-86, D-89). Its error messages are keys; the cap is the one an
// owner can act on, everything else is the generic failure.
export async function createOwnerRestaurant(
  client: SupabaseClient,
  input: RestaurantInput,
): Promise<RestaurantWriteResult> {
  const { data, error } = await client
    .rpc("create_restaurant", {
      p_name: input.name,
      p_address: input.address,
      p_city: input.city,
      p_region: input.region,
      p_postal_code: input.postalCode,
      p_timezone: input.timezone,
      p_phone: input.phone ?? null,
      p_website: input.website ?? null,
      p_hours: input.hours ?? null,
      p_allergen_note: input.allergenNote ?? null,
      p_prep_notes: input.prepNotes,
    })
    .single();
  if (error) {
    const kind = error.message === "restaurant_cap" ? "cap" : "failed";
    return { ok: false, error: { kind } };
  }
  const restaurant = readRow(data);
  if (!restaurant) return { ok: false, error: { kind: "failed" } };
  return { ok: true, restaurant };
}
