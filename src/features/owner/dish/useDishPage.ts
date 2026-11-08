"use client";

import { startTransition, useMemo, useOptimistic, useState } from "react";
import { useAnnounce } from "@/core/a11y/announcer";
import type { OwnerChoiceList } from "@/domain/choices";
import type { DietaryCopy } from "@/domain/dietary";
import type { ScheduleCopy } from "@/domain/schedule";
import type { TimeCopy } from "@/domain/time";
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
import { problemText, type EditingStrings } from "../editing/list-words";
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
import type { SameNamedPlace } from "../allergens/allergen-words";
import type { ChoiceStrings } from "../choices/choice-words";
import { useChoiceListRows } from "../choices/useChoiceListRows";
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
import type { ShowingNow } from "./schedule-words";
import { useDishAllergens } from "./useDishAllergens";
import { useDishAvailability } from "./useDishAvailability";
import { useDishCookedToOrder } from "./useDishCookedToOrder";
import { useDishSchedule } from "./useDishSchedule";
import { useDishTags } from "./useDishTags";

// A dish's own page (D-111, D-128, D-139): the state and the handlers
// behind its texts, its price choice, its sizes, its allergens (D-148,
// useDishAllergens), its tags, its availability, and its schedule (task 5,
// useDishTags, useDishAvailability, useDishSchedule), its Cooked to order
// mark and its choice lists (task 7, useDishCookedToOrder,
// useChoiceListRows). The page's own texts take no list; it composes the
// same editing state and the same text-commit path (texts.ts) the lists
// use, and its choice lists share them (D-145), so it keeps one queue and
// one saved status for everything on it. The price choice saves on change
// and says "Saved." once, as a field does (D-118); the other choices'
// values stay stored and come back on switching back (Michael, October 7,
// 2026). A size is added blank and takes focus in its name once it lands; a
// remove takes effect at once, on the press, since a size is a part of the
// dish's form (D-221). Sizes keep the places the page showed them in while
// the page is open (holdSizeOrder).

type Props = {
  strings: DishStrings;
  choiceStrings: ChoiceStrings;
  editing: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  // The dish's choice lists, in order, each with how many options it
  // holds (D-166).
  lists: OwnerChoiceList[];
  // The sizes as the server holds them, in price order. Every save ends
  // with a refresh, so this is always the truth.
  sizes: OwnerSize[];
  // The live dishes elsewhere in the restaurant with this dish's name whose
  // lists differ, or which are not checked (D-129).
  sameNamed: SameNamedPlace[];
  // What the server decided the dish's availability is at this render
  // (D-160), the restaurant's zone it decided it in, and its clock, which
  // every time-dependent line on the page reads.
  showing: ShowingNow;
  timeZone: string;
  lang: string;
  now: string;
  dietaryCopy: DietaryCopy;
  scheduleCopy: ScheduleCopy;
  timeCopy: TimeCopy;
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

export function useDishPage({
  strings,
  choiceStrings,
  editing: editingStrings,
  code,
  dish,
  lists,
  sizes,
  sameNamed,
  showing,
  timeZone,
  lang,
  now,
  dietaryCopy,
  scheduleCopy,
  timeCopy,
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

  // The allergen group shares the page's editing state and focus.
  const allergens = useDishAllergens({
    strings,
    editingStrings,
    code,
    dish,
    editing,
    words,
    announce,
    focusNextRef,
    sameNamed,
  });

  // The showing groups share the page's editing state (task 5).
  const tags = useDishTags({
    strings,
    code,
    dish,
    editing,
    words,
    names: dietaryCopy,
  });
  const availability = useDishAvailability({
    strings,
    code,
    dish,
    editing,
    words,
    showing,
    timeZone,
    lang,
    now,
    timeCopy,
  });
  const schedule = useDishSchedule({
    strings,
    code,
    dish,
    editing,
    words,
    announce,
    timeZone,
    lang,
    now,
    scheduleCopy,
    timeCopy,
  });
  const cookedToOrder = useDishCookedToOrder({
    strings,
    code,
    dish,
    editing,
    words,
  });

  // The choice lists share the page's editing state (D-145, D-166).
  const choices = useChoiceListRows({
    strings: choiceStrings,
    editingStrings,
    code,
    home: { kind: "dish", id: dish.id },
    lists,
    shared: editing,
  });

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
      if (allergens.tryAgain(key, failures[key]?.value ?? "")) continue;
      if (tags.tryAgain(key, failures[key]?.value ?? "")) continue;
      if (availability.tryAgain(key, failures[key]?.value ?? "")) continue;
      if (schedule.tryAgain(key, failures[key]?.value ?? "")) continue;
      if (cookedToOrder.tryAgain(key, failures[key]?.value ?? "")) continue;
      if (choices.tryAgainKey(key, failures[key]?.value ?? "")) continue;
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
    allergens,
    tags,
    availability,
    schedule,
    cookedToOrder,
    choices,
    tryAgain,
  };
}

export type DishPageState = ReturnType<typeof useDishPage>;
