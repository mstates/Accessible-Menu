import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { listOwnerMenus } from "@/core/supabase/menus";
import { getOwnerRestaurantByCode } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";
import { MenuList } from "@/features/owner/MenuList";
import { dashboardPath } from "@/features/owner/paths";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { PageFrame } from "@/ui/PageFrame";
import { PageLink } from "@/ui/PageLink";

type Props = { params: Promise<{ code: string }> };

const strings = en.owner.menus;

// One read per request, shared by the metadata and the page, the same shape
// as the details page: the session first, so a signed-in owner with a bad
// code gets the 404 page, and the code checked before any query (D-89). The
// next page that loads a restaurant this way takes the loader out of both.
const loadRestaurant = cache(async (rawCode: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email ?? null;
  if (!email) return { supabase, email, restaurant: null };
  const code = normalizeMenuCode(rawCode);
  if (!isMenuCode(code)) return { supabase, email, restaurant: null };
  return {
    supabase,
    email,
    restaurant: await getOwnerRestaurantByCode(supabase, code),
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const { restaurant } = await loadRestaurant(code);
  if (!restaurant) return { title: pageTitle(en, en.notFound.title) };
  return { title: pageTitle(en, strings.title, restaurant.name) };
}

// The restaurant's menus (D-111). The list is read here on every render, and
// every save ends with a refresh, so what the page shows is what the server
// holds. A read that fails throws to the owner error page; it never shows as
// an empty list. The slices of copy the list needs are passed on their own,
// since they travel with every refresh.
export default async function RestaurantMenusPage({ params }: Props) {
  const { code } = await params;
  const { supabase, email, restaurant } = await loadRestaurant(code);
  if (!email) redirect("/app/sign-in");
  if (!restaurant) notFound();
  const menus = await listOwnerMenus(supabase, restaurant.id);

  return (
    <PageFrame
      siteName={en.site.name}
      homeHref="/"
      loadingLabel={en.ui.loading}
      nav={
        <RestaurantNav
          copy={en}
          name={restaurant.name}
          code={restaurant.code}
          current="menus"
        />
      }
    >
      <h1 className="text-3xl font-bold">{strings.heading}</h1>
      <p className="mt-2">
        <PageLink href={dashboardPath} className="text-link underline">
          {en.owner.restaurants.backToDashboard}
        </PageLink>
      </p>
      <p className="mt-6 text-foreground-muted">{strings.lead}</p>
      <MenuList
        strings={strings}
        editing={en.owner.editing}
        pendingLabel={en.ui.pending}
        code={restaurant.code}
        menus={menus}
      />
    </PageFrame>
  );
}
