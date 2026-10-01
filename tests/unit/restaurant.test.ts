import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  normalizeWebsite,
  RESTAURANT_LIMITS,
  restaurantInputSchema,
} from "../../src/domain/restaurant";
import { readRestaurantForm } from "../../src/features/owner/form-data";

const schema = restaurantInputSchema(en.owner.restaurants.errors);
const errors = en.owner.restaurants.errors;

const valid = {
  name: "Test Bistro",
  address: "1 Main Street",
  city: "Reading",
  region: "PA",
  postalCode: "19601",
  phone: "(610) 555-0100",
  website: "example.com",
  hours: null,
  timezone: "America/New_York",
  allergenNote: "",
  prepNotes: ["shared-fryer", "shared-fryer"],
};

function firstProblem(input: unknown): string {
  const result = schema.safeParse(input);
  if (result.success) return "";
  const issue = result.error.issues[0];
  return `${issue?.path.map(String).join(".")}: ${issue?.message}`;
}

describe("the restaurant input (D-95)", () => {
  it("accepts a full restaurant and normalizes the optional fields", () => {
    const result = schema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.website).toBe("https://example.com");
    expect(result.data.allergenNote).toBeNull();
    expect(result.data.prepNotes).toEqual(["shared-fryer"]);
    expect(result.data.hours).toBeNull();
  });

  it("trims text and keeps a blank phone as null", () => {
    const result = schema.safeParse({
      ...valid,
      name: "  Test Bistro  ",
      phone: "   ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("Test Bistro");
    expect(result.data.phone).toBeNull();
  });

  it.each([
    [{ name: "" }, `name: ${errors.nameRequired}`],
    [
      { name: "x".repeat(RESTAURANT_LIMITS.name + 1) },
      `name: ${errors.nameLength}`,
    ],
    [{ address: "   " }, `address: ${errors.addressRequired}`],
    [
      { address: "x".repeat(RESTAURANT_LIMITS.address + 1) },
      `address: ${errors.addressLength}`,
    ],
    [{ city: "" }, `city: ${errors.cityRequired}`],
    [
      { city: "x".repeat(RESTAURANT_LIMITS.city + 1) },
      `city: ${errors.cityLength}`,
    ],
    [{ region: "Pennsylvania" }, `region: ${errors.region}`],
    [{ region: "" }, `region: ${errors.region}`],
    [{ postalCode: "1960" }, `postalCode: ${errors.postalCode}`],
    [{ postalCode: "19601-12" }, `postalCode: ${errors.postalCode}`],
    [{ phone: "call us" }, `phone: ${errors.phone}`],
    [{ phone: "123" }, `phone: ${errors.phone}`],
    [{ website: "javascript:alert(1)" }, `website: ${errors.website}`],
    [{ website: "ftp://files.example" }, `website: ${errors.website}`],
    [{ website: "two words.example" }, `website: ${errors.website}`],
    [
      { website: `${"x".repeat(RESTAURANT_LIMITS.website)}.example` },
      `website: ${errors.websiteLength}`,
    ],
    [{ timezone: "Europe/London" }, `timezone: ${errors.timezone}`],
    [{ timezone: "" }, `timezone: ${errors.timezone}`],
    [
      { allergenNote: "x".repeat(RESTAURANT_LIMITS.allergenNote + 1) },
      `allergenNote: ${errors.allergenNoteLength}`,
    ],
    [{ prepNotes: ["deep-fried"] }, `prepNotes.0: ${errors.prepNotes}`],
  ])("rejects %j with the field's message", (change, expected) => {
    expect(firstProblem({ ...valid, ...change })).toBe(expected);
  });

  it("accepts a nine-digit ZIP code and a bare domain with a path", () => {
    expect(firstProblem({ ...valid, postalCode: "19601-1234" })).toBe("");
    expect(firstProblem({ ...valid, website: "example.com/menu" })).toBe("");
  });

  it("adds https only when no scheme is typed", () => {
    expect(normalizeWebsite("example.com")).toBe("https://example.com");
    expect(normalizeWebsite("http://example.com")).toBe("http://example.com");
    expect(normalizeWebsite("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(normalizeWebsite("   ")).toBeNull();
  });

  it("names the day in an hours message", () => {
    const result = schema.safeParse({
      ...valid,
      hours: {
        mon: [{ open: "11:00", close: "" }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues[0];
    expect(issue?.path.map(String).join(".")).toBe("hours.mon.0.close");
    expect(issue?.message).toBe(errors.timePair);
  });
});

describe("reading the posted form", () => {
  function form(entries: Record<string, string | string[]>): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(entries)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        data.append(name, item);
      }
    }
    return data;
  }

  it("reads every field and collects the preparation notes", () => {
    const read = readRestaurantForm(
      form({
        name: "Test Bistro",
        address: "1 Main Street",
        city: "Reading",
        region: "PA",
        postalCode: "19601",
        phone: "",
        website: "example.com",
        timezone: "America/New_York",
        allergenNote: "",
        prepNotes: ["shared-fryer", "shared-kitchen"],
      }),
    );
    expect(read.name).toBe("Test Bistro");
    expect(read.region).toBe("PA");
    expect(read.prepNotes).toEqual(["shared-fryer", "shared-kitchen"]);
    expect(read.hours).toBeNull();
  });

  it("reads the hours grid: blank days closed, a half range kept, a lone second row moved up", () => {
    const read = readRestaurantForm(
      form({
        "hours.mon.0.open": "11:00",
        "hours.mon.0.close": "21:00",
        "hours.tue.0.open": "11:00",
        "hours.tue.0.close": "",
        "hours.wed.1.open": "17:00",
        "hours.wed.1.close": "21:00",
      }),
    );
    expect(read.hours).toEqual({
      mon: [{ open: "11:00", close: "21:00" }],
      tue: [{ open: "11:00", close: "" }],
      wed: [{ open: "17:00", close: "21:00" }],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    });
  });

  it("parses a posted form end to end", () => {
    const read = readRestaurantForm(
      form({
        name: "Test Bistro",
        address: "1 Main Street",
        city: "Reading",
        region: "PA",
        postalCode: "19601",
        phone: "",
        website: "",
        timezone: "America/New_York",
        allergenNote: " We cook with nuts. ",
        "hours.sat.0.open": "17:00",
        "hours.sat.0.close": "02:00",
      }),
    );
    const result = schema.safeParse(read);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allergenNote).toBe("We cook with nuts.");
    expect(result.data.website).toBeNull();
    expect(result.data.hours?.sat).toEqual([{ open: "17:00", close: "02:00" }]);
  });
});
