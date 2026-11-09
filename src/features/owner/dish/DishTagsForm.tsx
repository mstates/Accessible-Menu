"use client";

import { useMemo, useState } from "react";
import { fill } from "@/copy/fill";
import {
  dietarySentence,
  sameTags,
  toggleTag,
  type DietaryCopy,
} from "@/domain/dietary";
import type { OwnerDishDetail } from "@/domain/dish";
import type { DietaryTagId } from "@/domain/types";
import type { FormError } from "@/ui/Form";
import {
  failureSentence,
  problemText,
  type EditingStrings,
} from "../editing/list-words";
import { dishPagePath } from "./dish-pages";
import { dishWords, type DishStrings } from "./dish-words";
import {
  DishCookedToOrder,
  type DishCookedToOrderView,
} from "./DishCookedToOrder";
import { DishForm } from "./DishForm";
import { DishTags, type DishTagsView } from "./DishTags";
import type { TagsPayload } from "./form-actions";
import type { SaveResult } from "./form-result";
import {
  COOKED_TO_ORDER_HEADING_ID,
  COOKED_TO_ORDER_ID,
  TAGS_HEADING_ID,
} from "./showing-ids";
import { useDishForm } from "./useDishForm";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  // The hold's words (D-209).
  pendingLabel: string;
  code: string;
  dish: OwnerDishDetail;
  dietaryCopy: DietaryCopy;
  // Save, bound to the restaurant and the dish.
  action: (payload: unknown) => Promise<SaveResult>;
};

// A dish's Dietary tags page (D-66, D-167, D-222, D-229): one form, the
// three tags directly under the h1 that names them, Cooked to order under
// its own heading, and Save dietary tags at the foot. The sentence diners
// read follows the saved tags. Nothing on the page speaks, so it has no
// log: a tick is heard as the box's state, and Save's outcome is the new
// page or the focused summary.
export function DishTagsForm({
  strings,
  editing: editingStrings,
  pendingLabel,
  code,
  dish,
  dietaryCopy,
  action,
}: Props) {
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const [tags, setTags] = useState<DietaryTagId[]>(() => [...dish.tags]);
  const [cooked, setCooked] = useState(dish.cookedToOrder);
  const dirty = !sameTags(tags, dish.tags) || cooked !== dish.cookedToOrder;
  const form = useDishForm<TagsPayload>({
    action,
    notice: "tags-saved",
    path: dishPagePath(code, dish.id, "tags"),
    headingId: TAGS_HEADING_ID,
    dirty,
    errors,
    setErrors,
    failureOf: (result) =>
      result.status === "moved"
        ? strings.tags.tagsMoved
        : failureSentence(
            fill(strings.tags.notSaved, { dish: dish.name }),
            problemText(words, result.problem, dish.name),
          ),
  });

  const tagsView: DishTagsView = {
    shown: tags,
    set: (id, on) => setTags((list) => toggleTag(list, id, on)),
    errorOf: () => null,
    sentence: dietarySentence(dish.tags, dietaryCopy),
  };
  const cookedView: DishCookedToOrderView = {
    id: COOKED_TO_ORDER_ID,
    headingId: COOKED_TO_ORDER_HEADING_ID,
    shown: cooked,
    set: setCooked,
    error: null,
  };

  return (
    <DishForm
      strings={strings}
      pendingLabel={pendingLabel}
      submit={strings.tags.submit}
      form={form}
      onSubmit={() =>
        form.submit({
          payload: { tags, cookedToOrder: cooked, shownTags: [...dish.tags] },
        })
      }
    >
      <DishTags
        strings={strings.tags}
        names={dietaryCopy}
        tags={tagsView}
        underPageHeading
      />
      <DishCookedToOrder
        strings={strings.cookedToOrder}
        cookedToOrder={cookedView}
      />
    </DishForm>
  );
}
