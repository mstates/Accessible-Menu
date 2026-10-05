import { createServerClient } from "@supabase/ssr";
import { test as setup } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  cookieJar,
  ownerEnv,
  ownerFixturePath,
  ownerStatePath,
  toStorageState,
  type OwnerFixture,
} from "./owner-env";

// Signs in the test owner in Node, with no browser, and fails closed before
// any page loads: the user must hold exactly one membership, that
// restaurant's code must be the configured one (D-100), and it must have
// the menus the menus checks read and the sections the sections checks
// read. Messages name counts, codes, and the test menus' names, never a
// token, and say how to fix the data: one file, run by hand in the SQL
// editor, since the gate never writes (D-126). A failure after sign-in signs
// out first, since the teardown has no session file to work from yet.

const MENUS_NEEDED = 3;
const SECTIONS_NEEDED = 3;
const FIX_DATA =
  "Run supabase/checks/ci_diner.sql in the Supabase SQL editor, then re-run the failed jobs.";

const listedMenus = z.array(z.object({ id: z.string(), name: z.string() }));
const heldSections = z.array(z.object({ menu_id: z.string() }));

const memberships = z.array(
  z.object({
    restaurant_id: z.string(),
    restaurants: z.object({ code: z.string() }).nullable(),
  }),
);

setup(
  "the test owner signs in and holds exactly one restaurant, with its menus and sections",
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
      // The menus checks read three rows: a first, a last, and one between
      // with both moves on. The gate never writes, so the menus come from
      // the data file, and their absence stops the run here with the reason.
      const menus = await supabase
        .from("menus")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (menus.error) {
        throw new Error(`could not count menus: ${menus.error.message}`);
      }
      const count = menus.count ?? 0;
      if (count < MENUS_NEEDED) {
        throw new Error(
          `the test restaurant (${env.code}) needs three menus, found ${count}. ${FIX_DATA}`,
        );
      }
      // The sections checks read one menu with a first section, a last one,
      // and one between, and the delete checks also need a menu with none.
      // Which menus those are is found here, in the order the page shows
      // them, and handed to the specs, since a menu's page is named by its
      // id. The gate never writes, so the sections come from the data file.
      const menuRows = await supabase
        .from("menus")
        .select("id, name")
        .is("deleted_at", null)
        .order("sort")
        .order("created_at")
        .order("id");
      if (menuRows.error) {
        throw new Error(`could not read menus: ${menuRows.error.message}`);
      }
      const sectionRows = await supabase
        .from("sections")
        .select("menu_id")
        .is("deleted_at", null);
      if (sectionRows.error) {
        throw new Error(
          `could not read sections: ${sectionRows.error.message}`,
        );
      }
      const held = new Map<string, number>();
      for (const row of heldSections.parse(sectionRows.data)) {
        held.set(row.menu_id, (held.get(row.menu_id) ?? 0) + 1);
      }
      const listed = listedMenus
        .parse(menuRows.data)
        .map((menu) => ({ ...menu, sections: held.get(menu.id) ?? 0 }));
      const withSections = listed.find(
        (menu) => menu.sections >= SECTIONS_NEEDED,
      );
      const empty = listed.find((menu) => menu.sections === 0);
      if (!withSections || !empty) {
        const found = listed
          .map((menu) => `${menu.name} ${menu.sections}`)
          .join(", ");
        throw new Error(
          `the test restaurant (${env.code}) needs one menu with three sections and one menu with none; found ${found}. ${FIX_DATA}`,
        );
      }
      const fixture: OwnerFixture = {
        withSections,
        empty: { id: empty.id, name: empty.name },
      };
      writeFileSync(ownerFixturePath, JSON.stringify(fixture), { mode: 0o600 });
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
