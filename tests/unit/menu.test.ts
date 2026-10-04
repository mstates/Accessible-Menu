import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  cleanMenuName,
  inOrder,
  MENU_LIMITS,
  menuNameSchema,
  mergeOrder,
  moveInOrder,
  nameTaken,
} from "../../src/domain/menu";

const errors = en.owner.menus.errors;
const schema = menuNameSchema(errors);

function problem(input: string): string {
  const result = schema.safeParse(input);
  return result.success ? "" : (result.error.issues[0]?.message ?? "");
}

describe("the menu name (migration 3)", () => {
  it("trims the name and keeps what is inside", () => {
    const result = schema.safeParse("  Weekend brunch  ");
    expect(result.success && result.data).toBe("Weekend brunch");
  });

  it("turns a pasted tab or line break into a space", () => {
    expect(cleanMenuName("Lunch\tand\r\ndinner")).toBe("Lunch and dinner");
    const result = schema.safeParse("Lunch\nspecials");
    expect(result.success && result.data).toBe("Lunch specials");
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
