"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { createSupabaseServerClient } from "@/core/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; message: string }
  | { status: "error"; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// Emails a magic link. First-time owners are created on the spot (Spec 4.1).
export async function requestMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!emailPattern.test(email)) {
    return { status: "error", message: en.owner.signIn.invalidEmail };
  }
  const origin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/app`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    return { status: "error", message: en.owner.signIn.failed };
  }
  return { status: "sent", message: en.owner.signIn.sent };
}

// Starts Google sign-in. Supabase sends the owner to Google and back to
// /auth/callback with a code, the same exchange the magic link uses (Spec 4.1).
export async function signInWithGoogle(): Promise<void> {
  const origin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=/app` },
  });
  if (error || !data.url) redirect("/app/sign-in?error=google");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/app/sign-in");
}
