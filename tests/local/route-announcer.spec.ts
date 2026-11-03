import { expect, test, type Page } from "@playwright/test";
import {
  dashboardPath,
  fieldId,
  restaurantDetailsPath,
} from "../../src/features/owner/paths";
import { ownerEnv } from "../a11y/owner-env";

// Next's route announcer kept out of React Aria's hide (Q-127, D-201). An
// in-page move leaves the page's title in the announcer, an assertive alert
// at the end of the body. Opening a Select turns everything outside its
// list inert and closing it gives it all back, and VoiceOver on iOS read the
// announcer that came back, so the title followed the option on the next
// open. The root layout marks the announcer data-live-announcer="true",
// which React Aria's hide passes over. This reaches Details the way an
// owner does, by the dashboard's link, so the announcer holds the title,
// then opens State and reads the announcer marked and never inert while
// main is. On an editing screen main itself never carries inert: the page's
// polite log inside it wears React Aria's top-layer mark (D-123), so React
// Aria walks past main and makes what is in it inert, read here by main's
// heading and the State button, as the gate reads the page behind a dialog.
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

test("after an in-page move to Details, opening State leaves Next's route announcer out of React Aria's hide: the announcer marked and never inert while main is (Q-127, D-201)", async ({
  page,
}) => {
  await page.goto(dashboardPath);
  await page.waitForLoadState("networkidle");
  await page.locator(`main a[href="${details}"]`).click();
  await page.waitForURL(`**${details}`);
  const title = await page.title();
  expect(title, "Details has a title").not.toBe("");
  await expect
    .poll(() => announcerText(page), {
      message: "the in-page move leaves the title in the announcer",
    })
    .toBe(title);

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
});
