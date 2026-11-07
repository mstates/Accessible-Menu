import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { noticeCookie } from "../../src/core/notice";
import { checkoutSessionParams } from "../../src/core/stripe/checkout";
import { dashboardPath } from "../../src/features/owner/paths";

// GET /app/checkout, Stripe's return (D-219), with the session stood in:
// the result goes into the dashboard's notice cookie for a signed-in owner,
// then a 303 to the dashboard clean; a result it does not know, and a
// visitor who is not signed in, get the 303 and no cookie.

let claims: { email?: string } | null = { email: "owner@example.test" };
let GET: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
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
  ({ GET } = await import("../../app/app/checkout/route"));
});

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/app/checkout${query}`));

function expectHop(response: Response) {
  expect(response.status, "a 303 to the dashboard").toBe(303);
  expect(response.headers.get("location")).toBe(
    `http://localhost${dashboardPath}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("GET /app/checkout", () => {
  it("carries a success into the dashboard's cookie", async () => {
    claims = { email: "owner@example.test" };
    const response = await get("?result=success");
    expectHop(response);
    expect(response.headers.getSetCookie()).toEqual([
      noticeCookie("checkout-success", dashboardPath),
    ]);
  });

  it("carries a cancel the same way", async () => {
    claims = { email: "owner@example.test" };
    const response = await get("?result=cancel");
    expectHop(response);
    expect(response.headers.getSetCookie()).toEqual([
      noticeCookie("checkout-cancel", dashboardPath),
    ]);
  });

  it("sets nothing for a result it does not know, or none", async () => {
    claims = { email: "owner@example.test" };
    for (const query of ["?result=missing", "?result=bogus", "?result=", ""]) {
      const response = await get(query);
      expectHop(response);
      expect(response.headers.getSetCookie(), query).toEqual([]);
    }
  });

  it("sets nothing for a visitor who is not signed in", async () => {
    claims = null;
    expectHop(await get("?result=success"));
    expect((await get("?result=success")).headers.getSetCookie()).toEqual([]);
    claims = {};
    expect((await get("?result=cancel")).headers.getSetCookie()).toEqual([]);
  });
});

describe("the Checkout session's return addresses", () => {
  it("point at the return route with the result in the query", () => {
    const params = checkoutSessionParams({
      restaurantId: "r-1",
      ownerEmail: "owner@example.test",
      customerId: null,
      origin: "https://menus.example",
      priceId: "price_1",
    });
    expect(params.success_url).toBe(
      "https://menus.example/app/checkout?result=success",
    );
    expect(params.cancel_url).toBe(
      "https://menus.example/app/checkout?result=cancel",
    );
  });
});
