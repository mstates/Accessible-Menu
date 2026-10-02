import { describe, expect, it } from "vitest";
import {
  emptyHours,
  hoursInputSchema,
  hoursSchema,
  isAllDay,
  parseHours,
  type Hours,
  type HoursInputMessages,
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

describe("hours as the owner typed them (D-105)", () => {
  const inputMessages: HoursInputMessages = {
    timePair: "timePair",
    timeAmPm: "timeAmPm",
    timeFormat: "timeFormat",
    ranges: "ranges",
    overlap: "overlap",
    allDay: "allDay",
  };
  const input = hoursInputSchema(inputMessages);

  function typed(day: Partial<Record<keyof Hours, unknown>>) {
    return { ...emptyHours(), ...day };
  }

  function typedProblems(value: unknown): string[] {
    const result = input.safeParse(value);
    if (result.success) return [];
    return result.error.issues.map(
      (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
    );
  }

  it("reads typed times into the stored shape", () => {
    const result = input.safeParse(
      typed({
        mon: [{ open: "11am", close: "9 pm" }],
        tue: [
          { open: "11 a.m.", close: "2:30pm" },
          { open: "17:00", close: "9p" },
        ],
        wed: [{ open: "5.30 pm", close: "11 pm" }],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.mon).toEqual([{ open: "11:00", close: "21:00" }]);
    expect(result.data.tue).toEqual([
      { open: "11:00", close: "14:30" },
      { open: "17:00", close: "21:00" },
    ]);
    expect(result.data.wed).toEqual([{ open: "17:30", close: "23:00" }]);
    expect(parseHours(result.data)).toEqual(result.data);
  });

  it("stores a close after midnight as is, read as the next morning", () => {
    const result = input.safeParse(
      typed({ sat: [{ open: "5 pm", close: "2 am" }] }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sat).toEqual([{ open: "17:00", close: "02:00" }]);
  });

  it("stores midnight as 00:00 in either role", () => {
    const result = input.safeParse(
      typed({
        fri: [{ open: "noon", close: "midnight" }],
        sun: [{ open: "midnight", close: "12 am" }],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.fri).toEqual([{ open: "12:00", close: "00:00" }]);
    expect(result.data.sun).toEqual([{ open: "00:00", close: "00:00" }]);
    expect(isAllDay(result.data.sun[0] ?? { open: "", close: "x" })).toBe(true);
  });

  it("asks for am or pm on the side that needs it", () => {
    expect(
      typedProblems(typed({ mon: [{ open: "11", close: "9 pm" }] })),
    ).toEqual(["mon.0.open: timeAmPm"]);
    expect(
      typedProblems(typed({ thu: [{ open: "11 am", close: "5.30" }] })),
    ).toEqual(["thu.0.close: timeAmPm"]);
  });

  it("names a time it cannot read on its own side", () => {
    expect(
      typedProblems(typed({ mon: [{ open: "lunch", close: "25:00" }] })),
    ).toEqual(["mon.0.open: timeFormat", "mon.0.close: timeFormat"]);
  });

  it("reports a half range on the empty side and still reads the other", () => {
    expect(
      typedProblems(typed({ wed: [{ open: "11 am", close: "" }] })),
    ).toEqual(["wed.0.close: timePair"]);
    expect(typedProblems(typed({ wed: [{ open: "11", close: " " }] }))).toEqual(
      ["wed.0.open: timeAmPm", "wed.0.close: timePair"],
    );
  });

  it("checks overlap after reading, and only when every time read", () => {
    expect(
      typedProblems(
        typed({
          mon: [
            { open: "11 am", close: "3 pm" },
            { open: "2 pm", close: "9 pm" },
          ],
        }),
      ),
    ).toEqual(["mon: overlap"]);
    expect(
      typedProblems(
        typed({
          mon: [
            { open: "11 am", close: "3 pm" },
            { open: "2", close: "9 pm" },
          ],
        }),
      ),
    ).toEqual(["mon.1.open: timeAmPm"]);
  });

  it("keeps midnight to midnight alone on its day", () => {
    expect(
      typedProblems(
        typed({
          sun: [
            { open: "midnight", close: "midnight" },
            { open: "11 am", close: "2 pm" },
          ],
        }),
      ),
    ).toEqual(["sun: allDay"]);
  });
});
