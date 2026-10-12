// A time of day as an owner types it and as the hours store it (D-92, D-105).
// The parser reads what the owner typed into 24-hour HH:MM and never
// guesses: an hour from 1 to 12 without am or pm is an error that asks for
// one, because a wrong hour on a diner page is worse than one more error.
// The formatter turns a stored time back into the one format the owner sees
// after a save, so they see what was understood. Its words come from copy.
// Pure: no React, no network.

export type TimeCopy = {
  am: string;
  pm: string;
  noon: string;
  midnight: string;
};

export type TimeProblem = "ampm" | "format";

export type ParsedTime =
  { ok: true; time: string } | { ok: false; problem: TimeProblem };

// A stored time: 24-hour, two digits each side.
export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// am, a.m., a, pm, p.m., or p at the end, each period optional. It is split
// off before the digits are read, so the periods in "p.m." are never taken
// for the separator between hours and minutes.
const MERIDIEM = /^(.*?)([ap])\.?(?:m\.?)?$/;

// The hour alone (5, 17), the hour and two digits of minutes with nothing
// between (530, 1730), or with a colon or a period (5:30, 5.30, 17:30).
const DIGITS = /^(\d{1,2})(?:[:.]?(\d{2}))?$/;

const AMPM: ParsedTime = { ok: false, problem: "ampm" };
const FORMAT: ParsedTime = { ok: false, problem: "format" };

function stored(hour: number, minutes: number): ParsedTime {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return { ok: true, time: `${hh}:${mm}` };
}

// Case and spacing never matter, a narrow no-break space included. With am
// or pm the hour runs 1 to 12. Without, an hour of 0 or 13 to 23 is a
// 24-hour time and an hour of 1 to 12 asks for am or pm.
export function parseTime(text: string): ParsedTime {
  const compact = text.toLowerCase().replace(/\s+/g, "");
  if (compact === "noon") return stored(12, 0);
  if (compact === "midnight") return stored(0, 0);

  const meridiem = MERIDIEM.exec(compact);
  const digits = DIGITS.exec(meridiem ? (meridiem[1] ?? "") : compact);
  if (!digits) return FORMAT;
  const hour = Number(digits[1]);
  const minutes = Number(digits[2] ?? "0");
  if (minutes > 59) return FORMAT;

  if (meridiem) {
    if (hour < 1 || hour > 12) return FORMAT;
    return stored((hour % 12) + (meridiem[2] === "p" ? 12 : 0), minutes);
  }
  if (hour >= 1 && hour <= 12) return AMPM;
  if (hour > 23) return FORMAT;
  return stored(hour, minutes);
}

// One format for every stored time: the hour, the minutes unless it is on
// the hour, then am or pm (5:30 pm, 11 am, 12:30 am). Noon and midnight are
// words, since 12 am and 12 pm are the two times people misread.
export function formatTime(time: string, words: TimeCopy): string {
  if (!TIME_PATTERN.test(time)) return time;
  const [hh = "00", mm = "00"] = time.split(":");
  const hour = Number(hh);
  if (mm === "00" && hour === 0) return words.midnight;
  if (mm === "00" && hour === 12) return words.noon;
  const suffix = hour < 12 ? words.am : words.pm;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return mm === "00" ? `${twelve} ${suffix}` : `${twelve}:${mm} ${suffix}`;
}

// A range as "4 to 9 pm" through the given template ("{open} to {close}"):
// a shared am or pm is said once, at the end. Noon and midnight carry no
// suffix, so "noon to 3 pm" stays as it is. One place for a special's
// hours and the restaurant's (module rule 8).
export function formatTimeRange(
  open: string,
  close: string,
  template: string,
  words: TimeCopy,
): string {
  const from = formatTime(open, words);
  const to = formatTime(close, words);
  const shared = [words.am, words.pm].find(
    (suffix) => from.endsWith(` ${suffix}`) && to.endsWith(` ${suffix}`),
  );
  return template
    .replace("{open}", shared ? from.slice(0, -(shared.length + 1)) : from)
    .replace("{close}", to);
}
