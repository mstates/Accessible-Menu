import { expect, test, type Page, type Response } from "@playwright/test";
import { en } from "../../src/copy";
import { NOTICE_COOKIE, type NoticeKey } from "../../src/core/notice";
import type { BannerKind } from "../../src/ui/Banner";
import { expectLandedOutline } from "./checks";

// The flash a page load brings as its result (D-211, D-214 to D-216,
// D-219), shared by the gate and the local specs: a region named by its
// kind's word.
export function flashBanner(page: Page, kind: BannerKind) {
  return page.getByRole("region", {
    name: en.ui.banner[kind],
    exact: true,
  });
}

// The cookie a result leaves for the page it loads (D-211, D-219), for a
// test that reaches the flash without landing the result, as the gate must
// (D-108). The name and path are the ones the banner clears, and the domain
// is the run's own host.
export async function setNotice(page: Page, key: NoticeKey, path: string) {
  const base = test.info().project.use.baseURL;
  if (!base) throw new Error("the notice needs the run's baseURL");
  await page.context().addCookies([
    {
      name: NOTICE_COOKIE,
      value: key,
      domain: new URL(base).hostname,
      path,
      sameSite: "Lax",
    },
  ]);
}

// The flash as it arrives, on the load that read the cookie, GitHub's
// shape (D-214): nothing in the address; the served HTML holds one dismiss
// button carrying autofocus, so the browser focuses it as the page loads,
// before React hydrates; it is focused with the ring; the words sit in one
// alert with aria-atomic, the only alert in main (Next's route announcer is
// an alert of its own under the body); the region is named by its kind's
// word through a level-2 heading; and it is main's first element child,
// above the page's h1 (D-215), reading its dismiss button, its heading,
// then its words, the icon beside them (D-216).
export async function expectFlashArrival(
  page: Page,
  response: Response,
  { kind, words }: { kind: BannerKind; words: string },
) {
  const served = await response.text();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).search, "nothing in the address").toBe("");
  const banner = flashBanner(page, kind);
  await expect(banner).toHaveCount(1);
  const dismiss = banner.getByRole("button", {
    name: en.ui.banner.dismiss,
    exact: true,
  });
  const servedDismiss = [...served.matchAll(/<button\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes(`aria-label="${en.ui.banner.dismiss}"`));
  expect(
    servedDismiss,
    "the served HTML holds one dismiss button",
  ).toHaveLength(1);
  expect(
    servedDismiss[0],
    "the served dismiss button carries autofocus, so the browser focuses it as the page loads",
  ).toMatch(/\sautofocus(=""|\s|>)/);
  await expect(
    dismiss,
    "the dismiss button has focus on arrival",
  ).toBeFocused();
  await expectLandedOutline(page);
  const alert = banner.getByRole("alert");
  await expect(alert, "the words are in one alert").toHaveCount(1);
  await expect(alert).toHaveAttribute("aria-atomic", "true");
  await expect(alert).toHaveText(words);
  await expect(
    page.locator("main").getByRole("alert"),
    "the banner's is the one alert in main",
  ).toHaveCount(1);
  await expect(
    banner.getByRole("heading", {
      level: 2,
      name: en.ui.banner[kind],
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(banner.getByText(words, { exact: true })).toBeVisible();
  const place = await banner.evaluate((section) => {
    const main = section.closest("main");
    const h1 = main?.querySelector("h1");
    return {
      firstInMain: main?.firstElementChild === section,
      // Above the heading in document order: on a dish's page the
      // breadcrumb sits between the two (D-222, D-229).
      aboveHeading:
        h1 !== null &&
        h1 !== undefined &&
        (section.compareDocumentPosition(h1) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      order: [...section.children].map((child) =>
        child.getAttribute("role") === "alert"
          ? "alert"
          : child.tagName.toLowerCase(),
      ),
    };
  });
  expect(place.firstInMain, "the banner is main's first element child").toBe(
    true,
  );
  expect(place.aboveHeading, "the heading comes after the banner").toBe(true);
  expect(
    place.order,
    "the banner reads its dismiss button, its heading, then its words, the icon beside them",
  ).toEqual(["button", "h2", "svg", "alert"]);
  return { banner, dismiss };
}
