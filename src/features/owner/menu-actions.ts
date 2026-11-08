"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { expireRestaurant } from "@/core/cache";
import {
  addOwnerMenu,
  deleteOwnerMenu,
  listPublishBlockers,
  publishOwnerMenu,
  renameOwnerMenu,
  setOwnerMenuOrder,
  unpublishOwnerMenu,
  type MenuWriteError,
} from "@/core/supabase/menus";
import type { Held, OwnerMenu, PublishBlocker } from "@/domain/menu";
import { normalizeMenuCode } from "@/domain/menu-url";
import type { ListProblem } from "./editing/list-words";
import { menuList } from "./lists";
import { ownerScope } from "./owner-scope";
import type { PublishFailure } from "./publishing-words";

// The menus list saves through these (D-111). A failed save must never leave
// the page, so nothing here redirects: a missing session comes back as a
// result and the typed text stays on screen. Every call that reached the
// database with a live session ends with refresh(), so its own response
// carries the re-rendered list; without a session the page's own redirect
// would run, so those paths return before it. The code and the ids are user
// input: they are checked here and in ownerScope, and row level security
// decides whether the rows are this owner's. Publish and Unpublish go
// through the database's two functions, which check the caller themselves
// (migration 12). A delete, a move, Publish, and Unpublish each change
// what diners read (D-170, Q-79), so each clears the restaurant's
// pages at the edge once its write has landed (core/cache); a rename and
// an add reach diners through Publish and clear nothing.

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type MenuActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

const idSchema = z.uuid();
const orderSchema = z.array(z.uuid()).min(1).max(500);
const toldSchema = z.object({
  sections: z.number().int().min(0),
  dishes: z.number().int().min(0),
  options: z.number().int().min(0),
});

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const gone = refuse({ kind: "gone" });

// The name, cleaned, or the rule it breaks.
function readName(raw: unknown): { name: string } | ServerProblem {
  const name = menuList.clean("name", typeof raw === "string" ? raw : "");
  const rule = menuList.rule("name", name);
  return rule ? { kind: "invalid", rule } : { name };
}

function fromWrite(error: MenuWriteError): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "not-found":
      return { kind: "gone" };
    case "mismatch":
      return { kind: "mismatch" };
    case "grew":
      return { kind: "grew" };
    default:
      return { kind: "failed" };
  }
}

// The added menu, and how many menus there are now that it is in.
export async function addMenu(
  rawCode: string,
  rawName: string,
): Promise<MenuActionResult<{ row: OwnerMenu; total: number }>> {
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
  if (!result.ok) return refuse(fromWrite(result.error));
  return {
    ok: true,
    value: { row: result.value.menu, total: result.value.total },
  };
}

export async function renameMenu(
  rawCode: string,
  rawId: string,
  rawName: string,
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
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: result.value };
}

// Marks the menu deleted: the row stays, marked by deleted_at, with
// everything under it.
//
// Every delete asks first (D-221), and names what goes with the menu when
// it holds any (D-119); that rule is held by the database, not only on the
// page. Every delete says what the owner was told goes with the menu: the
// confirmation's numbers, zeros for a menu that holds nothing. The database
// counts the menu's sections and their dishes in the statement that marks
// it, and refuses a delete that would take more of either (migration 5).
// So a page that is out of date, after another tab, never deletes anything
// nobody was asked about. The refresh brings the page the count it missed,
// so the next press asks with it.
export async function deleteMenu(
  rawCode: string,
  rawId: string,
  rawTold: Held,
): Promise<MenuActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const told = toldSchema.safeParse(rawTold);
  if (!told.success) {
    refresh();
    return refuse({ kind: "grew" });
  }
  const result = await deleteOwnerMenu(
    scope.client,
    scope.restaurantId,
    id.data,
    told.data,
  );
  if (result.ok) expireRestaurant(normalizeMenuCode(rawCode));
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: null };
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
  if (result.ok) expireRestaurant(normalizeMenuCode(rawCode));
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: null };
}

type PublishActionProblem = Exclude<
  PublishFailure,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type PublishActionResult =
  { ok: true; value: null } | { ok: false; problem: PublishActionProblem };

// Publishes the menu (D-82, migration 12). The database refuses while a
// size has no name or no price and writes nothing then; the blockers are
// read back so the sentence can name the dish. A menu that is not here, or
// not this owner's, is gone.
export async function publishMenu(
  rawCode: string,
  rawId: string,
): Promise<PublishActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return { ok: false, problem: { kind: "gone" } };
  const result = await publishOwnerMenu(scope.client, id.data);
  if (result.ok) expireRestaurant(normalizeMenuCode(rawCode));
  if (!result.ok && result.error.kind === "blocked") {
    let blockers: PublishBlocker[] = [];
    try {
      blockers = await listPublishBlockers(scope.client, id.data);
    } catch {
      blockers = [];
    }
    refresh();
    return { ok: false, problem: { kind: "blocked", blockers } };
  }
  refresh();
  if (!result.ok) {
    return {
      ok: false,
      problem: { kind: result.error.kind === "not-found" ? "gone" : "failed" },
    };
  }
  return { ok: true, value: null };
}

// Unpublishes the menu: the flag, the time, and the snapshot go together,
// and a menu already unpublished is left as it is.
export async function unpublishMenu(
  rawCode: string,
  rawId: string,
): Promise<PublishActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return { ok: false, problem: { kind: "gone" } };
  const result = await unpublishOwnerMenu(scope.client, id.data);
  if (result.ok) expireRestaurant(normalizeMenuCode(rawCode));
  refresh();
  if (!result.ok) {
    return {
      ok: false,
      problem: { kind: result.error.kind === "not-found" ? "gone" : "failed" },
    };
  }
  return { ok: true, value: null };
}
