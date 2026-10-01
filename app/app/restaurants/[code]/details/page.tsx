import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { menuOrigin } from "@/core/config";
import { getOwnerRestaurantByCode } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isMenuCode, menuUrl, normalizeMenuCode } from "@/domain/menu-url";
import { updateRestaurant } from "@/features/owner/actions";
import { dashboardPath } from "@/features/owner/paths";
import { RestaurantForm } from "@/features/owner/RestaurantForm";
import { SavedNotice } from "@/features/owner/SavedNotice";
import { PageFrame } from "@/ui/PageFrame";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
};

const strings = en.owner.restaurants;

// One read per request, shared by the metadata and the page. The session is
// read first, so a signed-in owner with a bad code gets the 404 page, never
// a bounce through sign-in. The path segment is user input: it is checked
// before any query, and row level security hides rows that are not this
// owner's, so a wrong owner and an unknown code look the same (D-89).
const loadRestaurant = cache(async (rawCode: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email ?? null;
  if (!email) return { email, restaurant: null };
  const code = normalizeMenuCode(rawCode);
  if (!isMenuCode(code)) return { email, restaurant: null };
  return { email, restaurant: await getOwnerRestaurantByCode(supabase, code) };
});

// The outcome of a redirect lands in the title, which a full load and Next's
// route announcer both read on arrival.
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { code } = await params;
  const { created } = await searchParams;
  const { restaurant } = await loadRestaurant(code);
  if (!restaurant) return { title: en.notFound.title };
  return {
    title: fill(
      created ? strings.details.createdTitle : strings.details.title,
      {
        restaurant: restaurant.name,
      },
    ),
  };
}

export default async function RestaurantDetailsPage({
  params,
  searchParams,
}: Props) {
  const { code } = await params;
  const { created, saved } = await searchParams;
  const { email, restaurant } = await loadRestaurant(code);
  if (!email) redirect("/app/sign-in");
  if (!restaurant) notFound();
  const action = updateRestaurant.bind(null, restaurant.code);

  return (
    <PageFrame siteName={en.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{restaurant.name}</h1>
      {created ? (
        <p className="mt-4 rounded bg-background-raised p-4">
          {strings.details.created}
        </p>
      ) : null}
      {saved ? (
        <SavedNotice
          key={saved}
          value={saved}
          message={strings.details.saved}
        />
      ) : null}
      <p className="mt-4">
        <span className="font-semibold">{strings.menuLink}</span>{" "}
        <span className="break-all">
          {menuUrl(menuOrigin.origin, restaurant.code)}
        </span>
      </p>
      {menuOrigin.permanent ? (
        <p className="mt-1 text-sm text-foreground-muted">
          {strings.menuLinkPermanent}
        </p>
      ) : null}
      <p className="mt-2">
        <Link href={dashboardPath} className="text-link underline">
          {strings.backToDashboard}
        </Link>
      </p>
      <p className="mt-6 text-foreground-muted">{strings.details.lead}</p>
      <div className="mt-6">
        <RestaurantForm
          copy={en}
          action={action}
          defaultValues={restaurant}
          mode="details"
          submitLabel={strings.details.submit}
        />
      </div>
    </PageFrame>
  );
}
