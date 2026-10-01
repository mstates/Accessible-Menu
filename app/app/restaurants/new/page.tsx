import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { createRestaurant } from "@/features/owner/actions";
import { dashboardPath } from "@/features/owner/paths";
import { RestaurantForm } from "@/features/owner/RestaurantForm";
import { PageFrame } from "@/ui/PageFrame";

export const metadata: Metadata = {
  title: en.owner.restaurants.new.title,
};

export default async function NewRestaurantPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.email) redirect("/app/sign-in");
  const strings = en.owner.restaurants;
  return (
    <PageFrame siteName={en.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{strings.new.heading}</h1>
      <p className="mt-2 text-foreground-muted">{strings.new.lead}</p>
      <p className="mt-2">
        <Link href={dashboardPath} className="text-link underline">
          {strings.backToDashboard}
        </Link>
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
