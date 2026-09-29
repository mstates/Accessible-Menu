import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { SignInPage } from "@/features/owner/SignInPage";

export const metadata: Metadata = {
  title: en.owner.signIn.title,
};

type Props = { searchParams: Promise<{ error?: string }> };

export default async function OwnerSignInPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims.email) redirect("/app");
  const { error } = await searchParams;
  return <SignInPage copy={en} linkFailed={error === "link"} />;
}
