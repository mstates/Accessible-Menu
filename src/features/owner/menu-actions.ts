"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { en } from "@/copy";
import {
  addOwnerMenu,
  countOwnerMenuSections,
  listOwnerMenus,
  renameOwnerMenu,
  setOwnerMenuDeleted,
  setOwnerMenuOrder,
  type MenuWriteError,
} from "@/core/supabase/menus";
import {
  cleanMenuName,
  deleteTakesMore,
  menuNameSchema,
  mergeOrder,
  type OwnerMenu,
} from "@/domain/menu";
import type { MenuProblem } from "./menu-messages";
import { ownerScope } from "./owner-scope";

// The menus list saves through these (D-111). A failed save must never leave
// the page, so nothing here redirects: a missing session comes back as a
// result and the typed text stays on screen. Every call that reached the
// database with a live session ends with refresh(), so its own response
// carries the re-rendered list; without a session the page's own redirect
// would run, so those paths return before it. The code and the ids are user
// input: they are checked here and in ownerScope, and row level security
// decides whether the rows are this owner's. Nothing here can publish
// (migration 3).

type ServerProblem = Exclude<
  MenuProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type MenuActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

const nameSchema = menuNameSchema(en.owner.menus.errors);
const idSchema = z.uuid();
const orderSchema = z.array(z.uuid()).min(1).max(500);
const toldSchema = z.number().int().min(0);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const gone = refuse({ kind: "gone" });

function readName(raw: unknown): { name: string } | ServerProblem {
  const parsed = nameSchema.safeParse(raw);
  if (parsed.success) return { name: parsed.data };
  const empty = typeof raw !== "string" || cleanMenuName(raw) === "";
  return { kind: "invalid", rule: empty ? "nameRequired" : "nameLength" };
}

// A row that is not there is "gone" for an ordinary save, and "changed" for
// an Undo, whose change no longer stands.
function fromWrite(
  error: MenuWriteError,
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

// The added menu, and how many menus there are now that it is in.
export async function addMenu(
  rawCode: string,
  rawName: string,
): Promise<MenuActionResult<{ menu: OwnerMenu; total: number }>> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const name = readName(rawName);
  if ("kind" in name) return refuse(name);
  const result = await addOwnerMenu(
    scope.client,
    scope.restaurantId,
    name.name,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: result.value };
}

// With expected, the rename is an Undo: it happens only if the name is still
// the one the change wrote, and never writes over a newer change.
export async function renameMenu(
  rawCode: string,
  rawId: string,
  rawName: string,
  expected?: string,
): Promise<MenuActionResult<OwnerMenu>> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const name = readName(rawName);
  if ("kind" in name) return refuse(name);
  const result = await renameOwnerMenu(
    scope.client,
    scope.restaurantId,
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

// Marks the menu deleted. The row stays, so Undo can bring it back with
// everything under it (WCAG 3.3.4).
//
// A delete that takes content with it asks first (D-119), and the rule is
// held here, not only on the page. Every delete says how many sections the
// owner was told about: none for a delete at once and for an Undo of an
// add, the confirmation's number otherwise. The sections are counted now,
// and a delete that would take more than that is refused. So a page that is
// out of date, after another tab or a restored one, never deletes sections
// nobody was asked about, and an Undo never deletes content at all. The
// refresh brings the page the count it missed, so the next press asks.
export async function deleteMenu(
  rawCode: string,
  rawId: string,
  rawTold: number,
): Promise<MenuActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const told = toldSchema.safeParse(rawTold);
  const live = await countOwnerMenuSections(scope.client, id.data);
  if (live === "failed") {
    refresh();
    return refuse({ kind: "failed" });
  }
  if (!told.success || deleteTakesMore(live, told.data)) {
    refresh();
    return refuse({ kind: "grew" });
  }
  const result = await setOwnerMenuDeleted(
    scope.client,
    scope.restaurantId,
    id.data,
    true,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}

// Brings a deleted menu back, then puts the list in the order it had before
// the delete. If the order cannot be set, because the list changed since,
// the menu is back all the same and says where it landed.
export async function restoreMenu(
  rawCode: string,
  rawId: string,
  rawOrder: string[],
): Promise<MenuActionResult<{ position: number; total: number }>> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  const order = orderSchema.safeParse(rawOrder);
  if (!id.success || !order.success) return refuse({ kind: "changed" });
  const result = await setOwnerMenuDeleted(
    scope.client,
    scope.restaurantId,
    id.data,
    false,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "changed"));

  let live: string[];
  try {
    const menus = await listOwnerMenus(scope.client, scope.restaurantId);
    live = menus.map((menu) => menu.id);
  } catch {
    return { ok: true, value: { position: 0, total: 0 } };
  }
  const wanted = mergeOrder(order.data, live);
  const placed = await setOwnerMenuOrder(
    scope.client,
    scope.restaurantId,
    wanted,
  );
  const final = placed.ok ? wanted : live;
  return {
    ok: true,
    value: { position: final.indexOf(id.data) + 1, total: final.length },
  };
}

export async function orderMenus(
  rawCode: string,
  rawOrder: string[],
): Promise<MenuActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const order = orderSchema.safeParse(rawOrder);
  if (!order.success) return refuse({ kind: "mismatch" });
  const result = await setOwnerMenuOrder(
    scope.client,
    scope.restaurantId,
    order.data,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}
