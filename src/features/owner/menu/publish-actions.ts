"use server";

import { z } from "zod";
import { expireRestaurant } from "@/core/cache";
import {
  listPublishBlockers,
  publishOwnerMenu,
  readOwnerMenuDraft,
  unpublishOwnerMenu,
} from "@/core/supabase/menus";
import type { PublishBlocker } from "@/domain/menu";
import { normalizeMenuCode } from "@/domain/menu-url";
import { ownerScope } from "../owner-scope";
import type { PublishFailure } from "../publishing-words";
import { REVIEW_TOKEN_SHAPE, reviewToken } from "./review-token";

// Publish and Unpublish, from the menu's Publishing page (D-224, D-231),
// bound to the restaurant and the menu in the route. Both go through the
// database's two functions, which check the caller themselves and write
// the flag, the time, and the snapshot together (migration 12). The code,
// the id, and the token are user input: they are checked here and in
// ownerScope, and row level security decides whether the rows are this
// owner's.
//
// What the owner reviewed is what gets published: Publish carries the
// token the page made from the draft it reviewed, and the draft is read
// again here and refused when it is no longer that one, with nothing
// written. The check and publish_menu()'s own read are two statements, so
// a save from another tab that lands between them, one round trip to the
// database, is still published unread; closing that needs the check inside
// the function, which is a migration and is not built. Unpublish sends no
// draft, so it carries nothing.
//
// Neither refreshes the page itself: when a press lands the browser loads
// the page again, so the new document carries the result (core/notice.ts).
// Each still clears the restaurant's pages at the edge through
// expireRestaurant once its write has landed, since both change what diners
// read (D-170), and that clearing brings a fresh render of the page back
// with the action's answer, which the page holds off until its new
// document arrives. A press that did not land changes nothing and brings
// nothing back.

type PublishActionProblem = Exclude<
  PublishFailure,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type PublishActionResult =
  { ok: true; value: null } | { ok: false; problem: PublishActionProblem };

const idSchema = z.uuid();
const tokenSchema = z.string().regex(REVIEW_TOKEN_SHAPE);

function refuse(kind: "gone" | "failed" | "moved"): PublishActionResult {
  return { ok: false, problem: { kind } };
}

// Publishes the menu (D-82, migration 12), if the draft is still the one
// the page reviewed. A menu with no document, deleted or no longer this
// owner's, is gone, and is never told to reload. The database refuses while
// a size has no name or no price, or the menu has no dishes, and writes
// nothing then; the blockers are read back so the sentence can name the
// dish.
export async function publishMenu(
  rawCode: string,
  rawId: string,
  rawReviewed: string,
): Promise<PublishActionResult> {
  const scope = await ownerScope(rawCode);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return refuse("gone");
  const reviewed = tokenSchema.safeParse(rawReviewed);
  if (!reviewed.success) return refuse("failed");
  const draft = await readOwnerMenuDraft(scope.client, id.data);
  if (draft === "not-found") return refuse("gone");
  if (draft === "failed") return refuse("failed");
  if (reviewToken(draft.raw) !== reviewed.data) return refuse("moved");

  const result = await publishOwnerMenu(scope.client, id.data);
  if (result.ok) {
    expireRestaurant(normalizeMenuCode(rawCode));
    return { ok: true, value: null };
  }
  if (result.error.kind === "blocked") {
    let blockers: PublishBlocker[] = [];
    try {
      blockers = await listPublishBlockers(scope.client, id.data);
    } catch {
      blockers = [];
    }
    return { ok: false, problem: { kind: "blocked", blockers } };
  }
  return refuse(result.error.kind === "not-found" ? "gone" : "failed");
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
  if (!id.success) return refuse("gone");
  const result = await unpublishOwnerMenu(scope.client, id.data);
  if (result.ok) {
    expireRestaurant(normalizeMenuCode(rawCode));
    return { ok: true, value: null };
  }
  return refuse(result.error.kind === "not-found" ? "gone" : "failed");
}
