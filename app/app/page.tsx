import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { menuOrigin } from "@/core/config";
import { DASHBOARD_NOTICES, readNotice } from "@/core/notice";
import { listOwnerMenuPublishStates } from "@/core/supabase/menus";
import { listOwnerRestaurants } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { RestaurantBilling } from "@/features/billing/RestaurantBilling";
import { signOut } from "@/features/owner/actions";
import { DashboardShell } from "@/features/owner/DashboardShell";
import {
  dashboardPath,
  restaurantNewPath,
  signInPath,
} from "@/features/owner/paths";
import { publishSummary } from "@/features/owner/publishing-words";
import { RestaurantCard } from "@/features/owner/RestaurantCard";
import { PageLink } from "@/ui/PageLink";

export const metadata: Metadata = {
  title: pageTitle(en, en.owner.title),
};

// The dashboard lists every restaurant the user belongs to (D-89), each
// with what its menus say about Publish (D-82). Features never import each
// other, so the page composes the owner card and the billing line itself.
export default async function OwnerPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  if (!email) redirect(signInPath);
  // A result that arrived with this load, from the cookie its sender left
  // (D-219): the return from Checkout, or a restaurant the trial could not
  // find. Read from the header, not cookies(), since a notice for another
  // page can ride beside it (src/core/notice.ts).
  const notice = readNotice((await headers()).get("cookie"), DASHBOARD_NOTICES);

  // Row level security limits this to the owner's restaurants, and the
  // publish states to each restaurant's menus.
  const restaurants = await listOwnerRestaurants(supabase);
  const states = await Promise.all(
    restaurants.map((restaurant) =>
      listOwnerMenuPublishStates(supabase, restaurant.id),
    ),
  );

  return (
    <DashboardShell copy={en} email={email} signOut={signOut} notice={notice}>
      <p className="mt-6">
        <PageLink href={restaurantNewPath()} className="text-link underline">
          {en.owner.restaurants.add}
        </PageLink>
      </p>
      {restaurants.length > 0 ? (
        restaurants.map((restaurant, index) => (
          <RestaurantCard
            key={restaurant.code}
            copy={en}
            name={restaurant.name}
            code={restaurant.code}
            origin={menuOrigin}
            publishing={publishSummary(
              en.owner.publishing,
              states[index] ?? [],
              en.lang,
            )}
          >
            <RestaurantBilling
              copy={en}
              restaurant={{
                id: restaurant.id,
                name: restaurant.name,
                status: restaurant.status,
                hasStripeCustomer: restaurant.hasStripeCustomer,
              }}
              path={dashboardPath}
            />
          </RestaurantCard>
        ))
      ) : (
        <p className="mt-6">{en.owner.restaurants.none}</p>
      )}
    </DashboardShell>
  );
}
