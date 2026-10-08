"use client";

import {
  startTransition,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { useAnnounce } from "@/core/a11y/announcer";
import {
  cleanDishText,
  cleanSizeText,
  DISH_TEXTS,
  dishTextProblem,
  holdSizeOrder,
  SIZE_TEXTS,
  sizeTextProblem,
  type DishText,
  type OwnerDishDetail,
  type OwnerSize,
  type PriceKind,
  type SizeText,
} from "@/domain/dish";
import { nameTaken } from "@/domain/menu";
import {
  problemText,
  type EditingStrings,
  type ListProblem,
} from "../editing/list-words";
import {
  commitText,
  textOf,
  type TextEditor,
  type TextHome,
  type TextState,
} from "../editing/texts";
import {
  afterUndo,
  newestUndo,
  pushUndo,
  type UndoOutcome,
} from "../editing/undo";
import { useEditing } from "../editing/useEditing";
import { useUndoStack } from "../editing/useUndoStack";
import {
  addSize as addSizeAction,
  moveDishBack,
  removeSize as removeSizeAction,
  restoreSize,
  setDishPriceKind,
  setDishText,
  setSizeText,
} from "./actions";
import type { SameNamedPlace } from "./allergen-words";
import {
  dishUndoSchema,
  dishWords,
  kindNotSavedSentence,
  moveNotUndone,
  moveUndoneSentence,
  notAddedSentence,
  notRemovedSentence,
  notUndoneSentence,
  sizeAddedSentence,
  sizeLabel,
  sizeRemovedSentence,
  sizeWords,
  undoLabel,
  undoneSentence,
  type DishStrings,
  type DishUndo,
  type TextUndo,
} from "./dish-words";
import { useDishAllergens } from "./useDishAllergens";

// A dish's own page (D-111, D-128, D-139): the state and the handlers
// behind its texts, its price choice, its sizes, its allergens (D-148,
// useDishAllergens), and its Undo. The page has texts and no list, so it
// does not use the shared list; it composes the same editing state, the
// same Undo stack, and the same text-commit path (texts.ts) the lists use,
// and keeps one queue, one saved status, and one Undo for everything on
// it. The price choice saves on change and says "Saved." once, as a field
// does (D-118); the other choices' values stay stored and come back on
// switching back (Michael, October 7, 2026). A size is added blank and
// takes focus in its name once it lands; a remove takes effect at once,
// with Undo. Sizes keep the places the page showed them in while the page
// is open (holdSizeOrder).

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  // The sizes as the server holds them, in price order. Every save ends
  // with a refresh, so this is always the truth.
  sizes: OwnerSize[];
  // The live dishes elsewhere in the restaurant with this dish's name whose
  // lists differ, or which are not checked (D-129).
  sameNamed: SameNamedPlace[];
  // Says a sentence once the page shows the dish in that section.
  sayOnceIn: (sectionId: string, sentence: string) => void;
};

const KIND_KEY = "kind";
export const KIND_ID = "dish-kind";
export const ADD_SIZE_ID = "dish-size-add";
const ownKey = (field: DishText) => `own:${field}`;
const ownId = (field: DishText) => `dish-own-${field}`;
const sizeKey = (id: string, field: SizeText) => `size:${id}:${field}`;
export const sizeFieldId = (id: string, field: SizeText) =>
  `dish-size-${id}-${field}`;
export const sizeButtonId = (id: string) => `dish-size-${id}-remove`;

type Order = {
  // The sizes this order was made for.
  sizes: OwnerSize[];
  // The ids in the order the page shows.
  ids: string[];
  // An order to return to once the server shows a restored size again.
  wanted: string[] | null;
};

