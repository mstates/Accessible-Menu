import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { createRestaurant } from "@/features/owner/actions";
import { dashboardPath } from "@/features/owner/paths";
import { RestaurantForm } from "@/features/owner/RestaurantForm";
import { PageFrame } from "@/ui/PageFrame";
import { PageLink } from "@/ui/PageLink";

export const metadata: Metadata = {
  title: pageTitle(en, en.owner.restaurants.new.title),
};

export default async function NewRestaurantPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.email) redirect("/app/sign-in");
  const strings = en.owner.restaurants;
  return (
    <PageFrame
      siteName={en.site.name}
      homeHref="/"
      loadingLabel={en.ui.loading}
    >
      <h1 className="text-3xl font-bold">{strings.new.heading}</h1>
      <p className="mt-2 text-foreground-muted">{strings.new.lead}</p>
      <p className="mt-2">
        <PageLink href={dashboardPath} className="text-link underline">
          {strings.backToDashboard}
        </PageLink>
      </p>
      <div className="mt-6">
        <RestaurantForm
          copy={en}
          action={createRestaurant}
          mode="create"
          submitLabel={strings.new.submit}
        />
      </div>
    </PageFrame>
  );
}
