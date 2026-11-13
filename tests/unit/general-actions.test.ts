import type { SupabaseClient } from "@supabase/supabase-js";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { DishGeneral } from "../../src/domain/dish";
import {
  generalFields,
  type GeneralFields,
} from "../../src/features/owner/dish/general-form";

// saveDishGeneral (D-237), with the owner's scope, the database's writer,
// and the cache stood in, then the writer and the reader themselves against
// a client stood in. The page's checks run again in the action, on the
// fields as typed, before anything is sent; the document the page showed
// goes to the database as it arrived; each refusal comes back as the page
// says it. The action refreshes nothing: the browser loads the page again
// when a save lands.

const code = "12345678";
const dish = "0b2f0a9e-1111-4222-8333-444455556666";
const cup = "aaaaaaaa-1111-4111-8111-111111111111";
const bowl = "bbbbbbbb-2222-4222-8222-222222222222";

const shown: DishGeneral = {
  description: "Ask your server.",
  note: null,
  price_kind: "one",
  price_cents: 900,
  calories_low: 180,
  calories_high: null,
  sizes: [
    {
      id: cup,
      name: "Cup",
      price_cents: 500,
      calories_low: null,
      calories_high: null,
    },
    {
      id: bowl,
      name: "Bowl",
      price_cents: 800,
      calories_low: 300,
      calories_high: 340,
    },
  ],
};

const fields = (changes: Partial<GeneralFields> = {}): GeneralFields => ({
  ...generalFields(shown),
  ...changes,
});

type Written =
  | { ok: true; value: null }
  | {
      ok: false;
      error:
        | { kind: "moved" | "not-found" | "name-taken" | "failed" }
        | { kind: "refused"; rule: string };
    };
type ScopeProblem = "signed-out" | "parent-gone" | "failed";

let scopeProblem: ScopeProblem | null = null;
let written: Written = { ok: true, value: null };
let sent: { id: string; shown: unknown; next: unknown }[] = [];
let scoped: string[] = [];
const refreshed = vi.fn();
const expired = vi.fn();

type Actions = typeof import("../../src/features/owner/dish/form-actions");
type Dishes = typeof import("../../src/core/supabase/dishes");
let saveDishGeneral: Actions["saveDishGeneral"];
let real: Dishes;

beforeAll(async () => {
  real = await vi.importActual<Dishes>("../../src/core/supabase/dishes");
  vi.doMock("next/cache", () => ({ refresh: refreshed }));
  vi.doMock("../../src/core/cache", () => ({ expireRestaurant: expired }));
  vi.doMock("../../src/features/owner/owner-scope", () => ({
    dishScope: async (rawCode: string, rawDish: string) => {
      scoped.push(`${rawCode} ${rawDish}`);
      return scopeProblem
        ? { ok: false, problem: { kind: scopeProblem } }
        : {
            ok: true,
            client: { for: rawCode },
            restaurantId: "11111111-1111-4111-8111-111111111111",
            userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            dishId: rawDish,
            sectionId: "22222222-2222-4222-8222-222222222222",
            menuId: "33333333-3333-4333-8333-333333333333",
          };
    },
  }));
  vi.doMock("../../src/core/supabase/dishes", () => ({
    ...real,
    saveOwnerDishGeneral: async (
      _client: unknown,
      id: string,
      was: unknown,
      next: unknown,
    ) => {
      sent.push({ id, shown: was, next });
      return written;
    },
  }));
  ({ saveDishGeneral } =
    await import("../../src/features/owner/dish/form-actions"));
});

beforeEach(() => {
  scopeProblem = null;
  written = { ok: true, value: null };
  sent = [];
  scoped = [];
  refreshed.mockClear();
  expired.mockClear();
});

const failed = (problem: Record<string, unknown> = { kind: "failed" }) => ({
  status: "failed",
  problem,
});

