import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PlacesProvider } from "../../src/core/places";
import { ADDRESS_LOOKUPS_PER_DAY } from "../../src/features/owner/address/cap";

// POST /api/address (D-83), with the provider and the session stood in: its
// refusals in order, one word each and nothing cached, and its two answers.

let claims: { sub?: string } | null = { sub: "owner-1" };
let provider: PlacesProvider | null = null;
const calls: unknown[][] = [];

const working: PlacesProvider = {
  async suggest(input, session) {
    calls.push(["suggest", input, session]);
    return [{ id: "p1", text: "2 Main Street, Reading, PA, USA" }];
  },
  async pick(id, session) {
    calls.push(["pick", id, session]);
    return {
      street: "2 Main Street",
      city: "Reading",
      state: "PA",
      zip: "19601",
      country: "US",
    };
  },
};

const broken: PlacesProvider = {
  async suggest() {
    throw new Error("down");
  },
  async pick() {
    throw new Error("down");
  },
};

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  vi.doMock("../../src/core/places", () => ({
    placesProvider: () => provider,
  }));
  vi.doMock("../../src/core/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        getClaims: async () => ({
          data: claims ? { claims } : null,
          error: null,
        }),
      },
    }),
  }));
  ({ POST } = await import("../../app/api/address/route"));
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/address", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const suggest = { kind: "suggest", input: "2 Main", session: "s-1" };

async function refused(response: Response, status: number, word: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: word });
}

describe("POST /api/address", () => {
  it("refuses with 503 while no key is set, before anything else is read", async () => {
    provider = null;
    claims = null;
    await refused(await POST(post(suggest)), 503, "off");
  });

  it("refuses a request from another site with 403", async () => {
    provider = working;
    claims = { sub: "owner-1" };
    await refused(
      await POST(post(suggest, { "sec-fetch-site": "cross-site" })),
      403,
      "origin",
    );
    expect(calls).toEqual([]);
  });

  it("refuses a caller who is signed out with 401", async () => {
    provider = working;
    claims = null;
    await refused(await POST(post(suggest)), 401, "signed-out");
    claims = {};
    await refused(await POST(post(suggest)), 401, "signed-out");
    expect(calls).toEqual([]);
  });

  it("refuses a body that is not the protocol with 400 and asks nothing", async () => {
    provider = working;
    claims = { sub: "owner-1" };
    await refused(await POST(post("{")), 400, "request");
    await refused(
      await POST(post({ input: "2 Main", session: "s-1" })),
      400,
      "request",
    );
    await refused(
      await POST(post({ ...suggest, input: "x".repeat(201) })),
      400,
      "request",
    );
    await refused(
      await POST(post({ ...suggest, session: "has a space" })),
      400,
      "request",
    );
    await refused(
      await POST(post({ kind: "pick", id: "a/b", session: "s-1" })),
      400,
      "request",
    );
    expect(calls).toEqual([]);
  });

  it("answers a suggest with the provider's list, the session passed through", async () => {
    provider = working;
    claims = { sub: "owner-1" };
    const response = await POST(post({ ...suggest, input: "  2 Main " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      suggestions: [{ id: "p1", text: "2 Main Street, Reading, PA, USA" }],
    });
    expect(calls.at(-1)).toEqual(["suggest", "2 Main", "s-1"]);
  });

  it("answers a pick with the parts", async () => {
    provider = working;
    claims = { sub: "owner-1" };
    const response = await POST(
      post({ kind: "pick", id: "ChIJ2main_-x", session: "s-1" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      parts: {
        street: "2 Main Street",
        city: "Reading",
        state: "PA",
        zip: "19601",
        country: "US",
      },
    });
    expect(calls.at(-1)).toEqual(["pick", "ChIJ2main_-x", "s-1"]);
  });

  it("answers 502 when the provider fails", async () => {
    provider = broken;
    claims = { sub: "owner-1" };
    await refused(await POST(post(suggest)), 502, "upstream");
  });

  it("refuses an owner's requests past the day's fuse with 429", async () => {
    provider = working;
    claims = { sub: "cap-owner" };
    for (let i = 0; i < ADDRESS_LOOKUPS_PER_DAY; i += 1) {
      expect((await POST(post(suggest))).status).toBe(200);
    }
    await refused(await POST(post(suggest)), 429, "cap");
    claims = { sub: "owner-1" };
    expect((await POST(post(suggest))).status).toBe(200);
  });
});
