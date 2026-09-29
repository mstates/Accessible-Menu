import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  allergenSentence,
  allergensForRegion,
  confirmationLine,
  EU_ALLERGENS,
  restaurantAllergenNote,
  US_MAJOR_ALLERGENS,
} from "../../src/domain/allergens";
import { ALLERGEN_IDS, type AllergenId } from "../../src/domain/types";

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
    expect(sentence.words).toEqual(["peanuts", "dairy"]);
    expect(sentence.text).toBe("Contains peanuts, dairy.");
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
