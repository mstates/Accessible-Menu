import type {
  AllergenLists,
  OwnerAllergens,
  UsMajorAllergen,
} from "@/domain/allergens";
import type { AllergenId } from "@/domain/types";
import type { ListProblem } from "../editing/list-words";
import type {
  AllergenSubject,
  ApplyProblem,
  SameNamedPlace,
} from "./allergen-words";

// What an allergen group writes to and speaks for: a dish (D-148, D-149) or
// an option of a choice list (D-166). The group itself is one hook and one
// component; a target gives it the element ids and editing keys, the
// subject its sentences name, the three writes, and the same-named Apply
// (D-129). Every write carries the lists the page showed, and an option's
// carries the option's name too (D-153): what the server last confirmed,
// read when the queue sends it. Pure types.

type ServerProblem = Exclude<
  ListProblem,
  { kind: "unreachable" } | { kind: "out-of-date" }
>;

// A write that found the subject holding other lists, or other words, than
// the page showed: nothing was written.
export type GroupProblem = ServerProblem | { kind: "lists-changed" };

// What a write answers with: the lists and the check as the server holds
// them now, and, for an option, its name.
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
// "option-<id>-other-2-name"; and the keys its saves hold in the page's
// editing state, which start with the same prefix, so a page that holds a
// group per option row never mixes two groups' saves (D-166).
export type GroupIds = {
  prefix: string;
  heading: string;
  sentence: string;
  check: string;
  addOther: string;
  box: (id: AllergenId) => string;
  otherField: (key: number) => string;
  otherButton: (key: number) => string;
  apply: (id: string) => string;
  keys: {
    allergen: (id: AllergenId) => string;
    other: (key: number) => string;
    check: string;
  };
};

export function groupIds(prefix: string): GroupIds {
  return {
    prefix,
    heading: `${prefix}-allergens-heading`,
    sentence: `${prefix}-allergen-sentence`,
    check: `${prefix}-allergen-check`,
    addOther: `${prefix}-allergen-add`,
    box: (id) => `${prefix}-allergen-${id}`,
    otherField: (key) => `${prefix}-other-${key}-name`,
    otherButton: (key) => `${prefix}-other-${key}-remove`,
    apply: (id) => `${prefix}-apply-${id}`,
    keys: {
      allergen: (id) => `${prefix}:allergen:${id}`,
      other: (key) => `${prefix}:other:${key}`,
      check: `${prefix}:allergen-check`,
    },
  };
}

export type AllergenTarget = {
  ids: GroupIds;
  subject: AllergenSubject;
  // The three writes. shown is the lists the page showed, and words the
  // option's name the page showed, or null for a dish; each lands only if
  // the subject still holds them.
  writes: {
    allergens: (
      allergens: UsMajorAllergen[],
      shown: AllergenLists,
      words: string | null,
    ) => Promise<GroupResult>;
    others: (
      others: string[],
      shown: AllergenLists,
      words: string | null,
    ) => Promise<GroupResult>;
    check: (
      on: boolean,
      shown: AllergenLists,
      words: string | null,
    ) => Promise<GroupResult>;
  };
  // The same-named offer (D-129), grown to options (D-166).
  sameNamed?: {
    places: SameNamedPlace[];
    apply: (
      place: SameNamedPlace,
      shown: AllergenLists,
    ) => Promise<GroupApplyResult>;
  };
};
