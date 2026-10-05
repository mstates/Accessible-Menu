"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";
import { findOwnerMenu } from "@/core/supabase/menus";
import {
  addOwnerSection,
  listOwnerSections,
  setOwnerSectionDeleted,
  setOwnerSectionOrder,
  setOwnerSectionText,
  type SectionWriteError,
} from "@/core/supabase/sections";
import { mergeOrder } from "@/domain/menu";
import {
  cleanSectionText,
  SECTION_TEXTS,
  sectionTextProblem,
  type OwnerSection,
} from "@/domain/section";
import { ownerScope } from "./owner-scope";
import type { SectionProblem } from "./section-messages";

// A menu's sections save through these (D-111), the same way the menus list
// saves. Nothing here redirects: a missing session comes back as a result
// and the typed text stays on screen. Every call that reached the database
// with a live session ends with refresh(), so its own response carries the
// re-rendered list. The code, the menu, and the ids are user input: they are
// checked here, the menu is read as one of this restaurant's that is not
// deleted before any write, and row level security decides whether the rows
// are this owner's. A section never moves to another menu, and nothing here
// can publish (migrations 3 and 4).

type ServerProblem = Exclude<
  SectionProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type SectionActionResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

const idSchema = z.uuid();
const orderSchema = z.array(z.uuid()).min(1).max(500);
const fieldSchema = z.enum(SECTION_TEXTS);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const gone = refuse({ kind: "gone" });

type MenuScope =
  | { ok: true; client: SupabaseClient; menuId: string }
  | { ok: false; problem: ServerProblem };

// The owner's session and restaurant, then the menu: one of this
// restaurant's, not deleted. A deleted menu's sections are hidden from its
// owner, so a tab left open on one saves nothing more.
async function menuScope(rawCode: string, rawMenu: string): Promise<MenuScope> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const menuId = idSchema.safeParse(rawMenu);
  if (!menuId.success) return refuse({ kind: "menu-gone" });
  const menu = await findOwnerMenu(
    scope.client,
    scope.restaurantId,
    menuId.data,
  );
  if (menu === "failed") return refuse({ kind: "failed" });
  if (menu === "not-found") return refuse({ kind: "menu-gone" });
  return { ok: true, client: scope.client, menuId: menu.id };
}

// A row that is not there is "gone" for an ordinary save, and "changed" for
// an Undo, whose change no longer stands.
function fromWrite(
  error: SectionWriteError,
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

// The added section, and how many sections the menu has now that it is in.
export async function addSection(
  rawCode: string,
  rawMenu: string,
  rawName: string,
): Promise<SectionActionResult<{ section: OwnerSection; total: number }>> {
  const scope = await menuScope(rawCode, rawMenu);
  if (!scope.ok) return scope;
  const name = cleanSectionText(
    "name",
    typeof rawName === "string" ? rawName : "",
  );
  const rule = sectionTextProblem("name", name);
  if (rule) return refuse({ kind: "invalid", rule });
  const result = await addOwnerSection(scope.client, scope.menuId, name);
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: result.value };
}

// Writes a section's name, its note, or its every-dish line. With expected,
// the write is an Undo: it happens only if the text is still the one the
// change wrote, and never writes over a newer change.
export async function setSectionText(
  rawCode: string,
  rawMenu: string,
  rawId: string,
  rawField: string,
  rawValue: string,
  expected?: string,
): Promise<SectionActionResult<OwnerSection>> {
  const scope = await menuScope(rawCode, rawMenu);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  const field = fieldSchema.safeParse(rawField);
  if (!id.success || !field.success) return gone;
  // A value that is not text is not a cleared field: a blank note means
  // none, so only a string may say so.
  if (typeof rawValue !== "string") return refuse({ kind: "failed" });
  const value = cleanSectionText(field.data, rawValue);
  const rule = sectionTextProblem(field.data, value);
  if (rule) return refuse({ kind: "invalid", rule });
  const result = await setOwnerSectionText(
    scope.client,
    scope.menuId,
    id.data,
    field.data,
    value,
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

// Marks the section deleted. The row stays, so Undo can bring it back with
// everything under it (WCAG 3.3.4). A section holds no dishes yet, so this
// asks nothing; the confirmation arrives with the dishes (D-119).
export async function deleteSection(
  rawCode: string,
  rawMenu: string,
  rawId: string,
): Promise<SectionActionResult> {
  const scope = await menuScope(rawCode, rawMenu);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return gone;
  const result = await setOwnerSectionDeleted(
    scope.client,
    scope.menuId,
    id.data,
    true,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}

// Brings a deleted section back, then puts the list in the order it had
// before the delete. If the order cannot be set, because the list changed
// since, the section is back all the same and says where it landed.
export async function restoreSection(
  rawCode: string,
  rawMenu: string,
  rawId: string,
  rawOrder: string[],
): Promise<SectionActionResult<{ position: number; total: number }>> {
  const scope = await menuScope(rawCode, rawMenu);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  const order = orderSchema.safeParse(rawOrder);
  if (!id.success || !order.success) return refuse({ kind: "changed" });
  const result = await setOwnerSectionDeleted(
    scope.client,
    scope.menuId,
    id.data,
    false,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "changed"));

  let live: string[];
  try {
    const sections = await listOwnerSections(scope.client, scope.menuId);
    live = sections.map((section) => section.id);
  } catch {
    return { ok: true, value: { position: 0, total: 0 } };
  }
  const wanted = mergeOrder(order.data, live);
  const placed = await setOwnerSectionOrder(scope.client, scope.menuId, wanted);
  const final = placed.ok ? wanted : live;
  return {
    ok: true,
    value: { position: final.indexOf(id.data) + 1, total: final.length },
  };
}

export async function orderSections(
  rawCode: string,
  rawMenu: string,
  rawOrder: string[],
): Promise<SectionActionResult> {
  const scope = await menuScope(rawCode, rawMenu);
  if (!scope.ok) return scope;
  const order = orderSchema.safeParse(rawOrder);
  if (!order.success) return refuse({ kind: "mismatch" });
  const result = await setOwnerSectionOrder(
    scope.client,
    scope.menuId,
    order.data,
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error, "gone"));
  return { ok: true, value: null };
}
