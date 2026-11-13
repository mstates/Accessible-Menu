import { caloriesInputText, parseCalories } from "@/domain/calories";
import {
  cleanDishText,
  cleanSizeText,
  DISH_LIMITS,
  SIZE_LIMITS,
  type DishGeneral,
  type DishGeneralSize,
  type PriceKind,
} from "@/domain/dish";
import { nameKey } from "@/domain/menu";
import { parsePrice, priceInputText } from "@/domain/money";

// A dish's General page as one form (D-237): what its fields hold, what a
// Save checks before anything is sent and the server checks again, what it
// sends, and whether the form holds anything a Save would change. The page
// shows one document, item_general()'s (migration 16); the form's fields
// are that document as text, and a Save hands back the next document in
// the same shape. Only the chosen price choice's fields are checked and
// written: the other choices keep what the document the page showed holds,
// which under the writer's lock is what the server holds (Michael, October
// 7, 2026; Q-171). A size row left wholly blank is dropped without a word
// and is not a change, whether the owner added it in this visit or an
// older draft held it. Pure: no React, no network.

// One size as its row holds it. The key is the size's id, or a key of the
// page's own for a row added in this visit, which has no id yet.
export type GeneralSizeRow = {
  key: string;
  id: string | null;
  name: string;
  price: string;
  calories: string;
};

export type GeneralFields = {
  description: string;
  note: string;
  kind: PriceKind;
  // The one price, and the dish's own calories, which sit beside the one
  // price and alone under Market price (D-167).
  price: string;
  calories: string;
  sizes: GeneralSizeRow[];
};

// Where each field is on the page, by id: what the summary links to and
// where focus goes.
export const GENERAL_IDS = {
  description: "dish-own-description",
  note: "dish-own-note",
  price: "dish-own-price",
  calories: "dish-own-calories",
  addSize: "dish-size-add",
} as const;

export type SizePart = "name" | "price" | "calories";

export function sizeFieldId(key: string, part: SizePart): string {
  return `dish-size-${key}-${part}`;
}

export function sizeRemoveId(key: string): string {
  return `dish-size-${key}-remove`;
}

// The form's fields from the document the page showed: a blank for each
// null, a price with two decimals, calories as their field reads them.
export function generalFields(general: DishGeneral): GeneralFields {
  return {
    description: general.description ?? "",
    note: general.note ?? "",
    kind: general.price_kind,
    price: priceInputText(general.price_cents),
    calories: caloriesInputText(general.calories_low, general.calories_high),
    sizes: general.sizes.map((size, index) => ({
      key: size.id ?? `shown-${index}`,
      id: size.id,
      name: size.name ?? "",
      price: priceInputText(size.price_cents),
      calories: caloriesInputText(size.calories_low, size.calories_high),
    })),
  };
}

// A row that holds nothing: no name, no price, no calories.
export function isBlankSize(row: GeneralSizeRow): boolean {
  return (
    cleanSizeText("name", row.name) === "" &&
    row.price.trim() === "" &&
    row.calories.trim() === ""
  );
}

// The rules a Save can find broken, which are also the keys of their
// messages (src/copy, owner.dish.errors).
export type GeneralRule =
  | "descriptionLength"
  | "noteLength"
  | "priceFormat"
  | "priceRange"
  | "caloriesFormat"
  | "caloriesRange"
  | "caloriesOrder"
  | "sizeNameRequired"
  | "sizeNameLength"
  | "nameTaken"
  | "sizePriceRequired"
  | "sizePriceFormat"
  | "sizePriceRange"
  | "sizeCaloriesFormat"
  | "sizeCaloriesRange"
  | "sizeCaloriesOrder";

export type GeneralProblem = {
  // The field at fault.
  id: string;
  rule: GeneralRule;
  // For a size's problem: the row's place on the page and its name as it
  // will be saved, blank for none, so the message can name the size.
  size?: { position: number; name: string };
  // For nameTaken: the earlier size's name.
  other?: string;
};

// What a Save found: the problems, one a field, in page order, or the
// document to write when there are none.
export type GeneralCheck =
  | { problems: GeneralProblem[]; next: null }
  | { problems: []; next: DishGeneral };

const SIZE_PRICE_RULES = {
  priceFormat: "sizePriceFormat",
  priceRange: "sizePriceRange",
} as const;

const SIZE_CALORIE_RULES = {
  caloriesFormat: "sizeCaloriesFormat",
  caloriesRange: "sizeCaloriesRange",
  caloriesOrder: "sizeCaloriesOrder",
} as const;

