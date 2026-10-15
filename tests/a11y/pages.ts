import type { Page } from "@playwright/test";
import {
  feedbackPath,
  menuPath,
  statementPath,
} from "../../src/domain/menu-url";
import {
  dashboardPath,
  restaurantDetailsPath,
  restaurantMenusPath,
  restaurantNewPath,
} from "../../src/features/owner/paths";

// The restaurant whose diner pages the gate reads: CI Diner (D-126) on the
// preview, published by its data file, or the stand-in's code when
// `npm run local -- --public-gate` names it. The second published menu's
// page is found from the switcher when the diner spec runs.
export const menuCode = process.env.A11Y_MENU_CODE ?? "56097672";

// Every page the accessibility gate scans signed out. A 404 fails the run;
// nothing skips. Add a page here in the same task that builds it.
export const pages = [
  "/",
  menuPath(menuCode),
  statementPath(menuCode),
  feedbackPath(menuCode),
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
// menus page shows the four menus the test restaurant was given by its
// data file. A menu's own page, a section's own page, and a dish's own page
// are named by an id, which only the setup learns, so those pages get the
// same checks from owner-sections.spec.ts, owner-dishes.spec.ts, and
// owner-dish.spec.ts.
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
// names its nav, in front of the links (D-113). The nav is the one that
// marks a link as current, as the page or, inside a menu, as the part of
// the nav the page sits in (D-122).
export async function restaurantName(page: Page): Promise<string> {
  const nav = page
    .locator("nav")
    .filter({ has: page.locator("a[aria-current]") });
  const labelId = await nav.getAttribute("aria-labelledby");
  if (!labelId) throw new Error("the restaurant nav has no visible label");
  const label = await page.locator(`[id="${labelId}"]`).textContent();
  return label?.trim() ?? "";
}
