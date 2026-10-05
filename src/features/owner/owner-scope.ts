import type { SupabaseClient } from "@supabase/supabase-js";
import { findOwnerRestaurantId } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";

// The session and ownership check every editing save starts with (D-111),
// for the menus list and for a menu's sections. A failed save must never
// leave the page, so nothing here redirects: a missing session comes back
// as a result and the typed text stays on screen. The code is user input:
// it is checked here, and row level security decides whether the restaurant
// is this owner's, so a wrong owner and an unknown code read the same.
//
// It lives in its own file, not in an actions file: every export of a
// "use server" file is an endpoint a browser can call, and this hands back
// a database client.

export type ScopeProblem =
  { kind: "signed-out" } | { kind: "gone" } | { kind: "failed" };

export type OwnerScope =
  | { ok: true; client: SupabaseClient; restaurantId: string }
  | { ok: false; problem: ScopeProblem };

export async function ownerScope(rawCode: string): Promise<OwnerScope> {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims.email) {
    return { ok: false, problem: { kind: "signed-out" } };
  }
  const code = typeof rawCode === "string" ? normalizeMenuCode(rawCode) : "";
  if (!isMenuCode(code)) return { ok: false, problem: { kind: "gone" } };
  const restaurant = await findOwnerRestaurantId(client, code);
  if (restaurant === "failed") {
    return { ok: false, problem: { kind: "failed" } };
  }
  if (restaurant === "not-found") {
    return { ok: false, problem: { kind: "gone" } };
  }
  return { ok: true, client, restaurantId: restaurant.id };
}