export function validateGeneralForm(
  fields: GeneralFields,
  shown: DishGeneral,
): GeneralCheck {
  const problems: GeneralProblem[] = [];

  const description = cleanDishText("description", fields.description);
  if (description.length > DISH_LIMITS.description) {
    problems.push({ id: GENERAL_IDS.description, rule: "descriptionLength" });
  }
  const note = cleanDishText("note", fields.note);
  if (note.length > DISH_LIMITS.note) {
    problems.push({ id: GENERAL_IDS.note, rule: "noteLength" });
  }

  // What the unchosen choices keep: the document the page showed.
  let priceCents = shown.price_cents;
  let caloriesLow = shown.calories_low;
  let caloriesHigh = shown.calories_high;
  let sizes: DishGeneralSize[] = shown.sizes;

  if (fields.kind === "one") {
    const price = parsePrice(fields.price);
    if (price.ok) priceCents = price.cents;
    else problems.push({ id: GENERAL_IDS.price, rule: price.rule });
  }
  if (fields.kind === "one" || fields.kind === "market") {
    const calories = parseCalories(fields.calories);
    if (calories.ok) {
      caloriesLow = calories.calories?.low ?? null;
      caloriesHigh = calories.calories?.high ?? null;
    } else {
      problems.push({ id: GENERAL_IDS.calories, rule: calories.rule });
    }
  }
  if (fields.kind === "sizes") {
    sizes = [];
    const kept: string[] = [];
    fields.sizes.forEach((row, index) => {
      if (isBlankSize(row)) return;
      const name = cleanSizeText("name", row.name);
      const size = { position: index + 1, name };
      const nameId = sizeFieldId(row.key, "name");
      if (name === "") {
        problems.push({ id: nameId, rule: "sizeNameRequired", size });
      } else if (name.length > SIZE_LIMITS.name) {
        problems.push({ id: nameId, rule: "sizeNameLength", size });
      } else {
        const key = nameKey(name);
        const other = kept.find((each) => nameKey(each) === key);
        if (other !== undefined) {
          problems.push({ id: nameId, rule: "nameTaken", size, other });
        }
      }
      if (name !== "") kept.push(name);

      let cents: number | null = null;
      const price = parsePrice(row.price);
      const priceId = sizeFieldId(row.key, "price");
      if (!price.ok) {
        problems.push({
          id: priceId,
          rule: SIZE_PRICE_RULES[price.rule],
          size,
        });
      } else if (price.cents === null) {
        problems.push({ id: priceId, rule: "sizePriceRequired", size });
      } else {
        cents = price.cents;
      }

      let low: number | null = null;
      let high: number | null = null;
      const calories = parseCalories(row.calories);
      if (calories.ok) {
        low = calories.calories?.low ?? null;
        high = calories.calories?.high ?? null;
      } else {
        problems.push({
          id: sizeFieldId(row.key, "calories"),
          rule: SIZE_CALORIE_RULES[calories.rule],
          size,
        });
      }

      sizes.push({
        id: row.id,
        name: name === "" ? null : name,
        price_cents: cents,
        calories_low: low,
        calories_high: high,
      });
    });
  }

  if (problems.length > 0) return { problems, next: null };
  return {
    problems: [],
    next: {
      description: description === "" ? null : description,
      note: note === "" ? null : note,
      price_kind: fields.kind,
      price_cents: priceCents,
      calories_low: caloriesLow,
      calories_high: caloriesHigh,
      sizes,
    },
  };
}

// Two typed prices that read to the same amount are the same, "9" and
// "9.00"; a text that does not read is compared as typed.
function samePrice(a: string, b: string): boolean {
  const first = parsePrice(a);
  const second = parsePrice(b);
  if (first.ok && second.ok) return first.cents === second.cents;
  return a.trim() === b.trim();
}

function sameCalories(a: string, b: string): boolean {
  const first = parseCalories(a);
  const second = parseCalories(b);
  if (first.ok && second.ok) {
    return (
      (first.calories?.low ?? null) === (second.calories?.low ?? null) &&
      (first.calories?.high ?? null) === (second.calories?.high ?? null)
    );
  }
  return a.trim() === b.trim();
}

// Whether the form holds nothing a Save would change: the same choice, the
// same texts, and under the chosen choice the same values, read the way a
// Save reads them. Fields under a choice that is not the chosen one do not
// count, since a Save does not write them, and neither does a blank row.
// It compares fields, not documents, so an older draft the validator would
// refuse, a size with a name and no price, is not a change until the owner
// makes one.
export function sameGeneralFields(
  now: GeneralFields,
  shown: GeneralFields,
): boolean {
  if (now.kind !== shown.kind) return false;
  if (
    cleanDishText("description", now.description) !==
    cleanDishText("description", shown.description)
  ) {
    return false;
  }
  if (cleanDishText("note", now.note) !== cleanDishText("note", shown.note)) {
    return false;
  }
  if (now.kind === "one" && !samePrice(now.price, shown.price)) return false;
  if (now.kind !== "sizes" && !sameCalories(now.calories, shown.calories)) {
    return false;
  }
  if (now.kind === "sizes") {
    const rows = now.sizes.filter((row) => !isBlankSize(row));
    const before = shown.sizes.filter((row) => !isBlankSize(row));
    if (rows.length !== before.length) return false;
    return rows.every((row, index) => {
      const other = before[index];
      return (
        other !== undefined &&
        row.key === other.key &&
        cleanSizeText("name", row.name) === cleanSizeText("name", other.name) &&
        samePrice(row.price, other.price) &&
        sameCalories(row.calories, other.calories)
      );
    });
  }
  return true;
}