describe("a General save checks who and what before it sends (D-237)", () => {
  it("asks for the owner's scope on the dish first, and sends nothing without it", async () => {
    for (const kind of ["signed-out", "parent-gone", "failed"] as const) {
      scopeProblem = kind;
      expect(
        await saveDishGeneral(code, dish, { fields: fields(), shown }),
      ).toEqual(failed({ kind }));
    }
    expect(scoped).toEqual(Array(3).fill(`${code} ${dish}`));
    expect(sent).toEqual([]);
  });

  it("refuses a payload that is not the form's, with nothing sent", async () => {
    const good = { fields: fields(), shown };
    const bad: unknown[] = [
      null,
      "soup",
      {},
      { fields: fields() },
      { shown },
      { ...good, shown: null },
      { ...good, shown: [shown] },
      { ...good, shown: "{}" },
      // An object that is not a General document.
      { ...good, shown: {} },
      { ...good, shown: { ...shown, sizes: undefined } },
      { ...good, shown: { ...shown, price_kind: "range" } },
      { ...good, shown: { ...shown, sizes: [{ id: cup }] } },
      { ...good, fields: { ...fields(), kind: "range" } },
      { ...good, fields: { ...fields(), price: 9 } },
      { ...good, fields: { ...fields(), description: "x".repeat(5001) } },
      {
        ...good,
        fields: {
          ...fields(),
          sizes: [
            { key: "a", id: "not-an-id", name: "", price: "", calories: "" },
          ],
        },
      },
    ];
    for (const payload of bad) {
      expect(await saveDishGeneral(code, dish, payload)).toEqual(failed());
    }
    expect(sent).toEqual([]);
  });

  // The browser ran these checks before it sent. The action runs them
  // again, from the same validator, since the payload is user input.
  it("runs the page's checks again, and sends nothing a check refuses", async () => {
    const sizes = generalFields(shown).sizes;
    const refusedFields: GeneralFields[] = [
      fields({ price: "twelve" }),
      fields({ price: "123456" }),
      fields({ calories: "some" }),
      fields({ description: "x".repeat(501) }),
      fields({ note: "x".repeat(121) }),
      // By size: a price and no name, a name and no price, a shared name.
      fields({
        kind: "sizes",
        sizes: [
          ...sizes,
          { key: "new-1", id: null, name: "", price: "15", calories: "" },
        ],
      }),
      fields({
        kind: "sizes",
        sizes: [
          ...sizes,
          { key: "new-1", id: null, name: "Pint", price: "", calories: "" },
        ],
      }),
      fields({
        kind: "sizes",
        sizes: [
          ...sizes,
          { key: "new-1", id: null, name: " cup ", price: "6", calories: "" },
        ],
      }),
    ];
    for (const each of refusedFields) {
      expect(
        await saveDishGeneral(code, dish, { fields: each, shown }),
      ).toEqual(failed());
    }
    expect(sent).toEqual([]);
  });
});

