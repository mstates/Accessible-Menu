"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  findOwnerDish,
  writeOwnerDishAllergens,
  type DishWriteError,
} from "@/core/supabase/dishes";
import {
  cleanOtherAllergen,
  hasOtherAllergenComma,
  OTHER_ALLERGEN_LIMITS,
  otherAllergenProblem,
  sameListsAsStored,
  US_MAJOR_ALLERGENS,
  type AllergenLists,
} from "@/domain/allergens";
import type { OwnerDishAllergens, OwnerDishDetail } from "@/domain/dish";
import { nameKey } from "@/domain/menu";
import { ALLERGEN_IDS, type AllergenId } from "@/domain/types";
import { majorRuleOf } from "../allergens/allergen-words";
import type {
  GroupApplyResult,
  GroupProblem,
  GroupResult,
} from "../allergens/target";
import { dishScope } from "../owner-scope";

// A dish's allergens save through these (D-148): the major allergens
// ticked, the other allergens typed, the check, and D-129's apply to a
// same-named dish. Every write that changes or checks a list carries the
// two lists the page showed and lands only if the dish still holds them
// (Michael, October 8, 2026), so a stale tab never drops an allergen
// another tab added, and no one checks a list they never saw; a miss comes
// back as lists-changed, and the refreshed page shows the lists as they
// are now. The database clears the check on any change to a list and
// stamps who and when on a check, in the same statement (migration 7);
// nothing here writes who or when. Nothing here redirects: a missing
// session comes back as a result. Every call that reached the database
// with a live session ends with refresh(). The code, the dish, and the ids
// are user input: they are checked here and in dishScope, and row level
// security decides whether the rows are this owner's. Nothing here can
// publish (migration 3).

// The group's own result shapes (allergens/target.ts): a write that found
// the dish holding other lists than the page showed is lists-changed.
export type AllergenProblem = GroupProblem;
export type AllergenResult = GroupResult;
export type ApplyResult = GroupApplyResult;
type ServerApplyProblem = Extract<ApplyResult, { ok: false }>["problem"];

const idSchema = z.uuid();
const listsSchema = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  others: z.array(z.string().max(200)).max(OTHER_ALLERGEN_LIMITS.count),
});
const majorsSchema = z
  .array(z.enum(US_MAJOR_ALLERGENS))
  .max(US_MAJOR_ALLERGENS.length);
// One over the cap, so the count rule names itself.
const othersSchema = z
  .array(z.string().max(1000))
  .max(OTHER_ALLERGEN_LIMITS.count + 1);
const applyShownSchema = z.object({ source: listsSchema, target: listsSchema });

function refuse(problem: AllergenProblem): AllergenResult {
  return { ok: false, problem };
}

const failed = refuse({ kind: "failed" });

function refuseApply(problem: ServerApplyProblem): ApplyResult {
  return { ok: false, problem };
}

const applyFailed = refuseApply({ kind: "failed" });

function allergensOf(dish: OwnerDishDetail): OwnerDishAllergens {
  return {
    allergens: dish.allergens,
    otherAllergens: dish.otherAllergens,
    check: dish.check,
  };
}

function listsOf(dish: OwnerDishDetail): AllergenLists {
  return { allergens: dish.allergens, others: dish.otherAllergens };
}

// The major allergens in the order the boxes show and the database keeps,
// each once: the order the enum declares.
function inFixedOrder(allergens: readonly AllergenId[]): AllergenId[] {
  const set = new Set(allergens);
  return ALLERGEN_IDS.filter((id) => set.has(id));
}

// What the database refused, as the page's problems: a miss means the lists
// moved under the page; a rule the trigger names is the page's own rule
// said again, as the backstop it is.
function fromWrite(error: DishWriteError): AllergenProblem {
  switch (error.kind) {
    case "not-found":
      return { kind: "lists-changed" };
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

// The major allergens the dish contains, as the boxes show them.
export async function setDishAllergens(
  rawCode: string,
  rawDish: string,
  rawAllergens: unknown,
  rawShown: unknown,
): Promise<AllergenResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const allergens = majorsSchema.safeParse(rawAllergens);
  const shown = listsSchema.safeParse(rawShown);
  if (!allergens.success || !shown.success) return failed;
  const result = await writeOwnerDishAllergens(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    { allergens: inFixedOrder(allergens.data) },
    { lists: shown.data },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: allergensOf(result.value) };
}

// The other allergens typed, the whole list, each cleaned and checked by
// the page's rules before the database's own.
export async function setDishOtherAllergens(
  rawCode: string,
  rawDish: string,
  rawOthers: unknown,
  rawShown: unknown,
): Promise<AllergenResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const others = othersSchema.safeParse(rawOthers);
  const shown = listsSchema.safeParse(rawShown);
  if (!others.success || !shown.success) return failed;
  const cleaned = others.data.map(cleanOtherAllergen);
  if (cleaned.length > OTHER_ALLERGEN_LIMITS.count) {
    return refuse({ kind: "invalid", rule: "othersFull" });
  }
  for (const [index, value] of cleaned.entries()) {
    if (value === "") return refuse({ kind: "invalid", rule: "otherRequired" });
    if (hasOtherAllergenComma(value)) {
      return refuse({ kind: "invalid", rule: "otherComma" });
    }
    const major = majorRuleOf(value);
    if (major) return refuse({ kind: "invalid", rule: major });
    const rule = otherAllergenProblem(value, cleaned, index);
    if (rule === "otherTaken") return refuse({ kind: "name-taken" });
    if (rule) return refuse({ kind: "invalid", rule });
  }
  const result = await writeOwnerDishAllergens(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    { custom_allergens: cleaned },
    { lists: shown.data },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: allergensOf(result.value) };
}

