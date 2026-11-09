"use server";

import { z } from "zod";
import { expireRestaurant } from "@/core/cache";
import {
  writeOwnerDishAllergens,
  writeOwnerDishShowing,
  writeOwnerDishTagsPage,
  type DishWriteError,
  type ShowingPatch,
} from "@/core/supabase/dishes";
import { OTHER_ALLERGEN_LIMITS } from "@/domain/allergens";
import { AVAILABILITY } from "@/domain/availability";
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

// The three dish pages that save by a press save through these (D-223,
// D-229): Allergens, Dietary tags, and Availability, one action each,
// bound to the restaurant and the dish in the route. Each takes the page
// as the owner left it and what the page showed, runs the page's own
// validation again, and writes in as few statements as the database
// allows, each landing only if the dish still holds what the page showed
// (D-149). Nothing here redirects or refreshes: the browser loads the page
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
