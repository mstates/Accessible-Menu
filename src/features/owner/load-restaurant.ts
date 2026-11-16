import { cache } from "react";
import { getOwnerRestaurantByCode } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";

// The restaurant a page under /app/restaurants/[code] belongs to, read once
// per request and shared by the page's metadata and the page itself. The
// session is read first, so a signed-in owner with a bad code gets the 404
// page, never a bounce through sign-in. The path segment is user input: it
// is checked before any query, and row level security hides rows that are
// not this owner's, so a wrong owner and an unknown code look the same
// (D-89). Details, Menus, and a menu's own page all load this way; it left
// the first two for this file when the third arrived (module rule 12).
// The same read gives shown: the twelve columns a Details save writes, as
// the server returned them, which the Details page hands its form to post
// back with the save (D-237).
export const loadRestaurant = cache(async (rawCode: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email ?? null;
  // The signed-in person, for what a page says about who did a thing (D-148).
  const userId = data?.claims.sub ?? null;
  const nothing = { supabase, email, userId, restaurant: null, shown: null };
  if (!email) return nothing;
  const code = normalizeMenuCode(rawCode);
  if (!isMenuCode(code)) return nothing;
  const found = await getOwnerRestaurantByCode(supabase, code);
  return {
    supabase,
    email,
    userId,
    restaurant: found?.restaurant ?? null,
    shown: found?.shown ?? null,
  };
});
