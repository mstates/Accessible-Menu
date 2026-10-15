import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  allergenSentence,
  allergensForRegion,
  checkedOnDate,
  cleanOtherAllergen,
  confirmationLine,
  EU_ALLERGENS,
  hasOtherAllergenComma,
  MAJOR_ALLERGEN_WORDS,
  majorAllergensOf,
  OTHER_ALLERGEN_COMMA_CHARS,
  OTHER_ALLERGEN_LIMITS,
  otherAllergenProblem,
  rankOtherAllergenNames,
  restaurantAllergenNote,
  sameAllergenLists,
  sameListsAsStored,
  toggleAllergen,
  US_MAJOR_ALLERGENS,
} from "../../src/domain/allergens";
import { ALLERGEN_IDS, type AllergenId } from "../../src/domain/types";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(root, "supabase/migrations");
const sql = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(dir, name), "utf8"))
  .join("\n");

const copy = en.allergens;

function reviewed(allergens: AllergenId[], customAllergens: string[] = []) {
  return { allergens, customAllergens, allergensReviewed: true };
}

function unreviewed(allergens: AllergenId[] = []) {
  return { allergens, customAllergens: [], allergensReviewed: false };
}

describe("the three allergen sentences (D-35)", () => {
  it("reads not confirmed when the owner has not reviewed the item", () => {
    const sentence = allergenSentence(unreviewed(), copy);
    expect(sentence.kind).toBe("not-confirmed");
    expect(sentence.text).toBe("Allergens not confirmed yet. Ask your server.");
  });

  it("never publishes listed allergens on an unreviewed item", () => {
    const sentence = allergenSentence(unreviewed(["peanuts"]), copy);
    expect(sentence.kind).toBe("not-confirmed");
    expect(sentence.text).not.toContain("peanuts");
  });

  it("reads checked when the owner reviewed and listed none", () => {
    const sentence = allergenSentence(reviewed([]), copy);
    expect(sentence.kind).toBe("checked-none");
    expect(sentence.text).toBe("Checked. No major allergens.");
  });

  it("lists the allergens present, in the owner's order, with a period", () => {
    const sentence = allergenSentence(reviewed(["peanuts", "milk"]), copy);
    expect(sentence.kind).toBe("contains");
    if (sentence.kind !== "contains") return;
    expect(sentence.lead).toBe("Contains");
    expect(sentence.words).toEqual(["peanuts", "milk"]);
    expect(sentence.text).toBe("Contains peanuts, milk.");
  });

  it("appends custom allergens after the fixed ones", () => {
    const sentence = allergenSentence(reviewed(["eggs"], ["kiwi"]), copy);
    expect(sentence.text).toBe("Contains eggs, kiwi.");
  });

  it("ends every sentence with a period so read aloud pauses", () => {
    for (const sentence of [
      allergenSentence(unreviewed(), copy),
      allergenSentence(reviewed([]), copy),
      allergenSentence(reviewed(["fish"]), copy),
    ]) {
      expect(sentence.text.endsWith(".")).toBe(true);
    }
  });
});

describe("the restaurant allergen note (D-35)", () => {
  it("falls back to the default sentence when the note is null or blank", () => {
    expect(
      restaurantAllergenNote({ allergenNote: null, prepNotes: [] }, copy),
    ).toEqual([copy.noteDefault]);
    expect(
      restaurantAllergenNote({ allergenNote: "   ", prepNotes: [] }, copy),
    ).toEqual([copy.noteDefault]);
  });

  it("keeps the owner's note and appends the picked preparation sentences in order", () => {
    const note = restaurantAllergenNote(
      {
        allergenNote: "We cook with nuts every day.",
        prepNotes: ["shared-fryer", "shared-kitchen"],
      },
      copy,
    );
    expect(note).toEqual([
      "We cook with nuts every day.",
      copy.prepNotes["shared-fryer"],
      copy.prepNotes["shared-kitchen"],
    ]);
  });
});

