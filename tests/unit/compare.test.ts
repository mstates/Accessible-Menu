import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADDRESS_BUDGET,
  arrayLiteral,
  compareLength,
  holding,
  missed,
  SHOWN_TEXT_BOUND,
  shownTextSchema,
  type Shown,
} from "../../src/core/supabase/compare";
import { compareShed } from "../../src/core/supabase/log";
import {
  planDetailsWrite,
  restaurantShownSchema,
  type RestaurantShown,
} from "../../src/core/supabase/restaurants";

// D-237, rule 2: a write names the values its page showed, in the same
// statement, and lands only if the row still holds them. These pin the one
// shape every compare takes (src/core/supabase/compare.ts). The worst this
// can do is a compare that never matches, which would refuse every save of
// its row, so each kind of value is pinned to the filter that finds it.

// A query builder that keeps what it was asked.
function recorder() {
  const asked: unknown[][] = [];
  const query = {
    eq(column: string, value: string | number | boolean) {
      asked.push(["eq", column, value]);
      return query;
    },
    is(column: string, value: null) {
      asked.push(["is", column, value]);
      return query;
    },
  };
  return { query, asked };
}

function compare(column: string, shown: Shown): unknown[][] {
  const { query, asked } = recorder();
  expect(holding(query, column, shown)).toBe(query);
  return asked;
}

describe("one compare", () => {
  it("asks whether the column is null for nothing, and never sends the word null", () => {
    expect(compare("note", null)).toEqual([["is", "note", null]]);
  });

  it("compares zero, false, and an empty text as themselves: they are values, not nothing", () => {
    expect(compare("added_price_cents", 0)).toEqual([
      ["eq", "added_price_cents", 0],
    ]);
    expect(compare("show_icons", false)).toEqual([["eq", "show_icons", false]]);
    expect(compare("allergen_note", "")).toEqual([["eq", "allergen_note", ""]]);
  });

  it("compares a text as it stands, outer spaces, line breaks, and the word null among them", () => {
    for (const text of [
      " Dinner ",
      "one\ntwo",
      "one\r\ntwo",
      "null",
      "a,b(c)",
    ]) {
      expect(compare("name", text)).toEqual([["eq", "name", text]]);
    }
  });

  it("compares a number and a flag as they are", () => {
    expect(compare("calories_low", 250)).toEqual([["eq", "calories_low", 250]]);
    expect(compare("available", true)).toEqual([["eq", "available", true]]);
  });

  it("compares a list as a Postgres array literal, in the order given, every element quoted", () => {
    expect(compare("dietary_tags", ["vegetarian", "vegan"])).toEqual([
      ["eq", "dietary_tags", '{"vegetarian","vegan"}'],
    ]);
    expect(compare("prep_notes", [])).toEqual([["eq", "prep_notes", "{}"]]);
  });
});

describe("a Postgres array literal", () => {
  it("quotes every element and escapes its quotes and backslashes, so any name travels whole", () => {
    expect(arrayLiteral(["milk", "wheat"])).toBe('{"milk","wheat"}');
    expect(arrayLiteral(['say "cheese"', "a\\b", "x,y", "{z}", "NULL"])).toBe(
      '{"say \\"cheese\\"","a\\\\b","x,y","{z}","NULL"}',
    );
    expect(arrayLiteral([])).toBe("{}");
  });
});

