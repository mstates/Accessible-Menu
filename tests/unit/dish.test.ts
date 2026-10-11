import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  cleanDishName,
  cleanDishText,
  cleanSizeText,
  DISH_LIMITS,
  DISH_TEXTS,
  dishNameProblem,
  dishTextProblem,
  holdSizeOrder,
  nextDish,
  SIZE_LIMITS,
  SIZE_TEXTS,
  sizeTextProblem,
} from "../../src/domain/dish";
import { inOrder, nameTaken } from "../../src/domain/menu";

const errors = en.owner.dishes.errors;
const pageErrors = en.owner.dish.errors;

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

describe("the caps and their messages", () => {
  it("match the table constraints (migrations 5 and 6)", () => {
    expect(DISH_LIMITS).toEqual({ name: 120, description: 500, note: 120 });
    expect(SIZE_LIMITS).toEqual({ name: 40 });
  });

  it("are named in the messages they show", () => {
    expect(errors.nameLength).toContain(String(DISH_LIMITS.name));
    expect(pageErrors.descriptionLength).toContain(
      String(DISH_LIMITS.description),
    );
    expect(pageErrors.noteLength).toContain(String(DISH_LIMITS.note));
    expect(pageErrors.sizeNameLength).toContain(String(SIZE_LIMITS.name));
  });

  it("has a message for every rule a text can break", () => {
    expect(errors.nameRequired).not.toBe("");
    expect(errors.nameLength).not.toBe("");
    for (const rule of [
      "descriptionLength",
      "noteLength",
      "sizeNameLength",
      "priceFormat",
      "priceRange",
    ] as const) {
      expect(pageErrors[rule]).not.toBe("");
    }
  });
});

// The texts a dish's own page writes (D-128, D-139, migration 6).
describe("a dish's description, price, and note", () => {
  it("keeps a description's line breaks and turns a Windows one into a plain one", () => {
    expect(cleanDishText("description", "Line one\r\nLine two")).toBe(
      "Line one\nLine two",
    );
    expect(
      dishTextProblem("description", cleanDishText("description", "A\nB")),
    ).toBeNull();
  });

  it("turns any other control character in a description into a space, and trims the ends", () => {
    expect(cleanDishText("description", "  Tab\there \n")).toBe("Tab here");
  });

  it("takes a blank description as none", () => {
    expect(cleanDishText("description", "  \n ")).toBe("");
    expect(dishTextProblem("description", "")).toBeNull();
  });

  it("takes 500 characters of description and refuses one more", () => {
    expect(
      dishTextProblem("description", "x".repeat(DISH_LIMITS.description)),
    ).toBeNull();
    expect(
      dishTextProblem("description", "x".repeat(DISH_LIMITS.description + 1)),
    ).toBe("descriptionLength");
  });

  it("keeps a note to one line, like a name, and takes 120 characters", () => {
    expect(cleanDishText("note", " Comes\twith\nfries ")).toBe(
      "Comes with fries",
    );
    expect(dishTextProblem("note", "x".repeat(DISH_LIMITS.note))).toBeNull();
    expect(dishTextProblem("note", "x".repeat(DISH_LIMITS.note + 1))).toBe(
      "noteLength",
    );
    expect(dishTextProblem("note", "")).toBeNull();
  });

  it("trims a typed price and names the rule it breaks", () => {
    expect(cleanDishText("price", " 12.5 ")).toBe("12.5");
    expect(dishTextProblem("price", "12.5")).toBeNull();
    expect(dishTextProblem("price", "")).toBeNull();
    expect(dishTextProblem("price", "twelve")).toBe("priceFormat");
    expect(dishTextProblem("price", "100000")).toBe("priceRange");
  });

  // D-167: calories are a dish text, read by the one parser.
  it("trims typed calories and names the rule they break", () => {
    expect(DISH_TEXTS).toEqual(["description", "price", "calories", "note"]);
    expect(cleanDishText("calories", " 760 to 860 ")).toBe("760 to 860");
    expect(dishTextProblem("calories", "760")).toBeNull();
    expect(dishTextProblem("calories", "760 to 860")).toBeNull();
    expect(dishTextProblem("calories", "")).toBeNull();
    expect(dishTextProblem("calories", "lots")).toBe("caloriesFormat");
    expect(dishTextProblem("calories", "100000")).toBe("caloriesRange");
    expect(dishTextProblem("calories", "860 to 760")).toBe("caloriesOrder");
    for (const rule of [
      "caloriesFormat",
      "caloriesRange",
      "caloriesOrder",
    ] as const) {
      expect(pageErrors[rule]).not.toBe("");
    }
  });
});

