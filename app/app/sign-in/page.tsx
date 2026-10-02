import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { signInWithGoogle } from "@/features/owner/actions";
import { SignInPage, type SignInFailure } from "@/features/owner/SignInPage";

export const metadata: Metadata = {
  title: pageTitle(en, en.owner.signIn.title),
};

type Props = { searchParams: Promise<{ error?: string }> };

export default async function OwnerSignInPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims.email) redirect("/app");
  const { error } = await searchParams;
  const failure: SignInFailure =
    error === "link" || error === "google" ? error : null;
  return (
    <SignInPage
      copy={en}
      failure={failure}
      signInWithGoogle={signInWithGoogle}
    />
  );
}
