"use client";

import { useMemo } from "react";
import { Announcer } from "@/core/a11y/announcer";
import type { AllergenCopy } from "@/domain/allergens";
import type { ChoiceHome, OwnerOption } from "@/domain/choices";
import { ComboBox, suggestionItems } from "@/ui/ComboBox";
import type {
  AllergenStrings,
  SameNamedPlace,
} from "../allergens/allergen-words";
import type { EditingStrings } from "../editing/list-words";
import { RowList } from "../editing/RowList";
import type { ChoiceStrings } from "./choice-words";
import { OptionAllergens } from "./OptionAllergens";
import { useChoiceListPage } from "./useChoiceListPage";

type Props = {
  strings: ChoiceStrings;
  dishAllergenStrings: AllergenStrings;
  editing: EditingStrings;
  code: string;
  list: { id: string; lead: string; home: ChoiceHome };
  siblings: string[];
  options: OwnerOption[];
  sameNamed: Record<string, SameNamedPlace[]>;
  // The diner-facing allergen words, for the sentence diners will read.
  allergenCopy: AllergenCopy;
  // The other allergens the restaurant's dishes and options already name,
  // most used first.
  otherNames: string[];
  timeZone: string;
  lang: string;
};

export const LEAD_FIELD_ID = "option-own-lead";

// A choice list's own page (D-166): the lead first, a combo box with
// suggested leads that keeps any text typed, then the status and Undo,
// then the options, each a row with its name, its added price, its
// calories, its buttons, and its allergen group under them, and the add
// form. Everything on it shares one queue, one status, and one Undo
// (D-111).
export function ChoiceListPage(props: Props) {
  return (
    <Announcer>
      <ChoiceListEditor {...props} />
    </Announcer>
  );
}

function ChoiceListEditor({
  strings,
  dishAllergenStrings,
  editing,
  code,
  list,
  siblings,
  options,
  sameNamed,
  allergenCopy,
  otherNames,
  timeZone,
  lang,
}: Props) {
  const page = useChoiceListPage({
    strings,
    dishAllergenStrings,
    editingStrings: editing,
    code,
    list,
    siblings,
    options,
    sameNamed,
  });
  const { rows } = page;
  const lead = rows.own?.fieldOf("lead");

  // The restaurant's own other allergens first, then the starter list,
  // each once (D-148), as the dish page suggests them.
  const otherSuggestions = useMemo(() => {
    const seen = new Set(otherNames.map((name) => name.toLowerCase()));
    return [
      ...otherNames,
      ...dishAllergenStrings.suggestions.filter(
        (name) => !seen.has(name.toLowerCase()),
      ),
    ];
  }, [otherNames, dishAllergenStrings.suggestions]);

  return (
    <>
      {lead ? (
        <div className="mt-6 flex flex-col gap-4">
          <ComboBox
            id={lead.id}
            label={strings.page.leadLabel}
            buttonLabel={strings.page.showLeads}
            description={strings.page.leadHint}
            items={suggestionItems(strings.page.suggestions)}
            value={lead.value}
            onChange={lead.onChange}
            onCommit={lead.onCommit}
            isInvalid={lead.error ? true : undefined}
            errorMessage={lead.error ?? undefined}
          />
        </div>
      ) : null}
      <RowList
        list={rows}
        drawOwn={false}
        intro={strings.page.optionsLead}
        afterRow={(option) => (
          <OptionAllergens
            strings={page.groupStrings}
            editingStrings={editing}
            allergenCopy={allergenCopy}
            code={code}
            listId={list.id}
            option={option}
            editing={rows.editing}
            record={rows.record}
            words={page.words}
            gone={strings.page.errors.parentGone}
            announce={page.announce}
            sameNamed={page.sameNamedOf(option.id)}
            suggestions={otherSuggestions}
            timeZone={timeZone}
            lang={lang}
            register={page.register}
          />
        )}
      />
    </>
  );
}
