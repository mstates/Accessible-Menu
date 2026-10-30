import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { snapshotFromRaw } from "./snapshot-files.mjs";

// The page's accessibility tree, as Playwright computes it, held against a
// committed file (D-194). pageChecks in checks.ts reads it on every page
// the gate visits, in every engine and at every size, once the page has
// settled and every id it points at is on the page, and before the
// keyboard walk moves focus.
//
// What this is: Playwright's own computation of roles, names, heading
// levels, states, and text, the same in every engine, matched deep-equal
// at every depth (playwright.config.ts), so it is a structure net: a
// heading that changes level, a list that stops being a list, a landmark
// that goes, a control that loses its name, a node that appears or
// disappears.
//
// What this is not: not a hearing, which stays with the iPhone sittings;
// not Chrome's own tree, which stays in chrome-names.ts; not the label's
// pieces, which stay in label-shape.ts; and not a check of where a link
// goes. Playwright writes every link's href into a snapshot as a /url line,
// and the stand-in's code and ids differ from CI Diner's, so the committed
// files hold no url line (snapshot-files.mjs drops them). A template with
// no url matches any href, the link's role and name stay pinned, an a
// that loses its href stops being a link and shows in the diff, and the
// targets themselves are held by the one URL builder and its guard (D-88)
// and by the gate's own reads of the skip link, the breadcrumbs, the nav,
// and the switcher.
//
// Left out of the read: Vercel's toolbar on a preview (every element whose
// tag starts with vercel-) and React Aria's announcer under
// [data-live-announcer], whose contents come and go. Both are hidden from
// assistive technology for the length of the read and restored before the
// next step, the way the walk and the controls check already mark what
// they read.
//
// One file per page, named from the page, under tests/a11y/snapshots:
// snapshotName() derives it from a path, with the restaurant's code read as
// "code", and a page whose path is known only when the test runs, or whose
// tree the clock chooses, names its file through PageCheckOptions. Owner
// pages are prefixed "owner-", since the public gate reads /app signed out
// (the sign-in page) and the owner gate reads it signed in (the dashboard).
//
// Dynamic text is a regular expression in the file. An update run writes
// each file from Playwright's raw tree through snapshot-files.mjs, which
// keeps Playwright's own write-time patterns (ids and numbers of two or
// more digits) and adds five rules for what the data files do not fix
// (dates in words, the owner's address, the menu link's origin, the dish
// page's schedule sentence), then reads the page against the file it just
// wrote. Playwright's own writer is not used: it leaves out a text child
// that repeats a control's name, which only its contain mode tolerates and
// the gate's deep-equal match does not. The Dinner page is
// two files by the clock, m-code and m-code-night (pages.ts): the Starters
// soup is a special every day from 4 to 9 pm New York and leaves the page
// from 9 pm to midnight Eastern. The name is chosen in the instant before
// the page is fetched, so the only exposure is D-174's one-second window
// at 9:00:00 pm, the same the diner spec accepts; a red in that second is
// re-run, never papered over.
//
// A task that changes a page updates its snapshots in the same commit, and
// the snapshot's diff is part of that commit's review. Against the stand-in,
// one project per gate, writing every file the run visits again (a page
// that did not change comes out byte for byte the same, so the diff shows
// exactly the pages that changed, and a new page's file appears):
//
//   PUBLIC_GATE_PROJECTS=chromium-phone-light npm run local -- --public-gate --update-snapshots
//   OWNER_GATE_PROJECTS=owner-chromium-phone-light npm run local -- --no-build --owner-gate --update-snapshots
//
// A diner page change also needs the first line run once between 9 pm and
// midnight Eastern, which writes m-code-night. Then every engine and size
// must agree with the files, in both gates:
//
//   npm run local -- --no-build --public-gate
//   npm run local -- --no-build --owner-gate
//
// An engine or a size that disagrees with the shared file is a finding,
// filed as a Question with both trees; the file is never split and the
// difference never hidden behind a pattern.

// The file's name for a path: the restaurant's code as "code", the leading
// slash gone, every run outside letters and digits a dash, the root "home".
export function snapshotName(path: string): string {
  const name = path
    .replace(/\d{8}/g, "code")
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return name === "" ? "home" : name;
}

// The owner gate's files beside the public gate's, in one folder.
export function withScope(name: string): string {
  return process.env.A11Y_SCOPE === "owner" ? `owner-${name}` : name;
}

const MARK = "data-a11y-snapshot-hidden";

// An update run (`npm run local -- --update-snapshots`) writes the page's
// file first, then reads the page against it.
const updating = process.env.A11Y_UPDATE_SNAPSHOTS === "1";

export async function expectAriaSnapshot(
  page: Page,
  name: string,
): Promise<void> {
  const file = `${name}.aria.yml`;
  await page.evaluate((mark) => {
    for (const element of document.querySelectorAll("*")) {
      const ours =
        element.tagName.toLowerCase().startsWith("vercel-") ||
        element.hasAttribute("data-live-announcer");
      if (!ours || element.hasAttribute("aria-hidden")) continue;
      element.setAttribute("aria-hidden", "true");
      element.setAttribute(mark, "");
    }
  }, MARK);
  try {
    if (updating) {
      const path = test.info().snapshotPath(file, { kind: "aria" });
      const raw = await page.locator("body").ariaSnapshot();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, snapshotFromRaw(raw));
      console.log(`A snapshot is written at ${relative(process.cwd(), path)}.`);
    }
    await expect(page.locator("body")).toMatchAriaSnapshot({ name: file });
  } finally {
    await page.evaluate((mark) => {
      for (const element of document.querySelectorAll(`[${mark}]`)) {
        element.removeAttribute("aria-hidden");
        element.removeAttribute(mark);
      }
    }, MARK);
  }
}
