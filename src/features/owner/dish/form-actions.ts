"use server";

import { z } from "zod";
import { expireRestaurant } from "@/core/cache";
import {
  dishGeneralSchema,
  saveOwnerDishGeneral,
  writeOwnerDishAllergens,
  writeOwnerDishShowing,
  writeOwnerDishTagsPage,
  type DishWriteError,
  type ShowingPatch,
} from "@/core/supabase/dishes";
import { OTHER_ALLERGEN_LIMITS } from "@/domain/allergens";
import { AVAILABILITY } from "@/domain/availability";
import { PRICE_KINDS } from "@/domain/dish";
import { DAY_KEYS } from "@/domain/hours";
import { normalizeMenuCode } from "@/domain/menu-url";
import { MONTH_KEYS, parseSchedule, WEEK_KEYS } from "@/domain/schedule";
import {
  ALLERGEN_IDS,
  DIETARY_TAG_IDS,
  type DietaryTagId,
} from "@/domain/types";
import { inFixedOrder } from "../allergens/apply-server";
import { allergenSaveSteps } from "../allergens/save-steps";
import type { ListProblem } from "../editing/list-words";
import { dishScope } from "../owner-scope";
import { validateAllergenForm } from "./allergens-form";
import { validateAvailabilityForm } from "./availability-form";
import type { AllergenSaveDetail, SaveResult } from "./form-result";
import { validateGeneralForm } from "./general-form";

// The four dish pages that save by a press save through these (D-223,
// D-229, D-237): General, Allergens, Dietary tags, and Availability, one
// action each, bound to the restaurant and the dish in the route. Each
// takes the page as the owner left it and what the page showed, runs the
// page's own validation again, and writes in as few statements as the
// database allows, each landing only if the dish still holds what the
// page showed (D-149); General's is one call, whole or not at all, with
// the compare under a lock inside the database (migration 16). Nothing
// here redirects or refreshes: the browser loads the page
// again when a save lands, so the new document carries the result. The
// code, the dish, and the payload are user input: they are checked here
// and in dishScope, the dish is read as one of this restaurant's that is
// not deleted, in a live section of a live menu, before any write, and row
// level security decides whether the rows are this owner's. Nothing here
// can publish (migration 3).

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

function failed(problem: ServerProblem = { kind: "failed" }): {
  status: "failed";
  problem: ServerProblem;
} {
  return { status: "failed", problem };
}

const moved = { status: "moved" } as const;
const saved = { status: "saved" } as const;

const typed = z.string().max(200);

const generalPayload = z.object({
  // The form's fields as the owner left them, every price choice's among
  // them; only the chosen one's are read (Q-171).
  fields: z.object({
    description: z.string().max(5000),
    note: typed,
    kind: z.enum(PRICE_KINDS),
    price: typed,
    calories: typed,
    sizes: z
      .array(
        z.object({
          key: z.string().max(60),
          id: z.uuid().nullable(),
          name: typed,
          price: typed,
          calories: typed,
        }),
      )
      .max(200),
  }),
  // The document the page showed, as it arrived from the reader: an object,
  // handed on to the database untouched.
  shown: z.record(z.string(), z.unknown()),
});

export type GeneralPayload = z.infer<typeof generalPayload>;

// The table rules a General save can meet, by constraint, as the page's
// own rules: the database's refusal is the page's rule said again, as the
// backstop it is. The page checks every one before it sends, so these
// answer only if the two ever disagree.
const GENERAL_TABLE_RULES: Readonly<Record<string, string>> = {
  items_description_text: "descriptionLength",
  items_note_text: "noteLength",
  items_price_cents_check: "priceRange",
  items_price_cents_range: "priceRange",
  items_calories_shape: "caloriesFormat",
  item_sizes_name_text: "sizeNameLength",
  item_sizes_price_cents: "priceRange",
  item_sizes_calories_shape: "caloriesFormat",
};

function fromGeneralWrite(error: DishWriteError): SaveResult {
  switch (error.kind) {
    case "moved":
      return moved;
    // A dish that is not there is the page's own parent gone.
    case "not-found":
      return failed({ kind: "parent-gone" });
    // The names index: two sizes of the dish would share a name.
    case "name-taken":
      return failed({ kind: "invalid", rule: "sizeNamesDiffer" });
    case "refused": {
      const rule = GENERAL_TABLE_RULES[error.rule];
      return rule ? failed({ kind: "invalid", rule }) : failed();
    }
    default:
      return failed();
  }
}

// The General page (D-237): the description, the note, the price choice
// with its one price or its sizes, and the calories, in one call that
// lands whole or not at all. The page's own checks run again here, on the
// fields as typed, against the document the page showed; what is written
// is the next document, with every choice that is not the chosen one
// copied from the shown one. The database locks the dish, reads the
// document again, and refuses as moved when it is not the one the page
// showed. A draft until Publish, so no diner page is told.
export async function saveDishGeneral(
  rawCode: string,
  rawDish: string,
  rawPayload: unknown,
): Promise<SaveResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return failed(scope.problem);
  const payload = generalPayload.safeParse(rawPayload);
  if (!payload.success) return failed();
  const shown = dishGeneralSchema.safeParse(payload.data.shown);
  if (!shown.success) return failed();
  const check = validateGeneralForm(payload.data.fields, shown.data);
  if (check.next === null) return failed();
  const result = await saveOwnerDishGeneral(
    scope.client,
    scope.dishId,
    payload.data.shown,
    check.next,
  );
  return result.ok ? saved : fromGeneralWrite(result.error);
}

const listsSchema = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  others: z.array(z.string().max(200)).max(OTHER_ALLERGEN_LIMITS.count),
});

