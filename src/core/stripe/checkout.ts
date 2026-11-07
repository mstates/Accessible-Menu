import type Stripe from "stripe";
import { getStripe } from "./client";
import { stripeEnv } from "./env";

export type CheckoutInput = {
  restaurantId: string;
  ownerEmail: string;
  customerId: string | null;
  origin: string;
  priceId: string;
};

// The Checkout session that starts a restaurant's free trial (D-79): thirty
// days, no card asked for, and a trial still without a card at the end
// cancels itself. The restaurant id rides on the session and on the
// subscription so the webhook can find the row either way.
export function checkoutSessionParams(
  input: CheckoutInput,
): Stripe.Checkout.SessionCreateParams {
  const { restaurantId, ownerEmail, customerId, origin, priceId } = input;
  return {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "if_required",
    subscription_data: {
      trial_period_days: 30,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: { restaurant_id: restaurantId },
    },
    client_reference_id: restaurantId,
    metadata: { restaurant_id: restaurantId },
    // Stripe sends the owner back to the return route, which carries the
    // result into the dashboard's flash (D-219, app/app/checkout/route.ts).
    success_url: `${origin}/app/checkout?result=success`,
    cancel_url: `${origin}/app/checkout?result=cancel`,
    ...(customerId ? { customer: customerId } : { customer_email: ownerEmail }),
  };
}

// Creates the session and returns the Stripe-hosted URL to send the owner to.
export async function createCheckoutSession(
  input: Omit<CheckoutInput, "priceId">,
): Promise<string> {
  const session = await getStripe().checkout.sessions.create(
    checkoutSessionParams({ ...input, priceId: stripeEnv.priceId }),
  );
  if (!session.url) {
    throw new Error("Stripe returned a Checkout session without a URL.");
  }
  return session.url;
}
