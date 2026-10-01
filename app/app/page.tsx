import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { menuOrigin } from "@/core/config";
import { listOwnerRestaurants } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { startTrial } from "@/features/billing/actions";
import { RestaurantBilling } from "@/features/billing/RestaurantBilling";
import { signOut } from "@/features/owner/actions";
import { DashboardShell } from "@/features/owner/DashboardShell";
import { restaurantNewPath } from "@/features/owner/paths";
import { RestaurantCard } from "@/features/owner/RestaurantCard";

export const metadata: Metadata = {
  title: en.owner.title,
};

type Props = { searchParams: Promise<{ checkout?: string }> };

const notices: Record<string, string> = {
  success: en.owner.billing.checkoutSuccess,
  cancel: en.owner.billing.checkoutCancel,
  missing: en.owner.billing.restaurantMissing,
};

// The dashboard lists every restaurant the user belongs to (D-89). Features
// never import each other, so the page composes the owner card and the
// billing line itself.
export default async function OwnerPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  if (!email) redirect("/app/sign-in");
  const { checkout } = await searchParams;
  const notice = checkout ? (notices[checkout] ?? null) : null;

  // Row level security limits this to the owner's restaurants.
  const restaurants = await listOwnerRestaurants(supabase);

  return (
    <DashboardShell copy={en} email={email} signOut={signOut} notice={notice}>
      <p className="mt-6">
        <Link href={restaurantNewPath()} className="text-link underline">
          {en.owner.restaurants.add}
        </Link>
      </p>
      {restaurants.length > 0 ? (
        restaurants.map((restaurant) => (
          <RestaurantCard
            key={restaurant.code}
            copy={en}
            name={restaurant.name}
            code={restaurant.code}
            origin={menuOrigin}
          >
            <RestaurantBilling
              copy={en}
              restaurant={{
                id: restaurant.id,
                name: restaurant.name,
                status: restaurant.status,
                hasStripeCustomer: restaurant.hasStripeCustomer,
              }}
              startTrial={startTrial}
            />
          </RestaurantCard>
        ))
      ) : (
        <p className="mt-6">{en.owner.restaurants.none}</p>
      )}
    </DashboardShell>
  );
}
