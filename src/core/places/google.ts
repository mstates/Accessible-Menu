import { parseAddress, parseSuggestions } from "./parse";
import { PlacesError, type PlacesCall, type PlacesProvider } from "./provider";

// The Places API (New) over plain HTTPS (D-83): Autocomplete for the list
// and Place Details for the parts, each call carrying the session token the
// browser made, so Google bills a lookup as one session. Results stay in
// the US (D-94). Only the address components are asked for, the Essentials
// fields of the Build plan's Places note, and only the parts leave here
// (D-87). A call that fails logs one line, the status and Google's status
// word, never the key, the input, or the body, and throws a PlacesError.

const TIMEOUT_MS = 5000;
const SUGGEST_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.text";
const DETAILS_MASK = "addressComponents";
const REGION = "us";
const LANGUAGE = "en";
// Google's status word, such as PERMISSION_DENIED, and nothing else.
const STATUS_WORD = /^[A-Z_]{1,40}$/;

type Fetch = typeof fetch;

type Options = { key: string; origin: string; fetch?: Fetch };

function statusWord(body: unknown): string | null {
  const error = (body as { error?: { status?: unknown } } | null)?.error;
  return typeof error?.status === "string" && STATUS_WORD.test(error.status)
    ? error.status
    : null;
}

// One call's answer as JSON, or a PlacesError, with its one log line.
async function answer(
  call: PlacesCall,
  send: () => Promise<Response>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await send();
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    console.error(`places ${call}: no answer (${name})`);
    throw new PlacesError(call, null, `${call}: no answer (${name})`);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const word = statusWord(body);
    console.error(
      `places ${call}: ${response.status}${word ? ` ${word}` : ""}`,
    );
    throw new PlacesError(call, response.status, `${call}: ${response.status}`);
  }
  return body;
}

// Global fetch is looked up on each call, as the Supabase client's is, so
// Next's own fetch behaves as before.
export function googlePlaces({
  key,
  origin,
  fetch = (input, init) => globalThis.fetch(input, init),
}: Options): PlacesProvider {
  return {
    async suggest(input, session) {
      const body = await answer("suggest", () =>
        fetch(`${origin}/v1/places:autocomplete`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
            "x-goog-fieldmask": SUGGEST_MASK,
          },
          body: JSON.stringify({
            input,
            sessionToken: session,
            includedRegionCodes: [REGION],
            languageCode: LANGUAGE,
            regionCode: REGION,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      );
      return parseSuggestions(body);
    },
    async pick(id, session) {
      const url = new URL(`${origin}/v1/places/${encodeURIComponent(id)}`);
      url.searchParams.set("sessionToken", session);
      url.searchParams.set("languageCode", LANGUAGE);
      url.searchParams.set("regionCode", REGION);
      const body = await answer("pick", () =>
        fetch(url.href, {
          method: "GET",
          headers: { "x-goog-api-key": key, "x-goog-fieldmask": DETAILS_MASK },
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      );
      return parseAddress(body);
    },
  };
}
