import { z } from "zod";

// What a write names of the row it would change (D-237, rule 2): the values
// its page showed, in the same statement as the write, so the write lands
// only if the row still holds them. The version is the values, never a
// counter and never a clock. Every writer in this folder that updates a row
// compares through here, and tests/unit/compare-guard.test.ts holds each one
// to it by name.
//
// A value handed back is the server's own, as PostgREST returned it: never
// one read back from a field, rebuilt from the text a field shows, or
// checked by the field's own rule. A compare that could never match would
// refuse every save of its row.

// A value a page was shown for one column: a text, a number, a flag, a list
// of words, or nothing.
export type Shown = string | number | boolean | null | readonly string[];

// The one bound on a text handed back: at least twice every column's cap,
// whether the cap is counted in characters or in UTF-16 units, so a stored
// value at its cap always passes. Never a field's own rule: a field's rule
// says what may be typed, and a row can hold what no field would take.
export const SHOWN_TEXT_BOUND = 8_000;
export const shownTextSchema = z.string().max(SHOWN_TEXT_BOUND);

// A Postgres array literal, for comparing an array column against the value
// the page showed: {"milk","wheat"}. Every element is quoted, with its
// quotes and backslashes escaped, so any name travels whole.
export function arrayLiteral(values: readonly string[]): string {
  const quoted = values.map(
    (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${quoted.join(",")}}`;
}

// The two filters a compare is made of, as a query builder offers them.
type Compared<Query> = {
  eq(column: string, value: string | number | boolean): Query;
  is(column: string, value: null): Query;
};

// One compare. Nothing is the only value that asks whether the column is
// null: zero, false, and an empty text are values and are compared as
// themselves, and nothing is never sent as the word "null", which
// PostgREST would compare with a text of that word.
export function holding<Query extends Compared<Query>>(
  query: Query,
  column: string,
  shown: Shown,
): Query {
  if (shown === null) return query.is(column, null);
  if (typeof shown === "object") {
    return query.eq(column, arrayLiteral(shown));
  }
  return query.eq(column, shown);
}

// What a compare-and-set that matched no row met, read once more with the
// same scope and no compare. The read never decides a write: the write was
// refused by its own statement. It says which sentence the owner hears, and
// it finds the one case that is no refusal at all, a row that already
// holds every value the write would have set: a save whose answer was lost
// on the way back did land, and its retry finds the value it wrote.
export type Missed<Row> =
  | { kind: "landed"; row: Row }
  | { kind: "moved" }
  | { kind: "not-found" }
  | { kind: "failed" };

export async function missed<Row>(
  read: PromiseLike<{ data: unknown; error: unknown }>,
  shape: (data: unknown) => Row | null,
  holds: (row: Row) => boolean,
): Promise<Missed<Row>> {
  const { data, error } = await read;
  if (error) return { kind: "failed" };
  if (data === null || data === undefined) return { kind: "not-found" };
  const row = shape(data);
  if (row === null) return { kind: "failed" };
  return holds(row) ? { kind: "landed", row } : { kind: "moved" };
}

// How much of a request's address one compare takes, as the client encodes
// it. A compare travels in the query string, and the address with its
// headers has a ceiling near 16 KB on the hosted project (Supabase's own
// troubleshooting guide), which only a row of several long texts can reach.
export function compareLength(column: string, shown: Shown): number {
  const params = new URLSearchParams();
  if (shown === null) params.append(column, "is.null");
  else if (typeof shown === "object") {
    params.append(column, `eq.${arrayLiteral(shown)}`);
  } else params.append(column, `eq.${shown}`);
  // The pair, and the "&" that joins it to the next.
  return params.toString().length + 1;
}

// The most of a request's address the compares of one write may take.
export const ADDRESS_BUDGET = 12_000;
