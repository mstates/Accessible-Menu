"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  findOwnerSectionPage,
  writeOwnerSectionLine,
  type SectionWriteError,
} from "@/core/supabase/sections";
import {
  cleanOtherAllergen,
  hasOtherAllergenComma,
  OTHER_ALLERGEN_LIMITS,
  otherAllergenProblem,
  US_MAJOR_ALLERGENS,
} from "@/domain/allergens";
import {
  cleanSectionText,
  SECTION_LIMITS,
  sectionTextProblem,
  type OwnerSectionPage,
} from "@/domain/section";
import { ALLERGEN_IDS, type AllergenId } from "@/domain/types";
import { majorRuleOf } from "../allergens/allergen-words";
import type {
  GroupProblem,
  GroupResult,
  GroupState,
} from "../allergens/target";
import type { ListProblem } from "../editing/list-words";
import { sectionScope } from "../owner-scope";

// A section's line shown with every dish saves through these (D-152): its
// words, from the field at the top of the section's page (D-135), and its
// allergen group, the major allergens ticked, the other allergens typed,
// and the check. Every write in the group carries the line's words and the
// two lists the page showed and lands only if the section still holds all
// three (D-153), so a stale tab never drops an allergen another tab added,
// and no one checks a line they never saw; a miss comes back as
// lists-changed, and the refreshed page shows the line as it is now. The
// database clears the check on any change to the words or a list, clears
// the lists and the check when the words go, and stamps who and when on a
// check, in the same statement (migration 8); nothing here writes who or
// when. Nothing here redirects: a missing session comes back as a result.
// Every call that reached the database with a live session ends with
// refresh(). The code, the section, and the values are user input: they
// are checked here and in sectionScope, and row level security decides
// whether the rows are this owner's. Nothing here can publish (migration
// 3).

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type LineResult = GroupResult;

// The words' own saves answer with the whole section, so the page learns
// the line and its check as the server holds them now.
export type LineWordsResult =
  { ok: true; value: OwnerSectionPage } | { ok: false; problem: ServerProblem };

const listsSchema = z.object({
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  others: z.array(z.string().max(200)).max(OTHER_ALLERGEN_LIMITS.count),
});
const shownSchema = z.object({
  words: z.string().max(SECTION_LIMITS.everyItem),
  lists: listsSchema,
});
const majorsSchema = z
  .array(z.enum(US_MAJOR_ALLERGENS))
  .max(US_MAJOR_ALLERGENS.length);
// One over the cap, so the count rule names itself.
const othersSchema = z
  .array(z.string().max(1000))
  .max(OTHER_ALLERGEN_LIMITS.count + 1);
const expectedSchema = z.object({
  words: z.string(),
  lists: listsSchema.optional(),
});

function refuse(problem: GroupProblem): LineResult {
  return { ok: false, problem };
}

const failed = refuse({ kind: "failed" });

function refuseWords(problem: ServerProblem): LineWordsResult {
  return { ok: false, problem };
}

function stateOf(section: OwnerSectionPage): GroupState {
  return {
    allergens: section.line.allergens,
    otherAllergens: section.line.otherAllergens,
    check: section.line.check,
    words: section.everyItem,
  };
}

// The major allergens in the order the boxes show and the database keeps,
// each once: the order the enum declares.
function inFixedOrder(allergens: readonly AllergenId[]): AllergenId[] {
  const set = new Set(allergens);
  return ALLERGEN_IDS.filter((id) => set.has(id));
}

// What the database refused, as the page's problems: a miss means the line
// or its lists moved under the page; a line cleared elsewhere, which takes
// no list and no check, reads the same; a rule the trigger names is the
// page's own rule said again, as the backstop it is.
function fromWrite(error: SectionWriteError): GroupProblem {
  switch (error.kind) {
    case "not-found":
      return { kind: "lists-changed" };
    case "name-taken":
      return { kind: "name-taken" };
    case "refused":
      switch (error.rule) {
        case "other_allergen_repeated":
          return { kind: "name-taken" };
        case "other_allergen_text":
          return { kind: "invalid", rule: "otherLength" };
        case "other_allergen_comma":
          return { kind: "invalid", rule: "otherComma" };
        case "other_allergen_major":
          return { kind: "invalid", rule: "otherMajor:both" };
        case "line_blank_holds_nothing":
          return { kind: "lists-changed" };
        default:
          return { kind: "failed" };
      }
    default:
      return { kind: "failed" };
  }
}

// The major allergens the line contains, as the boxes show them.
export async function setLineAllergens(
  rawCode: string,
  rawSection: string,
  rawAllergens: unknown,
  rawShown: unknown,
): Promise<LineResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const allergens = majorsSchema.safeParse(rawAllergens);
  const shown = shownSchema.safeParse(rawShown);
  if (!allergens.success || !shown.success) return failed;
  const result = await writeOwnerSectionLine(
    scope.client,
    scope.menuId,
    scope.sectionId,
    scope.userId,
    { every_item_allergens: inFixedOrder(allergens.data) },
    { words: shown.data.words, lists: shown.data.lists },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: stateOf(result.value) };
}