describe("the confirmation line (D-36, D-166, D-177)", () => {
  it("confirms every dish only when a dish shows and no shown dish and no shown option is unchecked", () => {
    const line = confirmationLine({ shown: 1, dishes: 0, options: 0 }, copy);
    expect(line).toEqual({
      dishes: 0,
      options: 0,
      text: "Allergens confirmed for every dish.",
    });
  });

  it("says nothing when no dish shows, so an empty page never claims every dish is confirmed (D-177)", () => {
    expect(
      confirmationLine({ shown: 0, dishes: 0, options: 0 }, copy),
    ).toBeNull();
    // Zero of zero is not every dish, whatever the counts say.
    expect(
      confirmationLine({ shown: 0, dishes: 2, options: 1 }, copy),
    ).toBeNull();
  });

  it("uses the singular for one unconfirmed dish", () => {
    expect(
      confirmationLine({ shown: 1, dishes: 1, options: 0 }, copy)?.text,
    ).toBe(
      "We're still confirming allergens for 1 dish. Ask your server about that.",
    );
  });

  it("counts every unconfirmed dish", () => {
    expect(
      confirmationLine({ shown: 2, dishes: 2, options: 0 }, copy)?.text,
    ).toBe(
      "We're still confirming allergens for 2 dishes. Ask your server about those.",
    );
  });

  it("names unchecked options alone when every dish is checked", () => {
    expect(
      confirmationLine({ shown: 1, dishes: 0, options: 1 }, copy)?.text,
    ).toBe(
      "We're still confirming allergens for 1 option. Ask your server about that.",
    );
    expect(
      confirmationLine({ shown: 1, dishes: 0, options: 3 }, copy)?.text,
    ).toBe(
      "We're still confirming allergens for 3 options. Ask your server about those.",
    );
  });

  it("names dishes and options together", () => {
    expect(
      confirmationLine({ shown: 1, dishes: 1, options: 1 }, copy)?.text,
    ).toBe(
      "We're still confirming allergens for 1 dish and 1 option. Ask your server about those.",
    );
    expect(
      confirmationLine({ shown: 12, dishes: 12, options: 2 }, copy)?.text,
    ).toBe(
      "We're still confirming allergens for 12 dishes and 2 options. Ask your server about those.",
    );
  });
});

describe("allergen lists by region (Q-4)", () => {
  it("has nine US major allergens and fourteen EU allergens", () => {
    expect(US_MAJOR_ALLERGENS).toHaveLength(9);
    expect(EU_ALLERGENS).toHaveLength(14);
    expect(allergensForRegion("us")).toBe(US_MAJOR_ALLERGENS);
    expect(allergensForRegion("eu")).toBe(EU_ALLERGENS);
  });

  it("stores the union of both lists", () => {
    const union = new Set([...US_MAJOR_ALLERGENS, ...EU_ALLERGENS]);
    expect([...union].sort()).toEqual([...ALLERGEN_IDS].sort());
  });

  it("has a diner-facing word for every allergen", () => {
    for (const id of ALLERGEN_IDS) {
      expect(copy.names[id].length).toBeGreaterThan(0);
    }
  });
});

