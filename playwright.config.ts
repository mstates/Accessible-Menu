import { existsSync } from "node:fs";
import { defineConfig, devices, type Project } from "@playwright/test";
import { ownerEnv, ownerStatePath } from "./tests/a11y/owner-env";

// Local runs build and serve the app on 3100. To run the same gate against a
// Vercel preview: A11Y_BASE_URL=https://example.vercel.app npm run a11y
const baseURL = process.env.A11Y_BASE_URL ?? "http://localhost:3100";

// Two scopes (D-100). The default scans the public pages signed out, the
// same locally and in CI. A11Y_SCOPE=owner scans the owner pages signed in
// as the test owner and needs five values; missing ones fail the run and
// name themselves. Only the owner scope reads .env.local, where those values
// live locally, so the public run never carries that file's other keys.
const ownerScope = process.env.A11Y_SCOPE === "owner";
if (ownerScope && existsSync(".env.local")) process.loadEnvFile(".env.local");
if (ownerScope) ownerEnv();

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
// in its own projects.
const arrival = /@arrival/;
const forced = /@forced/;

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

const engines: Engine[] = ["chromium", "webkit", "firefox"];
const publicProjects: Project[] = [
  ...engines.flatMap((engine) =>
    sizes.map((size) =>
      project(engine, engine, size, {
        testIgnore: ownerFiles,
        ...(size === "320" || size === "phone" ? {} : { grep: [arrival] }),
      }),
    ),
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
// the two phone sizes, and the walk of arrivals by link at the phone size;
// Firefox's arrival pass at desktop, where NVDA with Firefox meets these
// screens on Windows.
const webkitOwner: Record<Size, RegExp[]> = {
  "320": [arrival, /@dialog/],
  phone: [arrival, /@dialog/, /@link-arrival/],
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
    grep: [arrival],
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
