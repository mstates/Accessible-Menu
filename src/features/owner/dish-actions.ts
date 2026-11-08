"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  addOwnerDish,
  deleteOwnerDish,
  renameOwnerDish,
  setOwnerDishOrder,
  type DishWriteError,
} from "@/core/supabase/dishes";
import {
  moveOwnerSection,
  setOwnerSectionText,
  type SectionWriteError,
} from "@/core/supabase/sections";
import { cleanDishName, dishNameProblem, type OwnerDish } from "@/domain/dish";
import {
  cleanSectionText,
  sectionTextProblem,
  type OwnerSection,
} from "@/domain/section";
import type { ListProblem } from "./editing/list-words";
import { SECTION_OWN_TEXTS } from "./lists";
import { sectionScope } from "./owner-scope";
import type { MoveProblem } from "./section-move";

// A section's own page saves through these (D-111, D-128): its dishes, the
// same way the menus and the sections lists save, the section's note
// (D-135), and the section's move to another menu (D-129); its choice
// lists save through choices/choice-actions.ts (D-166). Nothing here redirects: a missing session comes
// back as a result and the typed text stays on screen. Every call that
// reached the database with a live session ends with refresh(), so its own
// response carries the re-rendered page. The code, the section, and the ids
// are user input: they are checked here and in sectionScope, the section is
// read as one of this restaurant's that is not deleted, in a menu that is
// not deleted, before any write, and row level security decides whether the
// rows are this owner's. In task 3a a dish has only its name, and nothing
// here can publish (migration 3).

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type DishActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

type ServerMoveProblem = Exclude<
  MoveProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type MoveActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerMoveProblem };

const idSchema = z.uuid();
const ownTextSchema = z.enum(SECTION_OWN_TEXTS);
const orderSchema = z.array(z.uuid()).min(1).max(500);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const gone = refuse({ kind: "gone" });

// The name, cleaned, or the rule it breaks.
function readName(raw: unknown): { name: string } | ServerProblem {
  const name = cleanDishName(typeof raw === "string" ? raw : "");
  const rule = dishNameProblem(name);
  return rule ? { kind: "invalid", rule } : { name };
}

function fromWrite(error: DishWriteError): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "not-found":
      return { kind: "gone" };
    case "mismatch":
      return { kind: "mismatch" };
    default:
      return { kind: "failed" };
  }
}

// The added dish, and how many dishes the section has now that it is in.
export async function addDish(
  rawCode: string,
  rawSection: string,
  rawName: string,
): Promise<DishActionResult<{ row: OwnerDish; total: number }>> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const name = readName(rawName);
  if ("kind" in name) return refuse(name);
  const result = await addOwnerDish(scope.client, scope.sectionId, name.name);
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return {
    ok: true,
    value: { row: result.value.dish, total: result.value.total },
  };
}

// Writes the section's note, from the top of its own page (D-120, D-135).
// The section is read through sectionScope like every save here, so the
// write follows it to whatever menu it is in now, and a section that is
// gone says so in this page's words.
export async function setOwnSectionText(
  rawCode: string,
  rawSection: string,
  rawField: string,
  rawValue: string,
): Promise<DishActionResult<OwnerSection>> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const field = ownTextSchema.safeParse(rawField);
  if (!field.success) return gone;
  // A value that is not text is not a cleared field: a blank note means
  // none, so only a string may say so.
  if (typeof rawValue !== "string") return refuse({ kind: "failed" });
  const value = cleanSectionText(field.data, rawValue);
  const rule = sectionTextProblem(field.data, value);
  if (rule) return refuse({ kind: "invalid", rule });
  const result = await setOwnerSectionText(
    scope.client,
    scope.menuId,
    scope.sectionId,
    field.data,
    value,
  );
  refresh();
  if (!result.ok) {
    // The note has no name to collide with: a section that is not there is
    // the page's own parent gone.
    if (result.error.kind !== "not-found") return refuse({ kind: "failed" });
    return refuse({ kind: "parent-gone" });
  }
  return { ok: true, value: result.value };
}

export async function renameDish(
  rawCode: string,
  rawSection: string,
  rawId: string,
  rawName: string,
): Promise<DishActionResult<OwnerDish>> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const name = readName(rawName);
  if ("kind" in name) return refuse(name);
  const result = await renameOwnerDish(
    scope.client,
    scope.sectionId,
    id.data,
    name.name,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: result.value };
}

// Marks the dish deleted: the row stays, marked by deleted_at. A dish holds
// nothing a delete counts, so this counts nothing; the page asks first all
// the same (D-221).
export async function deleteDish(
  rawCode: string,
  rawSection: string,
  rawId: string,
): Promise<DishActionResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const result = await deleteOwnerDish(scope.client, scope.sectionId, id.data);
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: null };
}

export async function orderDishes(
  rawCode: string,
  rawSection: string,
  rawOrder: string[],
): Promise<DishActionResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const order = orderSchema.safeParse(rawOrder);
  if (!order.success) return refuse({ kind: "mismatch" });
  const result = await setOwnerDishOrder(
    scope.client,
    scope.sectionId,
    order.data,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: null };
}

function fromMove(error: SectionWriteError): ServerMoveProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "menu-gone":
      return { kind: "menu-gone" };
    case "same-menu":
      return { kind: "changed" };
    case "not-found":
      return { kind: "gone" };
    default:
      return { kind: "failed" };
  }
}

// Moves the section to another menu of its restaurant, last, with its
// dishes (D-129). menu_id is not a column owners write, so the move goes
// through move_section(), which checks the caller and the restaurant for
// itself and refuses a name that menu already has (migration 5).
export async function moveSection(
  rawCode: string,
  rawSection: string,
  rawMenu: string,
): Promise<MoveActionResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const menu = idSchema.safeParse(rawMenu);
  if (!menu.success) return { ok: false, problem: { kind: "menu-gone" } };
  const result = await moveOwnerSection(
    scope.client,
    scope.sectionId,
    menu.data,
  );
  refresh();
  if (!result.ok) return { ok: false, problem: fromMove(result.error) };
  return { ok: true, value: null };
}
