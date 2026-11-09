import { expect, test, type Page } from "@playwright/test";
import {
  dashboardPath,
  fieldId,
  restaurantDetailsPath,
} from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";

// Next's route announcer kept out of React Aria's hide (Q-127, D-201). An
// in-page move leaves the page's title in the announcer, an assertive alert.
// Opening a Select turns everything outside its list inert and closing it
// gives it all back, and VoiceOver on iOS read the announcer that came back,
// so the title followed the option on the next open. The root layout marks
// the announcer data-live-announcer="true", which React Aria's hide passes
// over. This reaches Details the way an owner does, by the dashboard's link,
// so the announcer holds the title, then opens State and reads the
// announcer marked and never inert while main is. On an editing screen main
// itself never carries inert: the page's polite log inside it wears React
// Aria's top-layer mark (D-123), so React Aria walks past main and makes
// what is in it inert, read here by main's heading and the State button, as
// the gate reads the page behind a dialog.
//
// And where the announcer sits (Q-154, D-228). Next appends it to the body.
// Every page mounts inside the root layout's one wrapper, which stays across
// navigations, so the announcer comes after it and only script elements
// follow it; before the wrapper, each link press appended the new page's
// frame after the announcer, and the swipe after the skip link read the
// title just announced. While a list is open React Aria's layer follows it
// too, and goes with the close.
const { code } = ownerEnv();
const details = restaurantDetailsPath(code);

// What Next's route announcer last said, from its open shadow root.
function announcerText(page: Page) {
  return page.evaluate(
    () =>
      document
        .querySelector("next-route-announcer")
        ?.shadowRoot?.querySelector("#__next-route-announcer__")?.textContent ??
      "",
  );
}

const inert = (element: Element) => element.closest("[inert]") !== null;

// The announcer's place in the body: whether it is a child of the body after
// the element that holds main, and the body's element children after it
// other than scripts, "list" for one that holds the open list.
function announcerPlace(page: Page) {
  return page.evaluate(() => {
    const announcer = document.querySelector("next-route-announcer");
    const holder = document.querySelector("main")?.closest("body > *");
    if (!announcer || !holder) return null;
    const list = document.querySelector('[role="listbox"]');
    const after: string[] = [];
    for (
      let node = announcer.nextElementSibling;
      node;
      node = node.nextElementSibling
    ) {
      if (node.localName === "script") continue;
      after.push(list && node.contains(list) ? "list" : node.localName);
    }
    return {
      afterHolder:
        announcer.parentElement === document.body &&
        (holder.compareDocumentPosition(announcer) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      after,
    };
  });
}

test("after an in-page move to Details, Next's route announcer stays after the wrapper that holds every page, and opening State leaves it out of React Aria's hide: the announcer marked and never inert while main is (Q-127, D-201, Q-154, D-228)", async ({
  page,
}) => {
  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  expect
    .soft(
      await page.evaluate(() => {
        const main = document.querySelector("main");
        const holder = main?.closest("body > *");
        return holder !== main && holder?.localName === "div";
      }),
      "main sits inside a div under the body, the root layout's wrapper",
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __holder?: Element | null }).__holder = document
      .querySelector("main")
      ?.closest("body > *");
  });
  await expect
    .poll(() => announcerPlace(page), {
      message:
        "after the load the announcer comes after the wrapper, with only scripts after it",
    })
    .toEqual({ afterHolder: true, after: [] });

  await page.locator(`main a[href="${details}"]`).click();
  await page.waitForURL(`**${details}`);
  const title = await page.title();
  expect(title, "Details has a title").not.toBe("");
  await expect
    .poll(() => announcerText(page), {
      message: "the in-page move leaves the title in the announcer",
    })
    .toBe(title);
  expect(
    await page.evaluate(() => {
      const holder = (window as unknown as { __holder?: Element | null })
        .__holder;
      const main = document.querySelector("main");
      return Boolean(holder?.isConnected && main && holder.contains(main));
    }),
    "the wrapper the dashboard's main sat in stays and holds Details' main",
  ).toBe(true);
  expect(
    await announcerPlace(page),
    "after the in-page move the announcer still comes after the wrapper, with only scripts after it",
  ).toEqual({ afterHolder: true, after: [] });

  const announcer = page.locator("next-route-announcer");
  await expect(announcer).toHaveCount(1);
  expect
    .soft(
      await announcer.getAttribute("data-live-announcer"),
      "the announcer carries React Aria's live announcer mark",
    )
    .toBe("true");

  const state = page.locator(`#${fieldId("region")}`);
  await state.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect
    .poll(() => page.locator("main h1").evaluate(inert), {
      message: "the open list makes main's heading inert",
    })
    .toBe(true);
  expect(
    await state.evaluate(inert),
    "the open list makes the State button inert",
  ).toBe(true);
  expect
    .soft(
      await announcer.evaluate((element) => (element as HTMLElement).inert),
      "the announcer is never inert while the list is open",
    )
    .toBe(false);
  expect
    .soft(
      await announcer.getAttribute("data-live-announcer"),
      "the announcer is still marked while the list is open",
    )
    .toBe("true");
  const open = await announcerPlace(page);
  expect(
    open?.afterHolder,
    "while the list is open the announcer still comes after the wrapper",
  ).toBe(true);
  expect(
    open?.after,
    "the open list's layer comes after the announcer",
  ).toContain("list");

  await page.keyboard.press("Escape");
  await expect(state).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.locator("[inert]"),
    "the close gives the page back",
  ).toHaveCount(0);
  expect(
    await announcer.evaluate((element) => (element as HTMLElement).inert),
    "the announcer is not inert after the close",
  ).toBe(false);
  expect(await announcerText(page), "the announcer still holds the title").toBe(
    title,
  );
  await expect
    .poll(() => announcerPlace(page), {
      message:
        "the close takes React Aria's layer away, and only scripts follow the announcer again",
    })
    .toEqual({ afterHolder: true, after: [] });
});
