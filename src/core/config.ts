import { resolveMenuOrigin, type MenuOriginResult } from "@/domain/menu-url";

// The one config value for the menu origin (D-88, D-96). Read once at
// module load on the server. next.config.ts runs the same rule at build time
// so a production build without a valid MENU_ORIGIN fails instead of
// printing a wrong link.

export type MenuOrigin = { origin: string; permanent: boolean };

export function describeMenuOriginProblem(
  result: Extract<MenuOriginResult, { ok: false }>,
): string {
  return result.reason === "missing-in-production"
    ? "MENU_ORIGIN is required in production: the https origin menu links are printed with, no path (D-88)."
    : "MENU_ORIGIN must be an https origin with no path, query, or trailing slash (D-88).";
}

function readMenuOrigin(): MenuOrigin {
  const result = resolveMenuOrigin({
    MENU_ORIGIN: process.env.MENU_ORIGIN,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  });
  if (!result.ok) throw new Error(describeMenuOriginProblem(result));
  return { origin: result.origin, permanent: result.permanent };
}

export const menuOrigin: MenuOrigin = readMenuOrigin();
