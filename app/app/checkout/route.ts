import { NextResponse, type NextRequest } from "next/server";
import { noticeCookie, type DashboardNotice } from "@/core/notice";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { dashboardPath } from "@/features/owner/paths";

// Stripe's return from Checkout (D-79, D-219): success_url and cancel_url
// point here with the result in the query. The result goes into the notice
// cookie for the dashboard, and the browser is sent on to the dashboard
// with a 303, clean, a real page load where the flash arrives (D-211,
// D-214). A result this does not know sets nothing, and so does a visitor
// who is not signed in: the trial's state is the webhook's (D-79), and the
// flash only says what just happened, so a crafted link shows no owner a
// result that is not theirs.
const results = new Map<string, DashboardNotice>([
  ["success", "checkout-success"],
  ["cancel", "checkout-cancel"],
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const response = NextResponse.redirect(new URL(dashboardPath, origin), 303);
  response.headers.set("cache-control", "no-store");
  const notice = results.get(searchParams.get("result") ?? "");
  if (!notice) return response;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.email) return response;
  response.headers.append("set-cookie", noticeCookie(notice, dashboardPath));
  return response;
}
