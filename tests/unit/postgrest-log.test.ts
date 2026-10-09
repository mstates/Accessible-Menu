import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { failureLine, loggedFetch, shaped } from "../../src/core/supabase/log";
import { listOwnerSections } from "../../src/core/supabase/sections";

// What a log line may hold (Q-64). The sentinel stands for a typed value, a
// stored row, or the session, and is put in every place the rule says it
// must never reach the log: a data error's message and hint, a request
// error's message, details, the query string, a header, and the body sent.

const SENTINEL = "SENTINEL-q64";
const BASE = "https://stand-in.example.test";
const sectionsUrl = `${BASE}/rest/v1/sections?select=id&every_item=eq.${SENTINEL}`;
const sent: RequestInit = {
  method: "PATCH",
  headers: { Authorization: `Bearer ${SENTINEL}`, apikey: SENTINEL },
  body: JSON.stringify({ every_item: SENTINEL }),
};

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function answer(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A fetch through the logger whose network always gives this answer.
function through(response: Response): typeof fetch {
  return loggedFetch(async () => response);
}

// The one line written, read back, with the sentinel nowhere in it.
function onlyLine(): unknown {
  expect(lines).toHaveLength(1);
  const [line = ""] = lines;
  expect(line.startsWith("postgrest {")).toBe(true);
  expect(line).not.toContain(SENTINEL);
  return JSON.parse(line.slice("postgrest ".length));
}

describe("a failed PostgREST response logs one line", () => {
  it("keeps the code alone for a data error, which quotes the value", async () => {
    await through(
      answer(400, {
        code: "22P02",
        message: `invalid input syntax for type uuid: "${SENTINEL}"`,
        details: SENTINEL,
        hint: SENTINEL,
      }),
    )(sectionsUrl, sent);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "sections",
      status: 400,
      code: "22P02",
    });
  });

  it("keeps the code alone for a request error, which can quote what was sent", async () => {
    await through(
      answer(400, {
        code: "PGRST100",
        message: `"failed to parse filter (eq.${SENTINEL})" (line 1, column 4)`,
        details: `unexpected "${SENTINEL}"`,
        hint: null,
      }),
    )(sectionsUrl, sent);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "sections",
      status: 400,
      code: "PGRST100",
    });
  });

  it("keeps the code alone for a token error, which is about the session", async () => {
    await through(
      answer(401, {
        code: "PGRST301",
        message: `JWSError ${SENTINEL}`,
        details: null,
        hint: null,
      }),
    )(sectionsUrl, sent);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "sections",
      status: 401,
      code: "PGRST301",
    });
  });

  it("keeps a constraint's message and never its details, which hold the key's values or the row", async () => {
    await through(
      answer(409, {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "items_name_key"',
        details: `Key (section_id, lower(name))=(1, ${SENTINEL}) already exists.`,
        hint: null,
      }),
    )(`${BASE}/rest/v1/items?id=eq.${SENTINEL}`, sent);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "items",
      status: 409,
      code: "23505",
      message:
        'duplicate key value violates unique constraint "items_name_key"',
    });

    lines = [];
    await through(
      answer(400, {
        code: "23514",
        message:
          'new row for relation "items" violates check constraint "items_note_check"',
        details: `Failing row contains (${SENTINEL}).`,
        hint: null,
      }),
    )(`${BASE}/rest/v1/items?id=eq.1`, sent);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "items",
      status: 400,
      code: "23514",
      message:
        'new row for relation "items" violates check constraint "items_note_check"',
    });
  });

  it("keeps our own raise's name and a missing column's message and hint", async () => {
    await through(
      answer(400, {
        code: "P0001",
        message: "other_allergen_comma",
        details: SENTINEL,
        hint: null,
      }),
    )(`${BASE}/rest/v1/sections?id=eq.${SENTINEL}`, sent);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "sections",
      status: 400,
      code: "P0001",
      message: "other_allergen_comma",
    });

    lines = [];
    await through(
      answer(400, {
        code: "42703",
        message: "column sections.every_item_custom_allergens does not exist",
        details: null,
        hint: 'Perhaps you meant to reference the column "sections.every_item".',
      }),
    )(`${BASE}/rest/v1/rpc/move_section`, { method: "POST" });
    expect(onlyLine()).toEqual({
      method: "POST",
      table: "rpc/move_section",
      status: 400,
      code: "42703",
      message: "column sections.every_item_custom_allergens does not exist",
      hint: 'Perhaps you meant to reference the column "sections.every_item".',
    });
  });

  it("writes no text from a body that is not PostgREST's, and only a code that looks like one", async () => {
    await through(answer(502, `<html><body>${SENTINEL}</body></html>`))(
      sectionsUrl,
      sent,
    );
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "sections",
      status: 502,
      code: null,
    });

    expect(
      failureLine("GET", sectionsUrl, 400, {
        code: SENTINEL,
        message: SENTINEL,
      }),
    ).toEqual({ method: "GET", table: "sections", status: 400, code: null });
  });

  it("writes nothing for an auth call, and nothing for an answer that is ok", async () => {
    await through(answer(401, { message: SENTINEL, code: "23505" }))(
      `${BASE}/auth/v1/user?token=${SENTINEL}`,
      sent,
    );
    await through(answer(200, [{ id: SENTINEL }]))(sectionsUrl, sent);
    expect(lines).toEqual([]);
    expect(failureLine("GET", `${BASE}/auth/v1/user`, 401, {})).toBeNull();
  });

  it("answers with the very response, its body still readable", async () => {
    const body = { code: "23505", message: "taken", details: SENTINEL };
    const response = answer(409, body);
    const got = await through(response)(sectionsUrl, sent);
    expect(got).toBe(response);
    expect(await got.json()).toEqual(body);
  });

  it("logs a call that got no answer by its error's name and cause code, then throws the same error", async () => {
    const error = new TypeError(`fetch failed ${SENTINEL}`, {
      cause: Object.assign(new Error(`connect ECONNREFUSED ${SENTINEL}`), {
        code: "ECONNREFUSED",
      }),
    });
    const logged = loggedFetch(async () => {
      throw error;
    });
    await expect(logged(sectionsUrl, sent)).rejects.toBe(error);
    expect(onlyLine()).toEqual({
      method: "PATCH",
      table: "sections",
      status: 0,
      error: "TypeError",
      cause: "ECONNREFUSED",
    });
  });

  it("never throws when writing the line fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("the log is gone");
    });
    const response = answer(500, { code: "XX000", message: "internal" });
    await expect(through(response)(sectionsUrl, sent)).resolves.toBe(response);
  });
});

