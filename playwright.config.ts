import { defineConfig, devices } from "@playwright/test";

// Local runs build and serve the app on 3100. To run the same gate against a
// Vercel preview: A11Y_BASE_URL=https://example.vercel.app npm run a11y
const baseURL = process.env.A11Y_BASE_URL ?? "http://localhost:3100";

const phone = devices["Pixel 7"];
if (!phone) {
  throw new Error("Playwright no longer ships the Pixel 7 device profile.");
}

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
  projects: [
    {
      name: "phone-light",
      use: { ...phone, colorScheme: "light" },
    },
    {
      name: "phone-dark-320",
      use: {
        ...phone,
        viewport: { width: 320, height: 640 },
        colorScheme: "dark",
      },
    },
  ],
  webServer: process.env.A11Y_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
