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
// this; owners never write status or the Stripe customer id themselves.
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
      .select("id");
    if (error) throw new Error(`restaurants update failed: ${error.message}`);
    return data.length;
  }
  return {
    updateByRestaurantId: (id, patch) => update("id", id, patch),
    updateByCustomerId: (customerId, patch) =>
      update("stripe_customer_id", customerId, patch),
  };
}
