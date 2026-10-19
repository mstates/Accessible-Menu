import { NextResponse } from "next/server";
import { placesProvider } from "@/core/places";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { allowLookup, type LookupCounts } from "@/features/owner/address/cap";
import {
  addressRequestSchema,
  type AddressAnswer,
  type AddressRefusal,
} from "@/features/owner/address/protocol";

// The address finder's one route (D-83): the browser sends the typed text
// or the chosen id with its session token, and this asks the places
// service with the server's key. Signed-in owners only, from this site
// only, with a daily fuse per owner (Q-111), and nothing from an answer is
// kept here. Without the key it refuses, and the form, which has no finder
// then, never calls it (Q-33). Every refusal is one word in JSON, nothing
// is cached, and a GET is not served.

const counts: LookupCounts = new Map();

const NO_STORE = { "cache-control": "no-store" };

function refuse(error: AddressRefusal, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function answer(body: AddressAnswer): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const provider = placesProvider();
  if (provider === null) return refuse("off", 503);
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return refuse("origin", 403);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (!ownerId) return refuse("signed-out", 401);
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return refuse("request", 400);
  }
  const parsed = addressRequestSchema.safeParse(json);
  if (!parsed.success) return refuse("request", 400);
  if (!allowLookup(counts, ownerId, new Date())) return refuse("cap", 429);
  const sent = parsed.data;
  try {
    if (sent.kind === "suggest") {
      return answer({
        suggestions: await provider.suggest(sent.input, sent.session),
      });
    }
    return answer({ parts: await provider.pick(sent.id, sent.session) });
  } catch {
    return refuse("upstream", 502);
  }
}
