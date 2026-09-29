import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/core/supabase/server";

// Finishes a magic link or Google sign-in: trades the code for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  // Supabase sends an error instead of a code when the link expired or Google
  // did not finish. An otp error code means the link; anything else, Google.
  if (searchParams.get("error")) {
    const failure = (searchParams.get("error_code") ?? "").startsWith("otp")
      ? "link"
      : "google";
    return NextResponse.redirect(
      new URL(`/app/sign-in?error=${failure}`, origin),
    );
  }
  const code = searchParams.get("code");
  const requested = searchParams.get("next") ?? "/app";
  const next =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/app";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/app/sign-in?error=link", origin));
}
