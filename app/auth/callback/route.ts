import { NextResponse, type NextRequest } from "next/server";
import { noticeCookie, type SignInNotice } from "@/core/notice";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { signInPath } from "@/features/owner/paths";

// A sign-in that fails here lands on the sign-in page as a real page load
// with the failure's flash (D-219): the notice cookie for that page, then
// a 303 to it clean, nothing in the address.
function failed(origin: string, notice: SignInNotice): NextResponse {
  const response = NextResponse.redirect(new URL(signInPath, origin), 303);
  response.headers.append("set-cookie", noticeCookie(notice, signInPath));
  return response;
}

// Finishes a magic link or Google sign-in: trades the code for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  // Supabase sends an error instead of a code when the link expired or Google
  // did not finish. An otp error code means the link; anything else, Google.
  if (searchParams.get("error")) {
    const notice = (searchParams.get("error_code") ?? "").startsWith("otp")
      ? "sign-in-link"
      : "sign-in-google";
    return failed(origin, notice);
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
  return failed(origin, "sign-in-link");
}
