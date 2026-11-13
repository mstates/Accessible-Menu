"use client";

import {
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { OwnerDishGeneral } from "@/core/supabase/dishes";
import { cleanSizeText, type PriceKind } from "@/domain/dish";
import type { FormError } from "@/ui/Form";
import type { TextWords } from "../editing/list-words";
import type { FocusWanted } from "../editing/useFocusNext";
import {
  generalNotSavedSentence,
  generalProblemText,
  sizeAddedSentence,
  sizeLabel,
  sizeLegend,
  sizeRemovedSentence,
  type DishStrings,
} from "./dish-words";
import type { GeneralPayload } from "./form-actions";
import type { SaveRefused } from "./form-result";
import {
  GENERAL_IDS,
  generalFields,
  sameGeneralFields,
  sizeFieldId,
  sizeRemoveId,
  validateGeneralForm,
  type GeneralFields,
  type GeneralSizeRow,
  type SizePart,
} from "./general-form";
import type { Prepared } from "./useDishForm";

// A dish's General page as one form (D-237): the description, the note,
// the price choice with its one price or its sizes, and the calories are
// the form's state, changed in the page and sent together by Save general.
// Nothing here writes: adding a size, removing one, and choosing or
// arrowing through the price choice change the form only.
//
// What the page showed is fixed when the form mounts. The document the
// reader returned and the fields made from it are captured together and
// never replaced by a later render: a refresh of the page, which Move this
// dish makes, must not put a newer document under fields the owner is
// still looking at, or a Save would carry a version the form never showed
// and write over whatever moved. The Save hands that same document back,
// untouched, and the database compares it with its own read (migration
// 16).
//
// Each price choice keeps what was typed under it for the visit, so
// switching back brings it back (D-127, D-139); a Save checks and writes
// the chosen one alone (Q-171). A size's name in its group's legend and in
// its controls' names is the name as last committed, when the field was
// left, a suggestion chosen, or Enter pressed, never per keystroke, so
// nothing is renamed under the cursor (D-140).

// A row on the page: what its fields hold, and the name its legend and its
// controls carry.
type Row = GeneralSizeRow & { settled: string };

type Captured = {
  // The document as the reader returned it, for the Save to hand back.
  shown: Record<string, unknown>;
  // The same document, read, and the fields made from it.
  general: OwnerDishGeneral["general"];
  fields: GeneralFields;
};

type Props = {
  strings: DishStrings;
  // The dish's words, for a failure said with the dish's name.
  words: TextWords;
  announce: (text: string) => void;
  focusNextRef: RefObject<FocusWanted | null>;
  dish: { id: string; name: string };
  // What item_general() returned for this load.
  general: OwnerDishGeneral;
  errors: FormError[];
  setErrors: Dispatch<SetStateAction<FormError[]>>;
};

function withSettled(rows: readonly GeneralSizeRow[]): Row[] {
  return rows.map((row) => ({
    ...row,
    settled: cleanSizeText("name", row.name),
  }));
}

// The ids of the fields under the price choice, which leave the page when
// the choice changes.
function underPrice(id: string): boolean {
  return (
    id === GENERAL_IDS.price ||
    id === GENERAL_IDS.calories ||
    id.startsWith("dish-size-")
  );
}

export function useGeneralForm({
  strings,
  words,
  announce,
  focusNextRef,
  dish,
  general,
  errors,
  setErrors,
}: Props) {
  const [first] = useState<Captured>(() => ({
    // A plain object: the reader's own document, as it arrived.
    shown: general.raw as Record<string, unknown>,
    general: general.general,
    fields: generalFields(general.general),
  }));
  const [description, setDescription] = useState(first.fields.description);
  const [note, setNote] = useState(first.fields.note);
  const [kind, setKindState] = useState<PriceKind>(first.fields.kind);
  const [price, setPrice] = useState(first.fields.price);
  const [calories, setCalories] = useState(first.fields.calories);
  const [rows, setRows] = useState<Row[]>(() =>
    withSettled(first.fields.sizes),
  );
  const [nextKey, setNextKey] = useState(1);

  const fields: GeneralFields = {
    description,
    note,
    kind,
    price,
    calories,
    sizes: rows.map(({ key, id, name, price: amount, calories: energy }) => ({
      key,
      id,
      name,
      price: amount,
      calories: energy,
    })),
  };
  const dirty = !sameGeneralFields(fields, first.fields);

  function errorOf(id: string): string | null {
    return errors.find((error) => error.id === id)?.message ?? null;
  }

  // A problem whose field leaves the page leaves the summary with it, so
  // no link points at nothing.
  function setKind(next: PriceKind) {
    setKindState(next);
    setErrors((list) => list.filter((error) => !underPrice(error.id)));
  }

  function setSize(key: string, part: SizePart, value: string) {
    setRows((list) =>
      list.map((row) => (row.key === key ? { ...row, [part]: value } : row)),
    );
  }

  // Leaving a size's name cleans it, the way a Save would, and its legend
  // and its controls take the name.
  function commitName(key: string) {
    setRows((list) =>
      list.map((row) => {
        if (row.key !== key) return row;
        const name = cleanSizeText("name", row.name);
        return { ...row, name, settled: name };
      }),
    );
  }

  // A size is added blank, in the form only, and its name takes focus.
  function addSize() {
    const key = `new-${nextKey}`;
    setNextKey(nextKey + 1);
    setRows((list) => [
      ...list,
      { key, id: null, name: "", price: "", calories: "", settled: "" },
    ]);
    focusNextRef.current = { id: sizeFieldId(key, "name"), force: true };
    announce(sizeAddedSentence(strings, rows.length + 1));
  }

  // A size goes on the press, from the form only, with any problem it
  // carried (D-221). Focus goes to the next size's name, or the one
  // before, or to Add a size when none is left.
  function removeSize(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    const row = rows[index];
    if (!row) return;
    const neighbor = rows[index + 1] ?? rows[index - 1];
    focusNextRef.current = {
      id: neighbor ? sizeFieldId(neighbor.key, "name") : GENERAL_IDS.addSize,
      force: true,
    };
    const prefix = `dish-size-${key}-`;
    setErrors((list) => list.filter((error) => !error.id.startsWith(prefix)));
    setRows((list) => list.filter((each) => each.key !== key));
    announce(sizeRemovedSentence(strings, row.settled, index + 1));
  }

  // What Save sends, or the problems that stop it, one a field, in page
  // order. The fields go as typed, every price choice's among them; the
  // server reads them the same way.
  function prepare(): Prepared<GeneralPayload> {
    const check = validateGeneralForm(fields, first.general);
    if (check.next === null) {
      return {
        problems: check.problems.map((problem) => ({
          id: problem.id,
          message: generalProblemText(strings, problem),
        })),
      };
    }
    return { payload: { fields, shown: first.shown } };
  }

  function failureOf(result: SaveRefused): string {
    if (result.status === "moved") return strings.general.moved;
    return generalNotSavedSentence(strings, words, dish.name, result.problem);
  }

  return {
    dirty,
    prepare,
    failureOf,
    description: {
      id: GENERAL_IDS.description,
      value: description,
      error: errorOf(GENERAL_IDS.description),
      onChange: setDescription,
    },
    note: {
      id: GENERAL_IDS.note,
      value: note,
      error: errorOf(GENERAL_IDS.note),
      onChange: setNote,
    },
    kind: { value: kind, set: setKind },
    price: {
      id: GENERAL_IDS.price,
      value: price,
      error: errorOf(GENERAL_IDS.price),
      onChange: setPrice,
    },
    calories: {
      id: GENERAL_IDS.calories,
      value: calories,
      error: errorOf(GENERAL_IDS.calories),
      onChange: setCalories,
    },
    sizes: {
      addId: GENERAL_IDS.addSize,
      add: addSize,
      remove: removeSize,
      rows: rows.map((row, index) => {
        const part = (which: SizePart) => {
          const id = sizeFieldId(row.key, which);
          return {
            id,
            value: row[which],
            error: errorOf(id),
            onChange: (value: string) => setSize(row.key, which, value),
          };
        };
        return {
          key: row.key,
          // "Cup", or "size 2" while it has no name: what its controls
          // carry. And the same for its group's legend, "Size 2".
          label: sizeLabel(strings, row.settled, index + 1),
          legend: sizeLegend(strings, row.settled, index + 1),
          name: { ...part("name"), onCommit: () => commitName(row.key) },
          price: part("price"),
          calories: part("calories"),
          removeId: sizeRemoveId(row.key),
        };
      }),
    },
  };
}

export type GeneralFormState = ReturnType<typeof useGeneralForm>;