describe("a size's name and price (D-139)", () => {
  it("keeps a name to one line and 40 characters, or none", () => {
    expect(cleanSizeText("name", " Cup\t")).toBe("Cup");
    expect(sizeTextProblem("name", "")).toBeNull();
    expect(sizeTextProblem("name", "x".repeat(SIZE_LIMITS.name))).toBeNull();
    expect(sizeTextProblem("name", "x".repeat(SIZE_LIMITS.name + 1))).toBe(
      "sizeNameLength",
    );
  });

  it("reads a price the way the dish's price is read", () => {
    expect(cleanSizeText("price", " 5 ")).toBe("5");
    expect(sizeTextProblem("price", "5")).toBeNull();
    expect(sizeTextProblem("price", "")).toBeNull();
    expect(sizeTextProblem("price", "five")).toBe("priceFormat");
    expect(sizeTextProblem("price", "123456")).toBe("priceRange");
  });

  it("reads calories the way the dish's are read (D-167)", () => {
    expect(SIZE_TEXTS).toEqual(["name", "price", "calories"]);
    expect(cleanSizeText("calories", " 180 ")).toBe("180");
    expect(sizeTextProblem("calories", "180")).toBeNull();
    expect(sizeTextProblem("calories", "")).toBeNull();
    expect(sizeTextProblem("calories", "some")).toBe("caloriesFormat");
  });
});

describe("dishes in a list", () => {
  const dishes = [
    { id: "a", name: "Soup of the day" },
    { id: "b", name: "House salad" },
    { id: "c", name: "Garlic bread" },
  ];

  it("finds a name in use whatever the case or outer spaces", () => {
    expect(nameTaken(dishes, "b", " soup OF the day ")).toEqual(dishes[0]);
    expect(nameTaken(dishes, "a", "Soup of the day")).toBeNull();
  });

  it("puts the rows in a given order", () => {
    expect(inOrder(dishes, ["b", "a", "c"])).toEqual([
      dishes[1],
      dishes[0],
      dishes[2],
    ]);
  });

  // The link to the next dish, so typing a section is one pass (D-128).
  it("finds the dish after this one, and none after the last", () => {
    expect(nextDish(dishes, "a")).toEqual(dishes[1]);
    expect(nextDish(dishes, "b")).toEqual(dishes[2]);
    expect(nextDish(dishes, "c")).toBeNull();
    expect(nextDish(dishes, "x")).toBeNull();
  });
});

// Price order on arrival, held while the page is open (Michael, October 7,
// 2026).
describe("the order a dish's sizes keep on the page", () => {
  const ids = (list: string[]) => list.map((id) => ({ id }));

  it("starts from what the server holds, in its order", () => {
    expect(holdSizeOrder([], ids(["cup", "bowl"]))).toEqual(["cup", "bowl"]);
  });

  it("keeps the places the page shows when the server's order changes", () => {
    expect(holdSizeOrder(["cup", "bowl"], ids(["bowl", "cup"]))).toEqual([
      "cup",
      "bowl",
    ]);
  });

  it("drops a size that is gone and puts a new one last", () => {
    expect(
      holdSizeOrder(["cup", "bowl", "pint"], ids(["pint", "cup", "half"])),
    ).toEqual(["cup", "pint", "half"]);
  });

  it("puts a restored size back where it was, from the order it was removed from", () => {
    const beforeRemove = ["cup", "pint", "bowl"];
    expect(holdSizeOrder(beforeRemove, ids(["cup", "bowl", "pint"]))).toEqual(
      beforeRemove,
    );
  });
});
