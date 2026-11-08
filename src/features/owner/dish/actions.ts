"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { expireRestaurant } from "@/core/cache";
import {
  moveOwnerDish,
  setOwnerDishCalories,
  setOwnerDishCookedToOrder,
  setOwnerDishPrice,
  setOwnerDishPriceKind,
  setOwnerDishText,
  writeOwnerDishAvailability,
  type AvailabilityPatch,
  type DishWriteError,
} from "@/core/supabase/dishes";
import { AVAILABILITY } from "@/domain/availability";
import { parseCalories, type Calories } from "@/domain/calories";
import {
  addOwnerSize,
  removeOwnerSize,
  setOwnerSizeCalories,
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
import { normalizeMenuCode } from "@/domain/menu-url";
import { parsePrice } from "@/domain/money";
import type { ListProblem } from "../editing/list-words";
import { dishScope } from "../owner-scope";
import type { DishMoveProblem } from "./dish-words";

// A dish's own page saves through these (D-111, D-128): its description,
// its price choice, its one price, and its note (D-139), its calories and
// its Cooked to order mark (D-167), its sizes, its availability (D-160),
// and its move to another section (D-129). Nothing here redirects: a missing
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

export type DishMoveResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ServerMoveProblem };

const idSchema = z.uuid();
const availabilitySchema = z.enum(AVAILABILITY);
const dishTextSchema = z.enum(DISH_TEXTS);
const sizeTextSchema = z.enum(SIZE_TEXTS);
const kindSchema = z.enum(PRICE_KINDS);

function refuse(problem: ServerProblem): { ok: false; problem: ServerProblem } {
  return { ok: false, problem };
}

const failed = refuse({ kind: "failed" });

// The dish's texts as the page's fields show them.
function textsOf(dish: OwnerDishDetail): Record<DishText, string> {
  return {
    description: dish.description,
    price: dish.price,
    calories: dish.calories,
    note: dish.note,
  };
}

function sizeTexts(size: OwnerSize): Record<SizeText, string> {
  return { name: size.name, price: size.price, calories: size.calories };
}

// A dish that is not there is the page's own parent gone.
function fromDishWrite(error: DishWriteError): ServerProblem {
  return error.kind === "not-found"
    ? { kind: "parent-gone" }
    : { kind: "failed" };
}

function fromSizeWrite(
  error: SizeWriteError,
  missing: "gone" | "parent-gone",
): ServerProblem {
  switch (error.kind) {
    case "name-taken":
      return { kind: "name-taken" };
    case "not-found":
      return { kind: missing };
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

// Typed calories, or the field's blank, as the pair or null (D-167).
function readCalories(
  raw: string,
): { calories: Calories | null } | { rule: string } {
  const calories = parseCalories(raw);
  return calories.ok
    ? { calories: calories.calories }
    : { rule: calories.rule };
}

// Writes the dish's description, note, one price (D-139), or calories
// (D-167). A price or calories travel as the field's text and are read
// here, on both sides.
export async function setDishText(
  rawCode: string,
  rawDish: string,
  rawField: string,
  rawValue: string,
): Promise<DishPageResult<Record<DishText, string>>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const field = dishTextSchema.safeParse(rawField);
  if (!field.success) return failed;
  if (typeof rawValue !== "string") return failed;
  const value = cleanDishText(field.data, rawValue);
  const rule = dishTextProblem(field.data, value);
  if (rule) return refuse({ kind: "invalid", rule });
  let result;
  if (field.data === "price") {
    const price = readPrice(value);
    if ("rule" in price) return failed;
    result = await setOwnerDishPrice(
      scope.client,
      scope.sectionId,
      scope.dishId,
      price.cents,
    );
  } else if (field.data === "calories") {
    const calories = readCalories(value);
    if ("rule" in calories) return failed;
    result = await setOwnerDishCalories(
      scope.client,
      scope.sectionId,
      scope.dishId,
      calories.calories,
    );
  } else {
    result = await setOwnerDishText(
      scope.client,
      scope.sectionId,
      scope.dishId,
      field.data,
      value === "" ? null : value,
    );
  }
  refresh();
  if (!result.ok) return refuse(fromDishWrite(result.error));
  return { ok: true, value: textsOf(result.value) };
}

// How the dish is priced (D-139). The other choices' values stay stored.
export async function setDishPriceKind(
  rawCode: string,
  rawDish: string,
  rawKind: string,
): Promise<DishPageResult<{ priceKind: PriceKind }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const kind = kindSchema.safeParse(rawKind);
  if (!kind.success) return failed;
  const result = await setOwnerDishPriceKind(
    scope.client,
    scope.sectionId,
    scope.dishId,
    kind.data,
  );
  refresh();
  if (!result.ok) return refuse(fromDishWrite(result.error));
  return { ok: true, value: { priceKind: result.value.priceKind } };
}

