import type Stripe from "stripe";
import {
  restaurantStatusFromSubscription,
  type RestaurantStatus,
} from "@/domain/billing";

export type BillingPatch = {
  status?: RestaurantStatus;
  stripeCustomerId?: string;
};

// The one write the webhook needs. Each call returns how many rows matched.
export type BillingStore = {
  updateByRestaurantId(
    restaurantId: string,
    patch: BillingPatch,
  ): Promise<number>;
  updateByCustomerId(customerId: string, patch: BillingPatch): Promise<number>;
};

export type BillingEventResult =
  | { handled: false; reason: string }
  | { handled: true; matched: number; patch: BillingPatch; by: string };

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

// Applies one Stripe event to restaurants. Every write sets a state rather
// than changing one, so Stripe's retries and duplicate deliveries are safe.
// The restaurant id in the subscription metadata is the primary key for the
// lookup; the Stripe customer id is the fallback.
export async function applyStripeEvent(
  event: Stripe.Event,
  store: BillingStore,
): Promise<BillingEventResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = customerIdOf(session.customer);
      const restaurantId =
        session.client_reference_id ?? session.metadata?.restaurant_id ?? null;
      if (!customerId || !restaurantId) {
        return {
          handled: false,
          reason: "session without customer or restaurant",
        };
      }
      const patch = { stripeCustomerId: customerId };
      const matched = await store.updateByRestaurantId(restaurantId, patch);
      return { handled: true, matched, patch, by: "restaurant" };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const status = restaurantStatusFromSubscription(subscription.status);
      if (!status) {
        return {
          handled: false,
          reason: `subscription status ${subscription.status}`,
        };
      }
      const customerId = customerIdOf(subscription.customer);
      const restaurantId = subscription.metadata.restaurant_id;
      const patch: BillingPatch = customerId
        ? { status, stripeCustomerId: customerId }
        : { status };
      if (restaurantId) {
        const matched = await store.updateByRestaurantId(restaurantId, patch);
        return { handled: true, matched, patch, by: "restaurant" };
      }
      if (customerId) {
        const matched = await store.updateByCustomerId(customerId, patch);
        return { handled: true, matched, patch, by: "customer" };
      }
      return {
        handled: false,
        reason: "subscription without restaurant or customer",
      };
    }
    default:
      return { handled: false, reason: `unhandled event ${event.type}` };
  }
}
