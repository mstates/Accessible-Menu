import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import { loggedFetch } from "./log";

// Service role client for server code that acts for the system rather than
// for a person: the Stripe webhook now, the beacons and the feedback route
// later. It bypasses row level security, so only route handlers import it,
// and never anything that renders for a diner or an owner. Every failed
// PostgREST response it gets logs one line (Q-64, log.ts).
export function createSupabaseAdminClient() {
  return createClient(supabaseEnv.url, supabaseEnv.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: loggedFetch() },
  });
}