describe("a row that does not have the shape the code reads", () => {
  const schema = z.object({
    name: z.string(),
    allergens: z.array(z.enum(["milk", "eggs"])),
  });

  it("logs each issue's code and path, never the value, and reads as null", () => {
    expect(
      shaped(
        schema,
        { name: SENTINEL, allergens: ["milk", SENTINEL] },
        "items",
      ),
    ).toBeNull();
    expect(onlyLine()).toEqual({
      table: "items",
      shape: [{ code: "invalid_value", path: ["allergens", 1] }],
      issues: 1,
    });
  });

  it("names five issues at most and counts them all", () => {
    const rows = Array.from({ length: 8 }, () => ({
      name: 1,
      allergens: [SENTINEL],
    }));
    expect(shaped(z.array(schema), rows, "items")).toBeNull();
    const line = onlyLine() as { shape: unknown[]; issues: number };
    expect(line.shape).toHaveLength(5);
    expect(line.issues).toBe(16);
  });

  it("reads a row that has the shape, and writes nothing", () => {
    expect(
      shaped(schema, { name: "Soup", allergens: ["milk"] }, "items"),
    ).toEqual({ name: "Soup", allergens: ["milk"] });
    expect(lines).toEqual([]);
  });
});

describe("a read that fails", () => {
  it("throws its own sentence alone, and the cause is in the one line", async () => {
    const client = createClient(BASE, "sb_publishable_standin", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: through(
          answer(400, {
            code: "22P02",
            message: `invalid input syntax for type uuid: "${SENTINEL}"`,
            details: SENTINEL,
            hint: null,
          }),
        ),
      },
    });
    await expect(listOwnerSections(client, SENTINEL)).rejects.toThrow(
      /^sections could not be read$/,
    );
    expect(onlyLine()).toEqual({
      method: "GET",
      table: "sections",
      status: 400,
      code: "22P02",
    });
  });
});