const allergensPayload = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  // One over the cap, so the count rule names itself.
  others: z.array(z.string().max(1000)).max(OTHER_ALLERGEN_LIMITS.count + 1),
  checked: z.boolean(),
  shown: z.object({ lists: listsSchema, checked: z.boolean() }),
});

export type AllergensPayload = z.infer<typeof allergensPayload>;

// What the database refused, as the page's problems: a rule the trigger
// names is the page's own rule said again, as the backstop it is.
function fromAllergenWrite(error: DishWriteError): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "refused":
      switch (error.rule) {
        case "other_allergen_repeated":
          return { kind: "name-taken" };
        case "other_allergen_text":
          return { kind: "invalid", rule: "otherLength" };
        case "other_allergen_comma":
          return { kind: "invalid", rule: "otherComma" };
        case "other_allergen_major":
          return { kind: "invalid", rule: "otherMajor:both" };
        default:
          return { kind: "failed" };
      }
    default:
      return { kind: "failed" };
  }
}

// The Allergens page (D-148): the lists and the check in one press. A
// change to a list with the check kept is two statements, the lists and
// then the check against the new lists; if the second fails the dish
// holds the new lists unchecked, which the page adopts, so its next press
// sends the check alone.
export async function saveDishAllergens(
  rawCode: string,
  rawDish: string,
  rawPayload: unknown,
): Promise<SaveResult<AllergenSaveDetail>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return failed(scope.problem);
  const payload = allergensPayload.safeParse(rawPayload);
  if (!payload.success) return failed();
  const { allergens, others, checked, shown } = payload.data;
  const check = validateAllergenForm(others);
  if (check.problems.length > 0) return failed();
  const next = {
    lists: { allergens: inFixedOrder(allergens), others: check.others },
    checked,
  };
  const steps = allergenSaveSteps(shown, next);
  for (const [index, step] of steps.entries()) {
    const result = await writeOwnerDishAllergens(
      scope.client,
      scope.sectionId,
      scope.dishId,
      scope.userId,
      step.patch,
      step.expected,
    );
    if (result.ok) continue;
    if (result.error.kind === "not-found") return moved;
    const problem = fromAllergenWrite(result.error);
    if (index === 0) return failed(problem);
    return {
      status: "failed",
      problem,
      detail: { part: "check", shown: { lists: next.lists, checked: false } },
    };
  }
  return saved;
}

const tagsSchema = z.array(z.enum(DIETARY_TAG_IDS)).max(DIETARY_TAG_IDS.length);

const tagsPayload = z.object({
  tags: tagsSchema,
  cookedToOrder: z.boolean(),
  shownTags: tagsSchema,
});

export type TagsPayload = z.infer<typeof tagsPayload>;

function tagsInOrder(tags: readonly DietaryTagId[]): DietaryTagId[] {
  const set = new Set(tags);
  return DIETARY_TAG_IDS.filter((id) => set.has(id));
}

// The Dietary tags page (D-66, D-167): the tags and the Cooked to order
// mark in one statement.
export async function saveDishTags(
  rawCode: string,
  rawDish: string,
  rawPayload: unknown,
): Promise<SaveResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return failed(scope.problem);
  const payload = tagsPayload.safeParse(rawPayload);
  if (!payload.success) return failed();
  const result = await writeOwnerDishTagsPage(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    {
      dietary_tags: tagsInOrder(payload.data.tags),
      cooked_to_order: payload.data.cookedToOrder,
    },
    tagsInOrder(payload.data.shownTags),
  );
  if (result.ok) return saved;
  return result.error.kind === "not-found" ? moved : failed();
}

const text = z.string().max(200);

const availabilityPayload = z.object({
  choice: z.enum(AVAILABILITY),
  shownState: z.enum(AVAILABILITY),
  fields: z.object({
    days: z.array(z.enum(DAY_KEYS)).max(DAY_KEYS.length),
    weeks: z.array(z.enum(WEEK_KEYS)).max(WEEK_KEYS.length),
    months: z.array(z.enum(MONTH_KEYS)).max(MONTH_KEYS.length),
    open: text,
    close: text,
    from: text,
    until: text,
  }),
  // The restaurant's day as the page computed it, for a date typed with
  // no year.
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shownSchedule: z.unknown(),
});

export type AvailabilityPayload = z.infer<typeof availabilityPayload>;

// The Availability page (D-159, D-160): the schedule and, when the choice
// changed, the availability, in one statement. A sold-out mark is the
// server's own clock, never a browser's.
export async function saveDishAvailability(
  rawCode: string,
  rawDish: string,
  rawPayload: unknown,
): Promise<SaveResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return failed(scope.problem);
  const payload = availabilityPayload.safeParse(rawPayload);
  if (!payload.success) return failed();
  const {
    choice,
    shownState,
    fields,
    today,
    shownSchedule: rawShown,
  } = payload.data;
  const shownSchedule = rawShown === null ? null : parseSchedule(rawShown);
  if (rawShown !== null && shownSchedule === null) return failed();
  const check = validateAvailabilityForm(fields, today);
  if (check.problems.length > 0) return failed();
  const patch: ShowingPatch = { special_schedule: check.schedule };
  if (choice !== shownState) {
    if (choice === "off") {
      patch.available = false;
      patch.sold_out_at = null;
    } else if (choice === "sold-out") {
      patch.available = true;
      patch.sold_out_at = new Date().toISOString();
    } else {
      patch.available = true;
      patch.sold_out_at = null;
    }
  }
  const result = await writeOwnerDishShowing(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    patch,
    shownSchedule,
  );
  if (!result.ok) {
    return result.error.kind === "not-found" ? moved : failed();
  }
  // Availability and the schedule reach diners without Publish (D-84,
  // D-159, D-160): the restaurant's pages re-render on their next request.
  expireRestaurant(normalizeMenuCode(rawCode));
  return saved;
}
