import type { NextConfig } from "next";
import { resolveMenuOrigin } from "./src/domain/menu-url";

// The menu origin rule runs at build time too (D-88, D-96): a production
// build without a valid MENU_ORIGIN fails here instead of printing a link
// that points at a deployment URL.
const menuOrigin = resolveMenuOrigin({
  MENU_ORIGIN: process.env.MENU_ORIGIN,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
});
if (!menuOrigin.ok) {
  throw new Error(
    menuOrigin.reason === "missing-in-production"
      ? "MENU_ORIGIN is required in production: the https origin menu links are printed with, no path (D-88)."
      : "MENU_ORIGIN must be an https origin with no path, query, or trailing slash (D-88).",
  );
}

const nextConfig: NextConfig = {
  // next dev would otherwise append an agent-rules block, em dash included,
  // to CLAUDE.md whenever it detects Claude Code. The Next docs it points at
  // are readable at node_modules/next/dist/docs without the block.
  agentRules: false,
  // Metadata never streams (D-107). For every browser Next renders metadata
  // inside a Suspense boundary, so a title that resolves after the shell is
  // written into the body. Matching every user agent makes metadata
  // blocking, so each page's title is in the served head however the page
  // streams later. This setting changes nothing else about streaming.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
