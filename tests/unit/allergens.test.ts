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
  MAJOR_ALLERGEN_WORDS,
  majorAllergensOf,
  OTHER_ALLERGEN_LIMITS,
  otherAllergenProblem,
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

describe("the confirmation line (D-36)", () => {
  const menu = (items: { allergensReviewed: boolean }[]) => ({
    sections: [{ items }],
  });

  it("confirms every dish at one hundred percent reviewed", () => {
    const line = confirmationLine(
      menu([reviewed([]), reviewed(["soy"])]),
      copy,
    );
    expect(line.unconfirmed).toBe(0);
    expect(line.text).toBe("Allergens confirmed for every dish.");
  });

  it("uses the singular for one unconfirmed dish", () => {
    const line = confirmationLine(menu([reviewed([]), unreviewed()]), copy);
    expect(line.unconfirmed).toBe(1);
    expect(line.text).toBe(
      "We're still confirming allergens for 1 dish. Ask your server about that.",
    );
  });

  it("counts every unconfirmed dish across sections", () => {
    const line = confirmationLine(
      menu([unreviewed(), unreviewed(), reviewed([])]),
      copy,
    );
    expect(line.unconfirmed).toBe(2);
    expect(line.text).toBe(
      "We're still confirming allergens for 2 dishes. Ask your server about those.",
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

  it("offers the nine the migration allows, and refuses the words the migration refuses", () => {
    const offered = sql.match(
      /items_allergens_offered check \(\s*allergens <@ '\{([^}]+)\}'::public\.allergen\[\]/,
    );
    expect(offered).not.toBeNull();
    expect((offered?.[1] ?? "").split(",")).toEqual([...US_MAJOR_ALLERGENS]);
    const refused = sql.match(/raise exception 'other_allergen_major'[\s\S]*$/);
    const words = sql.match(
      /if lower\(other\) = any \(array\[([\s\S]*?)\]\) then\s+raise exception 'other_allergen_major'/,
    );
    expect(refused).not.toBeNull();
    expect(words).not.toBeNull();
    const inSql = [...(words?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
      (found) => found[1],
    );
    expect(inSql).toEqual(Object.keys(MAJOR_ALLERGEN_WORDS));
  });
});
