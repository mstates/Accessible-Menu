import type { z } from "zod";

// One line on the server for every failed PostgREST response (Q-64), so a
// failed read or write leaves its cause in Vercel's runtime log, which
// keeps about an hour. The server clients hand supabase-js loggedFetch, so
// every table and function logs from this one place and none is missed.
// Only /rest/v1 paths log, never auth. A line holds the method, the table
// or function from the path, the status, and PostgREST's code, with its
// message and hint wherever those cannot quote a value: Postgres's data
// errors (class 22) quote the value, PostgREST's request errors (PGRST1xx)
// can quote what was sent, and its token errors (PGRST3xx) are about the
// session, so those keep the code alone. Never the query string, which
// carries a compare-and-set's typed words, never a header, and never
// details, which holds the failing row or a key's values. A row that does
// not have the shape the code reads never reaches PostgREST's error, so it
// logs where it is read, with each issue's code and path only. Logging
// never throws and never changes the response.

const REST = "/rest/v1/";
// A Postgres SQLSTATE or a PostgREST code, and nothing else.
const CODE = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;
// An error's name, or its cause's code, such as ECONNREFUSED.
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
// How many of a row's shape issues a line names; the count says the rest.
const SHAPE_ISSUES = 5;

export type FailureLine = {
  method: string;
  table: string;
  status: number;
  code: string | null;
  message?: string;
  hint?: string;
};

type NoAnswerLine = {
  method: string;
  table: string;
  status: 0;
  error: string;
  cause?: string;
};

type ShapeLine = {
  table: string;
  shape: { code: string; path: (string | number)[] }[];
  issues: number;
};

function write(line: FailureLine | NoAnswerLine | ShapeLine): void {
  try {
    console.error(`postgrest ${JSON.stringify(line)}`);
  } catch {
    // Logging never throws.
  }
}

// The table or function a request names, from its path alone, or null for
// anything that is not a PostgREST call.
function tableOf(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  return path.startsWith(REST) ? path.slice(REST.length) : null;
}

// Codes whose message and hint can quote a value or the session.
function codeOnly(code: string): boolean {
  return (
    code.startsWith("22") ||
    code.startsWith("PGRST1") ||
    code.startsWith("PGRST3")
  );
}

// What a failed response may say in the log, or null when it is not a
// PostgREST call.
export function failureLine(
  method: string,
  url: string,
  status: number,
  body: unknown,
): FailureLine | null {
  const table = tableOf(url);
  if (table === null) return null;
  const error: Record<string, unknown> =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const code =
    typeof error.code === "string" && CODE.test(error.code) ? error.code : null;
  const line: FailureLine = { method, table, status, code };
  if (code !== null && !codeOnly(code)) {
    if (typeof error.message === "string") line.message = error.message;
    if (typeof error.hint === "string") line.hint = error.hint;
  }
  return line;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

async function logFailure(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  response: Response,
): Promise<void> {
  try {
    const url = urlOf(input);
    if (tableOf(url) === null) return;
    let body: unknown = null;
    try {
      body = JSON.parse(await response.clone().text());
    } catch {
      body = null;
    }
    const line = failureLine(methodOf(input, init), url, response.status, body);
    if (line) write(line);
  } catch {
    // Logging never throws.
  }
}

// A call that got no answer at all: the error's name and its cause's code,
// never its message, which can name the address.
function logNoAnswer(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  error: unknown,
): void {
  try {
    const table = tableOf(urlOf(input));
    if (table === null) return;
    const name =
      error instanceof Error && NAME.test(error.name) ? error.name : "Error";
    const cause =
      error instanceof Error ? (error.cause as { code?: unknown }) : undefined;
    const code =
      typeof cause?.code === "string" && NAME.test(cause.code)
        ? cause.code
        : undefined;
    write({
      method: methodOf(input, init),
      table,
      status: 0,
      error: name,
      ...(code ? { cause: code } : {}),
    });
  } catch {
    // Logging never throws.
  }
}

// The fetch the server clients hand supabase-js. It answers with the very
// response the network gave, after one line for a failed PostgREST call.
// Global fetch is looked up on each call, as supabase-js does, so Next's
// own fetch behaves as before.
export function loggedFetch(
  base: typeof fetch = (input, init) => globalThis.fetch(input, init),
): typeof fetch {
  return async (input, init) => {
    let response: Response;
    try {
      response = await base(input, init);
    } catch (error) {
      logNoAnswer(input, init, error);
      throw error;
    }
    if (!response.ok) await logFailure(input, init, response);
    return response;
  };
}

// A row read as the code expects it, or null, with one line naming where
// it was read and each issue's code and path, never the value.
export function shaped<S extends z.ZodType>(
  schema: S,
  data: unknown,
  table: string,
): z.output<S> | null {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues;
  write({
    table,
    shape: issues.slice(0, SHAPE_ISSUES).map((issue) => ({
      code: issue.code,
      path: issue.path.map((key) =>
        typeof key === "symbol" ? String(key) : key,
      ),
    })),
    issues: issues.length,
  });
  return null;
}
