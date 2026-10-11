"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  findOwnerOption,
  writeOwnerOptionAllergens,
  type ChoiceWriteError,
} from "@/core/supabase/choices";
import {
  cleanOtherAllergen,
  hasOtherAllergenComma,
  OTHER_ALLERGEN_LIMITS,
  otherAllergenProblem,
  sameListsAsStored,
  US_MAJOR_ALLERGENS,
  type AllergenLists,
} from "@/domain/allergens";
import { CHOICE_LIMITS, type OwnerOption } from "@/domain/choices";
import { ALLERGEN_IDS } from "@/domain/types";
import { majorRuleOf } from "../allergens/allergen-words";
import {
  applyListsTo,
  inFixedOrder,
  undoApplyTo,
} from "../allergens/apply-server";
import type {
  GroupApplyResult,
  GroupProblem,
  GroupResult,
  GroupState,
} from "../allergens/target";
import { listScope } from "../owner-scope";

// An option's allergens save through these (D-154, D-166): the major
// allergens ticked, the other allergens typed, the check, and D-129's
// apply to a same-named dish or option. Every write in the group carries
// the option's name and the two lists the page showed and lands only if
// the option still holds all three (D-153), so a stale tab never drops an
// allergen another tab added, and no one checks a list they never saw; a
// miss comes back as lists-changed, and the refreshed page shows the
// option as it is now. The database clears the check on any change to the
// name or a list and stamps who and when on a check, in the same statement
// (migration 11); nothing here writes who or when. Nothing here redirects:
// a missing session comes back as a result. Every call that reached the
// database with a live session ends with refresh(). The code, the list,
// the option, and the ids are user input: they are checked here and in
// listScope, and row level security decides whether the rows are this
// owner's. Nothing here can publish (migration 3).

export type OptionAllergenResult = GroupResult;
type ServerApplyProblem = Extract<GroupApplyResult, { ok: false }>["problem"];

const idSchema = z.uuid();
const listsSchema = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  others: z.array(z.string().max(200)).max(OTHER_ALLERGEN_LIMITS.count),
});
const shownSchema = z.object({
  words: z.string().max(CHOICE_LIMITS.name),
  lists: listsSchema,
});
const majorsSchema = z
  .array(z.enum(US_MAJOR_ALLERGENS))
  .max(US_MAJOR_ALLERGENS.length);
// One over the cap, so the count rule names itself.
const othersSchema = z
  .array(z.string().max(1000))
  .max(OTHER_ALLERGEN_LIMITS.count + 1);
const applyShownSchema = z.object({ source: listsSchema, target: listsSchema });
const targetSchema = z.object({
  kind: z.enum(["dish", "option"]),
  id: z.uuid(),
});

function refuse(problem: GroupProblem): OptionAllergenResult {
  return { ok: false, problem };
}

const failed = refuse({ kind: "failed" });

function refuseApply(problem: ServerApplyProblem): GroupApplyResult {
  return { ok: false, problem };
}

const applyFailed = refuseApply({ kind: "failed" });

function stateOf(option: OwnerOption): GroupState {
  return {
    allergens: option.allergens,
    otherAllergens: option.otherAllergens,
    check: option.check,
    words: option.name,
  };
}

function listsOf(option: OwnerOption): AllergenLists {
  return { allergens: option.allergens, others: option.otherAllergens };
}

// What the database refused, as the page's problems: a miss means the
// option or its lists moved under the page; a rule the trigger names is
// the page's own rule said again, as the backstop it is.
function fromWrite(error: ChoiceWriteError): GroupProblem {
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

// The major allergens the option contains, as the boxes show them.
export async function setOptionAllergens(
  rawCode: string,
  rawList: string,
  rawOption: string,
  rawAllergens: unknown,
  rawShown: unknown,
): Promise<OptionAllergenResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawOption);
  const allergens = majorsSchema.safeParse(rawAllergens);
  const shown = shownSchema.safeParse(rawShown);
  if (!id.success || !allergens.success || !shown.success) return failed;
  const result = await writeOwnerOptionAllergens(
    scope.client,
    scope.listId,
    id.data,
    scope.userId,
    { allergens: inFixedOrder(allergens.data) },
    { name: shown.data.words, lists: shown.data.lists },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: stateOf(result.value) };
}

