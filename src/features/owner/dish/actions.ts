"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  listOwnerDishes,
  moveOwnerDish,
  setOwnerDishOrder,
  setOwnerDishPrice,
  setOwnerDishPriceKind,
  setOwnerDishText,
  writeOwnerDishAvailability,
  type AvailabilityPatch,
  type DishWriteError,
} from "@/core/supabase/dishes";
import { AVAILABILITY } from "@/domain/availability";
import {
  addOwnerSize,
  setOwnerSizeDeleted,
  setOwnerSizeName,
  setOwnerSizePrice,
  type SizeWriteError,
} from "@/core/supabase/sizes";
import {
  cleanDishText,
  cleanSizeText,
  DISH_TEXTS,
  dishTextProblem,
  PRICE_KINDS,
  SIZE_TEXTS,
  sizeTextProblem,
  type DishText,
  type OwnerDishDetail,
  type OwnerSize,
  type PriceKind,
  type SizeText,
} from "@/domain/dish";
import { mergeOrder } from "@/domain/menu";
import { parsePrice } from "@/domain/money";
import type { ListProblem } from "../editing/list-words";
import { dishScope } from "../owner-scope";
import type { DishMoveProblem } from "./dish-words";

// A dish's own page saves through these (D-111, D-128): its description,
// its price choice, its one price, and its note (D-139), its sizes, its
// availability (D-160), and its move to another section (D-129). Nothing here redirects: a missing
// session comes back as a result and the typed text stays on screen. Every
// call that reached the database with a live session ends with refresh(),
// so its own response carries the re-rendered page. The code, the dish, and
// the ids are user input: they are checked here and in dishScope, the dish
// is read as one of this restaurant's that is not deleted, in a live
// section of a live menu, before any write, and row level security decides
// whether the rows are this owner's. Nothing here can publish (migration 3).

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type DishPageResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerProblem };

type ServerMoveProblem = Exclude<
  DishMoveProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type DishMoveResult<Value> =
  { ok: true; value: Value } | { ok: false; problem: ServerMoveProblem };

const idSchema = z.uuid();
const availabilitySchema = z.enum(AVAILABILITY);
// A row as the page read it, for an Undo that writes it back exactly.
const availabilityRowSchema = z.object({
  available: z.boolean(),
  soldOutAt: z.string().nullable(),
});
const dishTextSchema = z.enum(DISH_TEXTS);
const sizeTextSchema = z.enum(SIZE_TEXTS);
const kindSchema = z.enum(PRICE_KINDS);
const orderSchema = z.array(z.uuid()).min(1).max(500);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const failed = refuse({ kind: "failed" });

// The dish's texts as the page's fields show them.
function textsOf(dish: OwnerDishDetail): Record<DishText, string> {
  return { description: dish.description, price: dish.price, note: dish.note };
}

function sizeTexts(size: OwnerSize): Record<SizeText, string> {
  return { name: size.name, price: size.price };
}

// A dish that is not there is the page's own parent gone for an ordinary
// save, and "changed" for an Undo, whose change no longer stands.
function fromDishWrite(
  error: DishWriteError,
  missing: "parent-gone" | "changed",
): ServerProblem {
  return error.kind === "not-found" ? { kind: missing } : { kind: "failed" };
}

function fromSizeWrite(
  error: SizeWriteError,
  missing: "gone" | "parent-gone" | "changed",
): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "not-found":
      return { kind: missing };
    case "grew":
      return { kind: "grew" };
    default:
      return { kind: "failed" };
  }
}

// A typed price, or the field's blank, as cents or null, with the rule it
// breaks. The page checks the same rule before it sends.
function readPrice(
  raw: string,
): { cents: number | null } | { rule: "priceFormat" | "priceRange" } {
  const price = parsePrice(raw);
  return price.ok ? { cents: price.cents } : { rule: price.rule };
}

