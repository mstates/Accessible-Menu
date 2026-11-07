import { loadEnvConfig } from "@next/env";
import { existsSync } from "node:fs";
import { defineConfig, devices, type Project } from "@playwright/test";
import { ownerEnv, ownerStatePath } from "./tests/a11y/owner-env";

// Local runs build and serve the app on 3100. To run the same gate against a
// Vercel preview: A11Y_BASE_URL=https://example.vercel.app npm run a11y
const baseURL = process.env.A11Y_BASE_URL ?? "http://localhost:3100";

// Two scopes (D-100). The default scans the public pages signed out, the
// same locally and in CI. A11Y_SCOPE=owner scans the owner pages signed in
// as the test owner and needs five values; missing ones fail the run and
// name themselves. The owner scope reads .env.local, where those values
// live locally. The public scope takes only the two public Supabase names
// from it, through Next's own loader, so a local build renders the diner
// pages from the live database as the preview does and carries none of
// the file's other keys.
const ownerScope = process.env.A11Y_SCOPE === "owner";
if (ownerScope && existsSync(".env.local")) process.loadEnvFile(".env.local");
if (ownerScope) ownerEnv();
if (!ownerScope && existsSync(".env.local")) {
  const publicNames = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ] as const;
  const before = new Set(Object.keys(process.env));
  const quiet = { info() {}, error() {} };
  const { combinedEnv } = loadEnvConfig(process.cwd(), false, quiet);
  for (const key of Object.keys(process.env)) {
    if (!before.has(key)) delete process.env[key];
  }
  for (const name of publicNames) {
    const value = combinedEnv[name];
    if (value && !before.has(name)) process.env[name] = value;
  }
}

// A device profile Playwright ships, or a clear failure if it is gone.
function device(name: string) {
  const found = devices[name];
  if (!found) {
    throw new Error(`Playwright no longer ships the ${name} device profile.`);
  }
  return found;
}

// Five sizes in three engines (D-137): a 320 phone, a common phone, an iPad
// in portrait and in landscape, and a desktop. Each engine wears its own
// device profile, so WebKit phones and tablets carry touch and an iOS user
// agent. Playwright's Firefox has no mobile mode, so it is desktop Firefox
// at each size, with touch on phones and tablets. Light and dark alternate
// by size, so every engine runs both.
type Engine = "chromium" | "webkit" | "firefox";
type Size = "320" | "phone" | "tablet" | "tablet-landscape" | "desktop";

const tablet = device("iPad Pro 11").viewport;
const tabletLandscape = device("iPad Pro 11 landscape").viewport;
const desktop = { width: 1280, height: 800 };
const firefox = device("Desktop Firefox");

const profiles: Record<Engine, Record<Size, Project["use"]>> = {
  chromium: {
    "320": { ...device("Pixel 7"), viewport: { width: 320, height: 640 } },
    phone: device("Pixel 7"),
    tablet: { ...device("Galaxy Tab S4"), viewport: tablet },
    "tablet-landscape": {
      ...device("Galaxy Tab S4 landscape"),
      viewport: tabletLandscape,
    },
    desktop: { ...device("Desktop Chrome"), viewport: desktop },
  },
  webkit: {
    "320": device("iPhone SE"),
    phone: device("iPhone 17"),
    tablet: device("iPad Pro 11"),
    "tablet-landscape": device("iPad Pro 11 landscape"),
    desktop: { ...device("Desktop Safari"), viewport: desktop },
  },
  firefox: {
    "320": {
      ...firefox,
      viewport: { width: 320, height: 640 },
      hasTouch: true,
    },
    phone: { ...firefox, viewport: device("Pixel 7").viewport, hasTouch: true },
    tablet: { ...firefox, viewport: tablet, hasTouch: true },
    "tablet-landscape": {
      ...firefox,
      viewport: tabletLandscape,
      hasTouch: true,
    },
    desktop: { ...firefox, viewport: desktop },
  },
};

const schemes: Record<Size, "light" | "dark"> = {
  "320": "dark",
  phone: "light",
  tablet: "dark",
  "tablet-landscape": "light",
  desktop: "dark",
};

const sizes = Object.keys(schemes) as Size[];

// What a project runs, by tag. The two phone sizes in Chromium run every
// test, as the gate did before (D-100); every other project runs the
// arrival pass and what is named for it. The forced-colors pass runs only
// in its own projects. The flash tests (D-214, D-219) also run in WebKit
// at phone size, the iPhone's engine, and in Firefox at desktop, where
// NVDA with Firefox meets these screens on Windows.
const arrival = /@arrival/;
const forced = /@forced/;
const flash = /@saved-banner/;

function project(
  name: string,
  engine: Engine,
  size: Size,
  extra: Partial<Project> & { grep?: RegExp[] },
): Project {
  return {
    name: `${name}-${size}-${schemes[size]}`,
    grepInvert: forced,
    ...extra,
    use: {
      ...profiles[engine][size],
      browserName: engine,
      colorScheme: schemes[size],
      ...extra.use,
    },
  };
}

