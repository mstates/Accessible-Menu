import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { menuOrigin } from "@/core/config";
import { menuUrl } from "@/domain/menu-url";
import { updateRestaurant } from "@/features/owner/actions";
import { loadRestaurant } from "@/features/owner/load-restaurant";
import { dashboardPath } from "@/features/owner/paths";
import { RestaurantForm } from "@/features/owner/RestaurantForm";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { PageFrame } from "@/ui/PageFrame";
import { PageLink } from "@/ui/PageLink";
import { ResultMessage } from "@/ui/ResultMessage";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
};

const strings = en.owner.restaurants;

// The outcome of a redirect lands in the title, which a full load and Next's
// route announcer both read on arrival.
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { code } = await params;
  const { created } = await searchParams;
  const { restaurant } = await loadRestaurant(code);
  if (!restaurant) return { title: pageTitle(en, en.notFound.title) };
  return {
    title: pageTitle(
      en,
      created ? strings.details.createdTitle : strings.details.title,
      restaurant.name,
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
    <PageFrame
      siteName={en.site.name}
      homeHref="/"
      loadingLabel={en.ui.loading}
      nav={
        <RestaurantNav
          copy={en}
          name={restaurant.name}
          code={restaurant.code}
          current="details"
        />
      }
    >
      <h1 className="text-3xl font-bold">{strings.details.heading}</h1>
      {created ? (
        <p className="mt-4 rounded bg-background-raised p-4">
          {strings.details.created}
        </p>
      ) : null}
      {saved ? (
        <ResultMessage
          key={saved}
          fromUrl={saved}
          message={strings.details.saved}
          className="mt-4"
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
        <PageLink href={dashboardPath} className="text-link underline">
          {strings.backToDashboard}
        </PageLink>
      </p>
      <p className="mt-6 text-foreground-muted">{strings.details.lead}</p>
      <div className="mt-6">
        {/* React Aria fields keep the values they mounted with, so a save
            remounts the form from the saved row and the owner sees each
            value as it was understood: 17:30 comes back as 5:30 pm (D-105). */}
        <RestaurantForm
          key={saved ?? "details"}
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
