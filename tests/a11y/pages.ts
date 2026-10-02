import {
  dashboardPath,
  restaurantDetailsPath,
  restaurantNewPath,
} from "../../src/features/owner/paths";

// Every page the accessibility gate scans signed out. A 404 fails the run;
// nothing skips. Add a page here in the same task that builds it.
export const pages = [
  "/",
  "/m/demo",
  "/a11y/demo",
  "/feedback/demo",
  "/d/reading-pa",
  "/app",
  "/app/sign-in",
  "/app/restaurants/new",
] as const;

// The owner pages, scanned signed in as the test owner with the one
// restaurant it holds (D-100). Owner paths come from the owner feature. The
// created outcome and a save's result message are reached by URL, so the
// gate never sends a write to see them (D-108).
export function ownerPages(code: string) {
  return [
    dashboardPath,
    restaurantNewPath(),
    restaurantDetailsPath(code),
    restaurantDetailsPath(code, { created: true }),
    restaurantDetailsPath(code, { saved: 1 }),
  ];
}
