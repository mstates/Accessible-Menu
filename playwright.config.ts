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

const phone = devices["Pixel 7"];
if (!phone) {
  throw new Error("Playwright no longer ships the Pixel 7 device profile.");
}

const small = { width: 320, height: 640 };
// Every owner file: the setup, the teardown, and each owner-*.spec.ts. The
// public projects leave them all out, and the owner projects run every spec.
const ownerFiles = /owner(\.setup|\.teardown|-[\w-]+\.spec)\.ts$/;
const ownerSpecs = /owner-[\w-]+\.spec\.ts$/;

const publicProjects: Project[] = [
  {
    name: "phone-light",
    use: { ...phone, colorScheme: "light" },
    testIgnore: ownerFiles,
  },
  {
    name: "phone-dark-320",
    use: { ...phone, viewport: small, colorScheme: "dark" },
    testIgnore: ownerFiles,
  },
];

// The session stays on this machine: no trace and no video on any owner
// project, the state file in the temp dir, and a teardown that signs out
// whether the checks passed.
const quiet = { trace: "off", video: "off" } as const;
const ownerUse = { storageState: ownerStatePath, ...quiet };
const ownerProjects: Project[] = [
  {
    name: "owner-setup",
    testMatch: /owner\.setup\.ts$/,
    teardown: "owner-teardown",
    use: quiet,
  },
  { name: "owner-teardown", testMatch: /owner\.teardown\.ts$/, use: quiet },
  {
    name: "owner-phone-light",
    testMatch: ownerSpecs,
    dependencies: ["owner-setup"],
    use: { ...phone, colorScheme: "light", ...ownerUse },
  },
  {
    name: "owner-phone-dark-320",
    testMatch: ownerSpecs,
    dependencies: ["owner-setup"],
    use: { ...phone, viewport: small, colorScheme: "dark", ...ownerUse },
  },
];

export default defineConfig({
  testDir: "tests/a11y",
  fullyParallel: true,
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
