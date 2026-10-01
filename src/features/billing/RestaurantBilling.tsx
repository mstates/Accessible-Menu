import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { billingState, type RestaurantStatus } from "@/domain/billing";
import { Button } from "@/ui/Button";

export type BillingRestaurant = {
  id: string;
  name: string;
  status: RestaurantStatus;
  hasStripeCustomer: boolean;
};

type Props = {
  copy: Copy;
  restaurant: BillingRestaurant;
  startTrial: (formData: FormData) => Promise<void>;
};

// A restaurant's billing line on the dashboard: one sentence, and before the
// trial has started, the one button that starts it (D-79). The page places
// it inside the restaurant's card, which owns the heading. The button names
// the restaurant in visually hidden text, so a list of buttons reads one
// entry per restaurant.
export function RestaurantBilling({ copy, restaurant, startTrial }: Props) {
  const state = billingState(restaurant.status, restaurant.hasStripeCustomer);
  return (
    <div className="mt-4">
      <p>{copy.owner.billing.states[state]}</p>
      {state === "unstarted" ? (
        <form action={startTrial} className="mt-4">
          <input type="hidden" name="restaurant" value={restaurant.id} />
          <Button type="submit">
            {copy.owner.billing.startTrial}
            <span className="sr-only">
              {" "}
              {fill(copy.owner.billing.startTrialFor, {
                restaurant: restaurant.name,
              })}
            </span>
          </Button>
        </form>
      ) : null}
    </div>
  );
}
