// Billing state. Pure: no React, no network (module rule 3).

export const RESTAURANT_STATUSES = [
  "trial",
  "active",
  "paused",
  "closed",
] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export function isRestaurantStatus(value: unknown): value is RestaurantStatus {
  return (
    typeof value === "string" &&
    (RESTAURANT_STATUSES as readonly string[]).includes(value)
  );
}

// Maps a Stripe subscription status to restaurants.status (D-79). D-79
// names four: trialing, active, past_due and unpaid, canceled. Stripe's own
// paused state cannot happen with the cancel end behavior we set, and
// incomplete cannot happen with a free trial and no card, but each maps to
// the nearest honest state anyway. Anything else leaves the row alone.
export function restaurantStatusFromSubscription(
  status: string,
): RestaurantStatus | null {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "paused";
    case "canceled":
    case "incomplete_expired":
      return "closed";
    default:
      return null;
  }
}

export type BillingState = "unstarted" | RestaurantStatus;

// What the dashboard says about a restaurant. A restaurant in trial with no
// Stripe customer has not been through Checkout yet, so its trial has not
// started and the owner sees the button that starts it.
export function billingState(
  status: RestaurantStatus,
  hasStripeCustomer: boolean,
): BillingState {
  if (status === "trial" && !hasStripeCustomer) return "unstarted";
  return status;
}
