import { describe, expect, it } from "vitest";
import {
  DAY_KEYS,
  dayEnd,
  dayKeyOf,
  emptyHours,
  hoursInputSchema,
  hoursSchema,
  isAllDay,
  isOpenAllDay,
  parseHours,
  type DayKey,
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

  it("loads a day as open around the clock when its one range opens and closes at the same time, whatever the time", () => {
    for (const time of ["00:00", "06:00", "11:00", "23:30"]) {
      expect(isOpenAllDay([{ open: time, close: time }])).toBe(true);
    }
    expect(isOpenAllDay([])).toBe(false);
    expect(isOpenAllDay([{ open: "06:00", close: "22:00" }])).toBe(false);
    expect(
      isOpenAllDay([
        { open: "00:00", close: "00:00" },
        { open: "11:00", close: "14:00" },
      ]),
    ).toBe(false);
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
    sameTime: "sameTime",
  };
  const input = hoursInputSchema(inputMessages);

  function typed(
    day: Partial<Record<keyof Hours, unknown>>,
    allDay: DayKey[] = [],
  ) {
    return { ...emptyHours(), ...day, allDay };
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
        sat: [{ open: "midnight", close: "2 am" }],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.fri).toEqual([{ open: "12:00", close: "00:00" }]);
    expect(result.data.sat).toEqual([{ open: "00:00", close: "02:00" }]);
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

  // D-124 refines D-105's midnight-to-midnight line for typing only: the
  // Open 24 hours box is how an owner says it.
  it("refuses a typed time that opens and closes at the same time, as a day error", () => {
    expect(
      typedProblems(typed({ mon: [{ open: "11 am", close: "11 am" }] })),
    ).toEqual(["mon: sameTime"]);
    expect(
      typedProblems(typed({ tue: [{ open: "17:00", close: "5 pm" }] })),
    ).toEqual(["tue: sameTime"]);
    expect(
      typedProblems(typed({ sun: [{ open: "midnight", close: "12 am" }] })),
    ).toEqual(["sun: sameTime"]);
  });

  it("refuses a same-time pair beside a second range, and says nothing of overlap", () => {
    expect(
      typedProblems(
        typed({
          sun: [
            { open: "midnight", close: "midnight" },
            { open: "11 am", close: "2 pm" },
          ],
        }),
      ),
    ).toEqual(["sun: sameTime"]);
    expect(
      typedProblems(
        typed({
          wed: [
            { open: "11 am", close: "3 pm" },
            { open: "2 pm", close: "2 pm" },
          ],
        }),
      ),
    ).toEqual(["wed: sameTime"]);
  });

  it("stores a checked day as the one all-day range", () => {
    const result = input.safeParse(
      typed({ mon: [{ open: "11 am", close: "9 pm" }] }, ["sat", "sun"]),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      ...emptyHours(),
      mon: [{ open: "11:00", close: "21:00" }],
      sat: [{ open: "00:00", close: "00:00" }],
      sun: [{ open: "00:00", close: "00:00" }],
    });
    expect(isAllDay(result.data.sat[0] ?? { open: "", close: "x" })).toBe(true);
  });

  // The output is written to the column as it is, and the column's check
  // looks only at size, so a stray key would make every reader take the
  // whole column for no hours.
  it("gives back the seven days and nothing else, which the stored schema reads back equal", () => {
    const result = input.safeParse(
      typed(
        {
          mon: [{ open: "11 am", close: "9 pm" }],
          tue: [
            { open: "11 a.m.", close: "2:30pm" },
            { open: "5 pm", close: "2 am" },
          ],
          fri: [{ open: "noon", close: "midnight" }],
        },
        ["wed", "sun"],
      ),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Object.keys(result.data)).toEqual([...DAY_KEYS]);
    expect(result.data).not.toHaveProperty("allDay");
    expect(parseHours(result.data)).toEqual(result.data);
    expect(parseHours(JSON.parse(JSON.stringify(result.data)))).toEqual(
      result.data,
    );
  });

  it("takes only day keys as checked days", () => {
    expect(input.safeParse(typed({}, ["holiday" as DayKey])).success).toBe(
      false,
    );
    expect(input.safeParse({ ...typed({}), extra: [] }).success).toBe(false);
  });
});

describe("when a day's service ends (D-160)", () => {
  it.each([
    [[], null],
    [[{ open: "11:00", close: "21:00" }], { daysOn: 0, time: "21:00" }],
    [[{ open: "17:00", close: "02:00" }], { daysOn: 1, time: "02:00" }],
    [
      [
        { open: "11:00", close: "14:00" },
        { open: "17:00", close: "22:00" },
      ],
      { daysOn: 0, time: "22:00" },
    ],
    [
      [
        { open: "17:00", close: "01:00" },
        { open: "11:00", close: "14:00" },
      ],
      { daysOn: 1, time: "01:00" },
    ],
    [[{ open: "00:00", close: "00:00" }], { daysOn: 1, time: "00:00" }],
    [[{ open: "09:00", close: "09:00" }], { daysOn: 1, time: "00:00" }],
    [[{ open: "18:00", close: "00:00" }], { daysOn: 1, time: "00:00" }],
  ])("the day whose ranges are %j ends at %j", (ranges, expected) => {
    expect(dayEnd(ranges)).toEqual(expected);
  });

  it("names the day of the week a calendar day falls on, Monday first", () => {
    expect(dayKeyOf("2026-10-09")).toBe("fri");
    expect(dayKeyOf("2026-03-08")).toBe("sun");
    expect(dayKeyOf("2026-10-12")).toBe("mon");
  });
});