// The Cooked to order mark (D-167): on or off, saved at once.
export async function setDishCookedToOrder(
  rawCode: string,
  rawDish: string,
  rawOn: unknown,
): Promise<DishPageResult<{ cookedToOrder: boolean }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const on = z.boolean().safeParse(rawOn);
  if (!on.success) return failed;
  const result = await setOwnerDishCookedToOrder(
    scope.client,
    scope.sectionId,
    scope.dishId,
    on.data,
  );
  refresh();
  if (!result.ok) return refuse(fromDishWrite(result.error));
  return { ok: true, value: { cookedToOrder: result.value.cookedToOrder } };
}

// How the dish stands (D-160): available, sold out today, or off the menu
// for now. A sold-out mark is the server's own clock, never a browser's.
export async function setDishAvailability(
  rawCode: string,
  rawDish: string,
  rawChoice: unknown,
): Promise<DishPageResult<{ available: boolean; soldOutAt: string | null }>> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const choice = availabilitySchema.safeParse(rawChoice);
  if (!choice.success) return failed;
  let patch: AvailabilityPatch;
  if (choice.data === "off") {
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
  );
  // Availability reaches diners without Publish (D-84, D-160): the
  // restaurant's pages re-render on their next request.
  if (result.ok) expireRestaurant(normalizeMenuCode(rawCode));
  refresh();
  if (!result.ok) return refuse(fromDishWrite(result.error));
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

// Writes a size's name, price, or calories.
export async function setSizeText(
  rawCode: string,
  rawDish: string,
  rawSize: string,
  rawField: string,
  rawValue: string,
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
  let result;
  if (field.data === "price") {
    const price = readPrice(value);
    if ("rule" in price) return failed;
    result = await setOwnerSizePrice(
      scope.client,
      scope.dishId,
      id.data,
      price.cents,
    );
  } else if (field.data === "calories") {
    const calories = readCalories(value);
    if ("rule" in calories) return failed;
    result = await setOwnerSizeCalories(
      scope.client,
      scope.dishId,
      id.data,
      calories.calories,
    );
  } else {
    result = await setOwnerSizeName(
      scope.client,
      scope.dishId,
      id.data,
      value === "" ? null : value,
    );
  }
  refresh();
  if (!result.ok) return refuse(fromSizeWrite(result.error, "gone"));
  return { ok: true, value: sizeTexts(result.value) };
}

// Marks a size removed. The row stays, with deleted_at set; the page takes
// it out on the press, since a size is a part of the dish's form (D-221).
export async function removeSize(
  rawCode: string,
  rawDish: string,
  rawSize: string,
): Promise<DishPageResult> {
  const scope = await dishScope(rawCode, rawDish);
  if (!scope.ok) return scope;
  const id = idSchema.safeParse(rawSize);
  if (!id.success) return refuse({ kind: "gone" });
  const result = await removeOwnerSize(scope.client, scope.dishId, id.data);
  refresh();
  if (!result.ok) return refuse(fromSizeWrite(result.error, "gone"));
  return { ok: true, value: null };
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
