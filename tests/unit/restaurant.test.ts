import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  normalizeWebsite,
  RESTAURANT_LIMITS,
  restaurantInputSchema,
} from "../../src/domain/restaurant";
import {
  allDayFieldName,
  errorsShown,
  fieldErrors,
  readRestaurantForm,
  timeFieldLabel,
} from "../../src/features/owner/form-data";

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
  showIcons: false,
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

  it("takes the icons choice as a boolean and nothing else (D-189)", () => {
    const on = schema.safeParse({ ...valid, showIcons: true });
    expect(on.success && on.data.showIcons).toBe(true);
    expect(firstProblem({ ...valid, showIcons: "on" })).toMatch(/^showIcons: /);
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
        mon: [{ open: "11 am", close: "" }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        allDay: [],
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

  // D-189: the box posts only when checked, as a day's Open 24 hours box does.
  it("reads the icons box as on when it posted and off when it did not", () => {
    expect(readRestaurantForm(form({ showIcons: "on" })).showIcons).toBe(true);
    expect(readRestaurantForm(form({})).showIcons).toBe(false);
  });

  it("reads the hours grid as typed: blank days closed, a half range kept, a lone second row moved up", () => {
    const read = readRestaurantForm(
      form({
        "hours.mon.0.open": "11am",
        "hours.mon.0.close": " 9 pm ",
        "hours.tue.0.open": "11 a.m.",
        "hours.tue.0.close": "",
        "hours.wed.1.open": "17:00",
        "hours.wed.1.close": "9.30 pm",
      }),
    );
    expect(read.hours).toEqual({
      mon: [{ open: "11am", close: "9 pm" }],
      tue: [{ open: "11 a.m.", close: "" }],
      wed: [{ open: "17:00", close: "9.30 pm" }],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
      allDay: [],
    });
  });

  // D-124: the box is the answer for its day. Its times are never read,
  // valid or not, and it is stored as the one all-day range.
  it("stores a checked day as open around the clock and ignores its times, invalid ones included", () => {
    const read = readRestaurantForm(
      form({
        [allDayFieldName("mon")]: "on",
        "hours.mon.0.open": "lunch",
        "hours.mon.0.close": "5",
        "hours.mon.1.open": "2 pm",
        "hours.mon.1.close": "2 pm",
        [allDayFieldName("tue")]: "on",
        "hours.tue.0.open": "11 am",
        "hours.tue.0.close": "9 pm",
        "hours.wed.0.open": "11 am",
        "hours.wed.0.close": "9 pm",
      }),
    );
    expect(read.hours).toEqual({
      mon: [],
      tue: [],
      wed: [{ open: "11 am", close: "9 pm" }],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
      allDay: ["mon", "tue"],
    });
    const result = schema.safeParse({ ...valid, hours: read.hours });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hours).toEqual({
      mon: [{ open: "00:00", close: "00:00" }],
      tue: [{ open: "00:00", close: "00:00" }],
      wed: [{ open: "11:00", close: "21:00" }],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    });
  });

  it("reads a checked day alone as hours given, not as no hours", () => {
    const read = readRestaurantForm(form({ [allDayFieldName("sun")]: "on" }));
    expect(read.hours).not.toBeNull();
    const result = schema.safeParse({ ...valid, hours: read.hours });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hours?.sun).toEqual([{ open: "00:00", close: "00:00" }]);
    expect(result.data.hours?.mon).toEqual([]);
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
        "hours.sat.0.open": "5 pm",
        "hours.sat.0.close": "2 am",
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

describe("naming each field in an error (D-105)", () => {
  const strings = en.owner.restaurants;

  it("labels each time field by day and role", () => {
    expect(timeFieldLabel(strings.fields, "Monday", 0, "open")).toBe(
      "Monday opens",
    );
    expect(timeFieldLabel(strings.fields, "Monday", 0, "close")).toBe(
      "Monday closes",
    );
    expect(timeFieldLabel(strings.fields, "Monday", 1, "open")).toBe(
      "Monday opens again",
    );
    expect(timeFieldLabel(strings.fields, "Monday", 1, "close")).toBe(
      "Monday closes again",
    );
  });

  it("names the time field, the day, or nothing, by the message's path", () => {
    const result = schema.safeParse({
      ...valid,
      name: "",
      hours: {
        mon: [
          { open: "11 am", close: "3 pm" },
          { open: "5", close: "lunch" },
        ],
        tue: [{ open: "11 am", close: "" }],
        wed: [
          { open: "11 am", close: "3 pm" },
          { open: "2 pm", close: "9 pm" },
        ],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        allDay: [],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error.issues, strings)).toEqual({
      name: errors.nameRequired,
      "hours.mon.1.open": "Add am or pm to the time Monday opens again.",
      "hours.mon.1.close":
        "Enter the time Monday closes again, like 11 am, 5:30 pm, or 17:30.",
      "hours.tue.0.close": "Tuesday needs both an opening and a closing time.",
      "hours.wed": "Wednesday has times that overlap.",
    });
  });

  it("names the day when a typed time opens and closes at the same time", () => {
    const result = schema.safeParse({
      ...valid,
      hours: {
        mon: [{ open: "11 am", close: "11am" }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        allDay: [],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error.issues, strings)).toEqual({
      "hours.mon":
        "Monday opens and closes at the same time. If you are open around the clock, check Open 24 hours.",
    });
  });
});

describe("the errors a checked day takes off the page (D-124)", () => {
  const all = {
    name: "Add the restaurant's name.",
    "hours.mon": "Monday opens and closes at the same time.",
    "hours.mon.0.open": "Add am or pm to the time Monday opens.",
    "hours.mon.1.close": "Monday needs both an opening and a closing time.",
    "hours.tue.0.open": "Add am or pm to the time Tuesday opens.",
    "hours.sun": "Sunday has times that overlap.",
  };

  it("keeps every error when no box is checked", () => {
    expect(errorsShown(all, [])).toEqual(all);
  });

  it("drops a checked day's day and time errors and keeps the rest", () => {
    expect(errorsShown(all, ["mon", "sun"])).toEqual({
      name: all.name,
      "hours.tue.0.open": all["hours.tue.0.open"],
    });
  });
});
