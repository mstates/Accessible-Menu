import { z } from "zod";
import type { RestaurantStatus } from "./billing";
import { hoursSchema, type Hours, type HoursMessages } from "./hours";
import { US_STATE_CODES, type StateCode } from "./regions";
import { TIMEZONE_IDS, type TimezoneId } from "./timezones";
import { PREP_NOTE_IDS, type PrepNoteId } from "./types";

// The owner-side restaurant: the row an owner reads and the fields an owner
// writes (D-95). The diner-side Restaurant in types.ts is the published view
// model and stays separate until the diner page reads real data (D-78).
// Pure: no React, no network.

export type RestaurantDetails = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  hours: Hours | null;
  timezone: string;
  allergenNote: string | null;
  prepNotes: PrepNoteId[];
  status: RestaurantStatus;
  hasStripeCustomer: boolean;
};

export type RestaurantInput = {
  name: string;
  address: string;
  city: string;
  region: StateCode;
  postalCode: string;
  phone: string | null;
  website: string | null;
  hours: Hours | null;
  timezone: TimezoneId;
  allergenNote: string | null;
  prepNotes: PrepNoteId[];
};

// Every rule here is also a table constraint in the database (migration 2),
// which is the boundary. These checks exist to name the field and the
// message; they never stand alone.
export const RESTAURANT_LIMITS = {
  name: 120,
  address: 200,
  city: 100,
  website: 500,
  allergenNote: 1000,
} as const;

export const POSTAL_CODE_PATTERN = /^[0-9]{5}(-[0-9]{4})?$/;
export const PHONE_PATTERN = /^[0-9 ()+.-]{7,25}$/;
export const WEBSITE_PATTERN = /^https?:\/\/\S+$/i;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export type RestaurantMessages = HoursMessages & {
  nameRequired: string;
  nameLength: string;
  addressRequired: string;
  addressLength: string;
  cityRequired: string;
  cityLength: string;
  region: string;
  postalCode: string;
  phone: string;
  website: string;
  websiteLength: string;
  timezone: string;
  allergenNoteLength: string;
  prepNotes: string;
};

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// A website typed without a scheme gets https://. One typed with another
// scheme keeps it and fails the pattern, so javascript: never gets through.
export function normalizeWebsite(value: unknown): unknown {
  const trimmed = blankToNull(value);
  if (typeof trimmed !== "string") return trimmed;
  return SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function restaurantInputSchema(messages: RestaurantMessages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: messages.nameRequired })
      .max(RESTAURANT_LIMITS.name, { error: messages.nameLength }),
    address: z
      .string()
      .trim()
      .min(1, { error: messages.addressRequired })
      .max(RESTAURANT_LIMITS.address, { error: messages.addressLength }),
    city: z
      .string()
      .trim()
      .min(1, { error: messages.cityRequired })
      .max(RESTAURANT_LIMITS.city, { error: messages.cityLength }),
    region: z.enum(US_STATE_CODES, { error: messages.region }),
    postalCode: z
      .string()
      .trim()
      .regex(POSTAL_CODE_PATTERN, { error: messages.postalCode }),
    phone: z.preprocess(
      blankToNull,
      z.string().regex(PHONE_PATTERN, { error: messages.phone }).nullable(),
    ),
    website: z.preprocess(
      normalizeWebsite,
      z
        .string()
        .regex(WEBSITE_PATTERN, { error: messages.website })
        .max(RESTAURANT_LIMITS.website, { error: messages.websiteLength })
        .nullable(),
    ),
    hours: hoursSchema(messages).nullable(),
    timezone: z.enum(TIMEZONE_IDS, { error: messages.timezone }),
    allergenNote: z.preprocess(
      blankToNull,
      z
        .string()
        .max(RESTAURANT_LIMITS.allergenNote, {
          error: messages.allergenNoteLength,
        })
        .nullable(),
    ),
    prepNotes: z
      .array(z.enum(PREP_NOTE_IDS, { error: messages.prepNotes }))
      .transform(unique),
  });
}

export type RestaurantInputSchema = ReturnType<typeof restaurantInputSchema>;
