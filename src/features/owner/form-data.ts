import { DAY_KEYS, type DayKey, type TimeRange } from "@/domain/hours";

// Turns the posted restaurant form into the plain object the zod schema
// parses. Field names match the schema keys; the hours grid posts as
// hours.<day>.<index>.open and .close. A day with no times is closed; every
// day blank means the owner gave no hours. A range with one side filled is
// kept as typed so the schema can report the empty side.

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export const RANGE_INDEXES = [0, 1] as const;

export function hoursFieldName(
  day: DayKey,
  index: number,
  side: keyof TimeRange,
): string {
  return `hours.${day}.${index}.${side}`;
}

function readHours(formData: FormData): Record<DayKey, TimeRange[]> | null {
  let anyTime = false;
  const entries = DAY_KEYS.map((day) => {
    const ranges = RANGE_INDEXES.flatMap((index) => {
      const open = text(formData, hoursFieldName(day, index, "open")).trim();
      const close = text(formData, hoursFieldName(day, index, "close")).trim();
      if (open === "" && close === "") return [];
      anyTime = true;
      return [{ open, close }];
    });
    return [day, ranges] as const;
  });
  if (!anyTime) return null;
  return Object.fromEntries(entries) as Record<DayKey, TimeRange[]>;
}

export function readRestaurantForm(formData: FormData) {
  return {
    name: text(formData, "name"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    postalCode: text(formData, "postalCode"),
    phone: text(formData, "phone"),
    website: text(formData, "website"),
    hours: readHours(formData),
    timezone: text(formData, "timezone"),
    allergenNote: text(formData, "allergenNote"),
    prepNotes: formData
      .getAll("prepNotes")
      .filter((value): value is string => typeof value === "string"),
  };
}
