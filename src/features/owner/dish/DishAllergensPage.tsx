"use client";

import { useMemo } from "react";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { AllergenCopy } from "@/domain/allergens";
import type { OwnerDishDetail } from "@/domain/dish";
import { AllergenGroup } from "../allergens/AllergenGroup";
import type { SameNamedPlace } from "../allergens/allergen-words";
import type { EditingStrings } from "../editing/list-words";
import { PageSavedStatus } from "../editing/SavedStatus";
import { useEditing } from "../editing/useEditing";
import { useFocusNext } from "../editing/useFocusNext";
import { dishWords, type DishStrings } from "./dish-words";
import { tryAgainWith } from "./try-again";
import { useDishAllergens } from "./useDishAllergens";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
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
};

// A dish's Allergens page (D-148, D-149, D-222): the allergen group alone,
// directly under the h1 that names it, then the saved status. Everything
// on it shares one queue and one status (D-111).
export function DishAllergensPage(props: Props) {
  return (
    <Announcer>
      <AllergensEditor {...props} />
    </Announcer>
  );
}

function AllergensEditor({
  strings,
  editing: editingStrings,
  code,
  dish,
  allergenCopy,
  otherNames,
  sameNamed,
  timeZone,
  lang,
}: Props) {
  const announce = useAnnounce();
  const editing = useEditing(editingStrings);
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const focusNextRef = useFocusNext();
  const group = useDishAllergens({
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
    <>
      <AllergenGroup
        strings={strings.allergens}
        allergenCopy={allergenCopy}
        group={group}
        lead={strings.allergens.groupHint}
        suggestions={suggestions}
        timeZone={timeZone}
        lang={lang}
      />
      <PageSavedStatus
        strings={editingStrings}
        editing={editing}
        onRetry={() => tryAgainWith(editing, [group.tryAgain])}
      />
    </>
  );
}
