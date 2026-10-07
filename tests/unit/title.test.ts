import { describe, expect, it } from "vitest";
import { en, type Copy } from "../../src/copy";
import { pageTitle } from "../../src/copy/title";

// Owner page titles (D-104): the page, the restaurant when there is one, then
// the site name, joined by the separator in copy. The expected strings are
// built from that separator, so choosing another one by ear changes no test.
const sep = en.site.titleSeparator;
const strings = en.owner.restaurants;

describe("pageTitle", () => {
  it("puts the page first and the site name last", () => {
    expect(pageTitle(en, en.owner.signIn.title)).toBe(
      `Sign in${sep}Accessible Menu`,
    );
  });

  it("names the restaurant between the page and the site", () => {
    expect(pageTitle(en, strings.details.title, "Test Kitchen")).toBe(
      `Details${sep}Test Kitchen${sep}Accessible Menu`,
    );
  });

  // A section's page (D-128): the section, its menu, the restaurant, the
  // site.
  it("names what a page sits inside right after the page", () => {
    expect(pageTitle(en, "Starters", "Test Bistro", "Dinner")).toBe(
      `Starters${sep}Dinner${sep}Test Bistro${sep}Accessible Menu`,
    );
  });

  // A dish's page (D-128): the dish, its section, its menu, the restaurant,
  // the site.
  it("names every level a page sits inside, nearest first", () => {
    expect(
      pageTitle(en, "Soup of the day", "Test Bistro", ["Starters", "Dinner"]),
    ).toBe(
      `Soup of the day${sep}Starters${sep}Dinner${sep}Test Bistro${sep}Accessible Menu`,
    );
  });

  it("keeps an outcome at the front, where it is heard first", () => {
    expect(pageTitle(en, strings.details.createdTitle, "Test Bistro")).toBe(
      `Restaurant created. Details${sep}Test Bistro${sep}Accessible Menu`,
    );
  });

  it("joins with the separator from the copy it is given", () => {
    const copy = {
      ...en,
      site: { ...en.site, titleSeparator: " | " },
    } as unknown as Copy;
    expect(pageTitle(copy, "Details", "Test Kitchen")).toBe(
      "Details | Test Kitchen | Accessible Menu",
    );
  });
});
