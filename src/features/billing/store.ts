import { revalidateRestaurant } from "@/core/cache";
import { createSupabaseAdminClient } from "@/core/supabase/admin";
import type { BillingPatch, BillingStore } from "./webhook";

function row(patch: BillingPatch): Record<string, string> {
  return {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.stripeCustomerId
      ? { stripe_customer_id: patch.stripeCustomerId }
      : {}),
  };
}

// Writes billing state with the service role. Only the webhook route calls
// this; owners never write status or the Stripe customer id themselves. A
// status change moves the restaurant into or out of the views diners read
// (Q-8, Q-31), so its pages at the edge are revalidated by its code.
export function createBillingStore(): BillingStore {
  const supabase = createSupabaseAdminClient();
  async function update(
    column: "id" | "stripe_customer_id",
    value: string,
    patch: BillingPatch,
  ): Promise<number> {
    const { data, error } = await supabase
      .from("restaurants")
      .update(row(patch))
      .eq(column, value)
      .select("id, code");
    // The cause is in the log line the client's fetch wrote (Q-64).
    if (error) throw new Error("restaurants update failed");
    if (patch.status) {
      for (const changed of data) {
        if (typeof changed.code === "string")
          revalidateRestaurant(changed.code);
      }
    }
    return data.length;
  }
  return {
    updateByRestaurantId: (id, patch) => update("id", id, patch),
    updateByCustomerId: (customerId, patch) =>
      update("stripe_customer_id", customerId, patch),
  };
}
