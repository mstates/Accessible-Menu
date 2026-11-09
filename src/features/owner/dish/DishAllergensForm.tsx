"use client";

import { useMemo, useState } from "react";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { AllergenCopy, AllergenLists } from "@/domain/allergens";
import type { OwnerDishDetail } from "@/domain/dish";
import type { FormError } from "@/ui/Form";
import { AllergenGroup } from "../allergens/AllergenGroup";
import type { SameNamedPlace } from "../allergens/allergen-words";
import { groupIds } from "../allergens/target";
import type { EditingStrings } from "../editing/list-words";
import { useFocusNext } from "../editing/useFocusNext";
import { applyDishAllergens } from "./allergen-actions";
import { dishPagePath } from "./dish-pages";
import { dishWords, type DishStrings } from "./dish-words";
import { DishForm } from "./DishForm";
import type { AllergenSaveDetail, SaveResult } from "./form-result";
import { useAllergenForm } from "./useAllergenForm";
import { useDishForm } from "./useDishForm";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  // The hold's words (D-209).
  pendingLabel: string;
  code: string;
  dish: OwnerDishDetail;
  // The diner-facing allergen words, for the sentence diners will read.
  allergenCopy: AllergenCopy;
  // The other allergens the restaurant's dishes and options already name,
  // most used first.
  otherNames: string[];
  // The same-named dishes and options the allergen check names (D-129).
  sameNamed: SameNamedPlace[];
  // The restaurant's time zone, which a check's date is read in, and the
  // page's language.
  timeZone: string;
  lang: string;
  // Save, bound to the restaurant and the dish.
  action: (payload: unknown) => Promise<SaveResult<AllergenSaveDetail>>;
};

const ids = groupIds("dish");

// A dish's Allergens page (D-148, D-149, D-222, D-229): one form, the
// allergen group directly under the h1 that names it, and Save allergens
// at the foot. Add, Remove, and Apply speak through the page's log.
export function DishAllergensForm(props: Props) {
  return (
    <Announcer>
      <AllergensForm {...props} />
    </Announcer>
  );
}

function AllergensForm({
  strings,
  editing: editingStrings,
  pendingLabel,
  code,
  dish,
  allergenCopy,
  otherNames,
  sameNamed,
  timeZone,
  lang,
  action,
}: Props) {
  const announce = useAnnounce();
  const focusNextRef = useFocusNext();
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const page = useAllergenForm({
    strings: strings.allergens,
    editingStrings,
    gone: strings.errors.parentGone,
    words,
    announce,
    focusNextRef,
    ids,
    dish,
    places: sameNamed,
    apply: (place, source: AllergenLists) =>
      applyDishAllergens(
        code,
        dish.id,
        { kind: place.kind, id: place.id },
        {
          source,
          target: {
            allergens: [...place.lists.allergens],
            others: [...place.lists.others],
          },
        },
      ),
    errors,
    setErrors,
  });
  const form = useDishForm({
    action,
    notice: "allergens-saved",
    path: dishPagePath(code, dish.id, "allergens"),
    headingId: ids.heading,
    dirty: page.dirty,
    errors,
    setErrors,
    failureOf: page.failureOf,
    onFailed: page.onFailed,
  });

  // The restaurant's own other allergens first, then the starter list,
  // each once (D-148), as the size names are suggested.
  const suggestions = useMemo(() => {
    const seen = new Set(otherNames.map((name) => name.toLowerCase()));
    return [
      ...otherNames,
      ...strings.allergens.suggestions.filter(
        (name) => !seen.has(name.toLowerCase()),
      ),
    ];
  }, [otherNames, strings.allergens.suggestions]);

  return (
    <DishForm
      strings={strings}
      pendingLabel={pendingLabel}
      submit={strings.allergens.submit}
      form={form}
      onSubmit={() => form.submit(page.prepare())}
    >
      <AllergenGroup
        strings={strings.allergens}
        allergenCopy={allergenCopy}
        group={page.group}
        lead={strings.allergens.groupHint}
        suggestions={suggestions}
        timeZone={timeZone}
        lang={lang}
      />
    </DishForm>
  );
}
