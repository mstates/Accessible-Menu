import { z } from "zod";
import { US_MAJOR_ALLERGENS } from "@/domain/allergens";
import { ALLERGEN_IDS } from "@/domain/types";

// The changes an allergen group leaves on its page's Undo stack (D-149): a
// major allergen ticked or unticked, the other allergens changed, the list
// checked or unchecked, and, on a dish's page, this dish's lists applied to
// a same-named dish (D-129). A change to a list is taken back only while
// the subject still holds the lists that change left, and a check is put
// back only on the lists it covered; each remembers the subject's id and
// name for its sentences. A page wraps these in its own entry kinds: the
// dish page as they are, a section's page with the line's words beside
// them (D-153). Pure: no React, no network.

export const undoListsSchema = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  others: z.array(z.string()),
});

export type UndoLists = z.infer<typeof undoListsSchema>;

export const allergenChangeSchema = z.object({
  kind: z.literal("allergen"),
  id: z.string(),
  name: z.string(),
  allergen: z.enum(US_MAJOR_ALLERGENS),
  on: z.boolean(),
  before: undoListsSchema,
  after: undoListsSchema,
});

export const othersChangeSchema = z.object({
  kind: z.literal("others"),
  id: z.string(),
  name: z.string(),
  before: undoListsSchema,
  after: undoListsSchema,
});

export const checkChangeSchema = z.object({
  kind: z.literal("check"),
  id: z.string(),
  name: z.string(),
  on: z.boolean(),
  lists: undoListsSchema,
});

export const applyChangeSchema = z.object({
  kind: z.literal("apply"),
  // The other dish, and where it is.
  id: z.string(),
  dish: z.string(),
  section: z.string(),
  menu: z.string(),
  before: undoListsSchema.extend({ reviewed: z.boolean() }),
  after: undoListsSchema,
  at: z.string(),
});

export const groupChangeSchema = z.discriminatedUnion("kind", [
  allergenChangeSchema,
  othersChangeSchema,
  checkChangeSchema,
  applyChangeSchema,
]);

export type GroupChange = z.infer<typeof groupChangeSchema>;

// The three changes every group leaves; the apply is the dish page's alone.
export type ListChange = Exclude<GroupChange, { kind: "apply" }>;
