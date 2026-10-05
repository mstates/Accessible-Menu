import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  cleanDishName,
  DISH_LIMITS,
  dishNameProblem,
} from "../../src/domain/dish";
import { inOrder, nameTaken } from "../../src/domain/menu";

const errors = en.owner.dishes.errors;

describe("a dish's name (migration 5)", () => {
  it("trims the name and keeps what is inside", () => {
    expect(cleanDishName("  Soup of the day  ")).toBe("Soup of the day");
    expect(dishNameProblem(cleanDishName("  Soup of the day  "))).toBeNull();
  });

  it("turns a pasted tab or line break into a space, since a name is one line", () => {
    expect(cleanDishName("Fish\tand\r\nchips")).toBe("Fish and chips");
  });

  it.each(["", "   ", "\t", "\n"])("refuses %j as no name at all", (input) => {
    expect(dishNameProblem(cleanDishName(input))).toBe("nameRequired");
  });

  it("takes 120 characters and refuses one more", () => {
    expect(dishNameProblem("x".repeat(DISH_LIMITS.name))).toBeNull();
    expect(dishNameProblem("x".repeat(DISH_LIMITS.name + 1))).toBe(
      "nameLength",
    );
  });

  it("takes a long name as a real menu prints it", () => {
    const name =
      "Slow-Braised Beef Short Rib with Horseradish Mashed Potatoes and Red Wine Reduction";
    expect(name.length).toBeGreaterThan(60);
    expect(dishNameProblem(cleanDishName(name))).toBeNull();
  });
});

describe("the cap and its messages", () => {
  it("matches the table constraint", () => {
    expect(DISH_LIMITS).toEqual({ name: 120 });
  });

  it("is named in the message it shows", () => {
    expect(errors.nameLength).toContain(String(DISH_LIMITS.name));
  });

  it("has a message for every rule a name can break", () => {
    expect(errors.nameRequired).not.toBe("");
    expect(errors.nameLength).not.toBe("");
  });
});

describe("dishes in a list", () => {
  const dishes = [
    { id: "a", name: "Soup of the day" },
    { id: "b", name: "House salad" },
  ];

  it("finds a name in use whatever the case or outer spaces", () => {
    expect(nameTaken(dishes, "b", " soup OF the day ")).toEqual(dishes[0]);
    expect(nameTaken(dishes, "a", "Soup of the day")).toBeNull();
  });

  it("puts the rows in a given order", () => {
    expect(inOrder(dishes, ["b", "a"])).toEqual([dishes[1], dishes[0]]);
  });
});
