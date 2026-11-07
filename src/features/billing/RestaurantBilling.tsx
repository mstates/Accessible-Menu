import type { Copy } from "@/copy";
import { billingState, type RestaurantStatus } from "@/domain/billing";
import { StartTrialForm } from "./StartTrialForm";

export type BillingRestaurant = {
  id: string;
  name: string;
  status: RestaurantStatus;
  hasStripeCustomer: boolean;
};

type Props = {
  copy: Copy;
  restaurant: BillingRestaurant;
  // The page this line is on, where the trial's failure loads its flash
  // (D-219).
  path: string;
};

// A restaurant's billing line on the dashboard: one sentence, and before the
// trial has started, the one button that starts it (D-79). The page places
// it inside the restaurant's card, which owns the heading.
export function RestaurantBilling({ copy, restaurant, path }: Props) {
  const state = billingState(restaurant.status, restaurant.hasStripeCustomer);
  return (
    <div className="mt-4">
      <p>{copy.owner.billing.states[state]}</p>
      {state === "unstarted" ? (
        <StartTrialForm
          copy={copy}
          restaurant={{ id: restaurant.id, name: restaurant.name }}
          path={path}
        />
      ) : null}
    </div>
  );
}
