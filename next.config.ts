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

// The build folder. `npm run local` builds against the Supabase stand-in
// into .next-local, so a build against the stand-in never sits in .next,
// where next dev, npm run build, and the gate's build go (D-142). Only the
// two names are taken, so a stray value fails here instead of building
// somewhere surprising.
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
if (distDir !== ".next" && distDir !== ".next-local") {
  throw new Error("NEXT_DIST_DIR must be .next or .next-local.");
}

const nextConfig: NextConfig = {
  distDir,
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
  experimental: {
    // Off, so a page that arrives by a link brings its title in the same
    // commit (D-134). With it on, as Next 16.3 ships, a navigation whose
    // head was not prefetched in full mounts an empty head first and the
    // real one a render later; Next's route announcer reads the title in
    // between, finds none, and reads only the h1. Next's own comment calls
    // that a stopgap for metadata that streams, and ours never does
    // (D-107). Owner links also never prefetch (PageLink), which closes the
    // same gap for a link pressed while its prefetch is on its way. Revisit
    // both at the next Next upgrade.
    optimisticRouting: false,
  },
};

export default nextConfig;
