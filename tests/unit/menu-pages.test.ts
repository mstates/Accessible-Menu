import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import type { MenuReview } from "../../src/domain/menu-review";
import {
  MENU_PAGE_HEADING_IDS,
  MENU_PAGE_KEYS,
  MENU_PAGE_SAVING,
  menuPageHeadingId,
  menuPageName,
  menuPageNavItems,
  menuPagePath,
  menuPageSaving,
  menuPageState,
  menuPageStateLine,
  menuPageTitle,
  publishingState,
} from "../../src/features/owner/menu/menu-pages";
import {
  restaurantMenuPagePath,
  restaurantMenuPath,
} from "../../src/features/owner/paths";
import { stateSentence } from "../../src/features/owner/publishing-words";

// The menu's pages as one config (D-224), in the dish's shape: the two in
// order, each page's path, its name, the id its h1 carries, how it saves,
// the state line beside Publishing's name, the nav items with the current
// one marked, the titles, and the Publishing page's own reading of the
// menu's state.

const pages = en.owner.menuPages;
const publishing = en.owner.publishing;
const code = "12345678";
const menu = "9d7e6c5b-aaaa-4bbb-8ccc-ddddeeeeffff";
const sep = en.site.titleSeparator;

describe("the menu's pages (D-224)", () => {
  it("lists Sections, then Publishing, five at most", () => {
    expect(MENU_PAGE_KEYS).toEqual(["sections", "publishing"]);
    expect(MENU_PAGE_KEYS.length).toBeLessThanOrEqual(5);
  });

  it("names the first Sections and the second by its own heading", () => {
    expect(menuPageName("sections", pages, publishing)).toBe("Sections");
    expect(menuPageName("publishing", pages, publishing)).toBe("Publishing");
  });

  it("keeps Sections at the menu's own address and puts Publishing under it", () => {
    expect(menuPagePath(code, menu, "sections")).toBe(
      restaurantMenuPath(code, menu),
    );
    expect(menuPagePath(code, menu, "publishing")).toBe(
      restaurantMenuPagePath(code, menu, "publishing"),
    );
    expect(menuPagePath(code, menu, "publishing")).toBe(
      `${restaurantMenuPath(code, menu)}/publishing`,
    );
  });

  it("gives Publishing's h1 an id, for the flash's dismiss button, and Sections' none (D-225)", () => {
    expect(menuPageHeadingId("sections")).toBeUndefined();
    expect(menuPageHeadingId("publishing")).toBe("menu-publishing-heading");
    expect(MENU_PAGE_HEADING_IDS.publishing).toBe("menu-publishing-heading");
  });

  it("saves the sections as the owner goes, and acts on Publishing by a press (D-223, D-231)", () => {
    expect(MENU_PAGE_SAVING).toEqual({
      sections: "as-you-go",
      publishing: "press",
    });
    expect(menuPageSaving("sections")).toBe("as-you-go");
    expect(menuPageSaving("publishing")).toBe("press");
  });
});

describe("the state line beside Publishing's name", () => {
  it("gives Sections none, as a dish's General has none", () => {
    expect(
      menuPageStateLine("sections", { published: true, changed: true }, pages),
    ).toBeNull();
  });

  it("says Not published yet, Published, or Changes not yet published", () => {
    expect(
      menuPageStateLine(
        "publishing",
        { published: false, changed: false },
        pages,
      ),
    ).toBe("Not published yet");
    expect(
      menuPageStateLine(
        "publishing",
        { published: true, changed: false },
        pages,
      ),
    ).toBe("Published");
    expect(
      menuPageStateLine(
        "publishing",
        { published: true, changed: true },
        pages,
      ),
    ).toBe("Changes not yet published");
  });

  it("reads the state menu_publish_states() reports, a menu not published having nothing compared", () => {
    expect(menuPageState({ published: false, changed: null })).toEqual({
      published: false,
      changed: false,
    });
    expect(menuPageState({ published: true, changed: false })).toEqual({
      published: true,
      changed: false,
    });
    expect(menuPageState({ published: true, changed: true })).toEqual({
      published: true,
      changed: true,
    });
  });
});