// The other allergens typed, the whole list, each cleaned and checked by
// the page's rules before the database's own. A comma is refused and never
// sent (D-151).
export async function setLineOtherAllergens(
  rawCode: string,
  rawSection: string,
  rawOthers: unknown,
  rawShown: unknown,
): Promise<LineResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const others = othersSchema.safeParse(rawOthers);
  const shown = shownSchema.safeParse(rawShown);
  if (!others.success || !shown.success) return failed;
  const cleaned = others.data.map(cleanOtherAllergen);
  if (cleaned.length > OTHER_ALLERGEN_LIMITS.count) {
    return refuse({ kind: "invalid", rule: "othersFull" });
  }
  for (const [index, value] of cleaned.entries()) {
    if (value === "") return refuse({ kind: "invalid", rule: "otherRequired" });
    if (hasOtherAllergenComma(value)) {
      return refuse({ kind: "invalid", rule: "otherComma" });
    }
    const major = majorRuleOf(value);
    if (major) return refuse({ kind: "invalid", rule: major });
    const rule = otherAllergenProblem(value, cleaned, index);
    if (rule === "otherTaken") return refuse({ kind: "name-taken" });
    if (rule) return refuse({ kind: "invalid", rule });
  }
  const result = await writeOwnerSectionLine(
    scope.client,
    scope.menuId,
    scope.sectionId,
    scope.userId,
    { every_item_custom_allergens: cleaned },
    { words: shown.data.words, lists: shown.data.lists },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: stateOf(result.value) };
}

// The check (D-148, D-152). It carries the words and the lists the page
// showed; an uncheck does too, and lands only while the line is checked.
export async function setLineAllergenCheck(
  rawCode: string,
  rawSection: string,
  rawChecked: unknown,
  rawShown: unknown,
): Promise<LineResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  const checked = z.boolean().safeParse(rawChecked);
  const shown = shownSchema.safeParse(rawShown);
  if (!checked.success || !shown.success) return failed;
  const result = await writeOwnerSectionLine(
    scope.client,
    scope.menuId,
    scope.sectionId,
    scope.userId,
    { every_item_allergens_reviewed: checked.data },
    {
      words: shown.data.words,
      lists: shown.data.lists,
      ...(checked.data ? {} : { every_item_allergens_reviewed: true }),
    },
  );
  refresh();
  if (!result.ok) return refuse(fromWrite(result.error));
  return { ok: true, value: stateOf(result.value) };
}

// The line's words, from the field at the top of the page (D-120, D-135):
// the own-text path's save, answering with the whole section, so the page
// learns the line and its check as the server holds them now (D-153). A
// blank line is stored as null, and the database clears its lists and its
// check with it (D-152). With expected, the write is an Undo: it happens
// only if the words are still the ones the change wrote, and, with lists,
// only while the line holds exactly those (empty, for words given to a
// blank line, since Undo never deletes content, D-119).
export async function setLineWords(
  rawCode: string,
  rawSection: string,
  rawWords: unknown,
  rawExpected?: unknown,
): Promise<LineWordsResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  if (typeof rawWords !== "string") return refuseWords({ kind: "failed" });
  const value = cleanSectionText("everyItem", rawWords);
  const rule = sectionTextProblem("everyItem", value);
  if (rule) return refuseWords({ kind: "invalid", rule });
  const expected =
    rawExpected === undefined
      ? undefined
      : expectedSchema.safeParse(rawExpected);
  if (expected && !expected.success) return refuseWords({ kind: "changed" });
  const result = await writeOwnerSectionLine(
    scope.client,
    scope.menuId,
    scope.sectionId,
    scope.userId,
    { every_item: value === "" ? null : value },
    expected
      ? {
          words: expected.data.words === "" ? null : expected.data.words,
          ...(expected.data.lists ? { lists: expected.data.lists } : {}),
        }
      : {},
  );
  refresh();
  if (!result.ok) {
    if (result.error.kind !== "not-found")
      return refuseWords({ kind: "failed" });
    if (!expected) return refuseWords({ kind: "parent-gone" });
    // An Undo that missed: the words changed since, or the line has gained
    // a list or a check, so it stays (D-119).
    if (expected.data.lists) {
      const now = await findOwnerSectionPage(
        scope.client,
        scope.restaurantId,
        scope.sectionId,
        scope.userId,
      );
      if (
        now !== "failed" &&
        now !== "not-found" &&
        now.everyItem === expected.data.words &&
        (now.line.allergens.length > 0 ||
          now.line.otherAllergens.length > 0 ||
          now.line.check !== null)
      ) {
        return refuseWords({ kind: "grew" });
      }
    }
    return refuseWords({ kind: "changed" });
  }
  return { ok: true, value: result.value };
}

// Undo of a clear: the words and the lists back in one statement, only
// while the line is still blank and holds nothing, and unchecked, since
// Undo never makes a check (D-149).
export async function restoreLine(
  rawCode: string,
  rawSection: string,
  rawWords: unknown,
  rawLists: unknown,
): Promise<LineWordsResult> {
  const scope = await sectionScope(rawCode, rawSection);
  if (!scope.ok) return scope;
  if (typeof rawWords !== "string") return refuseWords({ kind: "failed" });
  const value = cleanSectionText("everyItem", rawWords);
  const lists = listsSchema.safeParse(rawLists);
  if (value === "" || !lists.success) return refuseWords({ kind: "changed" });
  const result = await writeOwnerSectionLine(
    scope.client,
    scope.menuId,
    scope.sectionId,
    scope.userId,
    {
      every_item: value,
      every_item_allergens: inFixedOrder(lists.data.allergens),
      every_item_custom_allergens: lists.data.others,
    },
    { words: null, lists: { allergens: [], others: [] } },
  );
  refresh();
  if (!result.ok) {
    return refuseWords({
      kind: result.error.kind === "not-found" ? "changed" : "failed",
    });
  }
  return { ok: true, value: result.value };
}
