import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { menuOrigin } from "@/core/config";
import { DETAILS_NOTICES, readNotice } from "@/core/notice";
import { placesConfigured } from "@/core/places";
import { menuUrl } from "@/domain/menu-url";
import { updateRestaurant } from "@/features/owner/actions";
import { loadRestaurant } from "@/features/owner/load-restaurant";
import { NoticeBanner } from "@/features/owner/NoticeBanner";
import {
  dashboardPath,
  restaurantDetailsPath,
  signInPath,
} from "@/features/owner/paths";
import { RestaurantForm } from "@/features/owner/RestaurantForm";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { PageFrame } from "@/ui/PageFrame";
import { PageLink } from "@/ui/PageLink";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string }>;
};

const strings = en.owner.restaurants;

// The Details heading, where focus goes when the flash is dismissed.
const DETAILS_HEADING_ID = "details-heading";

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
  const { created } = await searchParams;
  const { email, restaurant } = await loadRestaurant(code);
  if (!email) redirect(signInPath);
  if (!restaurant) notFound();
  const action = updateRestaurant.bind(null, restaurant.code);
  // A save that landed left its cookie for this load (D-211, D-219); the
  // banner clears it once it shows. Read from the header, not cookies(),
  // since a notice for another page can ride beside it (src/core/notice.ts).
  const notice = readNotice((await headers()).get("cookie"), DETAILS_NOTICES);

  return (
    <PageFrame
      siteName={en.site.name}
      homeHref={dashboardPath}
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
      {/* The success banner at the top of the body content, first in main
          and above the heading (D-211, D-215, Primer), as GitHub's flash on
          the load the save brings (D-214): its words an alert, its dismiss
          button focused by the served autofocus. */}
      {notice ? (
        <NoticeBanner
          copy={en}
          notice={notice}
          path={restaurantDetailsPath(restaurant.code)}
          headingId={DETAILS_HEADING_ID}
          className="mb-6"
        />
      ) : null}
      {/* Focusable by code alone, for the banner's dismiss button. */}
      <h1 id={DETAILS_HEADING_ID} tabIndex={-1} className="text-3xl font-bold">
        {strings.details.heading}
      </h1>
      {created ? (
        <p className="mt-4 rounded bg-background-raised p-4">
          {strings.details.created}
        </p>
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
        {/* A save that lands loads this page again (D-211), so the fields
            mount from the saved row and the owner sees each value as it was
            understood: 17:30 comes back as 5:30 pm (D-105). */}
        <RestaurantForm
          copy={en}
          action={action}
          defaultValues={restaurant}
          mode="details"
          addressFinder={placesConfigured()}
          submitLabel={strings.details.submit}
        />
      </div>
    </PageFrame>
  );
}
