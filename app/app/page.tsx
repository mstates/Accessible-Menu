import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isRestaurantStatus } from "@/domain/billing";
import { startTrial } from "@/features/billing/actions";
import {
  RestaurantBilling,
  type BillingRestaurant,
} from "@/features/billing/RestaurantBilling";
import { signOut } from "@/features/owner/actions";
import { DashboardShell } from "@/features/owner/DashboardShell";

export const metadata: Metadata = {
  title: en.owner.title,
};

type Props = { searchParams: Promise<{ checkout?: string }> };

const notices: Record<string, string> = {
  success: en.owner.billing.checkoutSuccess,
  cancel: en.owner.billing.checkoutCancel,
  missing: en.owner.billing.restaurantMissing,
};

export default async function OwnerPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  if (!email) redirect("/app/sign-in");
  const { checkout } = await searchParams;
  const notice = checkout ? (notices[checkout] ?? null) : null;

  // Row level security limits this to the owner's restaurants.
  const { data: rows } = await supabase
    .from("restaurants")
    .select("id, name, status, stripe_customer_id")
    .order("name");
  const restaurants: BillingRestaurant[] = (rows ?? []).flatMap((row) =>
    isRestaurantStatus(row.status)
      ? [
          {
            id: String(row.id),
            name: String(row.name),
            status: row.status,
            hasStripeCustomer: row.stripe_customer_id != null,
          },
        ]
      : [],
  );

  return (
    <DashboardShell copy={en} email={email} signOut={signOut} notice={notice}>
      {restaurants.length > 0
        ? restaurants.map((restaurant) => (
            <RestaurantBilling
              key={restaurant.id}
              copy={en}
              restaurant={restaurant}
              startTrial={startTrial}
            />
          ))
        : undefined}
    </DashboardShell>
  );
}
