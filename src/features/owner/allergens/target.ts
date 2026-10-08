import type { OwnerAllergens, UsMajorAllergen } from "@/domain/allergens";
import type { AllergenId } from "@/domain/types";
import type { ListProblem } from "../editing/list-words";
import type {
  AllergenSubject,
  ApplyProblem,
  SameNamedPlace,
} from "./allergen-words";
import type { GroupChange, UndoLists } from "./group-undo";

// What an allergen group writes to and speaks for: a dish (D-148, D-149) or
// a section's line shown with every dish (D-152, D-153). The group itself is
// one hook and one component; a target gives it the element ids, the
// subject its sentences name, the three writes, the Undo entries its page
// keeps, and, on a dish's page, the same-named Apply (D-129). Every write
// carries the lists the page showed, and a line's carries the line's words
// too: what the server last confirmed, read when the queue sends it. Pure
// types.

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

// A write that found the subject holding other lists, or other words, than
// the page showed: nothing was written.
export type GroupProblem = ServerProblem | { kind: "lists-changed" };

// What a write answers with: the lists and the check as the server holds
// them now, and, for a line, its words.
export type GroupState = OwnerAllergens & { words?: string };

export type GroupResult =
  { ok: true; value: GroupState } | { ok: false; problem: GroupProblem };

type ServerApplyProblem = Exclude<
  ApplyProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

export type GroupApplyResult =
  | { ok: true; value: OwnerAllergens }
  | { ok: false; problem: ServerApplyProblem };

// The element ids the group's controls carry, so a failed save can point
// focus at its control and the tests can find them: "dish-allergen-check",
// "line-other-2-name". fallbackFocus is where focus goes when the group
// leaves the page with focus inside it (a line cleared from another tab).
export type GroupIds = {
  heading: string;
  sentence: string;
  check: string;
  addOther: string;
  box: (id: AllergenId) => string;
  otherField: (key: number) => string;
  otherButton: (key: number) => string;
  apply: (id: string) => string;
  fallbackFocus: string | null;
};

export function groupIds(
  prefix: string,
  fallbackFocus: string | null = null,
): GroupIds {
  return {
    heading: `${prefix}-allergens-heading`,
    sentence: `${prefix}-allergen-sentence`,
    check: `${prefix}-allergen-check`,
    addOther: `${prefix}-allergen-add`,
    box: (id) => `${prefix}-allergen-${id}`,
    otherField: (key) => `${prefix}-other-${key}-name`,
    otherButton: (key) => `${prefix}-other-${key}-remove`,
    apply: (id) => `${prefix}-apply-${id}`,
    fallbackFocus,
  };
}

export type AllergenTarget<Entry> = {
  ids: GroupIds;
  subject: AllergenSubject;
  // The three writes. shown is the lists the page showed, and words the
  // line's words the page showed, or null for a dish; each lands only if
  // the subject still holds them.
  writes: {
    allergens: (
      allergens: UsMajorAllergen[],
      shown: UndoLists,
      words: string | null,
    ) => Promise<GroupResult>;
    others: (
      others: string[],
      shown: UndoLists,
      words: string | null,
    ) => Promise<GroupResult>;
    check: (
      on: boolean,
      shown: UndoLists,
      words: string | null,
    ) => Promise<GroupResult>;
  };
  // The page's own Undo entries around the group's changes: make wraps a
  // change the group just made, with the words it carried; read gives one
  // back, or null for an entry that is not the group's.
  entries: {
    make: (change: GroupChange, words: string | null) => Entry;
    read: (
      entry: Entry,
    ) => { change: GroupChange; words: string | null } | null;
  };
  // The same-named offer, a dish's alone (D-129).
  sameNamed?: {
    places: SameNamedPlace[];
    apply: (
      place: SameNamedPlace,
      shown: UndoLists,
    ) => Promise<GroupApplyResult>;
    undoApply: (
      entry: Extract<GroupChange, { kind: "apply" }>,
    ) => Promise<GroupApplyResult>;
  };
};
