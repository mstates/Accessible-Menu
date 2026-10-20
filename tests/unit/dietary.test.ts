import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  dietarySentence,
  isDietaryTag,
  sameTags,
  toggleTag,
} from "../../src/domain/dietary";
import { DIETARY_TAG_IDS } from "../../src/domain/types";

describe("a dish's dietary tags (D-66)", () => {
  it("keeps the three in the enum's order, each once, whatever order a tick comes in", () => {
    expect(toggleTag([], "made-without-gluten", true)).toEqual([
      "made-without-gluten",
    ]);
    expect(toggleTag(["made-without-gluten"], "vegan", true)).toEqual([
      "vegan",
      "made-without-gluten",
    ]);
    expect(toggleTag(["vegan", "vegetarian"], "vegan", false)).toEqual([
      "vegetarian",
    ]);
    expect(toggleTag(["vegan"], "vegan", true)).toEqual(["vegan"]);
    expect(toggleTag(["vegan"], "vegetarian", false)).toEqual(["vegan"]);
  });

  it("compares lists as stored, in order", () => {
    expect(sameTags(["vegan", "vegetarian"], ["vegan", "vegetarian"])).toBe(
      true,
    );
    expect(sameTags(["vegan", "vegetarian"], ["vegetarian", "vegan"])).toBe(
      false,
    );
    expect(sameTags([], [])).toBe(true);
  });

  it("knows the three and nothing else", () => {
    for (const tag of DIETARY_TAG_IDS) expect(isDietaryTag(tag)).toBe(true);
    expect(isDietaryTag("gluten-free")).toBe(false);
    expect(isDietaryTag("")).toBe(false);
  });

  it("reads each tag as its own short sentence, never Gluten-free, and nothing with no tag", () => {
    expect(dietarySentence([], en.dietary)).toBeNull();
    expect(dietarySentence(["vegan"], en.dietary)).toEqual({
      words: ["Vegan"],
      text: "Vegan.",
      tags: ["vegan"],
    });
    expect(
      dietarySentence(["made-without-gluten", "vegan"], en.dietary)?.text,
    ).toBe("Vegan. Made without gluten ingredients.");
    // The tags ride along in the words' order, for the icon row (D-189).
    expect(
      dietarySentence(["made-without-gluten", "vegan"], en.dietary)?.tags,
    ).toEqual(["vegan", "made-without-gluten"]);
    expect(
      dietarySentence(
        ["vegan", "vegetarian", "made-without-gluten"],
        en.dietary,
      )?.text,
    ).toBe("Vegan. Vegetarian. Made without gluten ingredients.");
    expect(JSON.stringify(en.dietary)).not.toMatch(/gluten-free/i);
  });
});
