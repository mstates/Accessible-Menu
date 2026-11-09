import { describe, expect, it } from "vitest";
import { allergenSaveSteps } from "../../src/features/owner/allergens/save-steps";

// The statements one Save of the allergen form sends (D-148, D-229).

const shownLists = { allergens: ["milk" as const], others: ["celery"] };
const nextLists = {
  allergens: ["milk" as const, "sesame" as const],
  others: ["celery"],
};

describe("allergenSaveSteps", () => {
  it("writes the lists, then the check against the new lists, when a list changed and the check is ticked", () => {
    expect(
      allergenSaveSteps(
        { lists: shownLists, checked: true },
        { lists: nextLists, checked: true },
      ),
    ).toEqual([
      {
        patch: { allergens: nextLists.allergens, custom_allergens: ["celery"] },
        expected: { lists: shownLists },
      },
      { patch: { allergens_reviewed: true }, expected: { lists: nextLists } },
    ]);
  });

  it("writes the lists alone when a list changed and the check is unticked, since the database clears the check", () => {
    expect(
      allergenSaveSteps(
        { lists: shownLists, checked: true },
        { lists: nextLists, checked: false },
      ),
    ).toEqual([
      {
        patch: { allergens: nextLists.allergens, custom_allergens: ["celery"] },
        expected: { lists: shownLists },
      },
    ]);
  });

  it("writes the check alone against the shown lists when only the check was ticked", () => {
    expect(
      allergenSaveSteps(
        { lists: shownLists, checked: false },
        { lists: shownLists, checked: true },
      ),
    ).toEqual([
      { patch: { allergens_reviewed: true }, expected: { lists: shownLists } },
    ]);
  });

  it("writes the uncheck alone against a ticked check when only the check was unticked", () => {
    expect(
      allergenSaveSteps(
        { lists: shownLists, checked: true },
        { lists: shownLists, checked: false },
      ),
    ).toEqual([
      {
        patch: { allergens_reviewed: false },
        expected: { allergens_reviewed: true },
      },
    ]);
  });

  it("sends nothing when nothing changed", () => {
    expect(
      allergenSaveSteps(
        { lists: shownLists, checked: true },
        { lists: { allergens: ["milk"], others: ["celery"] }, checked: true },
      ),
    ).toEqual([]);
  });

  it("reads a reordered other list as a change, as the stored text does", () => {
    expect(
      allergenSaveSteps(
        { lists: { allergens: [], others: ["a", "b"] }, checked: false },
        { lists: { allergens: [], others: ["b", "a"] }, checked: false },
      ),
    ).toHaveLength(1);
  });
});
