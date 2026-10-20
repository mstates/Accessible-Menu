import { fill } from "@/copy/fill";
import {
  DAY_KEYS,
  isDayKey,
  type DayKey,
  type TimeRange,
  type TypedHours,
} from "@/domain/hours";

// Turns the posted restaurant form into the plain object the zod schema
// parses, and the schema's issues back into one message per field. Field
// names match the schema keys; the hours grid posts as
// hours.<day>.<index>.open and .close, each time as the owner typed it
// (D-105), and hours.<day>.allDay when a day's Open 24 hours box is checked
// (D-124). A checked day's times are never read, valid or not. A day with no
// times is closed; every day blank and unchecked means the owner gave no
// hours. A range with one side filled is kept as typed so the schema can
// report the empty side.

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

export function allDayFieldName(day: DayKey): string {
  return `hours.${day}.allDay`;
}

function readHours(formData: FormData): TypedHours | null {
  const allDay = DAY_KEYS.filter((day) => formData.has(allDayFieldName(day)));
  let anyTime = allDay.length > 0;
  const entries = DAY_KEYS.map((day) => {
    if (allDay.includes(day)) return [day, []] as const;
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
  const days = Object.fromEntries(entries) as Record<DayKey, TimeRange[]>;
  return { ...days, allDay };
}

type TimeFieldLabels = {
  opens: string;
  closes: string;
  opensAgain: string;
  closesAgain: string;
};

// The label of one time field, "Monday opens again" for example. The form
// shows it, and an error about that time names its field with it.
export function timeFieldLabel(
  labels: TimeFieldLabels,
  day: string,
  index: number,
  side: keyof TimeRange,
): string {
  const first = side === "open" ? labels.opens : labels.closes;
  const again = side === "open" ? labels.opensAgain : labels.closesAgain;
  return fill(index === 0 ? first : again, { day });
}

type Issue = { path: PropertyKey[]; message: string };

type ErrorCopy = { days: Record<DayKey, string>; fields: TimeFieldLabels };

// One message per field, keyed by the field name the form posts; the first
// issue wins. Hours messages carry {day}, and a time's messages carry
// {field}, its label, so each link in the error summary names its field.
export function fieldErrors(
  issues: Issue[],
  strings: ErrorCopy,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String);
    const name = path.join(".");
    if (name in errors) continue;
    const [root, day, index, side] = path;
    if (root !== "hours" || day === undefined || !isDayKey(day)) {
      errors[name] = issue.message;
      continue;
    }
    const dayLabel = strings.days[day];
    const field =
      index !== undefined && (side === "open" || side === "close")
        ? timeFieldLabel(strings.fields, dayLabel, Number(index), side)
        : dayLabel;
    errors[name] = fill(issue.message, { day: dayLabel, field });
  }
  return errors;
}

// The errors the summary and each day show. A day whose box is checked has
// no time fields on the page, so its errors leave with them, and no link in
// the summary can point at a field that is gone. They come back if the box
// is unchecked, with the times they were given for.
export function errorsShown(
  errors: Record<string, string>,
  allDay: readonly DayKey[],
): Record<string, string> {
  const hidden = allDay.map((day) => `hours.${day}`);
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([name]) =>
        !hidden.some((day) => name === day || name.startsWith(`${day}.`)),
    ),
  );
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
    // The icons box posts only when checked, like a day's Open 24 hours box.
    showIcons: formData.has("showIcons"),
  };
}
