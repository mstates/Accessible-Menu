import { describe, expect, it } from "vitest";
import {
  emptyHours,
  hoursSchema,
  isAllDay,
  parseHours,
  type Hours,
  type HoursMessages,
} from "../../src/domain/hours";

const messages: HoursMessages = {
  time: "time",
  timePair: "timePair",
  ranges: "ranges",
  overlap: "overlap",
  allDay: "allDay",
};

const schema = hoursSchema(messages);

const example: Hours = {
  mon: [{ open: "11:00", close: "21:00" }],
  tue: [
    { open: "11:00", close: "14:30" },
    { open: "17:00", close: "21:00" },
  ],
  wed: [],
  thu: [{ open: "11:00", close: "21:00" }],
  fri: [{ open: "11:00", close: "22:00" }],
  sat: [{ open: "17:00", close: "02:00" }],
  sun: [{ open: "00:00", close: "00:00" }],
};

function problems(value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
  );
}

describe("the hours shape (D-92)", () => {
  it("accepts the documented example, overnight and all-day included", () => {
    expect(schema.safeParse(example).success).toBe(true);
    expect(parseHours(example)).toEqual(example);
  });

  it("treats an empty day as closed and starts empty", () => {
    expect(emptyHours()).toEqual({
      mon: [],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    });
    expect(schema.safeParse(emptyHours()).success).toBe(true);
  });

  it("requires every day and nothing else", () => {
    const missing = Object.fromEntries(
      Object.entries(example).filter(([day]) => day !== "sun"),
    );
    expect(schema.safeParse(missing).success).toBe(false);
    expect(schema.safeParse({ ...example, holiday: [] }).success).toBe(false);
  });

  it("allows two ranges at most", () => {
    const three = {
      ...example,
      mon: [
        { open: "08:00", close: "10:00" },
        { open: "11:00", close: "13:00" },
        { open: "14:00", close: "16:00" },
      ],
    };
    expect(problems(three)).toEqual(["mon: ranges"]);
  });

  it.each(["9:00", "24:00", "11:60", "11am", ""])(
    "rejects the time %j on its own side",
    (time) => {
      const bad = { ...example, mon: [{ open: time, close: "21:00" }] };
      const found = problems(bad);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^mon\.0\.open: /);
    },
  );

  it("reports a half-filled range on the empty side", () => {
    expect(
      problems({ ...example, wed: [{ open: "11:00", close: "" }] }),
    ).toEqual(["wed.0.close: timePair"]);
    expect(
      problems({ ...example, wed: [{ open: "", close: "21:00" }] }),
    ).toEqual(["wed.0.open: timePair"]);
  });

  it("rejects ranges that overlap", () => {
    expect(
      problems({
        ...example,
        mon: [
          { open: "11:00", close: "15:00" },
          { open: "14:00", close: "21:00" },
        ],
      }),
    ).toEqual(["mon: overlap"]);
  });

  it("keeps an overnight range apart from the next morning's", () => {
    expect(
      problems({
        ...example,
        sat: [
          { open: "06:00", close: "10:00" },
          { open: "17:00", close: "02:00" },
        ],
      }),
    ).toEqual([]);
  });

  it("reads open equal to close as all day, alone on its day", () => {
    expect(isAllDay({ open: "00:00", close: "00:00" })).toBe(true);
    expect(isAllDay({ open: "06:00", close: "06:00" })).toBe(true);
    expect(isAllDay({ open: "06:00", close: "22:00" })).toBe(false);
    expect(
      problems({
        ...example,
        sun: [
          { open: "00:00", close: "00:00" },
          { open: "11:00", close: "14:00" },
        ],
      }),
    ).toEqual(["sun: allDay"]);
  });

  it("reads anything else as no hours", () => {
    expect(parseHours(null)).toBeNull();
    expect(parseHours("Tuesday to Sunday")).toBeNull();
    expect(parseHours([])).toBeNull();
    expect(parseHours({ mon: "11-9" })).toBeNull();
  });
});
