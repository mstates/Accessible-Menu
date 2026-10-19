import { z } from "zod";
import {
  PlacesError,
  type AddressParts,
  type AddressSuggestion,
  type PlacesCall,
} from "./provider";

// Google's two answers read into our shapes (D-83, D-87), pure: no network.
// Only the keys we read are named, and zod's object drops the rest, so a
// field Google adds never breaks a lookup. A body that is not the shape is
// a PlacesError naming the call and the issue codes, never the body.

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string().min(1),
            text: z.object({ text: z.string() }),
          })
          .optional(),
      }),
    )
    .optional(),
});

const componentSchema = z.object({
  longText: z.string().optional(),
  shortText: z.string().optional(),
  types: z.array(z.string()),
});

const detailsSchema = z.object({
  addressComponents: z.array(componentSchema).optional(),
});

type Component = z.output<typeof componentSchema>;

const ISSUES_NAMED = 5;

function read<S extends z.ZodType>(
  call: PlacesCall,
  schema: S,
  json: unknown,
): z.output<S> {
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;
  const named = parsed.error.issues
    .slice(0, ISSUES_NAMED)
    .map((issue) => `${issue.code} at ${issue.path.map(String).join(".")}`);
  throw new PlacesError(
    call,
    null,
    `${call}: an answer that is not the shape (${named.join("; ")})`,
  );
}

// The predictions in Google's order, each by its place id and its one line
// of text. An entry without a place prediction is skipped.
export function parseSuggestions(json: unknown): AddressSuggestion[] {
  const { suggestions = [] } = read("suggest", suggestionsSchema, json);
  return suggestions.flatMap(({ placePrediction }) =>
    placePrediction
      ? [{ id: placePrediction.placeId, text: placePrediction.text.text }]
      : [],
  );
}

// One component's text by type, long or short, or an empty string when the
// answer has no component of that type.
function part(
  components: Component[],
  type: string,
  form: "long" | "short",
): string {
  const found = components.find((component) => component.types.includes(type));
  if (!found) return "";
  const text =
    form === "short"
      ? (found.shortText ?? found.longText)
      : (found.longText ?? found.shortText);
  return text ?? "";
}

function firstOf(components: Component[], types: readonly string[]): string {
  for (const type of types) {
    const text = part(components, type, "long");
    if (text) return text;
  }
  return "";
}

// The city is the locality; New York's boroughs come as a sublocality with
// no locality, and a few places only as a level three area.
const CITY_TYPES = [
  "locality",
  "sublocality_level_1",
  "administrative_area_level_3",
] as const;

// The five parts from the address components: the street from the number
// and the route, with a unit after a comma; the state and the country as
// their short codes; the ZIP with its four-digit suffix when there is one.
export function parseAddress(json: unknown): AddressParts {
  const { addressComponents = [] } = read("pick", detailsSchema, json);
  const number = part(addressComponents, "street_number", "long");
  const route = part(addressComponents, "route", "long");
  const unit = part(addressComponents, "subpremise", "long");
  const line = [number, route].filter(Boolean).join(" ");
  const zip = part(addressComponents, "postal_code", "long");
  const suffix = part(addressComponents, "postal_code_suffix", "long");
  return {
    street: unit && line ? `${line}, ${unit}` : line || unit,
    city: firstOf(addressComponents, CITY_TYPES),
    state: part(addressComponents, "administrative_area_level_1", "short"),
    zip: zip && suffix ? `${zip}-${suffix}` : zip,
    country: part(addressComponents, "country", "short"),
  };
}