describe("what a General save sends (D-237)", () => {
  it("sends the dish, the document the page showed as it arrived, and the next document", async () => {
    // A key this code does not know travels back with the rest, in the
    // order it arrived: the database compares the document by value.
    const arrived = { later: [1, { deep: true }], ...shown };
    expect(
      await saveDishGeneral(code, dish, {
        fields: fields({
          description: "  Tomato and basil.  ",
          note: "Comes with bread.",
          price: "9.5",
          calories: "200 to 240",
        }),
        shown: arrived,
      }),
    ).toEqual({ status: "saved" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.id).toBe(dish);
    expect(sent[0]?.shown).toEqual(arrived);
    expect(JSON.stringify(sent[0]?.shown)).toBe(JSON.stringify(arrived));
    expect(sent[0]?.next).toEqual({
      description: "Tomato and basil.",
      note: "Comes with bread.",
      price_kind: "one",
      price_cents: 950,
      calories_low: 200,
      calories_high: 240,
      // Not the chosen choice: as the page showed them (Q-171).
      sizes: shown.sizes,
    });
  });

  it("writes the sizes under Prices by size, and keeps the one price the page showed", async () => {
    const [first, second] = generalFields(shown).sizes;
    expect(
      await saveDishGeneral(code, dish, {
        fields: fields({
          kind: "sizes",
          price: "44",
          calories: "nonsense",
          sizes: [
            { ...first!, name: "Bowl", price: "5.25" },
            { ...second!, name: "Cup" },
            { key: "new-1", id: null, name: "", price: "", calories: " " },
            { key: "new-2", id: null, name: "Pint", price: "12", calories: "" },
          ],
        }),
        shown,
      }),
    ).toEqual({ status: "saved" });
    expect(sent[0]?.next).toEqual({
      description: "Ask your server.",
      note: null,
      price_kind: "sizes",
      price_cents: 900,
      calories_low: 180,
      calories_high: null,
      sizes: [
        {
          id: cup,
          name: "Bowl",
          price_cents: 525,
          calories_low: null,
          calories_high: null,
        },
        {
          id: bowl,
          name: "Cup",
          price_cents: 800,
          calories_low: 300,
          calories_high: 340,
        },
        {
          id: null,
          name: "Pint",
          price_cents: 1200,
          calories_low: null,
          calories_high: null,
        },
      ],
    });
  });

  it("sends a save with nothing changed too, so a stale page is told", async () => {
    written = { ok: false, error: { kind: "moved" } };
    expect(
      await saveDishGeneral(code, dish, { fields: fields(), shown }),
    ).toEqual({ status: "moved" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.next).toEqual(shown);
  });

  it("refreshes nothing and tells no diner page, landed or not", async () => {
    await saveDishGeneral(code, dish, { fields: fields(), shown });
    written = { ok: false, error: { kind: "failed" } };
    await saveDishGeneral(code, dish, { fields: fields(), shown });
    expect(refreshed).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });
});

describe("what the database refused, as the page says it (D-237)", () => {
  const save = () => saveDishGeneral(code, dish, { fields: fields(), shown });

  it("says moved for a document that is no longer the dish's", async () => {
    written = { ok: false, error: { kind: "moved" } };
    expect(await save()).toEqual({ status: "moved" });
  });

  it("says the dish is gone, never that it moved", async () => {
    written = { ok: false, error: { kind: "not-found" } };
    expect(await save()).toEqual(failed({ kind: "parent-gone" }));
  });

  it("says the names rule for the names index", async () => {
    written = { ok: false, error: { kind: "name-taken" } };
    expect(await save()).toEqual(
      failed({ kind: "invalid", rule: "sizeNamesDiffer" }),
    );
  });

  it.each([
    ["items_description_text", "descriptionLength"],
    ["items_note_text", "noteLength"],
    ["items_price_cents_check", "priceRange"],
    ["items_price_cents_range", "priceRange"],
    ["items_calories_shape", "caloriesFormat"],
    ["item_sizes_name_text", "sizeNameLength"],
    ["item_sizes_price_cents", "priceRange"],
    ["item_sizes_calories_shape", "caloriesFormat"],
  ])("says the page's own rule for %s", async (constraint, rule) => {
    written = { ok: false, error: { kind: "refused", rule: constraint } };
    expect(await save()).toEqual(failed({ kind: "invalid", rule }));
  });

  it("fails plainly for a rule it does not know, and for anything else", async () => {
    written = { ok: false, error: { kind: "refused", rule: "items_new_rule" } };
    expect(await save()).toEqual(failed());
    written = { ok: false, error: { kind: "failed" } };
    expect(await save()).toEqual(failed());
  });
});

// The writer and the reader themselves, against a client that answers as
// the Data API does.
type Answer = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
};

function client(answer: Answer) {
  const calls: unknown[][] = [];
  const stood = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { stood, calls };
}

describe("save_item_general() as the app calls it (migration 16)", () => {
  it("sends all three arguments by name, as a POST", async () => {
    const { stood, calls } = client({});
    const was = { ...shown };
    expect(await real.saveOwnerDishGeneral(stood, dish, was, shown)).toEqual({
      ok: true,
      value: null,
    });
    expect(calls).toEqual([
      ["save_item_general", { p_item: dish, p_shown: was, p_next: shown }],
    ]);
  });

  it.each([
    ["general_moved", { kind: "moved" }],
    ["general_not_found", { kind: "not-found" }],
    ["general_malformed", { kind: "failed" }],
  ])("tells %s apart by its message", async (message, error) => {
    const { stood } = client({ error: { code: "P0001", message } });
    expect(await real.saveOwnerDishGeneral(stood, dish, shown, shown)).toEqual({
      ok: false,
      error,
    });
  });

  it("reads a table rule by its code: the names index, or the constraint by name", async () => {
    const taken = client({
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "item_sizes_name_key"',
      },
    });
    expect(
      await real.saveOwnerDishGeneral(taken.stood, dish, shown, shown),
    ).toEqual({ ok: false, error: { kind: "name-taken" } });
    const checked = client({
      error: {
        code: "23514",
        message:
          'new row for relation "item_sizes" violates check constraint "item_sizes_price_cents"',
      },
    });
    expect(
      await real.saveOwnerDishGeneral(checked.stood, dish, shown, shown),
    ).toEqual({
      ok: false,
      error: { kind: "refused", rule: "item_sizes_price_cents" },
    });
  });

  it("fails plainly for anything else", async () => {
    for (const error of [
      { code: "42501", message: "permission denied for function" },
      { code: "XX000", message: "the server fell over" },
      { message: "fetch failed" },
    ]) {
      const { stood } = client({ error });
      expect(
        await real.saveOwnerDishGeneral(stood, dish, shown, shown),
      ).toEqual({ ok: false, error: { kind: "failed" } });
    }
  });
});

describe("item_general() as the app reads it (migration 16)", () => {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => quiet.mockClear());

  it("asks by GET, and keeps the document as it arrived beside the one it read", async () => {
    const arrived = { later: true, ...shown };
    const { stood, calls } = client({ data: arrived });
    const read = await real.readOwnerDishGeneral(stood, dish);
    expect(calls).toEqual([["item_general", { p_item: dish }, { get: true }]]);
    expect(read).not.toBe("failed");
    expect(read).not.toBe("not-found");
    if (typeof read === "string") return;
    expect(read.raw).toBe(arrived);
    expect(read.general).toEqual(shown);
  });

  it("says not found for no document, and failed for an error or a document of another shape", async () => {
    expect(
      await real.readOwnerDishGeneral(client({ data: null }).stood, dish),
    ).toBe("not-found");
    expect(
      await real.readOwnerDishGeneral(
        client({ error: { code: "XX000", message: "no" } }).stood,
        dish,
      ),
    ).toBe("failed");
    expect(
      await real.readOwnerDishGeneral(
        client({ data: { ...shown, sizes: "none" } }).stood,
        dish,
      ),
    ).toBe("failed");
  });
});
