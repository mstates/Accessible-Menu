"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  writeOwnerDishSchedule,
  writeOwnerDishTags,
  type DishWriteError,
} from "@/core/supabase/dishes";
import {
  normalizeSchedule,
  parseSchedule,
  type Schedule,
} from "@/domain/schedule";
import { DIETARY_TAG_IDS, type DietaryTagId } from "@/domain/types";
import type { ListProblem } from "../editing/list-words";
import { dishScope } from "../owner-scope";

// A dish's dietary tags (D-66) and its schedule (D-159) save through these
// (task 5). Every write carries what the page showed and lands only if the
// dish still holds it (D-149's rule, widened to both at the plan): a stale
// tab's tick never puts back a tag another tab removed, and never drops a
// part of the schedule another tab set; a miss comes back as changed, and
// the refreshed page shows the dish as it is now. The database holds each
// tag to once and the schedule to its shape (migration 9); the same rules
// are read here first, as the backstop they are. Nothing here redirects: a
// missing session comes back as a result. Every call that reached the
// database with a live session ends with refresh(). The code and the dish
// are user input: they are checked here and in dishScope, and row level
// security decides whether the rows are this owner's. Nothing here can
// publish (migration 3).

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type TagsProblem = ServerProblem | { kind: "tags-changed" };
export type TagsResult =
  | { ok: true; value: { tags: DietaryTagId[] } }
  | { ok: false; problem: TagsProblem };

export type ScheduleProblem = ServerProblem | { kind: "schedule-changed" };
export type ScheduleResult =
  | { ok: true; value: { schedule: Schedule | null } }
  | { ok: false; problem: ScheduleProblem };

const tagsSchema = z.array(z.enum(DIETARY_TAG_IDS)).max(DIETARY_TAG_IDS.length);

// The tags in the order the boxes show and the database keeps, each once.
function inFixedOrder(tags: readonly DietaryTagId[]): DietaryTagId[] {
  const set = new Set(tags);
  return DIETARY_TAG_IDS.filter((id) => set.has(id));
}

function fromTagsWrite(error: DishWriteError): TagsProblem {
  return error.kind === "not-found"
    ? { kind: "tags-changed" }
    : { kind: "failed" };
}

export async function setDishTags(
  rawCode: string,
  rawDish: string,
  rawTags: unknown,
  rawShown: unknown,
): Promise<TagsResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const tags = tagsSchema.safeParse(rawTags);
  const shown = tagsSchema.safeParse(rawShown);
  if (!tags.success || !shown.success) {
    return { ok: false, problem: { kind: "failed" } };
  }
  const result = await writeOwnerDishTags(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    inFixedOrder(tags.data),
    shown.data,
  );
  refresh();
  if (!result.ok) return { ok: false, problem: fromTagsWrite(result.error) };
  return { ok: true, value: { tags: result.value.tags } };
}

// A schedule as the page sends it: null for none, or a value the domain
// reads as a schedule. The one to store is put in its fixed shape; the one
// the page showed is compared as the server handed it back.
function readSchedule(
  raw: unknown,
): { ok: true; schedule: Schedule | null } | { ok: false } {
  if (raw === null) return { ok: true, schedule: null };
  const schedule = parseSchedule(raw);
  return schedule ? { ok: true, schedule } : { ok: false };
}

function fromScheduleWrite(error: DishWriteError): ScheduleProblem {
  switch (error.kind) {
    case "not-found":
      return { kind: "schedule-changed" };
    case "refused":
      return error.rule === "items_special_schedule_shape"
        ? { kind: "invalid", rule: "scheduleShape" }
        : { kind: "failed" };
    default:
      return { kind: "failed" };
  }
}

export async function setDishSchedule(
  rawCode: string,
  rawDish: string,
  rawSchedule: unknown,
  rawShown: unknown,
): Promise<ScheduleResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const next = readSchedule(rawSchedule);
  const shown = readSchedule(rawShown);
  if (!next.ok || !shown.ok) return { ok: false, problem: { kind: "failed" } };
  const result = await writeOwnerDishSchedule(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    normalizeSchedule(next.schedule),
    shown.schedule,
  );
  refresh();
  if (!result.ok) {
    return { ok: false, problem: fromScheduleWrite(result.error) };
  }
  return { ok: true, value: { schedule: result.value.schedule } };
}
