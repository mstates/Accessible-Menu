"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  addOwnerDish,
  listOwnerDishes,
  renameOwnerDish,
  setOwnerDishDeleted,
  setOwnerDishOrder,
  type DishWriteError,
} from "@/core/supabase/dishes";
import {
  listOwnerSections,
  moveOwnerSection,
  setOwnerSectionOrder,
  type SectionWriteError,
} from "@/core/supabase/sections";
import { cleanDishName, dishNameProblem, type OwnerDish } from "@/domain/dish";
import { mergeOrder } from "@/domain/menu";
import type { ListProblem } from "./editing/list-words";
import { sectionScope } from "./owner-scope";
import type { MoveProblem } from "./section-move";

// A section's own page saves through these (D-111, D-128): its dishes, the
// same way the menus and the sections lists save, and the section's move to
// another menu (D-129). Nothing here redirects: a missing session comes
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

export type MoveActionResult<Value> =
  { ok: true; value: Value } | { ok: false; problem: ServerMoveProblem };

const idSchema = z.uuid();
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

// A row that is not there is "gone" for an ordinary save, and "changed" for
// an Undo, whose change no longer stands.
function fromWrite(
  error: DishWriteError,
  missing: "gone" | "changed",
): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "not-found":
      return { kind: missing };
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
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return {
    ok: true,
    value: { row: result.value.dish, total: result.value.total },
  };
}

// With expected, the rename is an Undo: it happens only if the name is still
// the one the change wrote, and never writes over a newer change.
export async function renameDish(
  rawCode: string,
  rawSection: string,
  rawId: string,
  rawName: string,
  expected?: string,
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
    typeof expected === "string" ? expected : undefined,
  );
  refresh();
  if (!result.ok) {
    return refuse(
      fromWrite(result.error, expected === undefined ? "gone" : "changed"),
    );
  }
  return { ok: true, value: result.value };
}

// Marks the dish deleted. The row stays, so Undo can bring it back (WCAG
// 3.3.4). A dish holds nothing, so this asks nothing and counts nothing
// (D-119).
export async function deleteDish(
  rawCode: string,
  rawSection: string,
  rawId: string,
): Promise<DishActionResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const result = await setOwnerDishDeleted(
    scope.client,
    scope.sectionId,
    id.data,
    true,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}

// Brings a deleted dish back, then puts the list in the order it had before
// the delete. If the order cannot be set, because the list changed since,
// the dish is back all the same and says where it landed.
export async function restoreDish(
  rawCode: string,
  rawSection: string,
  rawId: string,
  rawOrder: string[],
): Promise<DishActionResult<{ position: number; total: number }>> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  const order = orderSchema.safeParse(rawOrder);
  if (!id.success || !order.success) return refuse({ kind: "changed" });
  const result = await setOwnerDishDeleted(
    scope.client,
    scope.sectionId,
    id.data,
    false,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "changed"));

  let live: string[];
  try {
    const dishes = await listOwnerDishes(scope.client, scope.sectionId);
    live = dishes.map((dish) => dish.id);
  } catch {
    return { ok: true, value: { position: 0, total: 0 } };
  }
  const wanted = mergeOrder(order.data, live);
  const placed = await setOwnerDishOrder(scope.client, scope.sectionId, wanted);
  const final = placed.ok ? wanted : live;
  return {
    ok: true,
    value: { position: final.indexOf(id.data) + 1, total: final.length },
  };
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
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
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
// itself and refuses a name that menu already has (migration 5). It answers
// with the order the section's old menu had, which is what Undo puts back.
export async function moveSection(
  rawCode: string,
  rawSection: string,
  rawMenu: string,
): Promise<MoveActionResult<{ order: string[] }>> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const menu = idSchema.safeParse(rawMenu);
  if (!menu.success) return { ok: false, problem: { kind: "menu-gone" } };
  let order: string[];
  try {
    const sections = await listOwnerSections(scope.client, scope.menuId);
    order = sections.map((section) => section.id);
  } catch {
    return { ok: false, problem: { kind: "failed" } };
  }
  const result = await moveOwnerSection(
    scope.client,
    scope.sectionId,
    menu.data,
  );
  refresh();
  if (!result.ok) return { ok: false, problem: fromMove(result.error) };
  return { ok: true, value: { order } };
}

// Undo of a move: the section goes back to the menu it came from, and that
// menu's list goes back to the order it had. If the order cannot be set,
// because the list changed since, the section is back all the same and
// says where it landed.
export async function moveSectionBack(
  rawCode: string,
  rawSection: string,
  rawMenu: string,
  rawOrder: string[],
): Promise<MoveActionResult<{ position: number; total: number }>> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const menu = idSchema.safeParse(rawMenu);
  const order = orderSchema.safeParse(rawOrder);
  if (!menu.success || !order.success) {
    return { ok: false, problem: { kind: "changed" } };
  }
  const result = await moveOwnerSection(
    scope.client,
    scope.sectionId,
    menu.data,
  );
  refresh();
  if (!result.ok) return { ok: false, problem: fromMove(result.error) };

  let live: string[];
  try {
    const sections = await listOwnerSections(scope.client, menu.data);
    live = sections.map((section) => section.id);
  } catch {
    return { ok: true, value: { position: 0, total: 0 } };
  }
  const wanted = mergeOrder(order.data, live);
  const placed = await setOwnerSectionOrder(scope.client, menu.data, wanted);
  const final = placed.ok ? wanted : live;
  return {
    ok: true,
    value: {
      position: final.indexOf(scope.sectionId) + 1,
      total: final.length,
    },
  };
}
