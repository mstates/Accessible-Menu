import type { Copy } from "@/copy";
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
// it inside the restaurant's card, which owns the heading.
export function RestaurantBilling({ copy, restaurant, startTrial }: Props) {
  const state = billingState(restaurant.status, restaurant.hasStripeCustomer);
  return (
    <div className="mt-4">
      <p>{copy.owner.billing.states[state]}</p>
      {state === "unstarted" ? (
        <form action={startTrial} className="mt-4">
          <input type="hidden" name="restaurant" value={restaurant.id} />
          <Button type="submit">{copy.owner.billing.startTrial}</Button>
        </form>
      ) : null}
    </div>
  );
}
