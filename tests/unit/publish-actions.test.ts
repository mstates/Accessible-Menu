import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishBlocker } from "../../src/domain/menu";
import { reviewToken } from "../../src/features/owner/menu/review-token";

// publishMenu and unpublishMenu (D-224, D-231), with the owner's scope, the
// database's readers and writers, and the cache stood in. What the owner
// reviewed is what gets published: the press carries the token of the draft
// the page showed, and the action reads the draft again and refuses when it
// is no longer that one, before publish_menu() is ever called. A menu with
// no document is gone, never told to reload. Neither action refreshes the
// page itself: the browser loads it again when a press lands.

const code = "12345678";
const menu = "9d7e6c5b-aaaa-4bbb-8ccc-ddddeeeeffff";
const draft = { v: 1, menu: { id: menu, name: "Dinner" }, sections: [] };
const moved = { v: 1, menu: { id: menu, name: "Supper" }, sections: [] };

type Read = { raw: unknown; snapshot: unknown } | "not-found" | "failed";
type Written =
  | { ok: true }
  | { ok: false; error: { kind: "blocked" | "not-found" | "failed" } };

let signedIn = true;
let read: Read = { raw: draft, snapshot: draft };
let published: Written = { ok: true };
let unpublished: Written = { ok: true };
let blockers: PublishBlocker[] | "throws" = [];
let calls: string[] = [];
const refreshed = vi.fn();

type Actions = typeof import("../../src/features/owner/menu/publish-actions");
let publishMenu: Actions["publishMenu"];
let unpublishMenu: Actions["unpublishMenu"];

beforeAll(async () => {
  vi.doMock("next/cache", () => ({ refresh: refreshed }));
  vi.doMock("../../src/core/cache", () => ({
    expireRestaurant: (which: string) => {
      calls.push(`expire ${which}`);
    },
  }));
  vi.doMock("../../src/features/owner/owner-scope", () => ({
    ownerScope: async (rawCode: string) =>
      signedIn
        ? {
            ok: true,
            client: { for: rawCode },
            restaurantId: "11111111-1111-4111-8111-111111111111",
            userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          }
        : { ok: false, problem: { kind: "signed-out" } },
  }));
  vi.doMock("../../src/core/supabase/menus", () => ({
    readOwnerMenuDraft: async (_client: unknown, id: string) => {
      calls.push(`draft ${id}`);
      return read;
    },
    publishOwnerMenu: async (_client: unknown, id: string) => {
      calls.push(`publish ${id}`);
      return published;
    },
    unpublishOwnerMenu: async (_client: unknown, id: string) => {
      calls.push(`unpublish ${id}`);
      return unpublished;
    },
    listPublishBlockers: async (_client: unknown, id: string) => {
      calls.push(`blockers ${id}`);
      if (blockers === "throws") throw new Error("no");
      return blockers;
    },
  }));
  ({ publishMenu, unpublishMenu } =
    await import("../../src/features/owner/menu/publish-actions"));
});

beforeEach(() => {
  signedIn = true;
  read = { raw: draft, snapshot: draft };
  published = { ok: true };
  unpublished = { ok: true };
  blockers = [];
  calls = [];
  refreshed.mockClear();
});

