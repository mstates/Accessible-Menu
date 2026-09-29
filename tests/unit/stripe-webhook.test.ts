import Stripe from "stripe";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseStripeEvent } from "../../src/core/stripe/webhook";
import {
  applyStripeEvent,
  type BillingPatch,
  type BillingStore,
} from "../../src/features/billing/webhook";

const secret = "whsec_test_secret";

function signed(payload: object): { body: string; header: string } {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
  });
  return { body, header };
}

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    type,
    api_version: "2026-08-26",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: { object },
  } as unknown as Stripe.Event;
}

function subscription(
  status: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "sub_1",
    object: "subscription",
    status,
    customer: "cus_1",
    metadata: {},
    ...extra,
  };
}

type Call = { by: "restaurant" | "customer"; id: string; patch: BillingPatch };

function fakeStore(matched = 1): { calls: Call[]; store: BillingStore } {
  const calls: Call[] = [];
  return {
    calls,
    store: {
      async updateByRestaurantId(id, patch) {
        calls.push({ by: "restaurant", id, patch });
        return matched;
      },
      async updateByCustomerId(id, patch) {
        calls.push({ by: "customer", id, patch });
        return matched;
      },
    },
  };
}

describe("parseStripeEvent", () => {
  const payload = event(
    "customer.subscription.updated",
    subscription("active"),
  );

  it("accepts a body signed with the endpoint secret", () => {
    const { body, header } = signed(payload);
    const parsed = parseStripeEvent(body, header, secret);
    expect(parsed.type).toBe("customer.subscription.updated");
  });

  it("rejects a missing header, a wrong secret, and a changed body", () => {
    const { body, header } = signed(payload);
    expect(() => parseStripeEvent(body, null, secret)).toThrow();
    expect(() => parseStripeEvent(body, header, "whsec_other")).toThrow();
    expect(() =>
      parseStripeEvent(body.replace("active", "canceled"), header, secret),
    ).toThrow();
  });
});

describe("applyStripeEvent", () => {
  it("stores the Stripe customer on the restaurant when Checkout completes", async () => {
    const { calls, store } = fakeStore();
    const result = await applyStripeEvent(
      event("checkout.session.completed", {
        id: "cs_1",
        object: "checkout.session",
        customer: "cus_1",
        client_reference_id: "rest-1",
        metadata: { restaurant_id: "rest-1" },
      }),
      store,
    );
    expect(result).toEqual({
      handled: true,
      matched: 1,
      by: "restaurant",
      patch: { stripeCustomerId: "cus_1" },
    });
    expect(calls).toEqual([
      { by: "restaurant", id: "rest-1", patch: { stripeCustomerId: "cus_1" } },
    ]);
  });

  it("sets status by the restaurant id carried in subscription metadata", async () => {
    const { calls, store } = fakeStore();
    await applyStripeEvent(
      event(
        "customer.subscription.created",
        subscription("trialing", { metadata: { restaurant_id: "rest-1" } }),
      ),
      store,
    );
    expect(calls).toEqual([
      {
        by: "restaurant",
        id: "rest-1",
        patch: { status: "trial", stripeCustomerId: "cus_1" },
      },
    ]);
  });

  it("falls back to the customer id when metadata names no restaurant", async () => {
    const { calls, store } = fakeStore();
    await applyStripeEvent(
      event("customer.subscription.updated", subscription("past_due")),
      store,
    );
    expect(calls).toEqual([
      {
        by: "customer",
        id: "cus_1",
        patch: { status: "paused", stripeCustomerId: "cus_1" },
      },
    ]);
  });

  it("closes the restaurant when the subscription is deleted", async () => {
    const { calls, store } = fakeStore();
    await applyStripeEvent(
      event("customer.subscription.deleted", subscription("canceled")),
      store,
    );
    expect(calls[0]?.patch.status).toBe("closed");
  });

  it("reports when no restaurant matched", async () => {
    const { store } = fakeStore(0);
    const result = await applyStripeEvent(
      event("customer.subscription.updated", subscription("active")),
      store,
    );
    expect(result).toMatchObject({ handled: true, matched: 0 });
  });

  it("ignores statuses and event types it does not handle", async () => {
    const { calls, store } = fakeStore();
    const skipped = await applyStripeEvent(
      event("customer.subscription.updated", subscription("incomplete")),
      store,
    );
    const other = await applyStripeEvent(
      event("invoice.paid", { id: "in_1", object: "invoice" }),
      store,
    );
    expect(skipped.handled).toBe(false);
    expect(other.handled).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("POST /api/stripe/webhook", () => {
  const fake = fakeStore();
  let POST: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    vi.doMock("../../src/features/billing/store", () => ({
      createBillingStore: () => fake.store,
    }));
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    ({ POST } = await import("../../app/api/stripe/webhook/route"));
  });

  function post(body: string, header: string | null): Request {
    const headers = new Headers({ "content-type": "application/json" });
    if (header) headers.set("stripe-signature", header);
    return new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers,
      body,
    });
  }

  it("answers 200 to a signed event and writes the status", async () => {
    const { body, header } = signed(
      event(
        "customer.subscription.updated",
        subscription("active", { metadata: { restaurant_id: "rest-1" } }),
      ),
    );
    const response = await POST(post(body, header));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: true });
    expect(fake.calls).toEqual([
      {
        by: "restaurant",
        id: "rest-1",
        patch: { status: "active", stripeCustomerId: "cus_1" },
      },
    ]);
  });

  it("answers 400 to a bad signature and writes nothing", async () => {
    const before = fake.calls.length;
    const { body } = signed(
      event("customer.subscription.updated", subscription("active")),
    );
    const response = await POST(post(body, "t=1,v1=nope"));
    expect(response.status).toBe(400);
    expect(fake.calls.length).toBe(before);
  });
});
