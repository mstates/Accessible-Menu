import { createServerClient } from "@supabase/ssr";
import { test as setup } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  cookieJar,
  ownerEnv,
  ownerStatePath,
  toStorageState,
} from "./owner-env";

// Signs in the test owner in Node, with no browser, and fails closed before
// any page loads: the user must hold exactly one membership, and that
// restaurant's code must be the configured one (D-100). Messages name
// counts and codes, never a token. A failure after sign-in signs out first,
// since the teardown has no session file to work from yet.

const memberships = z.array(
  z.object({
    restaurant_id: z.string(),
    restaurants: z.object({ code: z.string() }).nullable(),
  }),
);

setup(
  "the test owner signs in and holds exactly one restaurant",
  async ({ baseURL }) => {
    if (!baseURL) throw new Error("the owner checks need a baseURL");
    const env = ownerEnv();
    const jar = cookieJar();
    const supabase = createServerClient(env.supabaseUrl, env.supabaseKey, {
      cookies: jar.methods,
    });
    const signIn = await supabase.auth.signInWithPassword({
      email: env.email,
      password: env.password,
    });
    if (signIn.error) {
      throw new Error(`sign-in failed: ${signIn.error.message}`);
    }
    try {
      const { data, error } = await supabase
        .from("owners")
        .select("restaurant_id, restaurants(code)")
        .eq("user_id", signIn.data.user.id);
      if (error) {
        throw new Error(`could not read memberships: ${error.message}`);
      }
      const codes = memberships
        .parse(data)
        .map((row) => row.restaurants?.code ?? "unknown");
      if (codes.length !== 1 || codes[0] !== env.code) {
        const found =
          codes.length === 0 ? "none" : `${codes.length}: ${codes.join(", ")}`;
        throw new Error(
          `expected one membership with code ${env.code}, found ${found}`,
        );
      }
      writeFileSync(
        ownerStatePath,
        JSON.stringify(toStorageState(jar.cookies, baseURL)),
        { mode: 0o600 },
      );
    } catch (error) {
      await supabase.auth.signOut({ scope: "local" });
      throw error;
    }
  },
);
