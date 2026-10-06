import { defineConfig, devices } from "@playwright/test";
import { ownerStatePath } from "../a11y/owner-env";

// The checks that need a save to land (D-142). The gate never writes
// (D-108, D-115), so these run on this machine only, against the app built
// and served with the Supabase stand-in in this folder. `npm run local`
// starts both and runs them; see run.mjs. The owner setup and teardown are
// the gate's own, so the stand-in is checked the way CI Diner is.
//
// These checks save for real, so the config stops before anything runs
// unless the app and the Supabase address are both on this machine.

const baseURL = process.env.LOCAL_BASE_URL ?? "http://localhost:3200";

function onThisMachine(address: string | undefined): boolean {
  try {
    const { hostname } = new URL(address ?? "");
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

if (
  !onThisMachine(baseURL) ||
  !onThisMachine(process.env.NEXT_PUBLIC_SUPABASE_URL)
) {
  throw new Error(
    "tests/local saves for real, so it runs only against the app and the Supabase stand-in on this machine. Run it with npm run local.",
  );
}

const quiet = { trace: "off", video: "off" } as const;

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, ...quiet },
  projects: [
    {
      name: "owner-setup",
      testDir: "../a11y",
      testMatch: /owner\.setup\.ts$/,
      teardown: "owner-teardown",
    },
    {
      name: "owner-teardown",
      testDir: "../a11y",
      testMatch: /owner\.teardown\.ts$/,
    },
    {
      name: "local",
      testMatch: /\.spec\.ts$/,
      dependencies: ["owner-setup"],
      use: { ...devices["Desktop Chrome"], storageState: ownerStatePath },
    },
  ],
});
