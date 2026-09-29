import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

// Server client for Server Components, Server Actions, and Route Handlers.
// Sessions live in cookies on owner routes only; diner pages never call this.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseEnv.url, supabaseEnv.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // proxy.ts refreshes the session there.
        }
      },
    },
  });
}
