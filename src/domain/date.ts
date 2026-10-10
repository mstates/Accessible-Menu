import { zonedDay, type Day } from "./timezones";

// A calendar day as an owner types it and as a schedule stores it (D-159).
// The parser reads what the owner typed into YYYY-MM-DD and never guesses:
// a date with no year is the next such date on or after today, a two-digit
// year and a day-first number are errors, and a day that does not exist is
// too. Month names are read in English, as noon and midnight are in
// time.ts; the formatter speaks through Intl. Pure: no React, no network.

export type DateProblem = "format";

export type ParsedDate =
  { ok: true; day: Day } | { ok: false; problem: DateProblem };

export const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const FORMAT: ParsedDate = { ok: false, problem: "format" };

// V8 reads 2027-02-30 as March 2, so the day must read back as itself.
export function isRealDay(day: string): boolean {
  if (!DATE_PATTERN.test(day)) return false;
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// A month typed in full, or its first three letters, with or without a
// period ("oct", "oct.", "sept" too).
function monthNumber(word: string): number | null {
  const name = word.replace(/\.$/, "");
  if (name.length < 3) return null;
  const index = MONTHS.findIndex(
    (month) => month === name || (name.length <= 4 && month.startsWith(name)),
  );
  return index === -1 ? null : index + 1;
}

function iso(year: number, month: number, dayOfMonth: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

function real(year: number, month: number, dayOfMonth: number): ParsedDate {
  const day = iso(year, month, dayOfMonth);
  return isRealDay(day) ? { ok: true, day } : FORMAT;
}

// The next such date on or after today. February 29 waits for a leap year.
function nextOf(month: number, dayOfMonth: number, today: Day): ParsedDate {
  const year = Number(today.slice(0, 4));
  for (let step = 0; step < 8; step += 1) {
    const day = iso(year + step, month, dayOfMonth);
    if (isRealDay(day) && day >= today) return { ok: true, day };
  }
  return FORMAT;
}

// Four digits of year, two of month, two of day, with dashes.
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
// Month, day, and perhaps a four-digit year, with slashes (10/31/2026).
const SLASHES = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
// A month in words, then the day, then perhaps a year (October 31, 2026).
const MONTH_FIRST = /^([a-z]+\.?)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/;
// The day, then a month in words, then perhaps a year (31 October 2026).
const DAY_FIRST = /^(\d{1,2})\s+([a-z]+\.?)(?:,?\s+(\d{4}))?$/;

export function parseDate(text: string, today: Day): ParsedDate {
  const compact = text.trim().toLowerCase().replace(/\s+/g, " ");
  const dashed = ISO.exec(compact);
  if (dashed) {
    return real(Number(dashed[1]), Number(dashed[2]), Number(dashed[3]));
  }
  const slashed = SLASHES.exec(compact);
  if (slashed) {
    const month = Number(slashed[1]);
    const dayOfMonth = Number(slashed[2]);
    if (slashed[3]) return real(Number(slashed[3]), month, dayOfMonth);
    return nextOf(month, dayOfMonth, today);
  }
  const worded = MONTH_FIRST.exec(compact) ?? DAY_FIRST.exec(compact);
  if (!worded) return FORMAT;
  const monthFirst = MONTH_FIRST.test(compact);
  const month = monthNumber(monthFirst ? (worded[1] ?? "") : (worded[2] ?? ""));
  const dayOfMonth = Number(monthFirst ? worded[2] : worded[1]);
  if (month === null) return FORMAT;
  if (worded[3]) return real(Number(worded[3]), month, dayOfMonth);
  return nextOf(month, dayOfMonth, today);
}

function utc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

// One format for every saved date: "October 31, 2026", the year always,
// so the owner sees the year a date with none was given.
export function formatDate(day: Day, lang: string): string {
  if (!isRealDay(day)) return day;
  return new Intl.DateTimeFormat(lang, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(day));
}

// A day with its weekday, "Tuesday, October 13", with the year when it is
// not today's: for when a special next shows, when a sold-out mark ends,
// and what Today only set.
export function formatDayAndDate(day: Day, today: Day, lang: string): string {
  if (!isRealDay(day)) return day;
  return new Intl.DateTimeFormat(lang, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(utc(day));
}

// Today in a zone, as YYYY-MM-DD.
export function todayIn(zone: string, now: Date): Day {
  return zonedDay(zone, now).day;
}
