"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import {
  createOwnerRestaurant,
  updateOwnerRestaurant,
  type RestaurantWriteError,
} from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isDayKey } from "@/domain/hours";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";
import { restaurantInputSchema } from "@/domain/restaurant";
import { readRestaurantForm } from "./form-data";
import { restaurantDetailsPath } from "./paths";

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

// Restaurant creation and details (D-85 to D-89, D-95).

export type RestaurantFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Record<string, string> }
  | { status: "error"; message: string };

const restaurantCopy = en.owner.restaurants;
const schema = restaurantInputSchema(restaurantCopy.errors);

type Issue = { path: PropertyKey[]; message: string };

// One message per field, keyed by the field name the form posts. Hours
// messages carry {day}, filled from the path.
function fieldErrors(issues: Issue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String);
    const name = path.join(".");
    if (name in errors) continue;
    const day = path[0] === "hours" ? path[1] : undefined;
    errors[name] =
      day !== undefined && isDayKey(day)
        ? fill(issue.message, { day: restaurantCopy.days[day] })
        : issue.message;
  }
  return errors;
}

function writeErrorMessage(error: RestaurantWriteError): string {
  switch (error.kind) {
    case "cap":
      return restaurantCopy.errors.capReached;
    case "not-found":
      return restaurantCopy.errors.missing;
    default:
      return restaurantCopy.errors.failed;
  }
}

async function ownerClient() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.email) redirect("/app/sign-in");
  return supabase;
}

export async function createRestaurant(
  _previous: RestaurantFormState,
  formData: FormData,
): Promise<RestaurantFormState> {
  const supabase = await ownerClient();
  const parsed = schema.safeParse(readRestaurantForm(formData));
  if (!parsed.success) {
    return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  }
  const result = await createOwnerRestaurant(supabase, parsed.data);
  if (!result.ok) {
    return { status: "error", message: writeErrorMessage(result.error) };
  }
  redirect(restaurantDetailsPath(result.restaurant.code, { created: true }));
}

// The bound code is user input: it is checked here, and row level security
// decides whether the row is this owner's.
export async function updateRestaurant(
  rawCode: string,
  _previous: RestaurantFormState,
  formData: FormData,
): Promise<RestaurantFormState> {
  const supabase = await ownerClient();
  const code = normalizeMenuCode(rawCode);
  if (!isMenuCode(code)) {
    return { status: "error", message: restaurantCopy.errors.missing };
  }
  const parsed = schema.safeParse(readRestaurantForm(formData));
  if (!parsed.success) {
    return { status: "invalid", errors: fieldErrors(parsed.error.issues) };
  }
  const result = await updateOwnerRestaurant(supabase, code, parsed.data);
  if (!result.ok) {
    return { status: "error", message: writeErrorMessage(result.error) };
  }
  redirect(restaurantDetailsPath(code, { saved: Date.now() }));
}
