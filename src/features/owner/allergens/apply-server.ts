import {
  findOwnerOption,
  writeOwnerOptionAllergens,
} from "@/core/supabase/choices";
import { findOwnerDish, writeOwnerDishAllergens } from "@/core/supabase/dishes";
import {
  sameListsAsStored,
  type AllergenLists,
  type OwnerAllergens,
} from "@/domain/allergens";
import { nameKey } from "@/domain/menu";
import { ALLERGEN_IDS, type AllergenId } from "@/domain/types";
import { dishScope, listScope, ownerScope } from "../owner-scope";
import type { GroupApplyResult } from "./target";

// The same-named Apply's other side (D-129, grown to options by D-166): a
// dish or an option that gets the subject's lists and the check. The
// subject is read and checked by the action that calls this, a dish's or
// an option's; the target is read here
// as the signed-in owner, live in a live home, written through its own
// table's writer, and answered in the group's one shape. It lives in its
// own file, not in an actions file: every export of a "use server" file is
// an endpoint a browser can call, and these take what the actions already
// checked.

export type ApplyTarget = { kind: "dish" | "option"; id: string };

// What the apply knows about the subject once its action has read it: its
// name, and its lists as stored.
export type ApplySource = {
  name: string;
  allergens: readonly AllergenId[];
  others: readonly string[];
};

type ServerApplyProblem = Extract<GroupApplyResult, { ok: false }>["problem"];

function refuseApply(problem: ServerApplyProblem): GroupApplyResult {
  return { ok: false, problem };
}

const applyFailed = refuseApply({ kind: "failed" });

// The major allergens in the order the boxes show and the database keeps,
// each once: the order the enum declares.
export function inFixedOrder(allergens: readonly AllergenId[]): AllergenId[] {
  const set = new Set(allergens);
  return ALLERGEN_IDS.filter((id) => set.has(id));
}

type Patch = {
  allergens?: readonly AllergenId[];
  custom_allergens?: readonly string[];
  allergens_reviewed?: boolean;
};

type Expected = {
  lists?: AllergenLists;
};

type Written =
  { ok: true; value: OwnerAllergens } | { ok: false; notFound: boolean };

// The target as the owner reads it now, and the one write bound to it.
type Opened =
  | {
      ok: true;
      name: string;
      lists: AllergenLists;
      check: boolean;
      write: (patch: Patch, expected: Expected) => Promise<Written>;
    }
  | { ok: false; result: GroupApplyResult };

function listsOf(value: {
  allergens: AllergenId[];
  otherAllergens: string[];
}): AllergenLists {
  return { allergens: value.allergens, others: value.otherAllergens };
}

function allergensOf(value: OwnerAllergens): OwnerAllergens {
  return {
    allergens: value.allergens,
    otherAllergens: value.otherAllergens,
    check: value.check,
  };
}

// A scope that refused: a session or a server problem passes through, and
// a home that is gone is the target gone.
function targetProblem(problem: {
  kind: "signed-out" | "gone" | "parent-gone" | "failed";
}): GroupApplyResult {
  return problem.kind === "signed-out" || problem.kind === "failed"
    ? { ok: false, problem }
    : refuseApply({ kind: "target-gone" });
}

async function openTarget(
  rawCode: string,
  target: ApplyTarget,
  viewer: string,
): Promise<Opened> {
  if (target.kind === "dish") {
    const scope = await dishScope(rawCode, target.id);
    if (!scope.ok) return { ok: false, result: targetProblem(scope.problem) };
    const dish = await findOwnerDish(
      scope.client,
      scope.restaurantId,
      scope.dishId,
      viewer,
    );
    if (dish === "failed") return { ok: false, result: applyFailed };
    if (dish === "not-found") {
      return { ok: false, result: refuseApply({ kind: "target-gone" }) };
    }
    return {
      ok: true,
      name: dish.name,
      lists: listsOf(dish),
      check: dish.check !== null,
      write: async (patch, expected) => {
        const written = await writeOwnerDishAllergens(
          scope.client,
          scope.sectionId,
          dish.id,
          viewer,
          patch,
          expected,
        );
        if (written.ok) return { ok: true, value: allergensOf(written.value) };
        return { ok: false, notFound: written.error.kind === "not-found" };
      },
    };
  }
  const owner = await ownerScope(rawCode);
  if (!owner.ok) return { ok: false, result: targetProblem(owner.problem) };
  const option = await findOwnerOption(
    owner.client,
    owner.restaurantId,
    target.id,
    viewer,
  );
  if (option === "failed") return { ok: false, result: applyFailed };
  if (option === "not-found") {
    return { ok: false, result: refuseApply({ kind: "target-gone" }) };
  }
  const scope = await listScope(rawCode, option.listId);
  if (!scope.ok) return { ok: false, result: targetProblem(scope.problem) };
  return {
    ok: true,
    name: option.name,
    lists: listsOf(option),
    check: option.check !== null,
    write: async (patch, expected) => {
      const written = await writeOwnerOptionAllergens(
        scope.client,
        scope.listId,
        option.id,
        viewer,
        patch,
        expected,
      );
      if (written.ok) return { ok: true, value: allergensOf(written.value) };
      return { ok: false, notFound: written.error.kind === "not-found" };
    },
  };
}

// Gives the target the subject's lists and the check (D-129): two
// statements, the lists and then the check, since one statement that
// changes a list and checks it ends unchecked (migrations 7 and 11), and a
// failure between the two leaves the target with the new lists and
// unchecked, a safe state. The target must still have the name, and hold
// the lists its line showed. The lists are written whenever they differ as
// stored, so the check that follows never refuses itself over their order.
export async function applyListsTo(
  rawCode: string,
  target: ApplyTarget,
  source: ApplySource,
  shownTarget: AllergenLists,
  viewer: string,
): Promise<GroupApplyResult> {
  const opened = await openTarget(rawCode, target, viewer);
  if (!opened.ok) return opened.result;
  if (nameKey(opened.name) !== nameKey(source.name)) {
    return refuseApply({ kind: "target-changed" });
  }
  if (!sameListsAsStored(opened.lists, shownTarget)) {
    return refuseApply({ kind: "target-changed" });
  }
  let lists = opened.lists;
  const wanted: AllergenLists = {
    allergens: [...source.allergens],
    others: [...source.others],
  };
  if (!sameListsAsStored(lists, wanted)) {
    const written = await opened.write(
      { allergens: source.allergens, custom_allergens: source.others },
      { lists },
    );
    if (!written.ok) {
      return refuseApply({
        kind: written.notFound ? "target-changed" : "failed",
      });
    }
    lists = listsOf(written.value);
  }
  const checked = await opened.write({ allergens_reviewed: true }, { lists });
  if (!checked.ok) {
    return refuseApply({
      kind: checked.notFound ? "target-changed" : "failed",
    });
  }
  return { ok: true, value: checked.value };
}
