"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { en } from "@/copy";
import {
  addOwnerMenu,
  listOwnerMenus,
  renameOwnerMenu,
  setOwnerMenuDeleted,
  setOwnerMenuOrder,
  type MenuWriteError,
} from "@/core/supabase/menus";
import { findOwnerRestaurantId } from "@/core/supabase/restaurants";
import { createSupabaseServerClient } from "@/core/supabase/server";
import {
  cleanMenuName,
  menuNameSchema,
  mergeOrder,
  type OwnerMenu,
} from "@/domain/menu";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";
import type { MenuProblem } from "./menu-messages";

// The menus list saves through these (D-111). A failed save must never leave
// the page, so nothing here redirects: a missing session comes back as a
// result and the typed text stays on screen. Every call that reached the
// database with a live session ends with refresh(), so its own response
// carries the re-rendered list; without a session the page's own redirect
// would run, so those paths return before it. The code and the ids are user
// input: they are checked here, and row level security decides whether the
// rows are this owner's. Nothing here can publish (migration 3).

type ServerProblem = Exclude<
  MenuProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type MenuActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

const nameSchema = menuNameSchema(en.owner.menus.errors);
const idSchema = z.uuid();
const orderSchema = z.array(z.uuid()).min(1).max(500);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const gone = refuse({ kind: "gone" });

async function ownerScope(rawCode: string) {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims.email) return refuse({ kind: "signed-out" });
  const code = typeof rawCode === "string" ? normalizeMenuCode(rawCode) : "";
  if (!isMenuCode(code)) return gone;
  const restaurant = await findOwnerRestaurantId(client, code);
  if (restaurant === "failed") return refuse({ kind: "failed" });
  if (restaurant === "not-found") return gone;
  return { ok: true as const, client, restaurantId: restaurant.id };
}

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

export async function addMenu(
  rawCode: string,
  rawName: string,
): Promise<MenuActionResult<OwnerMenu>> {
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
export async function deleteMenu(
  rawCode: string,
  rawId: string,
): Promise<MenuActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
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
