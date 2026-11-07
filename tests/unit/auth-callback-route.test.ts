import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { noticeCookie } from "../../src/core/notice";
import { signInPath } from "../../src/features/owner/paths";

// GET /auth/callback (D-219), with the Supabase client stood in: a sign-in
// that fails lands on the sign-in page as a real load, the failure's notice
// in a cookie and nothing in the address; a code that exchanges goes on to
// where the link asked, with no notice.

let exchange: { error: { message: string } | null } = { error: null };
const exchanged: string[] = [];
let GET: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  vi.doMock("../../src/core/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        exchangeCodeForSession: async (code: string) => {
          exchanged.push(code);
          return exchange;
        },
      },
    }),
  }));
  ({ GET } = await import("../../app/auth/callback/route"));
});

const get = (query: string) =>
  GET(new NextRequest(`http://localhost${"/auth/callback"}${query}`));

function expectFailed(
  response: Response,
  notice: "sign-in-link" | "sign-in-google",
) {
  expect(response.status, "a 303 to the sign-in page").toBe(303);
  expect(response.headers.get("location")).toBe(
    `http://localhost${signInPath}`,
  );
  expect(response.headers.getSetCookie()).toEqual([
    noticeCookie(notice, signInPath),
  ]);
}

describe("GET /auth/callback", () => {
  it("lands an expired link on the sign-in page with the link's notice, asking nothing", async () => {
    expectFailed(
      await get("?error=access_denied&error_code=otp_expired"),
      "sign-in-link",
    );
    expect(exchanged).toEqual([]);
  });

  it("lands any other error there with Google's notice", async () => {
    expectFailed(
      await get("?error=server_error&error_code=unexpected_failure"),
      "sign-in-google",
    );
    expectFailed(await get("?error=access_denied"), "sign-in-google");
    expect(exchanged).toEqual([]);
  });

  it("lands a callback with no code there with the link's notice", async () => {
    expectFailed(await get(""), "sign-in-link");
    expect(exchanged).toEqual([]);
  });

  it("lands a code that does not exchange there with the link's notice", async () => {
    exchange = { error: { message: "invalid flow state" } };
    expectFailed(await get("?code=stale"), "sign-in-link");
    expect(exchanged).toEqual(["stale"]);
  });

  it("sends a code that exchanges on to where the link asked, with no notice", async () => {
    exchange = { error: null };
    const response = await get("?code=fresh&next=/app/restaurants/new");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/app/restaurants/new",
    );
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(exchanged).toContain("fresh");
  });

  it("keeps a next outside the site to the dashboard", async () => {
    exchange = { error: null };
    for (const next of ["//evil.example", "https://evil.example/app", "app"]) {
      const response = await get(
        `?code=fresh&next=${encodeURIComponent(next)}`,
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost/app");
    }
  });
});