// The check (D-148). A check carries the lists the page showed; an uncheck
// lands only while the dish is checked.
export async function setDishAllergenCheck(
  rawCode: string,
  rawDish: string,
  rawChecked: unknown,
  rawShown: unknown,
): Promise<AllergenResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const checked = z.boolean().safeParse(rawChecked);
  const shown = listsSchema.safeParse(rawShown);
  if (!checked.success || !shown.success) return failed;
  const result = await writeOwnerDishAllergens(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    { allergens_reviewed: checked.data },
    checked.data ? { lists: shown.data } : { allergens_reviewed: true },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: allergensOf(result.value) };
}

// Gives a same-named dish this dish's lists and the check (D-129): two
// statements, the lists and then the check, since one statement that
// changes a list and checks it ends unchecked (migration 7), and a failure
// between the two leaves that dish with the new lists and unchecked, a safe
// state. This dish must still be checked and hold the lists the page
// showed; the other dish must still have the name, and hold the lists its
// line showed. The lists are written whenever they differ as stored, so the
// check that follows never refuses itself over their order.
export async function applyDishAllergens(
  rawCode: string,
  rawDish: string,
  rawTarget: string,
  rawShown: unknown,
): Promise<ApplyResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  // Whatever the outcome, the page then shows both dishes as they are now.
  const result = await applyAs(scope, rawCode, rawTarget, rawShown);
  refresh();
  return result;
}

async function applyAs(
  scope: Extract<Awaited<ReturnType<typeof dishScope>>, { ok: true }>,
  rawCode: string,
  rawTarget: string,
  rawShown: unknown,
): Promise<ApplyResult> {
  const targetId = idSchema.safeParse(rawTarget);
  const shown = applyShownSchema.safeParse(rawShown);
  if (!targetId.success || !shown.success) return applyFailed;
  if (targetId.data === scope.dishId)
    return refuseApply({ kind: "target-gone" });

  const source = await findOwnerDish(
    scope.client,
    scope.restaurantId,
    scope.dishId,
    scope.userId,
  );
  if (source === "failed") return applyFailed;
  if (source === "not-found") return refuseApply({ kind: "parent-gone" });
  if (!source.check) return refuseApply({ kind: "source-unchecked" });
  if (!sameListsAsStored(listsOf(source), shown.data.source)) {
    return refuseApply({ kind: "source-changed" });
  }

  const targetScope = await dishScope(rawCode, targetId.data);
  if (!targetScope.ok) {
    return targetScope.problem.kind === "signed-out" ||
      targetScope.problem.kind === "failed"
      ? { ok: false, problem: targetScope.problem }
      : refuseApply({ kind: "target-gone" });
  }
  const target = await findOwnerDish(
    targetScope.client,
    targetScope.restaurantId,
    targetScope.dishId,
    scope.userId,
  );
  if (target === "failed") return applyFailed;
  if (target === "not-found") return refuseApply({ kind: "target-gone" });
  if (nameKey(target.name) !== nameKey(source.name)) {
    return refuseApply({ kind: "target-changed" });
  }
  if (!sameListsAsStored(listsOf(target), shown.data.target)) {
    return refuseApply({ kind: "target-changed" });
  }

  let lists = listsOf(target);
  if (!sameListsAsStored(lists, listsOf(source))) {
    const written = await writeOwnerDishAllergens(
      targetScope.client,
      targetScope.sectionId,
      target.id,
      scope.userId,
      {
        allergens: source.allergens,
        custom_allergens: source.otherAllergens,
      },
      { lists },
    );
    if (!written.ok) {
      return refuseApply({
        kind: written.error.kind === "not-found" ? "target-changed" : "failed",
      });
    }
    lists = listsOf(written.value);
  }
  const checked = await writeOwnerDishAllergens(
    targetScope.client,
    targetScope.sectionId,
    target.id,
    scope.userId,
    { allergens_reviewed: true },
    { lists },
  );
  if (!checked.ok) {
    return refuseApply({
      kind: checked.error.kind === "not-found" ? "target-changed" : "failed",
    });
  }
  return { ok: true, value: allergensOf(checked.value) };
}

// Undo of an apply: the other dish gets its old lists back and is left
// unchecked, since the stamp it had before cannot be restored, and only
// while it still holds the stamp the apply made.
export async function undoDishAllergensApply(
  rawCode: string,
  rawDish: string,
  rawTarget: string,
  rawBefore: unknown,
  rawAt: unknown,
): Promise<ApplyResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const targetId = idSchema.safeParse(rawTarget);
  const before = listsSchema.safeParse(rawBefore);
  const at = z.string().min(1).safeParse(rawAt);
  if (!targetId.success || !before.success || !at.success) return applyFailed;
  const targetScope = await dishScope(rawCode, targetId.data);
  if (!targetScope.ok) {
    refresh();
    return targetScope.problem.kind === "signed-out" ||
      targetScope.problem.kind === "failed"
      ? { ok: false, problem: targetScope.problem }
      : refuseApply({ kind: "target-gone" });
  }
  const result = await writeOwnerDishAllergens(
    targetScope.client,
    targetScope.sectionId,
    targetScope.dishId,
    scope.userId,
    {
      allergens: inFixedOrder(before.data.allergens),
      custom_allergens: before.data.others,
      allergens_reviewed: false,
    },
    { allergens_reviewed_at: at.data },
  );
  refresh();
  if (!result.ok) {
    return refuseApply({
      kind: result.error.kind === "not-found" ? "target-changed" : "failed",
    });
  }
  return { ok: true, value: allergensOf(result.value) };
}
