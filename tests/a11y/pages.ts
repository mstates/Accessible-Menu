// Every page the accessibility gate scans. A 404 fails the run; nothing skips.
// Add a page here in the same task that builds it.
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
