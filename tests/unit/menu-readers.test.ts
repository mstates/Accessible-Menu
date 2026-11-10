import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readOwnerMenuDraft,
  readOwnerMenuPublished,
} from "../../src/core/supabase/menus";
import { menuSnapshotSchema } from "../../src/domain/snapshot";

// The two reads behind the review on a menu's Publishing page (D-224), with
// the Supabase client stood in: what is published, in one statement, and
// the draft as menu_snapshot() builds it. A published snapshot the v1
// reader refuses must never fail the read: the page still renders and
// Publish replaces it (Michael, November 10, 2026). A draft the reader
// refuses is a failed read, never a guess.

const fixture: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../fixtures/menu-snapshot.v1.json", import.meta.url),
    ),
    "utf8",
  ),
);

const restaurant = "11111111-1111-4111-8111-111111111111";
const menu = "9d7e6c5b-aaaa-4bbb-8ccc-ddddeeeeffff";
const at = "2026-10-12T03:30:00.123456+00:00";

type Answer = { data: unknown; error: { message: string } | null };

// A client that answers the one table read and the one function call these
// readers make, and keeps what each was asked.
function standIn(answers: { row?: Answer; draft?: Answer }) {
  const asked: unknown[][] = [];
  const builder = {
    select: (columns: string) => {
      asked.push(["select", columns]);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      asked.push(["eq", column, value]);
      return builder;
    },
    is: (column: string, value: unknown) => {
      asked.push(["is", column, value]);
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve(answers.row ?? { data: null, error: null }),
  };
  const client = {
    from: (table: string) => {
      asked.push(["from", table]);
      return builder;
    },
    rpc: (name: string, args: unknown, options: unknown) => {
      asked.push(["rpc", name, args, options]);
      return Promise.resolve(answers.draft ?? { data: null, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, asked };
}

const row = (data: unknown): { row: Answer } => ({
  row: { data, error: null },
});
const draft = (data: unknown): { draft: Answer } => ({
  draft: { data, error: null },
});

// A size with no name: what a draft may hold and a published snapshot never
// does (D-139).
function withBlankSize(): unknown {
  const document = structuredClone(fixture) as {
    sections: {
      items: { price: { kind: string; sizes?: { name: string | null }[] } }[];
    }[];
  };
  const size = document.sections[0]?.items[0]?.price.sizes?.[0];
  if (!size) throw new Error("the fixture's first dish is by size");
  size.name = null;
  return document;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what is published of one menu", () => {
  it("is read in one statement: the flag, the time, and the snapshot, for this restaurant's live menu", async () => {
    const { client, asked } = standIn(
      row({ published: true, published_at: at, published_snapshot: fixture }),
    );
    await readOwnerMenuPublished(client, restaurant, menu);
    expect(asked).toEqual([
      ["from", "menus"],
      ["select", "published, published_at, published_snapshot"],
      ["eq", "id", menu],
      ["eq", "restaurant_id", restaurant],
      ["is", "deleted_at", null],
    ]);
  });

  it("comes back as the time and the parsed snapshot", async () => {
    const { client } = standIn(
      row({ published: true, published_at: at, published_snapshot: fixture }),
    );
    expect(await readOwnerMenuPublished(client, restaurant, menu)).toEqual({
      publishedAt: at,
      snapshot: menuSnapshotSchema.parse(fixture),
    });
  });

  it("is nothing for a menu that is not published", async () => {
    const { client } = standIn(
      row({ published: false, published_at: null, published_snapshot: null }),
    );
    expect(await readOwnerMenuPublished(client, restaurant, menu)).toBeNull();
  });

  it("hands back a snapshot that does not parse as v1 as unreadable, with its time, and does not throw", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const snapshot of [
      { ...(fixture as object), v: 2 },
      withBlankSize(),
      { some: "other shape" },
      "not a document",
    ]) {
      const { client } = standIn(
        row({
          published: true,
          published_at: at,
          published_snapshot: snapshot,
        }),
      );
      expect(await readOwnerMenuPublished(client, restaurant, menu)).toEqual({
        publishedAt: at,
        snapshot: "unreadable",
      });
    }
    // Each miss leaves its line in the log, naming where it was read and
    // never the value (Q-64).
    expect(logged).toHaveBeenCalledTimes(4);
    for (const [line] of logged.mock.calls) {
      expect(line).toContain("menus.published_snapshot");
      expect(line).not.toContain("other shape");
    }
  });

  it("tells a menu that is not there from a read that failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await readOwnerMenuPublished(standIn({}).client, restaurant, menu),
    ).toBe("not-found");
    expect(
      await readOwnerMenuPublished(
        standIn({ row: { data: null, error: { message: "no" } } }).client,
        restaurant,
        menu,
      ),
    ).toBe("failed");
    expect(
      await readOwnerMenuPublished(
        standIn(row({ published: "yes" })).client,
        restaurant,
        menu,
      ),
    ).toBe("failed");
  });
});

describe("the draft as a Publish would send it now", () => {
  it("is read through menu_snapshot() as a GET, by the menu's id", async () => {
    const { client, asked } = standIn(draft(fixture));
    await readOwnerMenuDraft(client, menu);
    expect(asked).toEqual([
      ["rpc", "menu_snapshot", { p_menu: menu }, { get: true }],
    ]);
  });

  it("comes back parsed, beside the document as it arrived, which the token is made from", async () => {
    const { client } = standIn(draft(fixture));
    const read = await readOwnerMenuDraft(client, menu);
    if (typeof read === "string") throw new Error("the draft was read");
    expect(read.raw).toBe(fixture);
    expect(read.snapshot.menu.name).toBe("Dinner");
    expect(read.snapshot.sections.map((section) => section.name)).toEqual([
      "Starters",
      "Mains",
      "Desserts",
    ]);
  });

  it("takes a size with no name, which a draft may hold", async () => {
    const { client } = standIn(draft(withBlankSize()));
    const read = await readOwnerMenuDraft(client, menu);
    expect(typeof read).toBe("object");
  });

  it("reports a draft that does not parse as a failed read, never as a document", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const document of [
      { ...(fixture as object), v: 2 },
      { some: "other shape" },
      [],
    ]) {
      expect(
        await readOwnerMenuDraft(standIn(draft(document)).client, menu),
      ).toBe("failed");
    }
  });

  it("tells a menu with no document from a read that failed", async () => {
    expect(await readOwnerMenuDraft(standIn(draft(null)).client, menu)).toBe(
      "not-found",
    );
    expect(
      await readOwnerMenuDraft(
        standIn({ draft: { data: null, error: { message: "no" } } }).client,
        menu,
      ),
    ).toBe("failed");
  });
});