// The other allergens typed, the whole list, each cleaned and checked by
// the page's rules before the database's own. A comma is refused and never
// sent (D-151).
export async function setOptionOtherAllergens(
  rawCode: string,
  rawList: string,
  rawOption: string,
  rawOthers: unknown,
  rawShown: unknown,
): Promise<OptionAllergenResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawOption);
  const others = othersSchema.safeParse(rawOthers);
  const shown = shownSchema.safeParse(rawShown);
  if (!id.success || !others.success || !shown.success) return failed;
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
  const result = await writeOwnerOptionAllergens(
    scope.client,
    scope.listId,
    id.data,
    scope.userId,
    { custom_allergens: cleaned },
    { name: shown.data.words, lists: shown.data.lists },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: stateOf(result.value) };
}

// The check (D-148, D-166). It carries the name and the lists the page
// showed; an uncheck does too, and lands only while the option is checked.
export async function setOptionAllergenCheck(
  rawCode: string,
  rawList: string,
  rawOption: string,
  rawChecked: unknown,
  rawShown: unknown,
): Promise<OptionAllergenResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawOption);
  const checked = z.boolean().safeParse(rawChecked);
  const shown = shownSchema.safeParse(rawShown);
  if (!id.success || !checked.success || !shown.success) return failed;
  const result = await writeOwnerOptionAllergens(
    scope.client,
    scope.listId,
    id.data,
    scope.userId,
    { allergens_reviewed: checked.data },
    {
      name: shown.data.words,
      lists: shown.data.lists,
      ...(checked.data ? {} : { allergens_reviewed: true }),
    },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: stateOf(result.value) };
}

// Gives a same-named dish or option this option's lists and the check
// (D-129, D-166), through the apply's shared server side. This option must
// still be checked and hold the lists the page showed.
export async function applyOptionAllergens(
  rawCode: string,
  rawList: string,
  rawOption: string,
  rawTarget: unknown,
  rawShown: unknown,
): Promise<GroupApplyResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const result = await applyAs(scope, rawCode, rawOption, rawTarget, rawShown);
  refresh();
  return result;
}

async function applyAs(
  scope: Extract<Awaited<ReturnType<typeof listScope>>, { ok: true }>,
  rawCode: string,
  rawOption: string,
  rawTarget: unknown,
  rawShown: unknown,
): Promise<GroupApplyResult> {
  const id = idSchema.safeParse(rawOption);
  const target = targetSchema.safeParse(rawTarget);
  const shown = applyShownSchema.safeParse(rawShown);
  if (!id.success || !target.success || !shown.success) return applyFailed;
  if (target.data.kind === "option" && target.data.id === id.data) {
    return refuseApply({ kind: "target-gone" });
  }
  const source = await findOwnerOption(
    scope.client,
    scope.restaurantId,
    id.data,
    scope.userId,
  );
  if (source === "failed") return applyFailed;
  if (source === "not-found" || source.listId !== scope.listId) {
    return refuseApply({ kind: "parent-gone" });
  }
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

// Undo of an apply from an option: the other side gets its old lists back
// and is left unchecked, only while it still holds the stamp the apply
// made.
export async function undoOptionAllergensApply(
  rawCode: string,
  rawList: string,
  rawTarget: unknown,
  rawBefore: unknown,
  rawAt: unknown,
): Promise<GroupApplyResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const target = targetSchema.safeParse(rawTarget);
  const before = listsSchema.safeParse(rawBefore);
  const at = z.string().min(1).safeParse(rawAt);
  if (!target.success || !before.success || !at.success) return applyFailed;
  const result = await undoApplyTo(
    rawCode,
    target.data,
    before.data,
    at.data,
    scope.userId,
  );
  refresh();
  return result;
}
