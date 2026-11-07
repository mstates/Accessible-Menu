import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { readNotice, SIGN_IN_NOTICES } from "@/core/notice";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { dashboardPath } from "@/features/owner/paths";
import { SignInPage } from "@/features/owner/SignInPage";

export const metadata: Metadata = {
  title: pageTitle(en, en.owner.signIn.title),
};

export default async function OwnerSignInPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims.email) redirect(dashboardPath);
  // A sign-in that failed before this load, from the cookie the auth
  // callback or the Google form left (D-219). Read from the header, not
  // cookies(), since a notice for another page can ride beside it
  // (src/core/notice.ts).
  const notice = readNotice((await headers()).get("cookie"), SIGN_IN_NOTICES);
  return <SignInPage copy={en} notice={notice} />;
}
