// Calories (D-167): a low number and an optional high one, on a dish, on
// each size, and on each option, read in words from here and nowhere else
// (module rule 8), so the dish page, the diner page, read aloud, the
// large-print PDF, and translations say the same thing. One field reads
// them (Michael, at the plan's tabs, October 10, 2026): a whole number, or
// a range as print writes it. Pure: no React, no network.

export type Calories = { low: number; high: number | null };

// Also a table constraint in the database (migration 11), which is the
// boundary. This exists to name the rule and the message.
export const CALORIE_LIMITS = { max: 99_999 } as const;

// The rules typed calories can break, which are also the keys of their
// messages.
export type CalorieRule = "caloriesFormat" | "caloriesRange" | "caloriesOrder";

// The words this module needs. The locale's copy object satisfies it.
export type CaloriesCopy = {
  one: string;
  other: string;
  range: string;
};

// A whole number with an optional thousands comma: 760, or 1,200.
const NUMBER = /^\d{1,3}(?:,\d{3})+$|^\d+$/;
// The two numbers of a range, joined by "to", a hyphen, or an en dash
// (U+2013), with or without spaces: 760 to 860, 760-860, 760 – 860.
const RANGE = /^(.+?)\s*(?:\bto\b|-|–)\s*(.+)$/;

function readNumber(text: string): number | null {
  const typed = text.trim();
  if (!NUMBER.test(typed)) return null;
  return Number(typed.replace(/,/g, ""));
}

// Reads typed calories (D-167): "760", "1,200", "760 to 860", "760-860",
// or "760 – 860", and blank for none. An equal pair is one number. Anything
// else is refused by name; it never guesses, as parsePrice never guesses.
export function parseCalories(
  text: string,
): { ok: true; calories: Calories | null } | { ok: false; rule: CalorieRule } {
  const typed = text.trim();
  if (typed === "") return { ok: true, calories: null };
  const single = readNumber(typed);
  if (single !== null) {
    if (single > CALORIE_LIMITS.max)
      return { ok: false, rule: "caloriesRange" };
    return { ok: true, calories: { low: single, high: null } };
  }
  const range = RANGE.exec(typed);
  if (!range) return { ok: false, rule: "caloriesFormat" };
  const low = readNumber(range[1] ?? "");
  const high = readNumber(range[2] ?? "");
  if (low === null || high === null)
    return { ok: false, rule: "caloriesFormat" };
  if (low > CALORIE_LIMITS.max || high > CALORIE_LIMITS.max) {
    return { ok: false, rule: "caloriesRange" };
  }
  if (high < low) return { ok: false, rule: "caloriesOrder" };
  return { ok: true, calories: { low, high: high === low ? null : high } };
}

// Calories as an owner's field shows them once saved: "760", "760 to 860",
// and blank for none. What it shows reads back to what it holds.
export function caloriesInputText(
  low: number | null,
  high: number | null,
): string {
  if (low === null) return "";
  if (high === null || high === low) return String(low);
  return `${low} to ${high}`;
}

// Calories from a row's two columns, or null when the row holds none.
export function caloriesOf(
  low: number | null,
  high: number | null,
): Calories | null {
  if (low === null) return null;
  return { low, high: high === null || high === low ? null : high };
}

// What diners read (D-167): "760 calories", "1 calorie", "760 to 860
// calories", the digits in the page's language. One builder, so the dish
// page's words and the diner page's agree.
export function caloriesWords(
  calories: Calories,
  copy: CaloriesCopy,
  lang: string,
): string {
  const digits = new Intl.NumberFormat(lang);
  const low = digits.format(calories.low);
  if (calories.high !== null && calories.high !== calories.low) {
    return copy.range
      .replace("{low}", low)
      .replace("{high}", digits.format(calories.high));
  }
  const template = calories.low === 1 ? copy.one : copy.other;
  return template.replace("{count}", low);
}
