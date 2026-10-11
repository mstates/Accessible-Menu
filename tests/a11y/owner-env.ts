import type { CookieOptions } from "@supabase/ssr";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// The owner checks sign in as the test owner (D-100). Five values, required
// together; the password is the one secret. Missing values fail the run and
// name themselves. They never skip it.
const names = [
  "A11Y_OWNER_EMAIL",
  "A11Y_OWNER_PASSWORD",
  "A11Y_OWNER_CODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

type Name = (typeof names)[number];

export type OwnerEnv = {
  email: string;
  password: string;
  code: string;
  supabaseUrl: string;
  supabaseKey: string;
};

function value(name: Name): string {
  return process.env[name] ?? "";
}

export function ownerEnv(): OwnerEnv {
  const missing = names.filter((name) => value(name) === "");
  if (missing.length > 0) {
    throw new Error(
      `Owner checks need ${missing.join(", ")}. See the Build plan, Phase 1, the CI note (Michael, by hand).`,
    );
  }
  return {
    email: value("A11Y_OWNER_EMAIL"),
    password: value("A11Y_OWNER_PASSWORD"),
    code: value("A11Y_OWNER_CODE"),
    supabaseUrl: value("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseKey: value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

// The session file lives in the runner's temp dir, never under test-results,
// so no artifact can carry it.
export const ownerStatePath = join(
  process.env.RUNNER_TEMP ?? tmpdir(),
  "accessible-menu-owner-state.json",
);

// What the checks need to know about the test restaurant's menus, and can
// only learn once the setup has signed in: which menu holds the sections
// the sections checks read, with how many sections and dishes, since its
// delete question names both; which menu holds none; and, in the first,
// which section holds the dishes the dishes checks read and which holds
// none; in that section, one dish priced each way (D-139), for the dish
// page checks; and the two choice lists the choices checks read (D-166):
// the one on that section and the one on its one-price dish, each with how
// many options it holds. The setup finds them, fails closed when they are
// not there, and writes them beside the session file. Ids, names, and counts
// only, no secret. A menu's page, a section's page, and a dish's page are
// named by an id, so their paths are known when a test runs, never when
// the test files are loaded.
export const ownerFixturePath = join(
  process.env.RUNNER_TEMP ?? tmpdir(),
  "accessible-menu-owner-fixture.json",
);

const fixtureSchema = z.object({
  withSections: z.object({
    id: z.string(),
    name: z.string(),
    sections: z.number(),
    dishes: z.number(),
  }),
  empty: z.object({ id: z.string(), name: z.string() }),
  withDishes: z.object({
    id: z.string(),
    name: z.string(),
    dishes: z.number(),
  }),
  emptySection: z.object({ id: z.string(), name: z.string() }),
  dishes: z.object({
    sizes: z.object({ id: z.string(), name: z.string() }),
    one: z.object({ id: z.string(), name: z.string() }),
    market: z.object({ id: z.string(), name: z.string() }),
  }),
  lists: z.object({
    section: z.object({
      id: z.string(),
      lead: z.string(),
      options: z.number(),
    }),
    dish: z.object({ id: z.string(), lead: z.string(), options: z.number() }),
  }),
});

export type OwnerFixture = z.infer<typeof fixtureSchema>;

// Call inside a test, never at the top of a spec file.
export function ownerFixture(): OwnerFixture {
  let raw: string;
  try {
    raw = readFileSync(ownerFixturePath, "utf8");
  } catch {
    throw new Error(
      "the owner setup has not written the menus and sections the checks read",
    );
  }
  return fixtureSchema.parse(JSON.parse(raw));
}

type Stored = { value: string; options: CookieOptions };
type Jar = Map<string, Stored>;

type Cookie = { name: string; value: string };

// An in-memory cookie store for @supabase/ssr. The library writes the
// session cookies in the shape the app reads them, so nothing here knows
// that format.
export function cookieJar(seed: readonly Cookie[] = []) {
  const cookies: Jar = new Map(
    seed.map((cookie) => [cookie.name, { value: cookie.value, options: {} }]),
  );
  return {
    cookies,
    methods: {
      getAll: () =>
        [...cookies].map(([name, stored]) => ({ name, value: stored.value })),
      setAll: (
        list: { name: string; value: string; options: CookieOptions }[],
      ) => {
        for (const cookie of list) {
          cookies.set(cookie.name, {
            value: cookie.value,
            options: cookie.options,
          });
        }
      },
    },
  };
}

// Playwright storage state for the preview's host. A cleared cookie (an
// empty value) is left out.
export function toStorageState(cookies: Jar, baseURL: string) {
  const url = new URL(baseURL);
  const now = Math.floor(Date.now() / 1000);
  return {
    cookies: [...cookies]
      .filter(([, stored]) => stored.value !== "")
      .map(([name, stored]) => ({
        name,
        value: stored.value,
        domain: url.hostname,
        path: stored.options.path ?? "/",
        expires: stored.options.maxAge ? now + stored.options.maxAge : -1,
        httpOnly: stored.options.httpOnly ?? false,
        secure: url.protocol === "https:",
        sameSite: "Lax" as const,
      })),
    origins: [],
  };
}
