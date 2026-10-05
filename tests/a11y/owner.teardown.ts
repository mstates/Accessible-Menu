import { createServerClient } from "@supabase/ssr";
import { test as teardown } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { z } from "zod";
import {
  cookieJar,
  ownerEnv,
  ownerFixturePath,
  ownerStatePath,
} from "./owner-env";

// Signs this run's session out, pass or fail, so its refresh token is
// revoked. Local scope: two runs on two commits never sign each other out.
// Then the session file goes, and with it the note of which test menus the
// checks read. When the setup failed before writing the session file, it
// signed itself out and there is nothing more to do here.

const stored = z.object({
  cookies: z.array(z.object({ name: z.string(), value: z.string() })),
});

teardown("the test owner's session is signed out", async () => {
  rmSync(ownerFixturePath, { force: true });
  if (!existsSync(ownerStatePath)) return;
  try {
    const env = ownerEnv();
    const state = stored.parse(
      JSON.parse(readFileSync(ownerStatePath, "utf8")),
    );
    const jar = cookieJar(state.cookies);
    const supabase = createServerClient(env.supabaseUrl, env.supabaseKey, {
      cookies: jar.methods,
    });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error(`sign-out failed: ${error.message}`);
  } finally {
    rmSync(ownerStatePath, { force: true });
  }
});
