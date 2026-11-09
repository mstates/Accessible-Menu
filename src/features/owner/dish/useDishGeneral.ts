"use client";

import {
  startTransition,
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
import { useConfirmed } from "../editing/confirmed";
import { problemText, type EditingStrings } from "../editing/list-words";
import { SETTLE_MS, settleChoice, type Settle } from "../editing/settle";
import {
  commitText,
  textOf,
  type TextHome,
  type TextState,
} from "../editing/texts";
import { useEditing } from "../editing/useEditing";
import { useFocusNext } from "../editing/useFocusNext";
import {
  addSize as addSizeAction,
  removeSize as removeSizeAction,
  setDishPriceKind,
  setDishText,
  setSizeText,
} from "./actions";
import {
  dishWords,
  kindNotSavedSentence,
  notAddedSentence,
  notRemovedSentence,
  sizeAddedSentence,
  sizeLabel,
  sizeRemovedSentence,
  sizeWords,
  type DishStrings,
} from "./dish-words";

// A dish's General page (D-111, D-128, D-139, D-222): the state and the
// handlers behind its texts, its price choice, and its sizes. The page's
// own texts take no list; it composes the same editing state and the same
// text-commit path (texts.ts) the lists use, so it keeps one queue and one
// saved status for everything on it. The price choice saves once it has
// settled, half a second after the last arrow, and says "Saved." once, as
// a field does (D-118, D-229); a walk that ends on the saved choice sends
// nothing and says nothing. The other choices' values stay stored and
// come back on switching back (Michael, October 7, 2026).
// A size is added blank and takes focus in its name once it lands; a
// remove takes effect at once, on the press, since a size is a part of the
// dish's form (D-221). Sizes keep the places the page showed them in while
// the page is open (holdSizeOrder). The dish's other groups live on their
// own pages (dish-pages.ts), each with its own editing state.

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  // The sizes as the server holds them, in price order. Every save ends
  // with a refresh, so this is always the truth.
  sizes: OwnerSize[];
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
};

export function useDishGeneral({
  strings,
  editing: editingStrings,
  code,
  dish,
  sizes,
}: Props) {
  const announce = useAnnounce();
  const editing = useEditing(editingStrings);
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
  // What the server last confirmed, so a round that starts while the last
  // save is still on its way compares against what was sent, not the
  // stale prop (D-229).
  const confirmedKindRef = useConfirmed(dish.priceKind);
  // The settle itself is made on the first change, in the handler, since
  // its reader of the confirmed choice must not be made in render.
  const settleRef = useRef<Settle<PriceKind> | null>(null);
  // The round on its way, which a change made inside the wait awaits, so
  // the chosen radio shows until the round ends.
  const roundRef = useRef<Promise<void> | null>(null);

  // The order the sizes are shown in: price order on arrival, held while
  // the page is open. Each new list from the server keeps the places the
  // page shows and adds new sizes last.
  const [order, setOrder] = useState<Order>(() => ({
    sizes,
    ids: sizes.map((size) => size.id),
  }));
  if (order.sizes !== sizes) {
    setOrder({ sizes, ids: holdSizeOrder(order.ids, sizes) });
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
  const focusNextRef = useFocusNext();

  function labelOf(size: OwnerSize, index: number): string {
    return sizeLabel(strings, size, index + 1);
  }

  // The dish's own texts live on the page and save through its actions.
  function ownHome(): TextHome<DishText> {
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
    };
  }

  // A size's texts live in its row. A name another size of the dish has is
  // refused before it is sent, as a row's name is; a blank name is no name
  // and collides with nothing.
  function sizeHome(size: OwnerSize, label: string): TextHome<SizeText> {
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
    };
  }

  // One save of the price choice, through the page's queue: "Saved." once
  // when it lands (D-118), the problem under the group when it does not.
  async function sendKind(value: PriceKind) {
    editing.sending(KIND_KEY, value);
    const result = await editing.call(() =>
      setDishPriceKind(code, dish.id, value),
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
        value: value,
      });
      return;
    }
    confirmedKindRef.current = result.value.priceKind;
    editing.landedField(KIND_KEY, null);
  }

  // The price choice changed. The chosen radio shows at once; the save
  // waits for the choice to settle (D-229): the first arrow starts a round
  // in the page's queue, every arrow inside the wait restarts it, and when
  // the wait ends the round sends the last choice, or nothing when the
  // walk ended on the saved one. One round is one run, so a link waits for
  // it and the browser warns while it is on its way, as for any save. Try
  // again passes force with the choice that failed, which sends at once.
  function setKind(next: PriceKind, force = false) {
    if (force) {
      startTransition(async () => {
        showKind(next);
        await editing.run(() => sendKind(next));
      });
      return;
    }
    const settle = (settleRef.current ??= settleChoice<PriceKind>({
      waitMs: SETTLE_MS,
      saved: () => confirmedKindRef.current,
    }));
    const round = settle.choose(next);
    startTransition(async () => {
      showKind(next);
      if (round === null) {
        await roundRef.current;
        return;
      }
      roundRef.current = editing.run(async () => {
        const value = await round;
        if (value === null) {
          editing.reset(KIND_KEY);
          return;
        }
        try {
          await sendKind(value);
        } finally {
          settle.finished(value);
        }
      });
      await roundRef.current;
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
        focusNextRef.current = {
          id: sizeFieldId(size.id, "name"),
          force: true,
        };
        editing.landed();
        announce(sizeAddedSentence(strings, total));
      });
    });
  }

  // A size goes at once, on the press: it is a part of the dish's form, and
  // is typed again in a moment (D-221). Focus goes to the next size's name,
  // or to Add a size when none is left; a remove that fails puts it back on
  // the button that asked.
  function removeSize(size: OwnerSize, index: number) {
    const label = labelOf(size, index);
    const neighbor = shownSizes[index + 1] ?? shownSizes[index - 1];
    focusNextRef.current = {
      id: neighbor ? sizeFieldId(neighbor.id, "name") : ADD_SIZE_ID,
      force: true,
    };
    announce(sizeRemovedSentence(strings, label));
    startTransition(async () => {
      dropSize(size.id);
      await editing.run(async () => {
        const result = await editing.call(() =>
          removeSizeAction(code, dish.id, size.id),
        );
        if (!result.ok) {
          focusNextRef.current = { id: sizeButtonId(size.id), force: true };
          editing.failChange(
            notRemovedSentence(strings, words, label, result.problem),
          );
          return;
        }
        for (const field of SIZE_TEXTS)
          editing.dropField(sizeKey(size.id, field));
        editing.landed();
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
      if (key === KIND_KEY) {
        const failed = failures[key]?.value;
        if (failed === "one" || failed === "sizes" || failed === "market") {
          setKind(failed, true);
        }
        continue;
      }
      const own = DISH_TEXTS.find((field) => ownKey(field) === key);
      if (own) {
        commitText(editing, ownHome(), own, true);
        continue;
      }
      shownSizes.forEach((size, index) => {
        const field = SIZE_TEXTS.find(
          (candidate) => sizeKey(size.id, candidate) === key,
        );
        if (field) {
          commitText(
            editing,
            sizeHome(size, labelOf(size, index)),
            field,
            true,
          );
        }
      });
    }
  }

  return {
    editing,
    words,
    own: {
      fieldOf: (field: DishText): TextState =>
        textOf(editing, ownHome(), field),
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
        textOf(editing, sizeHome(size, labelOf(size, index)), field),
      add: addSize,
      remove: removeSize,
    },
    tryAgain,
  };
}

export type DishGeneralState = ReturnType<typeof useDishGeneral>;
