import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { formatTime, parseTime } from "../../src/domain/time";

// D-105: the owner types a time, the parser reads it into 24-hour HH:MM and
// never guesses am or pm, and a saved time comes back in one format.

function read(text: string): string {
  const result = parseTime(text);
  return result.ok ? result.time : `error: ${result.problem}`;
}

describe("reading a typed time (D-105)", () => {
  it.each([
    ["11am", "11:00"],
    ["11 am", "11:00"],
    ["11 AM", "11:00"],
    ["11 a.m.", "11:00"],
    ["11a", "11:00"],
    ["11:30pm", "23:30"],
    ["5:30 p.m.", "17:30"],
    ["5 : 30 PM", "17:30"],
    ["530pm", "17:30"],
    ["5p", "17:00"],
    ["17:30", "17:30"],
    ["1730", "17:30"],
    ["17", "17:00"],
    ["0:30", "00:30"],
    ["00:00", "00:00"],
    ["0", "00:00"],
    ["23:59", "23:59"],
    ["noon", "12:00"],
    ["12 pm", "12:00"],
    ["12:00 pm", "12:00"],
    ["midnight", "00:00"],
    ["12 am", "00:00"],
    ["12:00 am", "00:00"],
    ["12:30 am", "00:30"],
    ["12:30 pm", "12:30"],
    ["1:05 a.m.", "01:05"],
  ])("reads %j as %s", (typed, time) => {
    expect(read(typed)).toBe(time);
  });

  it.each([
    ["5.30 pm", "17:30"],
    ["5.30pm", "17:30"],
    ["5.30 p.m.", "17:30"],
    ["11.30a", "11:30"],
    ["17.30", "17:30"],
    ["0.30", "00:30"],
    ["12.00 pm", "12:00"],
    ["12.00 am", "00:00"],
    ["12.30 am", "00:30"],
  ])("reads a period between hours and minutes: %j as %s", (typed, time) => {
    expect(read(typed)).toBe(time);
  });

  it("splits am or pm off first, so the periods in p.m. are never a separator", () => {
    expect(read("5p.m.")).toBe("17:00");
    expect(read("5.30p.m.")).toBe("17:30");
    expect(read("11.a.m.")).toBe("error: format");
  });

  it("ignores case and spacing, a narrow no-break space included", () => {
    expect(read("  NOON ")).toBe("12:00");
    expect(read("Midnight")).toBe("00:00");
    expect(read("5:30 PM")).toBe("17:30");
    expect(read("5:30 pm")).toBe("17:30");
    expect(read("1 1 : 3 0 p m")).toBe("23:30");
  });

  it.each(["5", "5:30", "5.30", "530", "12:30", "12.30", "12", "07:30", "1"])(
    "never guesses am or pm for %j",
    (typed) => {
      expect(read(typed)).toBe("error: ampm");
    },
  );

  it.each([
    "",
    "lunch",
    "25:00",
    "24:00",
    "11:60 pm",
    "11.60 pm",
    "13 pm",
    "0 am",
    "0:30 am",
    "5:3 pm",
    "5.3 pm",
    "5,30 pm",
    "11-9",
    "pm",
    "12345",
    "5:30 pmm",
  ])("rejects %j as not a time", (typed) => {
    expect(read(typed)).toBe("error: format");
  });
});

describe("showing a stored time (D-105)", () => {
  it.each([
    ["00:00", "midnight"],
    ["12:00", "noon"],
    ["17:30", "5:30 pm"],
    ["11:00", "11 am"],
    ["00:30", "12:30 am"],
    ["12:45", "12:45 pm"],
    ["01:05", "1:05 am"],
    ["23:59", "11:59 pm"],
    ["13:00", "1 pm"],
  ])("shows %s as %j", (time, shown) => {
    expect(formatTime(time, en.time)).toBe(shown);
  });

  it("leaves anything that is not a stored time as it is", () => {
    expect(formatTime("5pm", en.time)).toBe("5pm");
    expect(formatTime("24:00", en.time)).toBe("24:00");
  });

  it("reads back every minute of the day it shows", () => {
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const time = `${hh}:${mm}`;
      expect(read(formatTime(time, en.time))).toBe(time);
    }
  });
});
