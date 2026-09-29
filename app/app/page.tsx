import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { signOut } from "@/features/owner/actions";
import { DashboardShell } from "@/features/owner/DashboardShell";

export const metadata: Metadata = {
  title: en.owner.title,
};

export default async function OwnerPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  if (!email) redirect("/app/sign-in");
  return <DashboardShell copy={en} email={email} signOut={signOut} />;
}
