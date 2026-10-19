// The address finder's key (D-83): server-side only, never a NEXT_PUBLIC
// name. Unset means the finder is off: the form renders without it and the
// route refuses, so a fresh clone, CI, and the stand-in run unchanged, and
// only the test owners whose environments hold a key see it (Q-33). The
// origin is Google's unless tests/local points it at the stand-in's fake
// endpoints; nothing else ever sets it.
const GOOGLE_ORIGIN = "https://places.googleapis.com";

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export const placesEnv = {
  get key(): string | null {
    return blankToNull(process.env.GOOGLE_PLACES_API_KEY);
  },
  get origin(): string {
    return blankToNull(process.env.GOOGLE_PLACES_ORIGIN) ?? GOOGLE_ORIGIN;
  },
};
