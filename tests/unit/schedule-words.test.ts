import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import {
  dishUndoSchema,
  showingUndoLabel,
  type ShowingNames,
} from "../../src/features/owner/dish/dish-words";
import {
  availabilityLine,
  availabilityUndoneSentence,
  scheduleUndoneSentence,
  tagsUndoneSentence,
  type AvailabilityUndo,
  type ScheduleUndo,
  type TagsUndo,
} from "../../src/features/owner/dish/schedule-words";

// Task 5: the Undo labels and sentences of the dietary tags (D-66),
// availability (D-160), and the schedule (D-159), and the line under the
// availability radios, built from what the server decided.

const strings = en.owner.dish;
const dish = "Soup of the day";
const names: ShowingNames = {
  tag: en.dietary.names,
  box: (part, key) =>
    part === "days"
      ? en.owner.restaurants.days[key as "mon"]
      : part === "weeks"
        ? strings.schedule.weeks[key as "first"]
        : key,
};

describe("the showing groups' Undo entries (task 5)", () => {
  it("name a tag tick by the words diners read, and say what Undo did", () => {
    const entry: TagsUndo = {
      kind: "tags",
      id: "d1",
      name: dish,
      tag: "made-without-gluten",
      on: true,
      before: [],
      after: ["made-without-gluten"],
    };
    expect(showingUndoLabel(strings, names, entry)).toBe(
      `Undo: ticked Made without gluten ingredients for ${dish}`,
    );
    expect(tagsUndoneSentence(strings.tags, names.tag, entry)).toBe(
      "Undone. Made without gluten ingredients is unticked again.",
    );
    const off: TagsUndo = { ...entry, on: false, before: ["vegan"], after: [] };
    expect(showingUndoLabel(strings, names, off)).toBe(
      `Undo: unticked Made without gluten ingredients for ${dish}`,
    );
    expect(tagsUndoneSentence(strings.tags, names.tag, off)).toBe(
      "Undone. Made without gluten ingredients is ticked again.",
    );
    expect(dishUndoSchema.safeParse(entry).success).toBe(true);
  });

  it("name an availability choice by what it made, and say what the dish is again", () => {
    const soldOut: AvailabilityUndo = {
      kind: "availability",
      id: "d1",
      name: dish,
      from: { choice: "available", available: true, soldOutAt: null },
      to: {
        choice: "sold-out",
        available: true,
        soldOutAt: "2026-10-10T20:00:00.000Z",
      },
    };
    expect(showingUndoLabel(strings, names, soldOut)).toBe(
      `Undo: marked ${dish} sold out today`,
    );
    expect(availabilityUndoneSentence(strings.availability, soldOut)).toBe(
      `Undone. ${dish} is available again.`,
    );
    const off: AvailabilityUndo = {
      ...soldOut,
      from: soldOut.to,
      to: { choice: "off", available: false, soldOutAt: null },
    };
    expect(showingUndoLabel(strings, names, off)).toBe(
      `Undo: took ${dish} off the menu`,
    );
    expect(availabilityUndoneSentence(strings.availability, off)).toBe(
      `Undone. ${dish} is sold out today again.`,
    );
    const back: AvailabilityUndo = {
      ...soldOut,
      from: off.to,
      to: { choice: "available", available: true, soldOutAt: null },
    };
    expect(showingUndoLabel(strings, names, back)).toBe(
      `Undo: made ${dish} available`,
    );
    expect(availabilityUndoneSentence(strings.availability, back)).toBe(
      `Undone. ${dish} is off the menu again.`,
    );
    expect(dishUndoSchema.safeParse(soldOut).success).toBe(true);
  });

  it("name a schedule change by its part and box, say one sentence for Undo, and read a stored schedule or none", () => {
    const base = { kind: "schedule" as const, id: "d1", name: dish };
    const tick: ScheduleUndo = {
      ...base,
      part: "days",
      box: "tue",
      on: true,
      from: null,
      to: { days: ["tue"] },
    };
    expect(showingUndoLabel(strings, names, tick)).toBe(
      `Undo: ticked Tuesday for ${dish}`,
    );
    expect(
      showingUndoLabel(strings, names, {
        ...tick,
        part: "weeks",
        box: "first",
        on: false,
      }),
    ).toBe(`Undo: unticked First for ${dish}`);
    expect(
      showingUndoLabel(strings, names, {
        ...base,
        part: "hours",
        from: null,
        to: null,
      }),
    ).toBe(`Undo: changed the hours for ${dish}`);
    expect(
      showingUndoLabel(strings, names, {
        ...base,
        part: "today",
        from: null,
        to: null,
      }),
    ).toBe(`Undo: set Today only for ${dish}`);
    expect(
      showingUndoLabel(strings, names, {
        ...base,
        part: "from",
        from: null,
        to: null,
      }),
    ).toBe(`Undo: changed the first day for ${dish}`);
    expect(
      showingUndoLabel(strings, names, {
        ...base,
        part: "until",
        from: null,
        to: null,
      }),
    ).toBe(`Undo: changed the last day for ${dish}`);
    expect(scheduleUndoneSentence(strings.schedule, tick)).toBe(
      `Undone. The schedule for ${dish} is as it was.`,
    );
    expect(dishUndoSchema.safeParse(tick).success).toBe(true);
    expect(
      dishUndoSchema.safeParse({ ...tick, to: { days: ["tuesday"] } }).success,
      "a value the domain cannot read is not an entry",
    ).toBe(false);
  });
});

describe("the line under the availability radios (D-160)", () => {
  const newYork = "America/New_York";
  const now = "2026-10-13T17:00:00Z";
  const line = (
    state: "available" | "sold-out" | "off",
    until: string | null,
  ) =>
    availabilityLine(
      strings.availability,
      { state, until },
      newYork,
      "en",
      en.time,
      now,
    );

  it("says nothing for an available dish and that an off dish is hidden", () => {
    expect(line("available", null)).toBeUndefined();
    expect(line("off", null)).toBe(strings.availability.hidden);
  });

  it("says when a sold-out dish comes back: today, midnight tonight, tomorrow, or a named day", () => {
    expect(line("sold-out", "2026-10-14T02:00:00Z")).toBe(
      "Available again on its own at 10 pm today.",
    );
    expect(line("sold-out", "2026-10-14T04:00:00Z")).toBe(
      "Available again on its own at midnight tonight.",
    );
    expect(line("sold-out", "2026-10-14T06:00:00Z")).toBe(
      "Available again on its own at 2 am tomorrow.",
    );
    expect(line("sold-out", "2026-10-15T02:00:00Z")).toBe(
      "Available again on its own at 10 pm tomorrow.",
    );
    expect(line("sold-out", "2026-10-17T02:00:00Z")).toBe(
      "Available again on its own on Friday, October 16, at 10 pm.",
    );
    expect(line("sold-out", "not a date")).toBeUndefined();
    expect(line("sold-out", null)).toBeUndefined();
  });
});
