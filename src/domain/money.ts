import type { Price } from "./types";

export type MoneyCopy = {
  dollar: { one: string; other: string };
  cent: { one: string; other: string };
  and: string;
  to: string;
};

export type PriceText = { display: string; spoken: string };

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

// English words for whole numbers below one million, which covers every
// menu price. Other languages arrive with translations (Phase 3).
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`numberToWords needs a whole number, got ${n}`);
  }
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)] ?? String(n);
    const rest = n % 10;
    return rest === 0 ? tens : `${tens}-${ONES[rest] ?? String(rest)}`;
  }
  if (n < 1000) {
    const rest = n % 100;
    const hundreds = `${numberToWords(Math.floor(n / 100))} hundred`;
    return rest === 0 ? hundreds : `${hundreds} ${numberToWords(rest)}`;
  }
  if (n < 1_000_000) {
    const rest = n % 1000;
    const thousands = `${numberToWords(Math.floor(n / 1000))} thousand`;
    return rest === 0 ? thousands : `${thousands} ${numberToWords(rest)}`;
  }
  return String(n);
}

function split(totalCents: number): { dollars: number; cents: number } {
  return { dollars: Math.floor(totalCents / 100), cents: totalCents % 100 };
}

export function displayAmount(totalCents: number): string {
  const { dollars, cents } = split(totalCents);
  return cents === 0
    ? `$${dollars}`
    : `$${dollars}.${String(cents).padStart(2, "0")}`;
}

export function spokenAmount(totalCents: number, copy: MoneyCopy): string {
  const { dollars, cents } = split(totalCents);
  const parts: string[] = [];
  if (dollars > 0 || cents === 0) {
    const unit = dollars === 1 ? copy.dollar.one : copy.dollar.other;
    parts.push(`${numberToWords(dollars)} ${unit}`);
  }
  if (cents > 0) {
    const unit = cents === 1 ? copy.cent.one : copy.cent.other;
    parts.push(`${numberToWords(cents)} ${unit}`);
  }
  return parts.join(` ${copy.and} `);
}

// Visible numerals, spoken words (Q-6). Every price on a page comes through
// here, so the visible text, the screen reader text, and read aloud agree.
export function formatPrice(price: Price, copy: MoneyCopy): PriceText {
  switch (price.kind) {
    case "exact":
      return {
        display: displayAmount(price.cents),
        spoken: spokenAmount(price.cents, copy),
      };
    case "range": {
      const display = `${displayAmount(price.minCents)} ${copy.to} ${displayAmount(price.maxCents)}`;
      const wholeDollars =
        price.minCents % 100 === 0 && price.maxCents % 100 === 0;
      const spoken = wholeDollars
        ? `${numberToWords(price.minCents / 100)} ${copy.to} ${numberToWords(price.maxCents / 100)} ${copy.dollar.other}`
        : `${spokenAmount(price.minCents, copy)} ${copy.to} ${spokenAmount(price.maxCents, copy)}`;
      return { display, spoken };
    }
    case "text":
      return { display: price.text, spoken: price.text };
  }
}
