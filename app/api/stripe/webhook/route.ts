import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeEnv } from "@/core/stripe/env";
import { parseStripeEvent } from "@/core/stripe/webhook";
import { createBillingStore } from "@/features/billing/store";
import { applyStripeEvent } from "@/features/billing/webhook";

// Stripe posts subscription events here. The signature is checked over the
// raw body before anything is parsed: a bad one gets 400 and Stripe stops
// retrying. A failed database write throws, Next answers 500, and Stripe
// retries later. Nothing here reads cookies or an owner session.
export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = parseStripeEvent(
      rawBody,
      request.headers.get("stripe-signature"),
      stripeEnv.webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const result = await applyStripeEvent(event, createBillingStore());
  if (result.handled && result.matched === 0) {
    console.warn(
      `stripe webhook ${event.type}: no restaurant matched by ${result.by}`,
    );
  }
  return NextResponse.json({ received: true, handled: result.handled });
}
