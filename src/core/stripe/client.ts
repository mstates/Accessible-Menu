import Stripe from "stripe";
import { stripeEnv } from "./env";

let stripe: Stripe | undefined;

// One Stripe client per server process. The SDK pins API version
// 2026-08-26, the version the webhook endpoint is registered with.
export function getStripe(): Stripe {
  stripe ??= new Stripe(stripeEnv.secretKey);
  return stripe;
}
