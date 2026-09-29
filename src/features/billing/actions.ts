"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createCheckoutSession } from "@/core/stripe/checkout";
import { createSupabaseServerClient } from "@/core/supabase/server";

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// Starts a restaurant's free trial through Stripe Checkout (D-79). The read
// goes through the owner's own client, so row level security returns no
// restaurant the owner does not own.
export async function startTrial(formData: FormData): Promise<void> {
  const restaurantId = String(formData.get("restaurant") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  if (!email) redirect("/app/sign-in");
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, stripe_customer_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurant) redirect("/app?checkout=missing");
  const url = await createCheckoutSession({
    restaurantId: restaurant.id,
    ownerEmail: email,
    customerId: restaurant.stripe_customer_id ?? null,
    origin: await requestOrigin(),
  });
  redirect(url);
}
