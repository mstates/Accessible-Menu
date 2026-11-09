"use client";

import { useMemo } from "react";
import { Announcer } from "@/core/a11y/announcer";
import type { DietaryCopy } from "@/domain/dietary";
import type { OwnerDishDetail } from "@/domain/dish";
import type { EditingStrings } from "../editing/list-words";
import { PageSavedStatus } from "../editing/SavedStatus";
import { useEditing } from "../editing/useEditing";
import { dishWords, type DishStrings } from "./dish-words";
import { DishCookedToOrder } from "./DishCookedToOrder";
import { DishTags } from "./DishTags";
import { tryAgainWith } from "./try-again";
import { useDishCookedToOrder } from "./useDishCookedToOrder";
import { useDishTags } from "./useDishTags";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  dietaryCopy: DietaryCopy;
};

// A dish's Dietary tags page (D-66, D-167, D-222): the three tags directly
// under the h1 that names them, Cooked to order under its own heading, then
// the saved status. Everything on it shares one queue and one status
// (D-111).
export function DishTagsPage(props: Props) {
  return (
    <Announcer>
      <TagsEditor {...props} />
    </Announcer>
  );
}

function TagsEditor({
  strings,
  editing: editingStrings,
  code,
  dish,
  dietaryCopy,
}: Props) {
  const editing = useEditing(editingStrings);
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const tags = useDishTags({
    strings,
    code,
    dish,
    editing,
    words,
    names: dietaryCopy,
  });
  const cookedToOrder = useDishCookedToOrder({
    strings,
    code,
    dish,
    editing,
    words,
  });

  return (
    <>
      <DishTags
        strings={strings.tags}
        names={dietaryCopy}
        tags={tags}
        underPageHeading
      />
      <DishCookedToOrder
        strings={strings.cookedToOrder}
        cookedToOrder={cookedToOrder}
      />
      <PageSavedStatus
        strings={editingStrings}
        editing={editing}
        onRetry={() =>
          tryAgainWith(editing, [tags.tryAgain, cookedToOrder.tryAgain])
        }
      />
    </>
  );
}
