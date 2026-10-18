import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DishState } from "@/domain/diner";
import { parseHours, type Hours } from "@/domain/hours";
import { parseSchedule } from "@/domain/schedule";
import { menuSnapshotSchema, type MenuSnapshot } from "@/domain/snapshot";
import { PREP_NOTE_IDS, type PrepNoteId } from "@/domain/types";
import { supabaseEnv } from "./env";
import { loggedFetch, shaped } from "./log";

// The diner side's read (D-75, D-170): the three views anon can select,
// through a client that holds no cookies and sets none (module rule 7), so
// the page renders static and no response carries a Set-Cookie, and one
// function anon can run, the restaurant's name by code (Q-84, Q-31,
// migration 13). The only place the view rows are known. A read that
// fails throws, so nothing half-read is ever rendered or cached; a
// snapshot that fails the schema throws too, since a menu is never
// rendered in part. Every failed PostgREST response logs one line
// (Q-64, log.ts).

export function createSupabaseDinerClient(): SupabaseClient {
  return createClient(supabaseEnv.url, supabaseEnv.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: loggedFetch() },
  });
}

export type PublishedRestaurant = {
  id: string;
  code: string;
  name: string;
  website: string | null;
  // The city and the country, for the menu page's markup (D-184); never the
  // street, the phone, or the postal code, which the view does not carry.
  city: string | null;
  country: string;
  hours: Hours | null;
  timezone: string;
  allergenNote: string | null;
  prepNotes: PrepNoteId[];
};

export type PublishedMenu = {
  id: string;
  sort: number;
  publishedAt: string;
  snapshot: MenuSnapshot;
};

export type PublishedDishState = DishState & { id: string };

// What a code resolves to: a restaurant with its published menus in order
// and each menu's dish states; a known restaurant with nothing diners can
// read, by its name alone; or no restaurant at all. Plain data, since the
// cache keeps it as JSON.
export type PublishedRead =
  | {
      kind: "menu";
      restaurant: PublishedRestaurant;
      menus: PublishedMenu[];
      states: Record<string, PublishedDishState[]>;
    }
  | { kind: "unavailable"; name: string }
  | { kind: "unknown" };

const restaurantColumns =
  "id, code, name, website, city, country, hours, timezone, allergen_note, prep_notes";

const restaurantRow = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  hours: z.unknown(),
  timezone: z.string(),
  allergen_note: z.string().nullable(),
  prep_notes: z.array(z.enum(PREP_NOTE_IDS)),
});

const menuColumns = "id, sort, published_at, published_snapshot";

const menuRow = z.object({
  id: z.string(),
  sort: z.number(),
  published_at: z.string(),
  published_snapshot: z.unknown(),
});

const stateColumns = "id, available, sold_out_at, special_schedule";

const stateRow = z.object({
  id: z.string(),
  available: z.boolean(),
  sold_out_at: z.string().nullable(),
  special_schedule: z.unknown(),
});

const nameRow = z.object({ name: z.string() });

function unreadable(table: string): Error {
  // The cause is in the log line the client's fetch wrote (Q-64).
  return new Error(`${table} could not be read`);
}

async function readRestaurant(
  client: SupabaseClient,
  code: string,
): Promise<PublishedRestaurant | null> {
  const { data, error } = await client
    .from("published_restaurants")
    .select(restaurantColumns)
    .eq("code", code)
    .maybeSingle();
  if (error) throw unreadable("published_restaurants");
  if (!data) return null;
  const row = shaped(restaurantRow, data, "published_restaurants");
  if (!row) throw unreadable("published_restaurants");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    website: row.website,
    city: row.city,
    country: row.country,
    // A value that is not the hours shape reads as no hours (D-92).
    hours: parseHours(row.hours),
    timezone: row.timezone,
    allergenNote: row.allergen_note,
    prepNotes: row.prep_notes,
  };
}

async function readMenus(
  client: SupabaseClient,
  code: string,
): Promise<PublishedMenu[]> {
  const { data, error } = await client
    .from("published_menus")
    .select(menuColumns)
    .eq("code", code)
    .order("sort")
    .order("published_at")
    .order("id");
  if (error || !data) throw unreadable("published_menus");
  return data.map((raw) => {
    const row = shaped(menuRow, raw, "published_menus");
    if (!row) throw unreadable("published_menus");
    const snapshot = shaped(
      menuSnapshotSchema,
      row.published_snapshot,
      "published_menus",
    );
    if (!snapshot) throw unreadable("published_menus");
    return {
      id: row.id,
      sort: row.sort,
      publishedAt: row.published_at,
      snapshot,
    };
  });
}

// The state of every dish in one published menu, by the menu's id, which
// the view carries: never by a list of dish ids, which a large menu would
// outgrow a URL with.
async function readStates(
  client: SupabaseClient,
  menuId: string,
): Promise<PublishedDishState[]> {
  const { data, error } = await client
    .from("published_item_states")
    .select(stateColumns)
    .eq("menu_id", menuId);
  if (error || !data) throw unreadable("published_item_states");
  return data.map((raw) => {
    const row = shaped(stateRow, raw, "published_item_states");
    if (!row) throw unreadable("published_item_states");
    return {
      id: row.id,
      available: row.available,
      soldOutAt: row.sold_out_at,
      // A value that is not a schedule reads as none (D-159).
      schedule: parseSchedule(row.special_schedule),
    };
  });
}

async function readName(
  client: SupabaseClient,
  code: string,
): Promise<string | null> {
  const { data, error } = await client.rpc("restaurant_name_by_code", {
    p_code: code,
  });
  if (error || !Array.isArray(data))
    throw unreadable("rpc/restaurant_name_by_code");
  const [first] = data;
  if (first === undefined) return null;
  const row = shaped(nameRow, first, "rpc/restaurant_name_by_code");
  if (!row) throw unreadable("rpc/restaurant_name_by_code");
  return row.name;
}

export async function readPublished(
  client: SupabaseClient,
  code: string,
): Promise<PublishedRead> {
  const [restaurant, menus] = await Promise.all([
    readRestaurant(client, code),
    readMenus(client, code),
  ]);
  if (restaurant === null || menus.length === 0) {
    const name = restaurant?.name ?? (await readName(client, code));
    return name === null ? { kind: "unknown" } : { kind: "unavailable", name };
  }
  const states: Record<string, PublishedDishState[]> = {};
  await Promise.all(
    menus.map(async (menu) => {
      states[menu.id] = await readStates(client, menu.id);
    }),
  );
  return { kind: "menu", restaurant, menus, states };
}
