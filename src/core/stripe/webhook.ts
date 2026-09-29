import Stripe from "stripe";

// Verifies Stripe's signature over the raw request body and returns the
// event. Throws when the header is missing, the signature is wrong, or the
// timestamp is outside the SDK's tolerance, so the route can answer 400.
export function parseStripeEvent(
  rawBody: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) throw new Error("Missing stripe-signature header.");
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
