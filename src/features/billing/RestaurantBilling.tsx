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
// trial has started, the one button that starts it (D-79).
export function RestaurantBilling({ copy, restaurant, startTrial }: Props) {
  const state = billingState(restaurant.status, restaurant.hasStripeCustomer);
  const headingId = `restaurant-${restaurant.id}`;
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h2 id={headingId} className="text-xl font-bold">
        {restaurant.name}
      </h2>
      <p className="mt-2">{copy.owner.billing.states[state]}</p>
      {state === "unstarted" ? (
        <form action={startTrial} className="mt-4">
          <input type="hidden" name="restaurant" value={restaurant.id} />
          <Button type="submit">{copy.owner.billing.startTrial}</Button>
        </form>
      ) : null}
    </section>
  );
}
