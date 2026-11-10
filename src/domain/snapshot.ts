import { z } from "zod";
import { ALLERGEN_IDS, DIETARY_TAG_IDS } from "./types";

// The published snapshot of a menu, as publish_menu() writes it to
// menus.published_snapshot (migration 12, D-82): the one description of the
// shape in TypeScript. The diner page reads it; nothing in TypeScript
// writes it. Keys are the columns' names, and every object is strict, so a
// key the reader does not know refuses the snapshot instead of slipping
// past it. v names the shape: a later shape is v2 with its own reader
// beside this one, since a published snapshot is never rewritten (D-7 for
// published content). What is absent is as settled as what is present: no
// deleted row, no list with no option, no list on an unchecked dish or
// option, never who checked or when, and no state (availability, the
// sold-out mark, a special's schedule), which the diner page reads live by
// these dish ids. Pure: no React, no network.

const calories = {
  calories_low: z.number().int().nullable(),
  calories_high: z.number().int().nullable(),
};

// A checked dish or option carries its lists; an unchecked one carries
// nothing but the fact (D-149, D-166).
export const snapshotAllergensSchema = z.discriminatedUnion("checked", [
  z.strictObject({
    checked: z.literal(true),
    major: z.array(z.enum(ALLERGEN_IDS)),
    other: z.array(z.string()),
  }),
  z.strictObject({ checked: z.literal(false) }),
]);

// Publish refuses a size with no name or no price (D-139, D-144), so a
// published size has both. Sizes come in price order (D-143).
const sizeSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  price_cents: z.number().int(),
  ...calories,
});

// A draft may hold a size with no name or no price (D-139): what
// menu_snapshot() builds from the rows as they are, before Publish has
// refused anything. It is the one place a draft differs from what was
// published, so the shape below is built once, from its size.
const draftSizeSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().nullable(),
  price_cents: z.number().int().nullable(),
  ...calories,
});

// A blank one price and a dish by size with no live size both publish as
// no price shown (D-139).
function priceOf<Size extends z.ZodType>(size: Size) {
  return z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("one"),
      price_cents: z.number().int().nullable(),
      ...calories,
    }),
    z.strictObject({ kind: z.literal("sizes"), sizes: z.array(size) }),
    z.strictObject({ kind: z.literal("market"), ...calories }),
  ]);
}

export const snapshotPriceSchema = priceOf(sizeSchema);

const optionSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  added_price_cents: z.number().int().nullable(),
  ...calories,
  allergens: snapshotAllergensSchema,
});

const listSchema = z.strictObject({
  id: z.uuid(),
  lead: z.string(),
  options: z.array(optionSchema).min(1),
});

// The v1 shape around a size: the published one and the draft's are this
// same shape, so a key added to one is added to both.
function shapeOf<Size extends z.ZodType>(size: Size) {
  const itemSchema = z.strictObject({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    note: z.string().nullable(),
    price: priceOf(size),
    cooked_to_order: z.boolean(),
    dietary_tags: z.array(z.enum(DIETARY_TAG_IDS)),
    allergens: snapshotAllergensSchema,
    choice_lists: z.array(listSchema),
  });

  const sectionSchema = z.strictObject({
    id: z.uuid(),
    name: z.string(),
    note: z.string().nullable(),
    choice_lists: z.array(listSchema),
    items: z.array(itemSchema),
  });

  return z.strictObject({
    v: z.literal(1),
    menu: z.strictObject({ id: z.uuid(), name: z.string() }),
    sections: z.array(sectionSchema),
  });
}

export const menuSnapshotSchema = shapeOf(sizeSchema);

// The draft as menu_snapshot() builds it for the owner's review before
// Publish (D-224): the same shape, with a size's name and price as the
// draft holds them. Every published snapshot is also a draft.
export const menuDraftSchema = shapeOf(draftSizeSchema);

export type MenuSnapshot = z.infer<typeof menuSnapshotSchema>;
export type MenuDraft = z.infer<typeof menuDraftSchema>;
export type SnapshotSection = MenuSnapshot["sections"][number];
export type SnapshotItem = SnapshotSection["items"][number];
export type SnapshotChoiceList = SnapshotSection["choice_lists"][number];
export type SnapshotOption = SnapshotChoiceList["options"][number];

// The keys a snapshot never holds: columns a diner never reads (D-26,
// D-148), the photo columns (D-165), and the state read live (D-84). Held
// here so the fixture test and the stand-in's builder read one list.
export const SNAPSHOT_NEVER_HOLDS = [
  "allergens_reviewed_by",
  "allergens_reviewed_at",
  "allergen_suggestions",
  "import_confidence",
  "external_ids",
  "photo_url",
  "photo_alt",
  "available",
  "sold_out_at",
  "special_schedule",
  "deleted_at",
  "created_at",
  "updated_at",
  "restaurant_id",
  "source",
] as const;

// Every key anywhere in a snapshot, for a test that proves the list above.
export function snapshotKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
    } else if (node && typeof node === "object") {
      for (const [key, entry] of Object.entries(node)) {
        keys.add(key);
        walk(entry);
      }
    }
  };
  walk(value);
  return keys;
}
