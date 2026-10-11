"use client";

import { sameListsAsStored, type AllergenLists } from "@/domain/allergens";
import type { OwnerOption } from "@/domain/choices";
import type {
  AllergenStrings,
  SameNamedPlace,
} from "../allergens/allergen-words";
import { groupIds, type AllergenTarget } from "../allergens/target";
import { useAllergenGroup } from "../allergens/useAllergenGroup";
import type { EditingStrings, TextWords } from "../editing/list-words";
import type { UndoOutcome } from "../editing/undo";
import type { Editing } from "../editing/useEditing";
import { useFocusNext } from "../editing/useFocusNext";
import {
  applyOptionAllergens,
  setOptionAllergenCheck,
  setOptionAllergens,
  setOptionOtherAllergens,
  undoOptionAllergensApply,
} from "./option-allergen-actions";
import {
  readChange,
  wrapChange,
  type OptionAllergenUndo,
} from "./option-words";

// The allergen group of one option on its list's page (D-154, D-166): the
// option as the group's target. Its ids start with "option-<id>-", its
// sentences name the option, every write carries the option's name as
// well as the lists the page showed (D-153), its Undo entries are the list
// page's, beside the options' own, and its same-named offer reaches dishes
// and options (D-129). The name itself saves through the row's own text
// path; when such a save lands, the page hands the group the option as the
// server now holds it, and the group says what there is to say.

type Props = {
  // The dish page's words with the option's own over them (option-words).
  strings: AllergenStrings;
  editingStrings: EditingStrings;
  code: string;
  listId: string;
  option: OwnerOption;
  // The page's one editing state and one Undo, shared with the options.
  editing: Editing;
  record: (entry: OptionAllergenUndo) => void;
  // The options' words, for problems said with the option's name.
  words: TextWords;
  // The page's sentence for a list that is no longer here.
  gone: string;
  announce: (text: string) => void;
  sameNamed: SameNamedPlace[];
};

export type Undone =
  | { outcome: "applied"; sentence: string | null }
  | { outcome: Exclude<UndoOutcome, "applied">; sentence: string };

export const optionGroupPrefix = (id: string) => `option-${id}`;

export function useOptionAllergens({
  strings,
  editingStrings,
  code,
  listId,
  option,
  editing,
  record,
  words,
  gone,
  announce,
  sameNamed,
}: Props) {
  // Where focus belongs after the group next changes: a row added, a row
  // removed, an Apply that landed. The group's own, since its changes
  // render its own component and not the page (useFocusNext).
  const focusNextRef = useFocusNext();
  const target: AllergenTarget<OptionAllergenUndo> = {
    ids: groupIds(optionGroupPrefix(option.id)),
    subject: { id: option.id, noun: "option", name: option.name },
    writes: {
      allergens: (allergens, shown, carried) =>
        setOptionAllergens(code, listId, option.id, allergens, {
          words: carried ?? "",
          lists: shown,
        }),
      others: (others, shown, carried) =>
        setOptionOtherAllergens(code, listId, option.id, others, {
          words: carried ?? "",
          lists: shown,
        }),
      check: (on, shown, carried) =>
        setOptionAllergenCheck(code, listId, option.id, on, {
          words: carried ?? "",
          lists: shown,
        }),
    },
    entries: {
      make: (change, carried) => wrapChange(change, carried ?? "", option.id),
      read: (entry) => (entry.subject === option.id ? readChange(entry) : null),
    },
    sameNamed: {
      places: sameNamed,
      apply: (place, shown) =>
        applyOptionAllergens(
          code,
          listId,
          option.id,
          { kind: place.kind, id: place.id },
          {
            source: shown,
            target: {
              allergens: [...place.lists.allergens],
              others: [...place.lists.others],
            },
          },
        ),
      undoApply: (entry) =>
        undoOptionAllergensApply(
          code,
          listId,
          { kind: entry.target ?? "dish", id: entry.id },
          entry.before,
          entry.at,
        ),
    },
  };

  const group = useAllergenGroup({
    strings,
    editingStrings,
    editing,
    record,
    words,
    gone,
    announce,
    focusNextRef,
    state: option,
    stateWords: option.name,
    target,
  });

  // A save of the name landed, or an Undo of one: the group learns the
  // option as the server holds it now (D-153, Michael, October 10, 2026).
  // The name and the check are taken from the answer; the lists only when
  // they equal the lists the group last confirmed, since a save of the
  // name carries no lists and its answer can hold lists another tab wrote
  // that this page has never shown (D-154's rule). What the save changed
  // comes back as a sentence: the check it cleared, for the page to say
  // after "Saved." or after the Undo's own sentence.
  function confirmName(next: OwnerOption): string | null {
    const before = group.peek();
    const lists: AllergenLists = {
      allergens: next.allergens,
      others: next.otherAllergens,
    };
    const { clearedCheck } = group.confirm({
      words: next.name,
      lists: sameListsAsStored(lists, before.lists) ? lists : before.lists,
      check: next.check,
    });
    return clearedCheck ? strings.clearedNow : null;
  }

  // Undo of one of the option's entries, in the shape the list's Undo
  // takes.
  async function undo(entry: OptionAllergenUndo): Promise<Undone> {
    const result = await group.reverse(entry);
    return result.ok
      ? { outcome: "applied", sentence: result.sentence }
      : { outcome: result.outcome, sentence: result.sentence };
  }

  return { group, confirmName, undo };
}

export type OptionAllergensState = ReturnType<typeof useOptionAllergens>;
