import { z } from "zod";
import type { AddressParts, AddressSuggestion } from "@/core/places";

// What the browser sends the address route and what comes back (D-83).
// One route, two kinds: a suggest with the typed text, and a pick with the
// chosen id, each with the session token the browser made for this lookup,
// a UUID, though any short URL-safe string is taken.

const session = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const addressRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("suggest"),
    input: z.string().trim().min(1).max(200),
    session,
  }),
  z.object({
    kind: z.literal("pick"),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
    session,
  }),
]);

export type AddressRequest = z.input<typeof addressRequestSchema>;

// The one word a refusal carries. The form says the same thing for each.
export type AddressRefusal =
  "off" | "origin" | "signed-out" | "request" | "cap" | "upstream";

export type AddressAnswer =
  { suggestions: AddressSuggestion[] } | { parts: AddressParts };

export const ADDRESS_ROUTE = "/api/address";
