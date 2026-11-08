"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  addOwnerChoiceList,
  addOwnerOption,
  deleteOwnerChoiceList,
  removeOwnerOption,
  renameOwnerOption,
  setOwnerChoiceListLead,
  setOwnerChoiceListOrder,
  setOwnerOptionCalories,
  setOwnerOptionOrder,
  setOwnerOptionPrice,
  type ChoiceWriteError,
} from "@/core/supabase/choices";
import { parseCalories } from "@/domain/calories";
import {
  cleanLead,
  cleanOptionText,
  leadProblem,
  OPTION_TEXTS,
  optionTextProblem,
  type ChoiceHome,
  type OptionText,
  type OwnerChoiceList,
  type OwnerOption,
} from "@/domain/choices";
import type { Held } from "@/domain/menu";
import { parsePrice } from "@/domain/money";
import type { ListProblem } from "../editing/list-words";
import { dishScope, listScope, sectionScope } from "../owner-scope";

// Choice lists save through these (D-166): the rows on a dish's or a
// section's page, added by lead, moved, and deleted with their options
// after the question (D-119, D-221); and on the list's own page, the lead,
// and the options, added by name, their three texts, moved, and removed.
// Nothing here redirects: a missing session comes back as a
// result and the typed text stays on screen. Every call that reached the
// database with a live session ends with refresh(). The code, the home or
// the list, and the ids are user input: they are checked here and in the
// scopes, the home is read as live in a live menu before any write, and
// row level security decides whether the rows are this owner's. Nothing
// here can publish (migration 3). An option's allergens save through
// option-allergen-actions.ts.

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type ChoiceActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

const idSchema = z.uuid();
const homeSchema = z.object({
  kind: z.enum(["dish", "section"]),
  id: z.uuid(),
});
const orderSchema = z.array(z.uuid()).min(1).max(500);
const toldSchema = z.object({
  sections: z.number().int().min(0),
  dishes: z.number().int().min(0),
  options: z.number().int().min(0),
});
const optionTextSchema = z.enum(OPTION_TEXTS);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const gone = refuse({ kind: "gone" });
const failed = refuse({ kind: "failed" });

// A row that is not there is "gone"; for an add, what it would go in is.
function fromWrite(
  error: ChoiceWriteError,
  missing: "gone" | "parent-gone",
): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "not-found":
      return { kind: missing };
    case "mismatch":
      return { kind: "mismatch" };
    case "grew":
      return { kind: "grew" };
    default:
      return { kind: "failed" };
  }
}

// The home as the page named it, read live in a live menu: a dish through
// dishScope, a section through sectionScope.
async function homeScope(rawCode: string, rawHome: unknown) {
  const home = homeSchema.safeParse(rawHome);
  if (!home.success)
    return { ok: false as const, problem: { kind: "parent-gone" as const } };
  const scope =
    home.data.kind === "dish"
      ? await dishScope(rawCode, home.data.id)
      : await sectionScope(rawCode, home.data.id);
  if (!scope.ok) return scope;
  return {
    ok: true as const,
    client: scope.client,
    home: home.data as ChoiceHome,
  };
}

// The lead, cleaned, or the rule it breaks.
function readLead(raw: unknown): { lead: string } | ServerProblem {
  const lead = cleanLead(typeof raw === "string" ? raw : "");
  const rule = leadProblem(lead);
  return rule ? { kind: "invalid", rule } : { lead };
}

// The added list, and how many lists the home has now that it is in.
export async function addChoiceList(
  rawCode: string,
  rawHome: unknown,
  rawLead: string,
): Promise<ChoiceActionResult<{ row: OwnerChoiceList; total: number }>> {
  const scope = await homeScope(rawCode, rawHome);
  if (!scope.ok) return scope;
  const lead = readLead(rawLead);
  if ("kind" in lead) return refuse(lead);
  const result = await addOwnerChoiceList(scope.client, scope.home, lead.lead);
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "parent-gone"));
  return {
    ok: true,
    value: { row: result.value.list, total: result.value.total },
  };
}