// Writes the dish's description, note, or one price (D-139). With expected,
// the write is an Undo: it happens only if the text is still the one the
// change wrote, and never writes over a newer change. The price travels as
// the field's text and is read into cents here, on both sides.
export async function setDishText(
  rawCode: string,
  rawDish: string,
  rawField: string,
  rawValue: string,
  expected?: string,
): Promise<DishPageResult<Record<DishText, string>>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const field = dishTextSchema.safeParse(rawField);
  if (!field.success) return failed;
  if (typeof rawValue !== "string") return failed;
  const value = cleanDishText(field.data, rawValue);
  const rule = dishTextProblem(field.data, value);
  if (rule) return refuse({ kind: "invalid", rule });
  const was = typeof expected === "string" ? expected : undefined;
  let result;
  if (field.data === "price") {
    const price = readPrice(value);
    const wasPrice = was === undefined ? undefined : readPrice(was);
    if ("rule" in price || (wasPrice && "rule" in wasPrice)) return failed;
    result = await setOwnerDishPrice(
      scope.client,
      scope.sectionId,
      scope.dishId,
      price.cents,
      wasPrice?.cents,
    );
  } else {
    result = await setOwnerDishText(
      scope.client,
      scope.sectionId,
      scope.dishId,
      field.data,
      value === "" ? null : value,
      was === undefined ? undefined : was === "" ? null : was,
    );
  }
  refresh();
  if (!result.ok) {
    return refuse(
      fromDishWrite(
        result.error,
        was === undefined ? "parent-gone" : "changed",
      ),
    );
  }
  return { ok: true, value: textsOf(result.value) };
}

// How the dish is priced (D-139). The other choices' values stay stored.
export async function setDishPriceKind(
  rawCode: string,
  rawDish: string,
  rawKind: string,
  expected?: string,
): Promise<DishPageResult<{ priceKind: PriceKind }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const kind = kindSchema.safeParse(rawKind);
  if (!kind.success) return failed;
  let was: PriceKind | undefined;
  if (expected !== undefined) {
    const parsed = kindSchema.safeParse(expected);
    if (!parsed.success) return failed;
    was = parsed.data;
  }
  const result = await setOwnerDishPriceKind(
    scope.client,
    scope.sectionId,
    scope.dishId,
    kind.data,
    was,
  );
  refresh();
  if (!result.ok) {
    return refuse(
      fromDishWrite(
        result.error,
        was === undefined ? "parent-gone" : "changed",
      ),
    );
  }
  return { ok: true, value: { priceKind: result.value.priceKind } };
}

// How the dish stands (D-160): available, sold out today, or off the menu
// for now. A sold-out mark is the server's own clock, never a browser's.
// With exact and expected, the write is an Undo: it puts the row back as
// it was, and only while the dish still holds the row the change left, so
// it never writes over a newer choice and never makes a new mark.
export async function setDishAvailability(
  rawCode: string,
  rawDish: string,
  rawChoice: unknown,
  rawExact?: unknown,
  rawExpected?: unknown,
): Promise<DishPageResult<{ available: boolean; soldOutAt: string | null }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const choice = availabilitySchema.safeParse(rawChoice);
  if (!choice.success) return failed;
  let patch: AvailabilityPatch;
  let expected: AvailabilityPatch | undefined;
  if (rawExact !== undefined) {
    const exact = availabilityRowSchema.safeParse(rawExact);
    const was = availabilityRowSchema.safeParse(rawExpected);
    if (!exact.success || !was.success) return failed;
    patch = {
      available: exact.data.available,
      sold_out_at: exact.data.soldOutAt,
    };
    expected = {
      available: was.data.available,
      sold_out_at: was.data.soldOutAt,
    };
  } else if (choice.data === "off") {
    patch = { available: false, sold_out_at: null };
  } else if (choice.data === "sold-out") {
    patch = { available: true, sold_out_at: new Date().toISOString() };
  } else {
    patch = { available: true, sold_out_at: null };
  }
  const result = await writeOwnerDishAvailability(
    scope.client,
    scope.sectionId,
    scope.dishId,
    scope.userId,
    patch,
    expected,
  );
  refresh();
  if (!result.ok) {
    return refuse(
      fromDishWrite(
        result.error,
        expected === undefined ? "parent-gone" : "changed",
      ),
    );
  }
  return {
    ok: true,
    value: {
      available: result.value.available,
      soldOutAt: result.value.soldOutAt,
    },
  };
}

// A new size, blank, and how many sizes the dish has now that it is in.
export async function addSize(
  rawCode: string,
  rawDish: string,
): Promise<DishPageResult<{ size: OwnerSize; total: number }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const result = await addOwnerSize(scope.client, scope.dishId);
  refresh();
  if (!result.ok) return refuse(fromSizeWrite(result.error, "parent-gone"));
  return { ok: true, value: result.value };
}