// Forced colors at desktop, where Windows contrast themes mostly live, in
// both of Chromium's forced palettes, chosen by the color scheme.
function forcedProjects(name: string, extra: Partial<Project>): Project[] {
  return (["dark", "light"] as const).map((scheme) => ({
    name: `${name}-desktop-forced-${scheme}`,
    grep: forced,
    ...extra,
    use: {
      ...profiles.chromium.desktop,
      browserName: "chromium",
      colorScheme: scheme,
      forcedColors: "active",
      ...extra.use,
    },
  }));
}

// Every owner file: the setup, the teardown, and each owner-*.spec.ts. The
// public projects leave them all out, and the owner projects run every spec.
const ownerFiles = /owner(\.setup|\.teardown|-[\w-]+\.spec)\.ts$/;
const ownerSpecs = /owner-[\w-]+\.spec\.ts$/;

// The public pages: every test at the two phone sizes, the arrival pass at
// the rest, and the sign-in flash (D-219) in Firefox at desktop as well.
function publicGrep(engine: Engine, size: Size): RegExp[] | undefined {
  if (size === "320" || size === "phone") return undefined;
  return engine === "firefox" && size === "desktop"
    ? [arrival, flash]
    : [arrival];
}

const engines: Engine[] = ["chromium", "webkit", "firefox"];
const publicProjects: Project[] = [
  ...engines.flatMap((engine) =>
    sizes.map((size) => {
      const grep = publicGrep(engine, size);
      return project(engine, engine, size, {
        testIgnore: ownerFiles,
        ...(grep ? { grep } : {}),
      });
    }),
  ),
  ...forcedProjects("chromium", { testIgnore: ownerFiles }),
];

// The session stays on this machine: no trace and no video on any owner
// project, the state file in the temp dir, and a teardown that signs out
// whether the checks passed.
const quiet = { trace: "off", video: "off" } as const;
const ownerUse = { storageState: ownerStatePath, ...quiet };
const owner = { testMatch: ownerSpecs, dependencies: ["owner-setup"] };

// Owner screens: Chromium in full at the two phone sizes and the arrival
// pass at the rest; WebKit's arrival pass at every size, its dialog tests at
// the two phone sizes, and at the phone size, the iPhone's engine, the walk
// of arrivals by link, the pending message (D-210), and the flashes after a
// save and after Checkout (D-214, D-219); Firefox's arrival pass and the
// flashes at desktop, where NVDA with Firefox meets these screens on
// Windows.
const webkitOwner: Record<Size, RegExp[]> = {
  "320": [arrival, /@dialog/],
  phone: [arrival, /@dialog/, /@link-arrival/, /@pending-message/, flash],
  tablet: [arrival],
  "tablet-landscape": [arrival],
  desktop: [arrival],
};
const ownerProjects: Project[] = [
  {
    name: "owner-setup",
    testMatch: /owner\.setup\.ts$/,
    teardown: "owner-teardown",
    use: quiet,
  },
  { name: "owner-teardown", testMatch: /owner\.teardown\.ts$/, use: quiet },
  ...sizes.map((size) =>
    project("owner-chromium", "chromium", size, {
      ...owner,
      ...(size === "320" || size === "phone" ? {} : { grep: [arrival] }),
      use: ownerUse,
    }),
  ),
  ...forcedProjects("owner-chromium", { ...owner, use: ownerUse }),
  ...sizes.map((size) =>
    project("owner-webkit", "webkit", size, {
      ...owner,
      grep: webkitOwner[size],
      use: ownerUse,
    }),
  ),
  project("owner-firefox", "firefox", "desktop", {
    ...owner,
    grep: [arrival, flash],
    use: ownerUse,
  }),
];

export default defineConfig({
  testDir: "tests/a11y",
  fullyParallel: true,
  // A private repository's runner has two cores, where Playwright would
  // start one worker. The checks mostly wait on the preview, so two.
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The new-restaurant page preselects the browser's time zone. A UTC
    // runner matches nothing and falls back to Eastern; this zone keeps a
    // Mac in another zone from reading a different tree than CI reads, so
    // the shared aria snapshots (D-194) hold on every machine.
    timezoneId: "America/New_York",
  },
  // The aria snapshots (D-194): one file per page under tests/a11y/snapshots,
  // named by the page alone, never by the project or the platform, so every
  // engine, size, and operating system reads the same file; and the page's
  // whole tree, deep-equal at every depth, so an added node fails as a
  // missing one does. See tests/a11y/aria-snapshot.ts.
  expect: {
    toMatchAriaSnapshot: {
      pathTemplate: "{testDir}/snapshots/{arg}{ext}",
      children: "deep-equal",
    },
  },
  projects: ownerScope ? ownerProjects : publicProjects,
  webServer: process.env.A11Y_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3100",
        url: "http://localhost:3100",
        // Owner routes need Supabase settings to build. Placeholders let the
        // gate run on a machine without .env.local; nothing signs in here.
        env: {
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ??
            "https://placeholder.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
            "sb_publishable_placeholder",
        },
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