describe("a text handed back", () => {
  it("is bounded by one generous bound, at least twice every column's cap however the cap is counted", () => {
    // The longest texts a page hands back: the allergen note, 1,000
    // characters, which outside the basic plane is 2,000 UTF-16 units, and
    // the hours as their own text, 4,000 octets.
    expect(SHOWN_TEXT_BOUND).toBeGreaterThanOrEqual(2 * 2 * 1000);
    expect(SHOWN_TEXT_BOUND).toBeGreaterThanOrEqual(2 * 4000);
    const note = "\u{1F35C}".repeat(1000);
    expect(note.length).toBe(2000);
    expect(shownTextSchema.safeParse(note).success).toBe(true);
    expect(shownTextSchema.safeParse("").success).toBe(true);
    expect(
      shownTextSchema.safeParse("x".repeat(SHOWN_TEXT_BOUND + 1)).success,
    ).toBe(false);
    expect(shownTextSchema.safeParse(null).success).toBe(false);
    expect(shownTextSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("a compare-and-set that matched no row, read once more", () => {
  const shape = (data: unknown) => data as { name: string };
  const answer = (data: unknown, error: unknown = null) =>
    Promise.resolve({ data, error });

  it("is not found when no row is there", async () => {
    expect(await missed(answer(null), shape, () => true)).toEqual({
      kind: "not-found",
    });
  });

  it("is failed when the read failed, or the row has no shape to read", async () => {
    expect(
      await missed(answer(null, { message: "down" }), shape, () => true),
    ).toEqual({ kind: "failed" });
    expect(
      await missed(
        answer({ name: "Dinner" }),
        () => null,
        () => true,
      ),
    ).toEqual({ kind: "failed" });
  });

  it("is moved when the row holds other values than the write would set", async () => {
    expect(
      await missed(
        answer({ name: "Brunch" }),
        shape,
        (row) => row.name === "Supper",
      ),
    ).toEqual({ kind: "moved" });
  });

  it("has landed when the row already holds what the write would set: a retry of a save whose answer was lost", async () => {
    expect(
      await missed(
        answer({ name: "Supper" }),
        shape,
        (row) => row.name === "Supper",
      ),
    ).toEqual({ kind: "landed", row: { name: "Supper" } });
  });
});

// Details hands back twelve values in the request's address (D-237), which
// has a ceiling. Only a row of several long texts can reach it.
describe("the size of a Details compare", () => {
  const ordinary: RestaurantShown = {
    name: "Test Bistro",
    address: "12 Penn Street",
    city: "Reading",
    region: "PA",
    postal_code: "19601",
    phone: "(610) 555-0100",
    website: "https://example.com",
    hours: JSON.stringify({
      mon: [{ open: "11:00", close: "21:00" }],
      tue: [{ open: "11:00", close: "21:00" }],
      wed: [{ open: "11:00", close: "21:00" }],
      thu: [{ open: "11:00", close: "21:00" }],
      fri: [
        { open: "11:00", close: "14:00" },
        { open: "17:00", close: "22:00" },
      ],
      sat: [{ open: "11:00", close: "22:00" }],
      sun: [],
    }),
    timezone: "America/New_York",
    allergen_note: "Ask your server about allergens.",
    prep_notes: ["shared-fryer"],
    show_icons: false,
  };

  // What the form would write when the owner changed nothing: the same
  // values, the hours as the object they parse to.
  const valuesOf = (shown: RestaurantShown) => ({
    name: shown.name,
    address: shown.address ?? "",
    city: shown.city ?? "",
    region: (shown.region ?? "PA") as "PA",
    postal_code: shown.postal_code ?? "",
    phone: shown.phone,
    website: shown.website,
    hours: shown.hours === null ? null : JSON.parse(shown.hours),
    timezone: shown.timezone as "America/New_York",
    allergen_note: shown.allergen_note,
    prep_notes: shown.prep_notes as "shared-fryer"[],
    show_icons: shown.show_icons,
  });

  const total = (compares: readonly (readonly [string, Shown])[]) =>
    compares.reduce(
      (sum, [column, value]) => sum + compareLength(column, value),
      0,
    );

  it("counts a compare as the client encodes it: a character of three bytes takes nine", () => {
    expect(compareLength("name", "ab")).toBe("name=eq.ab&".length);
    expect(compareLength("name", "中")).toBe("name=eq.%E4%B8%AD&".length);
    expect(compareLength("note", null)).toBe("note=is.null&".length);
  });

  it("sends all twelve for ordinary details, well inside the budget", () => {
    const plan = planDetailsWrite(valuesOf(ordinary), ordinary);
    expect(plan.compares.map(([column]) => column)).toEqual([
      "name",
      "address",
      "city",
      "region",
      "postal_code",
      "phone",
      "website",
      "hours",
      "timezone",
      "allergen_note",
      "prep_notes",
      "show_icons",
    ]);
    expect(Object.keys(plan.set)).toHaveLength(12);
    expect(plan.shed).toEqual([]);
    expect(total(plan.compares)).toBeLessThan(3_000);
  });

  it("names the hours by the column's own text, and nothing by null", () => {
    const plan = planDetailsWrite(valuesOf(ordinary), {
      ...ordinary,
      phone: null,
    });
    const compares = new Map(plan.compares);
    expect(compares.get("hours")).toBe(ordinary.hours);
    expect(compares.get("phone")).toBeNull();
    expect(compares.get("show_icons")).toBe(false);
    expect(compares.get("prep_notes")).toEqual(["shared-fryer"]);
  });

  it("still sends all twelve for an allergen note at its cap in a script of three bytes a character", () => {
    const shown = { ...ordinary, allergen_note: "中".repeat(1000) };
    const plan = planDetailsWrite(valuesOf(shown), shown);
    expect(plan.compares).toHaveLength(12);
    expect(plan.shed).toEqual([]);
    expect(total(plan.compares)).toBeLessThanOrEqual(ADDRESS_BUDGET);
  });

  it("past the budget, first leaves an untouched column out of both the write and the compare, longest first, so nothing of it can be written over", () => {
    const shown = {
      ...ordinary,
      name: "中".repeat(120),
      address: "中".repeat(200),
      city: "中".repeat(100),
      allergen_note: "中".repeat(1000),
    };
    // The owner changed the phone alone.
    const values = { ...valuesOf(shown), phone: "(610) 555-0199" };
    const plan = planDetailsWrite(values, shown);
    expect(
      plan.shed,
      "no compare is dropped from a column that is written",
    ).toEqual([]);
    expect("allergen_note" in plan.set, "the note is not written").toBe(false);
    expect(plan.compares.map(([column]) => column)).not.toContain(
      "allergen_note",
    );
    expect(plan.set.phone).toBe("(610) 555-0199");
    expect(plan.compares.map(([column]) => column)).toContain("phone");
    expect(total(plan.compares)).toBeLessThanOrEqual(ADDRESS_BUDGET);
    // Every column still written is still compared.
    expect(Object.keys(plan.set).sort()).toEqual(
      plan.compares.map(([column]) => column).sort(),
    );
  });

  it("only when long columns the owner changed in this very save are still over, leaves the longest compare out and says which", () => {
    const shown = {
      ...ordinary,
      name: "中".repeat(120),
      address: "中".repeat(200),
      city: "中".repeat(100),
      allergen_note: "中".repeat(1000),
    };
    // Every long text changed at once.
    const values = {
      ...valuesOf(shown),
      name: "新".repeat(120),
      address: "新".repeat(200),
      city: "新".repeat(100),
      allergen_note: "新".repeat(1000),
    };
    const plan = planDetailsWrite(values, shown);
    expect(plan.shed).toEqual(["allergen_note"]);
    expect(plan.set.allergen_note, "the note is still written").toBe(
      values.allergen_note,
    );
    expect(plan.compares.map(([column]) => column)).not.toContain(
      "allergen_note",
    );
    expect(total(plan.compares)).toBeLessThanOrEqual(ADDRESS_BUDGET);
  });

  it("treats hours as untouched when the form would write the same hours, whatever the order of their keys", () => {
    const shuffled = JSON.stringify({
      sun: [],
      sat: [{ close: "22:00", open: "11:00" }],
      fri: [
        { open: "11:00", close: "14:00" },
        { open: "17:00", close: "22:00" },
      ],
      thu: [{ open: "11:00", close: "21:00" }],
      wed: [{ open: "11:00", close: "21:00" }],
      tue: [{ open: "11:00", close: "21:00" }],
      mon: [{ open: "11:00", close: "21:00" }],
    });
    const shown = {
      ...ordinary,
      hours: shuffled,
      allergen_note: "中".repeat(1000),
    };
    const values = {
      ...valuesOf(ordinary),
      allergen_note: "新".repeat(1000),
    };
    // A budget small enough that something must go, and the hours go first
    // among the untouched columns: they are the longest of them.
    const plan = planDetailsWrite(values, shown, 9_400);
    expect("hours" in plan.set).toBe(false);
    expect(plan.shed).toEqual([]);
  });

  it("reads what the page showed as the twelve columns and nothing else", () => {
    expect(restaurantShownSchema.safeParse(ordinary).success).toBe(true);
    expect(
      restaurantShownSchema.safeParse({ ...ordinary, status: "active" })
        .success,
    ).toBe(false);
    const { show_icons: _dropped, ...eleven } = ordinary;
    void _dropped;
    expect(restaurantShownSchema.safeParse(eleven).success).toBe(false);
  });
});

describe("a write that left a compare out says so in one line", () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the table and the columns, never a value", () => {
    compareShed("restaurants", ["allergen_note"]);
    expect(lines).toEqual([
      'postgrest {"table":"restaurants","shed":["allergen_note"]}',
    ]);
  });
});
