import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// startTrial and signInWithGoogle (D-219), with Next's headers and redirect,
// the Supabase client, and Stripe's session stood in: each returns its one
// failure as its state, for the form to load the page again with the flash,
// and still leaves by redirect when it can. Google's failure cannot be
// produced against the stand-in, which builds the provider's URL with no
// network call, so this is its one cover; the trial's missing restaurant
// also lands on the stand-in (tests/local/flash-arrivals.spec.ts).

class Redirect extends Error {
  constructor(readonly url: string) {
    super("NEXT_REDIRECT");
  }
}

let claims: { email?: string } | null = { email: "owner@example.test" };
let row: { id: string; stripe_customer_id: string | null } | null = null;
let oauth: {
  data: { url: string | null };
  error: { message: string } | null;
} = { data: { url: null }, error: null };
const oauthCalls: unknown[] = [];
const sessions: unknown[] = [];
let redirects: string[] = [];

type Trial = typeof import("../../src/features/billing/actions");
type Owner = typeof import("../../src/features/owner/actions");
let startTrial: Trial["startTrial"];
let signInWithGoogle: Owner["signInWithGoogle"];

beforeAll(async () => {
  vi.doMock("next/headers", () => ({
    headers: async () => new Headers({ origin: "https://menus.example" }),
  }));
  vi.doMock("next/navigation", () => ({
    redirect: (url: string) => {
      redirects.push(url);
      throw new Redirect(url);
    },
  }));
  vi.doMock("../../src/core/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      auth: {
        getClaims: async () => ({
          data: claims ? { claims } : null,
          error: null,
        }),
        signInWithOAuth: async (input: unknown) => {
          oauthCalls.push(input);
          return oauth;
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }),
    }),
  }));
  vi.doMock("../../src/core/stripe/checkout", () => ({
    createCheckoutSession: async (input: unknown) => {
      sessions.push(input);
      return "https://checkout.stripe.test/c/pay/cs_test_1";
    },
  }));
  vi.doMock("../../src/core/cache", () => ({ expireRestaurant: () => {} }));
  ({ startTrial } = await import("../../src/features/billing/actions"));
  ({ signInWithGoogle } = await import("../../src/features/owner/actions"));
});

beforeEach(() => {
  redirects = [];
});

const trialForm = (restaurant: string) => {
  const form = new FormData();
  form.set("restaurant", restaurant);
  return form;
};

async function leaves(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    throw error;
  }
  throw new Error("the action returned instead of leaving");
}

describe("startTrial", () => {
  it("returns the missing restaurant as its state and leaves for nowhere", async () => {
    claims = { email: "owner@example.test" };
    row = null;
    await expect(
      startTrial({ status: "idle" }, trialForm("r-gone")),
    ).resolves.toEqual({ status: "missing" });
    expect(redirects).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it("leaves for Stripe with the restaurant it found", async () => {
    claims = { email: "owner@example.test" };
    row = { id: "r-1", stripe_customer_id: "cus_1" };
    const url = await leaves(() =>
      startTrial({ status: "idle" }, trialForm("r-1")),
    );
    expect(url).toBe("https://checkout.stripe.test/c/pay/cs_test_1");
    expect(sessions).toEqual([
      {
        restaurantId: "r-1",
        ownerEmail: "owner@example.test",
        customerId: "cus_1",
        origin: "https://menus.example",
      },
    ]);
  });

  it("sends a signed-out caller to sign in", async () => {
    claims = null;
    expect(
      await leaves(() => startTrial({ status: "idle" }, trialForm("r-1"))),
    ).toBe("/app/sign-in");
  });
});

describe("signInWithGoogle", () => {
  it("returns the failure as its state when Supabase gives an error or no URL", async () => {
    oauth = { data: { url: null }, error: { message: "provider off" } };
    await expect(signInWithGoogle()).resolves.toEqual({
      status: "failed",
    });
    oauth = { data: { url: null }, error: null };
    await expect(signInWithGoogle()).resolves.toEqual({
      status: "failed",
    });
    expect(redirects).toEqual([]);
  });

  it("leaves for Google, asking to come back to the callback", async () => {
    oauth = {
      data: { url: "https://accounts.google.test/o/oauth2/auth?x=1" },
      error: null,
    };
    expect(await leaves(() => signInWithGoogle())).toBe(
      "https://accounts.google.test/o/oauth2/auth?x=1",
    );
    expect(oauthCalls.at(-1)).toEqual({
      provider: "google",
      options: { redirectTo: "https://menus.example/auth/callback?next=/app" },
    });
  });
});