export function useDishPage({
  strings,
  editing: editingStrings,
  code,
  dish,
  sizes,
  sameNamed,
  sayOnceIn,
}: Props) {
  const announce = useAnnounce();
  const editing = useEditing(editingStrings);
  const undo = useUndoStack(`undo:${code}:dish:${dish.id}`, dishUndoSchema);
  const editor: TextEditor<DishUndo> = { editing, undo };
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const sizeTextWords = useMemo(
    () => sizeWords(strings, editingStrings),
    [strings, editingStrings],
  );

  // The price choice as shown: the saved one, or the one just chosen while
  // its save is on its way; a failed save falls back by itself.
  const [shownKind, showKind] = useOptimistic(
    dish.priceKind,
    (_current: PriceKind, next: PriceKind) => next,
  );

  // The order the sizes are shown in: price order on arrival, held while
  // the page is open. Each new list from the server keeps the places the
  // page shows and adds new sizes last.
  const [order, setOrder] = useState<Order>(() => ({
    sizes,
    ids: sizes.map((size) => size.id),
    wanted: null,
  }));
  if (order.sizes !== sizes) {
    setOrder({
      sizes,
      ids: holdSizeOrder(order.wanted ?? order.ids, sizes),
      wanted: null,
    });
  }
  const bySize = new Map(sizes.map((size) => [size.id, size]));
  const ordered = order.ids.flatMap((id) => {
    const size = bySize.get(id);
    return size ? [size] : [];
  });
  // A removed size leaves at once and comes back by itself if the save
  // fails.
  const [shownSizes, dropSize] = useOptimistic(
    ordered,
    (list: OwnerSize[], id: string) => list.filter((size) => size.id !== id),
  );

  // Where focus belongs after the page next changes: the name of a size
  // just added, a neighbor's name after a remove, as the list hook does.
  const focusNext = useRef<{ id: string; force: boolean } | null>(null);
  useLayoutEffect(() => {
    const wanted = focusNext.current;
    if (!wanted) return;
    const element = document.getElementById(wanted.id);
    const active = document.activeElement;
    if (wanted.force) {
      if (!element) return;
      focusNext.current = null;
      if (active !== element) element.focus();
      return;
    }
    if (active === element) return;
    if (active === null || active === document.body) element?.focus();
    else focusNext.current = null;
  });

  // The allergen group shares the page's editing state, Undo, and focus.
  const allergens = useDishAllergens({
    strings,
    editingStrings,
    code,
    dish,
    editor,
    words,
    announce,
    focusNextRef: focusNext,
    sameNamed,
  });

  function labelOf(size: OwnerSize, index: number): string {
    return sizeLabel(strings, size, index + 1);
  }

  // The dish's own texts live on the page and save through its actions.
  function ownHome(): TextHome<DishText, DishUndo> {
    return {
      row: { id: dish.id, name: dish.name },
      words,
      key: ownKey,
      id: ownId,
      saved: (field) => dish[field],
      clean: cleanDishText,
      rule: dishTextProblem,
      taken: () => null,
      send: (field, value) => setDishText(code, dish.id, field, value),
      entry: (field, from, to) => ({
        kind: "own",
        field,
        id: dish.id,
        name: dish.name,
        from,
        to,
      }),
    };
  }

  // A size's texts live in its row. A name another size of the dish has is
  // refused before it is sent, as a row's name is; a blank name is no name
  // and collides with nothing.
  function sizeHome(
    size: OwnerSize,
    label: string,
  ): TextHome<SizeText, DishUndo> {
    return {
      row: { id: size.id, name: label },
      words: sizeTextWords,
      key: (field) => sizeKey(size.id, field),
      id: (field) => sizeFieldId(size.id, field),
      saved: (field) => size[field],
      clean: cleanSizeText,
      rule: sizeTextProblem,
      taken: (field, value) =>
        field === "name" && value !== ""
          ? nameTaken(shownSizes, size.id, value)
          : null,
      send: (field, value) => setSizeText(code, dish.id, size.id, field, value),
      entry: (field, from, to) => ({
        kind: "size-text",
        field,
        id: size.id,
        size: label,
        from,
        to,
      }),
    };
  }

  // The price choice changed. It saves at once, through the page's queue,
  // and says "Saved." once when it lands (D-118). Try again passes force
  // with the choice that failed.
  function setKind(next: PriceKind, force = false) {
    const saved = dish.priceKind;
    if (next === saved && !force) {
      editing.reset(KIND_KEY);
      return;
    }
    editing.sending(KIND_KEY, next);
    startTransition(async () => {
      showKind(next);
      await editing.run(async () => {
        const result = await editing.call(() =>
          setDishPriceKind(code, dish.id, next),
        );
        editing.answered(KIND_KEY);
        if (!result.ok) {
          editing.failField(KIND_KEY, {
            fieldId: KIND_ID,
            problem: problemText(words, result.problem, dish.name),
            sentence: kindNotSavedSentence(
              strings,
              words,
              dish.name,
              result.problem,
            ),
            value: next,
          });
          return;
        }
        editing.landedField(KIND_KEY, null);
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "kind",
            id: dish.id,
            name: dish.name,
            from: saved,
            to: result.value.priceKind,
          }),
        );
      });
    });
  }

  // A size is added blank, and its name takes focus once it lands.
  function addSize() {
    startTransition(async () => {
      await editing.run(async () => {
        const result = await editing.call(() => addSizeAction(code, dish.id));
        if (!result.ok) {
          editing.failChange(notAddedSentence(strings, words, result.problem));
          return;
        }
        const { size, total } = result.value;
        focusNext.current = { id: sizeFieldId(size.id, "name"), force: true };
        editing.landed();
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "size-add",
            id: size.id,
            size: sizeLabel(strings, size, total),
          }),
        );
        announce(sizeAddedSentence(strings, total));
      });
    });
  }

  // A size goes at once, with Undo. Focus goes to the next size's name, or
  // to Add a size when none is left; a remove that fails puts it back on
  // the button that asked.
  function removeSize(size: OwnerSize, index: number) {
    const label = labelOf(size, index);
    const ids = shownSizes.map((entry) => entry.id);
    const neighbor = shownSizes[index + 1] ?? shownSizes[index - 1];
    focusNext.current = {
      id: neighbor ? sizeFieldId(neighbor.id, "name") : ADD_SIZE_ID,
      force: true,
    };
    announce(sizeRemovedSentence(strings, label));
    startTransition(async () => {
      dropSize(size.id);
      await editing.run(async () => {
        const result = await editing.call(() =>
          removeSizeAction(code, dish.id, size.id, false),
        );
        if (!result.ok) {
          focusNext.current = { id: sizeButtonId(size.id), force: true };
          editing.failChange(
            notRemovedSentence(strings, words, label, result.problem),
          );
          return;
        }
        for (const field of SIZE_TEXTS)
          editing.dropField(sizeKey(size.id, field));
        editing.landed();
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "size-remove",
            id: size.id,
            size: label,
            order: ids,
          }),
        );
      });
    });
  }

  type Reversed =
    | { ok: true; sentence: string | null }
    | { ok: false; outcome: Exclude<UndoOutcome, "applied">; sentence: string };

  function notReversed(entry: TextUndo, problem: ListProblem): Reversed {
    return {
      ok: false,
      ...notUndoneSentence(strings, editingStrings, words, entry, problem),
    };
  }

  // The inverse of one change.
  async function reverse(entry: DishUndo): Promise<Reversed> {
    switch (entry.kind) {
      case "own": {
        const result = await editing.call(() =>
          setDishText(code, dish.id, entry.field, entry.from, entry.to),
        );
        return result.ok
          ? { ok: true, sentence: undoneSentence(strings, entry) }
          : notReversed(entry, result.problem);
      }
      case "kind": {
        const result = await editing.call(() =>
          setDishPriceKind(code, dish.id, entry.from, entry.to),
        );
        return result.ok
          ? { ok: true, sentence: undoneSentence(strings, entry) }
          : notReversed(entry, result.problem);
      }
      case "size-text": {
        const result = await editing.call(() =>
          setSizeText(
            code,
            dish.id,
            entry.id,
            entry.field,
            entry.from,
            entry.to,
          ),
        );
        return result.ok
          ? { ok: true, sentence: undoneSentence(strings, entry) }
          : notReversed(entry, result.problem);
      }
      case "size-add": {
        // Undo never deletes content: the size goes only while it is
        // blank, and the database says if it holds something now (D-119).
        const result = await editing.call(() =>
          removeSizeAction(code, dish.id, entry.id, true),
        );
        if (!result.ok) return notReversed(entry, result.problem);
        for (const field of SIZE_TEXTS)
          editing.dropField(sizeKey(entry.id, field));
        return { ok: true, sentence: undoneSentence(strings, entry) };
      }
      case "size-remove": {
        const result = await editing.call(() =>
          restoreSize(code, dish.id, entry.id),
        );
        if (!result.ok) return notReversed(entry, result.problem);
        // Back in the place the page showed it, once the server shows it.
        setOrder((current) => ({
          sizes: current.sizes,
          ids: holdSizeOrder(entry.order, current.sizes),
          wanted: entry.order,
        }));
        return { ok: true, sentence: undoneSentence(strings, entry) };
      }
      case "relocate": {
        const result = await editing.call(() =>
          moveDishBack(code, dish.id, entry.from.id, entry.from.order),
        );
        if (!result.ok) {
          return {
            ok: false,
            ...moveNotUndone(
              strings.move,
              editingStrings,
              strings.errors.parentGone,
              entry,
              result.problem,
            ),
          };
        }
        sayOnceIn(
          entry.from.id,
          moveUndoneSentence(
            strings.move,
            entry,
            result.value.position || entry.from.order.indexOf(entry.id) + 1,
            result.value.total || entry.from.order.length,
          ),
        );
        return { ok: true, sentence: null };
      }
      case "allergen":
      case "others":
      case "check":
      case "apply":
        return allergens.reverse(entry);
    }
  }

  // Undo waits for saves on their way, then takes back the newest change,
  // in the same queue as every save. A change that no longer stands is
  // dropped; one blocked by a taken name keeps its entry; either way it
  // says so.
  function undoNewest() {
    if (editing.peek().inFlight === 0 && !newestUndo(undo.peek())) {
      announce(editingStrings.nothingToUndo);
      return;
    }
    startTransition(async () => {
      await editing.run(async () => {
        const entry = newestUndo(undo.peek());
        if (!entry) {
          announce(editingStrings.nothingToUndo);
          return;
        }
        const result = await reverse(entry);
        if (result.ok) {
          undo.replace(afterUndo(undo.peek(), "applied"));
          editing.landed();
          if (result.sentence !== null) announce(result.sentence);
          return;
        }
        undo.replace(afterUndo(undo.peek(), result.outcome));
        editing.failChange(result.sentence);
      });
    });
  }

  // Focus goes to the first failed field, and every failed field is sent
  // again: the price choice with the choice that failed, a text with the
  // value that failed.
  function tryAgain() {
    editing.focusFirstFailed();
    const { failures } = editing.peek();
    for (const key of Object.keys(failures)) {
      if (allergens.tryAgain(key, failures[key]?.value ?? "")) continue;
      if (key === KIND_KEY) {
        const failed = failures[key]?.value;
        if (failed === "one" || failed === "sizes" || failed === "market") {
          setKind(failed, true);
        }
        continue;
      }
      const own = DISH_TEXTS.find((field) => ownKey(field) === key);
      if (own) {
        commitText(editor, ownHome(), own, true);
        continue;
      }
      shownSizes.forEach((size, index) => {
        const field = SIZE_TEXTS.find(
          (candidate) => sizeKey(size.id, candidate) === key,
        );
        if (field) {
          commitText(editor, sizeHome(size, labelOf(size, index)), field, true);
        }
      });
    }
  }

  const newest = newestUndo(undo.stack);

  return {
    editing,
    words,
    undoText: newest ? undoLabel(strings, newest) : null,
    own: {
      fieldOf: (field: DishText): TextState => textOf(editor, ownHome(), field),
    },
    kind: {
      value: shownKind,
      set: setKind,
      error: editing.failures[KIND_KEY]?.problem ?? null,
    },
    sizes: {
      shown: shownSizes,
      labelOf,
      fieldOf: (size: OwnerSize, index: number, field: SizeText): TextState =>
        textOf(editor, sizeHome(size, labelOf(size, index)), field),
      add: addSize,
      remove: removeSize,
    },
    allergens,
    undoNewest,
    tryAgain,
    // A change the page made that is not a text's goes on the same Undo
    // stack: the move.
    record: (entry: DishUndo) => undo.replace(pushUndo(undo.peek(), entry)),
  };
}

export type DishPageState = ReturnType<typeof useDishPage>;