describe("the owner's lists (D-148)", () => {
  it("ticks and unticks a major allergen in the fixed order", () => {
    expect(toggleAllergen([], "wheat", true)).toEqual(["wheat"]);
    expect(toggleAllergen(["wheat"], "milk", true)).toEqual(["milk", "wheat"]);
    expect(toggleAllergen(["milk", "wheat"], "wheat", false)).toEqual(["milk"]);
    expect(toggleAllergen(["milk", "milk"], "milk", true)).toEqual(["milk"]);
  });

  it("cleans another allergen's name like a menu name", () => {
    expect(cleanOtherAllergen("  celery\tseed ")).toBe("celery seed");
  });

  it("refuses a long name, a name that means one of the nine, and a repeat whatever the case", () => {
    expect(otherAllergenProblem("x".repeat(41), [], null)).toBe("otherLength");
    expect(otherAllergenProblem("x".repeat(40), [], null)).toBeNull();
    expect(otherAllergenProblem("Milk", [], null)).toBe("otherMajor");
    expect(otherAllergenProblem("dairy", [], null)).toBe("otherMajor");
    expect(otherAllergenProblem("celery", ["Celery"], null)).toBe("otherTaken");
    expect(otherAllergenProblem("celery", ["Celery"], 0)).toBeNull();
    expect(otherAllergenProblem("mustard", ["celery"], null)).toBeNull();
    expect(OTHER_ALLERGEN_LIMITS).toEqual({ length: 40, count: 10 });
  });

  it("points a word at its box, and nuts at both", () => {
    expect(majorAllergensOf("Tree Nuts")).toEqual(["tree-nuts"]);
    expect(majorAllergensOf("nuts")).toEqual(["peanuts", "tree-nuts"]);
    expect(majorAllergensOf("kiwi")).toEqual([]);
  });

  it("reads two lists the same as a diner does, whatever the order or case, and as stored only element for element", () => {
    const a = {
      allergens: ["milk", "wheat"] as AllergenId[],
      others: ["Celery"],
    };
    const b = {
      allergens: ["wheat", "milk"] as AllergenId[],
      others: ["celery"],
    };
    expect(sameAllergenLists(a, b)).toBe(true);
    expect(sameListsAsStored(a, b)).toBe(false);
    expect(sameListsAsStored(a, { ...a })).toBe(true);
    expect(
      sameAllergenLists(a, { allergens: ["milk"], others: ["celery"] }),
    ).toBe(false);
  });

  it("reads a check's date in the restaurant's time zone, and a bad stamp as nothing", () => {
    expect(
      checkedOnDate("2026-10-08T03:30:00+00:00", "America/New_York", "en"),
    ).toBe("October 7, 2026");
    expect(
      checkedOnDate("2026-10-08T03:30:00+00:00", "Pacific/Honolulu", "en"),
    ).toBe("October 7, 2026");
    expect(checkedOnDate("not a date", "America/New_York", "en")).toBe("");
  });

  it("refuses a comma in any of its three forms, before the length rule, and never strips one (D-151)", () => {
    expect(OTHER_ALLERGEN_COMMA_CHARS).toBe(",\uFF0C\u3001");
    for (const comma of OTHER_ALLERGEN_COMMA_CHARS) {
      const name = `nuts${comma} except almonds`;
      expect(hasOtherAllergenComma(name)).toBe(true);
      expect(otherAllergenProblem(name, [], null)).toBe("otherComma");
      expect(cleanOtherAllergen(name)).toBe(name);
    }
    expect(hasOtherAllergenComma("celery seed")).toBe(false);
    expect(otherAllergenProblem(`${"x".repeat(41)},`, [], null)).toBe(
      "otherComma",
    );
  });

  it("ranks the other allergens a restaurant already names, most used first and then by name, each once whatever its case", () => {
    expect(
      rankOtherAllergenNames([
        "Sulfites",
        "mustard",
        "Celery",
        "celery ",
        "",
        "mustard",
        "  ",
      ]),
    ).toEqual(["Celery", "mustard", "Sulfites"]);
  });

  it("offers the nine in every migration that lists them, and refuses the words every copy of the rule refuses, the live one in allergen_lists_problem", () => {
    // Every constraint that holds a list within the nine the US offers
    // (migration seven on items, migration eight on a section's line) names
    // the same nine.
    const offered = [
      ...sql.matchAll(
        /_allergens_offered check \(\s*\w+ <@ '\{([^}]+)\}'::public\.allergen\[\]/g,
      ),
    ].map((found) => (found[1] ?? "").split(","));
    expect(offered.length).toBeGreaterThanOrEqual(2);
    for (const list of offered) expect(list).toEqual([...US_MAJOR_ALLERGENS]);

    // The words that mean one of the nine. Migration seven's trigger raised
    // other_allergen_major with its own list; migration eight's rule
    // function returns it with the list every lists trigger reads now.
    // Every copy in the migrations folder equals the editor's, not only the
    // first, and the live one is in allergen_lists_problem.
    const copies = [
      ...sql.matchAll(
        /if lower\(other\) = any \(array\[([\s\S]*?)\]\) then\s+(?:raise exception|return) 'other_allergen_major'/g,
      ),
    ].map((found) =>
      [...(found[1] ?? "").matchAll(/'([^']+)'/g)].map((word) => word[1]),
    );
    expect(copies.length).toBeGreaterThanOrEqual(2);
    for (const words of copies) {
      expect(words).toEqual(Object.keys(MAJOR_ALLERGEN_WORDS));
    }
    const from = sql.indexOf("create function public.allergen_lists_problem");
    expect(from).toBeGreaterThan(-1);
    const live = sql.slice(from, sql.indexOf("\n$$;", from));
    expect(live).toMatch(/return 'other_allergen_major'/);
    expect(live).toMatch(/return 'other_allergen_text'/);
    expect(live).toMatch(/return 'other_allergen_repeated'/);
    expect(live).toMatch(/return 'allergens_repeated'/);
    const liveWords = live.match(
      /if lower\(other\) = any \(array\[([\s\S]*?)\]\) then\s+return 'other_allergen_major'/,
    );
    expect(
      [...(liveWords?.[1] ?? "").matchAll(/'([^']+)'/g)].map((word) => word[1]),
    ).toEqual(Object.keys(MAJOR_ALLERGEN_WORDS));

    // The commas the rule refuses are the editor's three (D-151, Q-65), as
    // the migration file holds them.
    const commas = live.match(
      /other ~ '\[([^\]]+)\]' then\s+return 'other_allergen_comma'/,
    );
    expect(commas?.[1]).toBe(OTHER_ALLERGEN_COMMA_CHARS);
  });
});
