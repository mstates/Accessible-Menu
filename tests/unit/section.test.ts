import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { inOrder, nameTaken } from "../../src/domain/menu";
import {
  cleanSectionText,
  SECTION_LIMITS,
  SECTION_TEXTS,
  sectionTextProblem,
  type OwnerSection,
} from "../../src/domain/section";

const errors = en.owner.sections.errors;

// What a typed value is saved as, and the rule it breaks, if any.
function saved(field: (typeof SECTION_TEXTS)[number], input: string) {
  const value = cleanSectionText(field, input);
  return { value, rule: sectionTextProblem(field, value) };
}

describe("a section's name (migration 4)", () => {
  it("trims the name and keeps what is inside", () => {
    expect(saved("name", "  Small plates  ")).toEqual({
      value: "Small plates",
      rule: null,
    });
  });

  it("turns a pasted tab or line break into a space, since a name is one line", () => {
    expect(cleanSectionText("name", "Small\tplates\r\nand sides")).toBe(
      "Small plates and sides",
    );
  });

  it.each(["", "   ", "\t", "\n"])("refuses %j as blank", (input) => {
    expect(saved("name", input).rule).toBe("nameRequired");
  });

  it("takes sixty characters and refuses sixty-one", () => {
    expect(saved("name", "x".repeat(SECTION_LIMITS.name)).rule).toBeNull();
    expect(saved("name", "x".repeat(SECTION_LIMITS.name + 1)).rule).toBe(
      "nameLength",
    );
  });
});

describe("a section's note (migration 4)", () => {
  it("keeps its line breaks and loses its outer space", () => {
    expect(
      saved("note", "  Everything here is fried.\nIn peanut oil.  \n"),
    ).toEqual({
      value: "Everything here is fried.\nIn peanut oil.",
      rule: null,
    });
  });

  it("turns a Windows or old Mac line break into a plain one", () => {
    expect(cleanSectionText("note", "One\r\nTwo\rThree")).toBe(
      "One\nTwo\nThree",
    );
  });

  it("turns any other control character into a space", () => {
    expect(cleanSectionText("note", "Fried in\tpeanut oil")).toBe(
      "Fried in peanut oil",
    );
    expect(cleanSectionText("note", "A\u0000B\u0085C")).toBe("A B C");
  });

  it.each(["", "   ", "\n", " \r\n "])(
    "saves %j as no note, which is allowed",
    (input) => {
      expect(saved("note", input)).toEqual({ value: "", rule: null });
    },
  );

  it("takes five hundred characters and refuses one more", () => {
    expect(saved("note", "x".repeat(SECTION_LIMITS.note)).rule).toBeNull();
    expect(saved("note", "x".repeat(SECTION_LIMITS.note + 1)).rule).toBe(
      "noteLength",
    );
  });
});

describe("the caps and their messages", () => {
  it("match the table constraints", () => {
    expect(SECTION_LIMITS).toEqual({ name: 60, note: 500 });
  });

  it("are named in the message each one shows", () => {
    expect(errors.nameLength).toContain(String(SECTION_LIMITS.name));
    expect(errors.noteLength).toContain(String(SECTION_LIMITS.note));
  });

  it("have a message for every rule a text can break", () => {
    const rules = [
      sectionTextProblem("name", ""),
      sectionTextProblem("name", "x".repeat(61)),
      sectionTextProblem("note", "x".repeat(501)),
    ];
    for (const rule of rules) {
      expect(rule).not.toBeNull();
      if (rule) expect(errors[rule].length).toBeGreaterThan(0);
    }
  });
});

// The list helpers written for menus read an id and a name and nothing
// else, so a menu's sections use them as they are.
describe("sections in a list", () => {
  const sections: OwnerSection[] = [
    { id: "a", name: "Starters", note: "" },
    { id: "b", name: "Mains", note: "Served with rice." },
    { id: "c", name: "Desserts", note: "" },
  ];

  it("finds a name in use whatever the case or outer spaces", () => {
    expect(nameTaken(sections, "c", " mains ")).toEqual(sections[1]);
    expect(nameTaken(sections, "b", "MAINS")).toBeNull();
    expect(nameTaken(sections, null, "Sides")).toBeNull();
  });

  it("puts the rows in a given order and keeps every field", () => {
    expect(inOrder(sections, ["c", "a", "b"])).toEqual([
      sections[2],
      sections[0],
      sections[1],
    ]);
  });
});
