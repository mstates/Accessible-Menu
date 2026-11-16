import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/copy";
import { restaurantDetailsPath } from "../../src/features/owner/paths";
import { ownerEnv, ownerStatePath } from "../a11y/owner-env";
import { flashBanner, setNotice } from "../a11y/saved-banner";
import { saveAndFail, saveAndLand } from "./save";

// The success banner and the back-forward cache (D-211, Michael at the
// plan's approval). A page restored from that cache comes back as it was
// left, banner and all, without loading or running the page's code again,
// so the banner hides itself on a pageshow that says the page was
// persisted, and a Back from an unrelated full load never shows it again.
//
// Reaching that cache from Playwright takes two changes, both here and
// neither in the app, measured on November 6, 2026 (Playwright 1.64.1):
// Playwright starts Chromium with --disable-back-forward-cache, and its
// headless shell kept no page even without the switch, so this file runs
// the full Chromium with the switch left out; and Chromium keeps no page
// served with Cache-Control: no-store, which Next sends for every dynamic
// page, Details included (the navigation entry's notRestoredReasons said
// "response-cache-control-no-store"), so a route serves Details' document
// without it. Playwright's WebKit and Firefox restored no page at all, the
// static home page included, so Safari is heard by hand. These options
// start a worker of their own, so they live at the top of their own file.
test.use({
  channel: "chromium",
  launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
});

const { code } = ownerEnv();
const details = restaurantDetailsPath(code);
const strings = en.owner.restaurants;
const standin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

type Restores = { __restored: boolean[] };

// Details' document without no-store, and each pageshow recorded with
// whether it came from the cache: a restore keeps this page's window, so a
// second entry, true, can only be a restore.
async function prepare(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === details,
    async (route) => {
      const request = route.request();
      if (request.method() !== "GET" || request.headers()["rsc"]) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "cache-control": "private, max-age=0",
        },
      });
    },
  );
  await page.addInitScript(() => {
    const w = window as unknown as Restores;
    w.__restored = [];
    addEventListener("pageshow", (event) => w.__restored.push(event.persisted));
  });
}

test("a Details page restored from the back-forward cache after a full load elsewhere hides its banner (D-211)", async ({
  page,
}) => {
  await prepare(page);
  await setNotice(page, "details-saved", details);

  await page.goto(details);
  await page.waitForLoadState("networkidle");
  const banner = flashBanner(page, "success");
  await expect(banner).toHaveCount(1);

  // A full load elsewhere, as a typed address is, then Back from the page
  // itself: Playwright's goBack waits for a load a restore never fires.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => history.back());
  await expect
    .poll(() => page.evaluate(() => location.pathname).catch(() => ""))
    .toBe(details);
  await expect
    .poll(
      () =>
        page
          .evaluate(() => (window as unknown as Restores).__restored)
          .catch(() => []),
      { message: "Details came back from the back-forward cache" },
    )
    .toEqual([false, true]);
  await expect(page.locator("main h1")).toHaveText(
    en.owner.restaurants.details.heading,
  );
  await expect(banner, "restored, the banner hides itself").toHaveCount(0);
  // The served autofocus left focus on the dismiss button when the page was
  // left (D-214), so the restore sends it to the heading, never to the body.
  await expect(
    page.locator("main h1"),
    "restored, focus that was in the banner goes to the heading",
  ).toBeFocused();
});

// A page restored from that cache comes back as it was left, its form and
// what the form showed with it, so a Back after a full load elsewhere can
// show Details as they were before another tab changed them. The Save
// there must be refused, never written over the change (D-237): the form
// hands back what it showed, and the statement compares it with the row.
test("a Details page restored from the back-forward cache after the details changed elsewhere refuses its Save as moved, with nothing written over", async ({
  page,
  browser,
}) => {
  const field = (on: Page, name: string) =>
    on.getByRole("textbox", { name, exact: true });
  const stored = async () =>
    (await (await fetch(`${standin}/__test/restaurant`)).json()) as {
      phone: string | null;
      allergen_note: string | null;
    };
  await prepare(page);
  try {
    await page.goto(details);
    await page.waitForLoadState("networkidle");
    const origin = new URL(page.url()).origin;

    // A full load elsewhere, a change from another tab while away, then
    // Back from the page itself.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const context = await browser.newContext({ storageState: ownerStatePath });
    try {
      const other = await context.newPage();
      await other.goto(`${origin}${details}`);
      await other.waitForLoadState("networkidle");
      await field(other, strings.fields.allergenNote).fill(
        "Changed while away.",
      );
      await saveAndLand(other, strings.details.submit, strings.details.saved);
    } finally {
      await context.close();
    }
    await page.evaluate(() => history.back());
    await expect
      .poll(() => page.evaluate(() => location.pathname).catch(() => ""))
      .toBe(details);
    await expect
      .poll(
        () =>
          page
            .evaluate(() => (window as unknown as Restores).__restored)
            .catch(() => []),
        { message: "Details came back from the back-forward cache" },
      )
      .toEqual([false, true]);
    await expect(
      field(page, strings.fields.allergenNote),
      "restored, the note is as the page was left",
    ).toHaveValue("");

    await field(page, strings.fields.phone).fill("(610) 555-0100");
    await saveAndFail(
      page,
      strings.details.submit,
      strings.errors.moved,
      strings.errors.summary,
    );
    expect(await stored()).toMatchObject({
      allergen_note: "Changed while away.",
      phone: null,
    });
  } finally {
    // As it was: the row put back, then one Save from a fresh page, which
    // changes nothing and clears the diner pages.
    await fetch(`${standin}/__test/reset-details`);
    await page.goto(details);
    await page.waitForLoadState("networkidle");
    await saveAndLand(page, strings.details.submit, strings.details.saved);
  }
});
