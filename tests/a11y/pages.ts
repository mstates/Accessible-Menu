import type { Page } from "@playwright/test";
import {
  dashboardPath,
  restaurantDetailsPath,
  restaurantMenusPath,
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
  // An expired sign-in link, arriving with the page (D-110).
  "/app/sign-in?error=link",
  "/app/restaurants/new",
] as const;

// The owner pages, scanned signed in as the test owner with the one
// restaurant it holds (D-100). Owner paths come from the owner feature. The
// created outcome, a save's result message, and the return from Checkout are
// reached by URL, so the gate never sends a write to see them (D-108). The
// menus page shows the three menus the test restaurant was given by hand.
export function ownerPages(code: string) {
  return [
    dashboardPath,
    `${dashboardPath}?checkout=success`,
    restaurantNewPath(),
    restaurantDetailsPath(code),
    restaurantDetailsPath(code, { created: true }),
    restaurantDetailsPath(code, { saved: 1 }),
    restaurantMenusPath(code),
  ];
}

// The restaurant's name on one of its own pages: the visible text that
// names its nav, in front of the links (D-113).
export async function restaurantName(page: Page): Promise<string> {
  const nav = page
    .locator("nav")
    .filter({ has: page.locator('a[aria-current="page"]') });
  const labelId = await nav.getAttribute("aria-labelledby");
  if (!labelId) throw new Error("the restaurant nav has no visible label");
  const label = await page.locator(`[id="${labelId}"]`).textContent();
  return label?.trim() ?? "";
}
