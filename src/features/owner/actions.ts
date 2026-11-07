"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { en } from "@/copy";
import { expireRestaurant } from "@/core/cache";
import {
  createOwnerRestaurant,
  updateOwnerRestaurant,
  type RestaurantWriteError,
} from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";
import { restaurantInputSchema } from "@/domain/restaurant";
import { fieldErrors, readRestaurantForm } from "./form-data";
import { restaurantDetailsPath, signInPath } from "./paths";

// Sign-in outcomes. An address problem belongs to the email field; every
// other outcome, sent or failed, is one message after the button. The
// attempt count keys that message, so the same text twice is read twice.
export type SignInState =
  | { status: "idle" }
  | { status: "invalid"; message: string; attempt: number }
  | { status: "sent"; message: string; attempt: number }
  | { status: "failed"; message: string; attempt: number };

function nextAttempt(previous: SignInState): number {
  return previous.status === "idle" ? 1 : previous.attempt + 1;
}

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
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const attempt = nextAttempt(previous);
  const email = String(formData.get("email") ?? "").trim();
  if (!emailPattern.test(email)) {
    return {
      status: "invalid",
      message: en.owner.signIn.invalidEmail,
      attempt,
    };
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
    return { status: "failed", message: en.owner.signIn.failed, attempt };
  }
  return { status: "sent", message: en.owner.signIn.sent, attempt };
}

// Google sign-in's one failure before leaving: Supabase gave an error or no
// URL. The form loads the sign-in page again with it (D-219); a sign-in
// that starts leaves through the redirect below.
export type GoogleSignInState = { status: "idle" } | { status: "failed" };

// Starts Google sign-in. Supabase sends the owner to Google and back to
// /auth/callback with a code, the same exchange the magic link uses (Spec 4.1).
export async function signInWithGoogle(): Promise<GoogleSignInState> {
  const origin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=/app` },
  });
  // Nothing redirects here for the failure: a redirect from an action is a
  // client navigation, where the flash cannot sit (D-214). The form loads
  // the sign-in page again with the result (D-219).
  if (error || !data.url) return { status: "failed" };
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(signInPath);
}

// Restaurant creation and details (D-85 to D-89, D-95).

export type RestaurantFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Record<string, string> }
  | { status: "error"; message: string }
  // A Details save that landed: the form loads the page again (D-211).
  | { status: "saved"; code: string };

const restaurantCopy = en.owner.restaurants;
const schema = restaurantInputSchema(restaurantCopy.errors);

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
  if (!data?.claims.email) redirect(signInPath);
  return supabase;
}

export async function createRestaurant(
  _previous: RestaurantFormState,
  formData: FormData,
): Promise<RestaurantFormState> {
  const supabase = await ownerClient();
  const parsed = schema.safeParse(readRestaurantForm(formData));
  if (!parsed.success) {
    return {
      status: "invalid",
      errors: fieldErrors(parsed.error.issues, restaurantCopy),
    };
  }
  const result = await createOwnerRestaurant(supabase, parsed.data);
  if (!result.ok) {
    return { status: "error", message: writeErrorMessage(result.error) };
  }
  // A page for this code may be cached as not found; it clears here.
  expireRestaurant(result.restaurant.code);
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
    return {
      status: "invalid",
      errors: fieldErrors(parsed.error.issues, restaurantCopy),
    };
  }
  const result = await updateOwnerRestaurant(supabase, code, parsed.data);
  if (!result.ok) {
    return { status: "error", message: writeErrorMessage(result.error) };
  }
  // Details save live (D-82): the diner pages read them on their next
  // request. The form then loads Details again as a new document, with the
  // success banner (D-211, Q-141). Nothing redirects here: a redirect from
  // an action is a client navigation, which the browser and a screen reader
  // do not treat as a new page.
  expireRestaurant(code);
  return { status: "saved", code };
}
