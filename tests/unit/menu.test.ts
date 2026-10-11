import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  cleanMenuName,
  deleteAsksFirst,
  HOLDS_NOTHING,
  inOrder,
  MENU_LIMITS,
  menuNameProblem,
  mergeOrder,
  moveInOrder,
  nameTaken,
} from "../../src/domain/menu";

const errors = en.owner.menus.errors;

// The message for what was typed, as the list and the server both find it:
// the name is cleaned, then held to the rule.
function problem(input: string): string {
  const rule = menuNameProblem(cleanMenuName(input));
  return rule ? errors[rule] : "";
}

describe("the menu name (migration 3)", () => {
  it("trims the name and keeps what is inside", () => {
    expect(cleanMenuName("  Weekend brunch  ")).toBe("Weekend brunch");
    expect(problem("  Weekend brunch  ")).toBe("");
  });

  it("turns a pasted tab or line break into a space", () => {
    expect(cleanMenuName("Lunch\tand\r\ndinner")).toBe("Lunch and dinner");
    expect(cleanMenuName("Lunch\nspecials")).toBe("Lunch specials");
    expect(problem("Lunch\nspecials")).toBe("");
  });

  it.each([
    ["", errors.nameRequired],
    ["   ", errors.nameRequired],
    ["\t", errors.nameRequired],
    ["\n", errors.nameRequired],
    ["x".repeat(MENU_LIMITS.name + 1), errors.nameLength],
  ])("refuses %j", (input, message) => {
    expect(problem(input)).toBe(message);
  });

  it("accepts sixty characters", () => {
    expect(problem("x".repeat(MENU_LIMITS.name))).toBe("");
  });

  it("matches the cap in the table constraint", () => {
    expect(MENU_LIMITS.name).toBe(60);
    expect(errors.nameLength).toContain(String(MENU_LIMITS.name));
  });
});

describe("a name already in use", () => {
  const menus = [
    { id: "a", name: "Dinner" },
    { id: "b", name: "Drinks" },
  ];

  it("finds the other menu whatever the case or outer spaces", () => {
    expect(nameTaken(menus, "b", "dinner")).toEqual(menus[0]);
    expect(nameTaken(menus, "b", "  DINNER ")).toEqual(menus[0]);
    expect(nameTaken(menus, null, "Drinks")).toEqual(menus[1]);
  });

  it("never collides with the menu being renamed", () => {
    expect(nameTaken(menus, "a", "dinner")).toBeNull();
  });

  it("lets a new name through", () => {
    expect(nameTaken(menus, null, "Lunch")).toBeNull();
    expect(nameTaken(menus, "a", "Dinner specials")).toBeNull();
  });
});

describe("moving a menu one step", () => {
  const ids = ["a", "b", "c"];

  it("moves up and down", () => {
    expect(moveInOrder(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInOrder(ids, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("stops at the edges", () => {
    expect(moveInOrder(ids, "a", "up")).toBeNull();
    expect(moveInOrder(ids, "c", "down")).toBeNull();
  });

  it("knows nothing about a menu that is not in the list", () => {
    expect(moveInOrder(ids, "z", "up")).toBeNull();
    expect(moveInOrder(ids, "z", "down")).toBeNull();
  });

  it("leaves the list it was given alone", () => {
    moveInOrder(ids, "a", "down");
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("the order to put back after a restore", () => {
  it("is the remembered order when nothing else changed", () => {
    expect(mergeOrder(["a", "b", "c"], ["a", "c", "b"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops a menu that is gone and keeps a new one at the end", () => {
    expect(mergeOrder(["a", "b", "c"], ["c", "d", "a"])).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
});

describe("the list in a given order", () => {
  const menus = [
    { id: "a", name: "Lunch" },
    { id: "b", name: "Dinner" },
    { id: "c", name: "Drinks" },
  ];

  it("follows the ids", () => {
    expect(inOrder(menus, ["c", "a", "b"]).map((menu) => menu.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("keeps a menu the ids do not name, and skips an id it does not know", () => {
    expect(inOrder(menus, ["b", "z", "a"]).map((menu) => menu.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

// Whether a delete that would take more than the owner was told is refused
// is the database's rule now (migration 5), proven by the boundary script.
describe("a delete that takes content with it (D-119)", () => {
  it("asks first when the row holds anything, and not when it is empty", () => {
    expect(deleteAsksFirst(HOLDS_NOTHING)).toBe(false);
    expect(deleteAsksFirst({ sections: 0, dishes: 0, options: 0 })).toBe(false);
    expect(
      deleteAsksFirst({ sections: 1, dishes: 0, options: 0 }),
      "a menu",
    ).toBe(true);
    expect(
      deleteAsksFirst({ sections: 4, dishes: 12, options: 0 }),
      "a menu",
    ).toBe(true);
    expect(
      deleteAsksFirst({ sections: 0, dishes: 1, options: 0 }),
      "a section",
    ).toBe(true);
    expect(
      deleteAsksFirst({ sections: 0, dishes: 0, options: 2 }),
      "a choice list (D-166)",
    ).toBe(true);
  });

  it("keeps the counts on a listed menu through a reorder", () => {
    const menus = [
      { id: "a", name: "Lunch", sections: 0, dishes: 0 },
      { id: "b", name: "Dinner", sections: 3, dishes: 14 },
    ];
    expect(inOrder(menus, ["b", "a"])).toEqual([menus[1], menus[0]]);
    expect(nameTaken(menus, null, "dinner")).toEqual(menus[1]);
  });
});
