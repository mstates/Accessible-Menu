import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RESTAURANT_STATUSES } from "@/domain/billing";
import { parseHours } from "@/domain/hours";
import type { RestaurantDetails, RestaurantInput } from "@/domain/restaurant";
import { PREP_NOTE_IDS } from "@/domain/types";

// Owner-side reads and writes on restaurants, through the owner's own client
// so row level security decides what is visible (D-75) and the table
// constraints decide what is valid (D-95). The only place the row shape is
// known; features see RestaurantDetails.

const columns =
  "id, code, name, address, city, region, postal_code, phone, website, hours, timezone, allergen_note, prep_notes, status, stripe_customer_id";

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
    status: row.status,
    hasStripeCustomer: row.stripe_customer_id !== null,
  };
}

function readRow(data: unknown): RestaurantDetails | null {
  const parsed = rowSchema.safeParse(data);
  return parsed.success ? toDetails(parsed.data) : null;
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
  };
}

export type RestaurantWriteError =
  { kind: "cap" } | { kind: "not-found" } | { kind: "failed" };

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

export async function getOwnerRestaurantByCode(
  client: SupabaseClient,
  code: string,
): Promise<RestaurantDetails | null> {
  const { data, error } = await client
    .from("restaurants")
    .select(columns)
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;
  return readRow(data);
}

// Under row level security a code the caller does not own matches zero rows
// without an error, so the update asks for the row back and reads an empty
// answer as not found.
export async function updateOwnerRestaurant(
  client: SupabaseClient,
  code: string,
  input: RestaurantInput,
): Promise<RestaurantWriteResult> {
  const { data, error } = await client
    .from("restaurants")
    .update(toRow(input))
    .eq("code", code)
    .select(columns)
    .maybeSingle();
  if (error) return { ok: false, error: { kind: "failed" } };
  if (!data) return { ok: false, error: { kind: "not-found" } };
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
