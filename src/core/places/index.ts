import { placesEnv } from "./env";
import { googlePlaces } from "./google";
import type { PlacesProvider } from "./provider";

export { PlacesError } from "./provider";
export type {
  AddressParts,
  AddressSuggestion,
  PlacesCall,
  PlacesProvider,
} from "./provider";

// Whether the finder is on: the key is set (D-83). The form shows the
// finder and the route answers only then; without it nothing is rendered
// and nothing is said (Q-33).
export function placesConfigured(): boolean {
  return placesEnv.key !== null;
}

// The one provider, from the environment, or null while the finder is off.
export function placesProvider(): PlacesProvider | null {
  const key = placesEnv.key;
  if (key === null) return null;
  return googlePlaces({ key, origin: placesEnv.origin });
}
