import { test } from "@playwright/test";
import { pageChecks } from "./checks";
import { pages } from "./pages";

// Every public page, scanned signed out. The checks live in checks.ts and
// are shared with the owner pages.
for (const path of pages) {
  test.describe(path, () => {
    pageChecks(path);
  });
}
