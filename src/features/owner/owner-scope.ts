import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { findOwnerMenu } from "@/core/supabase/menus";
import { findOwnerRestaurantId } from "@/core/supabase/restaurants";
import { findOwnerSection } from "@/core/supabase/sections";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { isMenuCode, normalizeMenuCode } from "@/domain/menu-url";

// The session and ownership check every editing save starts with (D-111),
// for the menus list, for a menu's sections, and for a section's dishes. A
// failed save must never leave the page, so nothing here redirects: a
// missing session comes back as a result and the typed text stays on
// screen. The code and the ids are user input: they are checked here, and
// row level security decides whether the rows are this owner's, so a wrong
// owner and an unknown code read the same.
//
// It lives in its own file, not in an actions file: every export of a
// "use server" file is an endpoint a browser can call, and these hand back
// a database client.

export type ScopeProblem =
  | { kind: "signed-out" }
  | { kind: "gone" }
  // What the page lists rows of is gone: the menu, on a menu's page, or the
  // section, on a section's page.
  | { kind: "parent-gone" }
  | { kind: "failed" };

type Refused = { ok: false; problem: ScopeProblem };

export type OwnerScope =
  { ok: true; client: SupabaseClient; restaurantId: string } | Refused;

const idSchema = z.uuid();

function refuse(kind: ScopeProblem["kind"]): Refused {
  return { ok: false, problem: { kind } };
}

export async function ownerScope(rawCode: string): Promise<OwnerScope> {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims.email) return refuse("signed-out");
  const code = typeof rawCode === "string" ? normalizeMenuCode(rawCode) : "";
  if (!isMenuCode(code)) return refuse("gone");
  const restaurant = await findOwnerRestaurantId(client, code);
  if (restaurant === "failed") return refuse("failed");
  if (restaurant === "not-found") return refuse("gone");
  return { ok: true, client, restaurantId: restaurant.id };
}

export type MenuScope =
  | { ok: true; client: SupabaseClient; restaurantId: string; menuId: string }
  | Refused;

// The owner's session and restaurant, then the menu: one of this
// restaurant's, not deleted (D-122). A deleted menu's sections are hidden
// from its owner, so a tab left open on one saves nothing more.
export async function menuScope(
  rawCode: string,
  rawMenu: string,
): Promise<MenuScope> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const menuId = idSchema.safeParse(rawMenu);
  if (!menuId.success) return refuse("parent-gone");
  const menu = await findOwnerMenu(
    scope.client,
    scope.restaurantId,
    menuId.data,
  );
  if (menu === "failed") return refuse("failed");
  if (menu === "not-found") return refuse("parent-gone");
  return { ...scope, menuId: menu.id };
}

export type SectionScope =
  | {
      ok: true;
      client: SupabaseClient;
      restaurantId: string;
      sectionId: string;
      // The menu the section is in now, which is not in the page's address:
      // a section can move (D-129).
      menuId: string;
    }
  | Refused;

// The owner's session and restaurant, then the section: one of this
// restaurant's, not deleted, in a menu that is not deleted. A tab left open
// on a section that is gone, or whose menu is, saves nothing more.
export async function sectionScope(
  rawCode: string,
  rawSection: string,
): Promise<SectionScope> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const sectionId = idSchema.safeParse(rawSection);
  if (!sectionId.success) return refuse("parent-gone");
  const section = await findOwnerSection(
    scope.client,
    scope.restaurantId,
    sectionId.data,
  );
  if (section === "failed") return refuse("failed");
  if (section === "not-found") return refuse("parent-gone");
  const menu = await findOwnerMenu(
    scope.client,
    scope.restaurantId,
    section.menuId,
  );
  if (menu === "failed") return refuse("failed");
  if (menu === "not-found") return refuse("parent-gone");
  return { ...scope, sectionId: section.id, menuId: menu.id };
}
