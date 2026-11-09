"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { findOwnerDish } from "@/core/supabase/dishes";
import {
  OTHER_ALLERGEN_LIMITS,
  sameListsAsStored,
  type AllergenLists,
} from "@/domain/allergens";
import type { OwnerDishDetail } from "@/domain/dish";
import { ALLERGEN_IDS } from "@/domain/types";
import { applyListsTo } from "../allergens/apply-server";
import type { GroupApplyResult } from "../allergens/target";
import { dishScope } from "../owner-scope";

// D-129's apply from a dish's Allergens page to a same-named dish or
// option (D-166): a press action outside the page's Save (D-229), from the
// dish's saved lists. The dish's lists and its check save through
// form-actions.ts. The apply carries the two lists the page showed for
// each side and lands only if both still hold them (Michael, October 8,
// 2026), so no one applies a list they never saw. Nothing here redirects:
// a missing session comes back as a result. The call ends with refresh(),
// so the page shows both sides as they are now. The code, the dish, and
// the ids are user input: they are checked here and in dishScope, and row
// level security decides whether the rows are this owner's. Nothing here
// can publish (migration 3).

export type ApplyResult = GroupApplyResult;
type ServerApplyProblem = Extract<ApplyResult, { ok: false }>["problem"];

const listsSchema = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  others: z.array(z.string().max(200)).max(OTHER_ALLERGEN_LIMITS.count),
});
const applyShownSchema = z.object({ source: listsSchema, target: listsSchema });
const targetSchema = z.object({
  kind: z.enum(["dish", "option"]),
  id: z.uuid(),
});

function refuseApply(problem: ServerApplyProblem): ApplyResult {
  return { ok: false, problem };
}

const applyFailed = refuseApply({ kind: "failed" });

function listsOf(dish: OwnerDishDetail): AllergenLists {
  return { allergens: dish.allergens, others: dish.otherAllergens };
}

// Gives a same-named dish or option this dish's lists and the check
// (D-129, D-166): two statements, the lists and then the check, through
// the apply's shared server side. This dish must still be checked and hold
// the lists the page showed; the other side must still have the name, and
// hold the lists its line showed.
export async function applyDishAllergens(
  rawCode: string,
  rawDish: string,
  rawTarget: unknown,
  rawShown: unknown,
): Promise<ApplyResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  // Whatever the outcome, the page then shows both sides as they are now.
  const result = await applyAs(scope, rawCode, rawTarget, rawShown);
  refresh();
  return result;
}

async function applyAs(
  scope: Extract<Awaited<ReturnType<typeof dishScope>>, { ok: true }>,
  rawCode: string,
  rawTarget: unknown,
  rawShown: unknown,
): Promise<ApplyResult> {
  const target = targetSchema.safeParse(rawTarget);
  const shown = applyShownSchema.safeParse(rawShown);
  if (!target.success || !shown.success) return applyFailed;
  if (target.data.kind === "dish" && target.data.id === scope.dishId) {
    return refuseApply({ kind: "target-gone" });
  }

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
  return applyListsTo(
    rawCode,
    target.data,
    {
      name: source.name,
      allergens: source.allergens,
      others: source.otherAllergens,
    },
    shown.data.target,
    scope.userId,
  );
}
