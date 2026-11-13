import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { shaped } from "./log";

// The one read of a dish's sizes that is not the dish's own (D-139),
// through the owner's own client so row level security decides what is
// visible (D-75). The table is called item_sizes; this is the only file
// that names it. A dish's sizes themselves are read and written with the
// dish's General fields, whole, through item_general() and
// save_item_general() in dishes.ts (migration 16, D-237). Nothing here can
// publish.

// The names the restaurant's dishes already use for their sizes, most used
// first and then by name, for the size name field to suggest before the
// starter list (D-139). A read that fails throws.
export async function listOwnerSizeNames(
  client: SupabaseClient,
  restaurantId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("item_sizes")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .not("name", "is", null);
  if (error) throw new Error("size names could not be read");
  const rows = shaped(
    z.array(z.object({ name: z.string() })),
    data,
    "item_sizes",
  );
  if (!rows) throw new Error("size names could not be read");
  const counts = new Map<string, { name: string; uses: number }>();
  for (const row of rows) {
    const name = row.name.trim();
    const key = name.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.uses += 1;
    else counts.set(key, { name, uses: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}