describe("the page nav's items", () => {
  it("come in order, each with its address, its name, and its state, the current one marked", () => {
    expect(
      menuPageNavItems(
        code,
        menu,
        "publishing",
        { published: true, changed: true },
        pages,
        publishing,
      ),
    ).toEqual([
      {
        href: restaurantMenuPath(code, menu),
        name: "Sections",
        state: null,
        current: false,
      },
      {
        href: `${restaurantMenuPath(code, menu)}/publishing`,
        name: "Publishing",
        state: "Changes not yet published",
        current: true,
      },
    ]);
    const onSections = menuPageNavItems(
      code,
      menu,
      "sections",
      { published: false, changed: false },
      pages,
      publishing,
    );
    expect(onSections.map((item) => item.current)).toEqual([true, false]);
    expect(onSections[1]?.state).toBe("Not published yet");
  });
});

describe("the titles (D-113, D-225)", () => {
  const names = { menu: "Dinner", restaurant: "Test Bistro" };

  it("names Sections for its menu, as the menu's page has always been", () => {
    expect(menuPageTitle(en, "sections", names)).toBe(
      ["Dinner", "Test Bistro", en.site.name].join(sep),
    );
  });

  it("names Publishing for the page first, then its menu", () => {
    expect(menuPageTitle(en, "publishing", names)).toBe(
      ["Publishing", "Dinner", "Test Bistro", en.site.name].join(sep),
    );
  });
});

describe("the Publishing page's own reading of the menu's state (D-224)", () => {
  const dinner = { id: menu, name: "Dinner" };
  const at = "2026-10-12T03:30:00Z";
  const zone = "America/New_York";
  const since: Extract<MenuReview, { kind: "since" }> = {
    kind: "since",
    changed: false,
    menuRenamed: false,
    dishes: { added: 0, changed: 0, moved: 0, removed: 0, reordered: false },
    sections: { added: 0, changed: 0, removed: 0, reordered: false },
    other: false,
  };

  it("reads a menu with nothing published as not published, with no day and nothing compared", () => {
    const state = publishingState(dinner, null, {
      kind: "first",
      sections: 3,
      dishes: 4,
    });
    expect(state).toEqual({
      id: menu,
      name: "Dinner",
      published: false,
      publishedAt: null,
      changed: null,
    });
    expect(menuPageStateLine("publishing", menuPageState(state), pages)).toBe(
      "Not published yet",
    );
  });

  it("takes whether anything changed from the review, never from another read", () => {
    const same = publishingState(dinner, { publishedAt: at }, since);
    expect(same).toEqual({
      id: menu,
      name: "Dinner",
      published: true,
      publishedAt: at,
      changed: false,
    });
    expect(menuPageStateLine("publishing", menuPageState(same), pages)).toBe(
      "Published",
    );
    const changed = publishingState(
      dinner,
      { publishedAt: at },
      { ...since, changed: true, menuRenamed: true },
    );
    expect(changed.changed).toBe(true);
    expect(menuPageStateLine("publishing", menuPageState(changed), pages)).toBe(
      "Changes not yet published",
    );
  });

  it("reads a published document the reader refuses as published and changed, with its day, so the page still renders and Publish can replace it", () => {
    // What reviewMenu() makes of an unreadable published document.
    const unreadable = { ...since, changed: true, other: true };
    const state = publishingState(dinner, { publishedAt: at }, unreadable);
    expect(state).toEqual({
      id: menu,
      name: "Dinner",
      published: true,
      publishedAt: at,
      changed: true,
    });
    expect(menuPageStateLine("publishing", menuPageState(state), pages)).toBe(
      "Changes not yet published",
    );
    expect(stateSentence(publishing, state, zone, "en")).toBe(
      "Published on October 11, 2026. Changes since then are not published yet.",
    );
  });
});