// Marks the list deleted after the question (D-119, D-221), with its
// options: the database counts the live options in the statement that
// marks it and refuses a delete that would take more than the owner was
// told about (migration 11).
export async function deleteChoiceList(
  rawCode: string,
  rawHome: unknown,
  rawId: string,
  rawTold: Held,
): Promise<ChoiceActionResult> {
  const scope = await homeScope(rawCode, rawHome);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const told = toldSchema.safeParse(rawTold);
  if (!told.success) {
    refresh();
    return refuse({ kind: "grew" });
  }
  const result = await deleteOwnerChoiceList(
    scope.client,
    scope.home,
    id.data,
    told.data,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}

export async function orderChoiceLists(
  rawCode: string,
  rawHome: unknown,
  rawOrder: string[],
): Promise<ChoiceActionResult> {
  const scope = await homeScope(rawCode, rawHome);
  if (!scope.ok) return scope;
  const order = orderSchema.safeParse(rawOrder);
  if (!order.success) return refuse({ kind: "mismatch" });
  const result = await setOwnerChoiceListOrder(
    scope.client,
    scope.home,
    order.data,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}

// The rows on a home page never rename a list: the lead is edited on the
// list's own page. The shared list still needs a setText, which refuses.
export async function renameChoiceListRow(): Promise<
  ChoiceActionResult<Record<never, string>>
> {
  return failed;
}

// The list's lead, from the top of its own page (D-135).
export async function setChoiceListLead(
  rawCode: string,
  rawList: string,
  rawLead: string,
): Promise<ChoiceActionResult<{ lead: string }>> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const lead = readLead(rawLead);
  if ("kind" in lead) return refuse(lead);
  const result = await setOwnerChoiceListLead(
    scope.client,
    scope.home,
    scope.listId,
    lead.lead,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "parent-gone"));
  return { ok: true, value: { lead: result.value.lead } };
}

// An option's texts as the row's fields show them.
function textsOf(option: OwnerOption): Record<OptionText, string> {
  return { name: option.name, price: option.price, calories: option.calories };
}

// The added option, and how many options the list has now that it is in.
export async function addChoiceOption(
  rawCode: string,
  rawList: string,
  rawName: string,
): Promise<ChoiceActionResult<{ row: OwnerOption; total: number }>> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const name = cleanOptionText(
    "name",
    typeof rawName === "string" ? rawName : "",
  );
  const rule = optionTextProblem("name", name);
  if (rule) return refuse({ kind: "invalid", rule });
  const result = await addOwnerOption(scope.client, scope.listId, name);
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "parent-gone"));
  return {
    ok: true,
    value: { row: result.value.option, total: result.value.total },
  };
}

// Writes an option's name, added price, or calories. A rename answers with
// the whole option, so the page learns the check the database cleared with
// it (D-153, Michael, October 10, 2026). A price or calories travel as the
// field's text and are read here, on both sides.
export async function setOptionText(
  rawCode: string,
  rawList: string,
  rawOption: string,
  rawField: string,
  rawValue: string,
): Promise<
  ChoiceActionResult<Record<OptionText, string> & { option: OwnerOption }>
> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawOption);
  const field = optionTextSchema.safeParse(rawField);
  if (!id.success || !field.success) return gone;
  if (typeof rawValue !== "string") return failed;
  const value = cleanOptionText(field.data, rawValue);
  const rule = optionTextProblem(field.data, value);
  if (rule) return refuse({ kind: "invalid", rule });
  let result;
  if (field.data === "price") {
    const price = parsePrice(value);
    if (!price.ok) return failed;
    result = await setOwnerOptionPrice(
      scope.client,
      scope.listId,
      id.data,
      price.cents,
    );
  } else if (field.data === "calories") {
    const calories = parseCalories(value);
    if (!calories.ok) return failed;
    result = await setOwnerOptionCalories(
      scope.client,
      scope.listId,
      id.data,
      calories.calories,
    );
  } else {
    result = await renameOwnerOption(
      scope.client,
      scope.listId,
      id.data,
      scope.userId,
      value,
    );
  }
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return {
    ok: true,
    value: { ...textsOf(result.value), option: result.value },
  };
}

// Marks the option removed: the row stays, marked by deleted_at, with its
// lists and its check. An option is a part of the list's form, so a remove
// asks nothing and counts nothing (D-119, D-221).
export async function removeChoiceOption(
  rawCode: string,
  rawList: string,
  rawOption: string,
): Promise<ChoiceActionResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawOption);
  if (!id.success) return gone;
  const result = await removeOwnerOption(scope.client, scope.listId, id.data);
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}

export async function orderChoiceOptions(
  rawCode: string,
  rawList: string,
  rawOrder: string[],
): Promise<ChoiceActionResult> {
  const scope = await listScope(rawCode, rawList);
  if (!scope.ok) return scope;
  const order = orderSchema.safeParse(rawOrder);
  if (!order.success) return refuse({ kind: "mismatch" });
  const result = await setOwnerOptionOrder(
    scope.client,
    scope.listId,
    order.data,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}