// Writes a size's name or price. With expected, the write is an Undo.
export async function setSizeText(
  rawCode: string,
  rawDish: string,
  rawSize: string,
  rawField: string,
  rawValue: string,
  expected?: string,
): Promise<DishPageResult<Record<SizeText, string>>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawSize);
  const field = sizeTextSchema.safeParse(rawField);
  if (!id.success || !field.success) return refuse({ kind: "gone" });
  if (typeof rawValue !== "string") return failed;
  const value = cleanSizeText(field.data, rawValue);
  const rule = sizeTextProblem(field.data, value);
  if (rule) return refuse({ kind: "invalid", rule });
  const was = typeof expected === "string" ? expected : undefined;
  let result;
  if (field.data === "price") {
    const price = readPrice(value);
    const wasPrice = was === undefined ? undefined : readPrice(was);
    if ("rule" in price || (wasPrice && "rule" in wasPrice)) return failed;
    result = await setOwnerSizePrice(
      scope.client,
      scope.dishId,
      id.data,
      price.cents,
      wasPrice?.cents,
    );
  } else {
    result = await setOwnerSizeName(
      scope.client,
      scope.dishId,
      id.data,
      value === "" ? null : value,
      was === undefined ? undefined : was === "" ? null : was,
    );
  }
  refresh();
  if (!result.ok) {
    return refuse(
      fromSizeWrite(result.error, was === undefined ? "gone" : "changed"),
    );
  }
  return { ok: true, value: sizeTexts(result.value) };
}

// Marks a size removed. The row stays, so Undo can bring it back. With
// onlyIfBlank, which an Undo of an add sends, the size goes only while it
// has no name and no price (D-119).
export async function removeSize(
  rawCode: string,
  rawDish: string,
  rawSize: string,
  onlyIfBlank: boolean,
): Promise<DishPageResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawSize);
  if (!id.success) return refuse({ kind: onlyIfBlank ? "changed" : "gone" });
  const result = await setOwnerSizeDeleted(
    scope.client,
    scope.dishId,
    id.data,
    true,
    onlyIfBlank === true,
  );
  refresh();
  if (!result.ok) {
    return refuse(
      fromSizeWrite(result.error, onlyIfBlank ? "changed" : "gone"),
    );
  }
  return { ok: true, value: null };
}

// Brings a removed size back, with its name and its price.
export async function restoreSize(
  rawCode: string,
  rawDish: string,
  rawSize: string,
): Promise<DishPageResult<OwnerSize>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawSize);
  if (!id.success) return refuse({ kind: "changed" });
  const result = await setOwnerSizeDeleted(
    scope.client,
    scope.dishId,
    id.data,
    false,
  );
  refresh();
  if (!result.ok) return refuse(fromSizeWrite(result.error, "changed"));
  return { ok: true, value: result.value };
}

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
// itself and refuses a name that section already has (migration 6). It
// answers with the order the dish's old section had, which is what Undo
// puts back.
export async function moveDish(
  rawCode: string,
  rawDish: string,
  rawSection: string,
): Promise<DishMoveResult<{ order: string[] }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const section = idSchema.safeParse(rawSection);
  if (!section.success) return { ok: false, problem: { kind: "section-gone" } };
  let order: string[];
  try {
    const dishes = await listOwnerDishes(scope.client, scope.sectionId);
    order = dishes.map((dish) => dish.id);
  } catch {
    return { ok: false, problem: { kind: "failed" } };
  }
  const result = await moveOwnerDish(scope.client, scope.dishId, section.data);
  refresh();
  if (!result.ok) return { ok: false, problem: fromMove(result.error) };
  return { ok: true, value: { order } };
}

// Undo of a move: the dish goes back to the section it came from, and that
// section's list goes back to the order it had. If the order cannot be set,
// because the list changed since, the dish is back all the same and says
// where it landed.
export async function moveDishBack(
  rawCode: string,
  rawDish: string,
  rawSection: string,
  rawOrder: string[],
): Promise<DishMoveResult<{ position: number; total: number }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const section = idSchema.safeParse(rawSection);
  const order = orderSchema.safeParse(rawOrder);
  if (!section.success || !order.success) {
    return { ok: false, problem: { kind: "changed" } };
  }
  const result = await moveOwnerDish(scope.client, scope.dishId, section.data);
  refresh();
  if (!result.ok) return { ok: false, problem: fromMove(result.error) };

  let live: string[];
  try {
    const dishes = await listOwnerDishes(scope.client, section.data);
    live = dishes.map((dish) => dish.id);
  } catch {
    return { ok: true, value: { position: 0, total: 0 } };
  }
  const wanted = mergeOrder(order.data, live);
  const placed = await setOwnerDishOrder(scope.client, section.data, wanted);
  const final = placed.ok ? wanted : live;
  return {
    ok: true,
    value: { position: final.indexOf(scope.dishId) + 1, total: final.length },
  };
}
