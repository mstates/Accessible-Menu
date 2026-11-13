"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { moveOwnerDish, type DishWriteError } from "@/core/supabase/dishes";
import { dishScope } from "../owner-scope";
import type { DishMoveProblem } from "./dish-words";

// A dish's move to another section, the one press on its General page that
// is not the page's Save (D-129, D-237). The page's own fields save through
// form-actions.ts. Nothing here redirects: a missing session comes back as
// a result. A call that reached the database with a live session ends with
// refresh(), so its own response carries the re-rendered page, with the
// dish under its new section. The code, the dish, and the section are user
// input: they are checked here and in dishScope, the dish is read as one of
// this restaurant's that is not deleted, in a live section of a live menu,
// before the move, and the database checks the caller and the restaurant
// for itself. Nothing here can publish (migration 3).

type ServerMoveProblem = Exclude<
  DishMoveProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type DishMoveResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerMoveProblem };

const idSchema = z.uuid();

function fromMove(error: DishWriteError): ServerMoveProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "section-gone":
      return { kind: "section-gone" };
    case "same-section":
      return { kind: "changed" };
    case "not-found":
      return { kind: "gone" };
    default:
      return { kind: "failed" };
  }
}

// Moves the dish to another section of its restaurant, last, with its
// sizes (D-129). section_id is not a column owners write, so the move goes
// through move_item(), which checks the caller and the restaurant for
// itself and refuses a name that section already has (migration 6).
export async function moveDish(
  rawCode: string,
  rawDish: string,
  rawSection: string,
): Promise<DishMoveResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const section = idSchema.safeParse(rawSection);
  if (!section.success) return { ok: false, problem: { kind: "section-gone" } };
  const result = await moveOwnerDish(scope.client, scope.dishId, section.data);
  refresh();
  if (!result.ok) return { ok: false, problem: fromMove(result.error) };
  return { ok: true, value: null };
}