describe("Publish carries what the review showed (D-224)", () => {
  it("publishes when the draft is still the one the page reviewed, and clears the restaurant's diner pages", async () => {
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: true,
      value: null,
    });
    expect(calls).toEqual([
      `draft ${menu}`,
      `publish ${menu}`,
      `expire ${code}`,
    ]);
  });

  it("takes the same draft whatever order its keys arrive in", async () => {
    read = {
      raw: { sections: [], menu: { name: "Dinner", id: menu }, v: 1 },
      snapshot: draft,
    };
    expect((await publishMenu(code, menu, reviewToken(draft))).ok).toBe(true);
  });

  it("refuses as moved when the draft is no longer that one, with publish_menu() never called and nothing cleared", async () => {
    read = { raw: moved, snapshot: moved };
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "moved" },
    });
    expect(calls).toEqual([`draft ${menu}`]);
  });

  it("says a menu with no document is gone, never that it moved", async () => {
    read = "not-found";
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "gone" },
    });
    expect(calls).toEqual([`draft ${menu}`]);
  });

  it("fails, with nothing published, when the draft cannot be read or the token is not one", async () => {
    read = "failed";
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "failed" },
    });
    expect(calls).toEqual([`draft ${menu}`]);
    calls = [];
    read = { raw: draft, snapshot: draft };
    for (const token of ["", "nope", `${reviewToken(draft)}x`]) {
      expect(await publishMenu(code, menu, token)).toEqual({
        ok: false,
        problem: { kind: "failed" },
      });
    }
    expect(calls, "nothing was read or written for a bad token").toEqual([]);
  });

  it("checks the owner and the menu's id before anything is read", async () => {
    signedIn = false;
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "signed-out" },
    });
    signedIn = true;
    expect(await publishMenu(code, "not-a-menu", reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "gone" },
    });
    expect(calls).toEqual([]);
  });
});

describe("what the database refuses stays as it was (D-139, D-177)", () => {
  it("reads the blockers back for a blocked press, and clears nothing", async () => {
    published = { ok: false, error: { kind: "blocked" } };
    blockers = [{ kind: "no-dishes" }];
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "blocked", blockers: [{ kind: "no-dishes" }] },
    });
    expect(calls).toEqual([
      `draft ${menu}`,
      `publish ${menu}`,
      `blockers ${menu}`,
    ]);
  });

  it("still says blocked when the blockers cannot be read back", async () => {
    published = { ok: false, error: { kind: "blocked" } };
    blockers = "throws";
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "blocked", blockers: [] },
    });
  });

  it("says gone for a menu the function does not find, and failed for the rest", async () => {
    published = { ok: false, error: { kind: "not-found" } };
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "gone" },
    });
    published = { ok: false, error: { kind: "failed" } };
    expect(await publishMenu(code, menu, reviewToken(draft))).toEqual({
      ok: false,
      problem: { kind: "failed" },
    });
    expect(calls.filter((call) => call.startsWith("expire"))).toEqual([]);
  });
});

describe("Unpublish sends no draft, so it carries nothing", () => {
  it("unpublishes and clears the restaurant's diner pages, reading no draft", async () => {
    expect(unpublishMenu).toHaveLength(2);
    expect(await unpublishMenu(code, menu)).toEqual({ ok: true, value: null });
    expect(calls).toEqual([`unpublish ${menu}`, `expire ${code}`]);
  });

  it("says gone or failed when it does not land, and clears nothing", async () => {
    unpublished = { ok: false, error: { kind: "not-found" } };
    expect(await unpublishMenu(code, menu)).toEqual({
      ok: false,
      problem: { kind: "gone" },
    });
    unpublished = { ok: false, error: { kind: "failed" } };
    expect(await unpublishMenu(code, menu)).toEqual({
      ok: false,
      problem: { kind: "failed" },
    });
    expect(calls).toEqual([`unpublish ${menu}`, `unpublish ${menu}`]);
  });
});

describe("neither press refreshes the page itself (D-231)", () => {
  it("leaves the reload to the browser, landed or not", async () => {
    await publishMenu(code, menu, reviewToken(draft));
    await unpublishMenu(code, menu);
    read = { raw: moved, snapshot: moved };
    await publishMenu(code, menu, reviewToken(draft));
    expect(refreshed).not.toHaveBeenCalled();
    // And by the file's own text: it takes nothing from next/cache.
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/owner/menu/publish-actions.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/from\s*["']next\/cache["']/);
    expect(source).not.toMatch(/\brefresh\s*\(\s*\)\s*;/);
  });
});
