"use client";

import {
  US_MAJOR_ALLERGENS,
  type AllergenCopy,
  type AllergenLists,
  type UsMajorAllergen,
} from "@/domain/allergens";
import type { AllergenId } from "@/domain/types";
import { Button } from "@/ui/Button";
import { Checkbox, CheckboxGroup } from "@/ui/CheckboxGroup";
import { ComboBox, suggestionItems } from "@/ui/ComboBox";
import { handToBox } from "../editing/hand-to-box";
import type { TextState } from "../editing/texts";
import {
  applyName,
  dinerSentence,
  dinersReadText,
  otherAction,
  otherSuffix,
  sameNamedLine,
  stampLine,
  type AllergenStrings,
  type SameNamedPlace,
  type StampState,
} from "./allergen-words";
import type { GroupIds } from "./target";

// What the component draws, whichever hook holds it: the group that saves
// as the owner goes (useAllergenGroup, an option's) or the dish's form
// that saves by a press (useAllergenForm, D-229). The shown values are
// the controls'; reads is what the Diners read line and the stamp follow,
// the shown state for a group that saves as it goes and the saved values
// for a form, so what diners read is never ahead of what is saved.
export type AllergenGroupView = {
  ids: GroupIds;
  allergens: {
    shown: readonly AllergenId[];
    set: (id: UsMajorAllergen, on: boolean) => void;
    errorOf: (id: AllergenId) => string | null;
  };
  others: {
    rows: readonly {
      key: number;
      position: number;
      label: string;
      field: TextState;
    }[];
    add: () => void;
    remove: (key: number) => void;
    full: boolean;
  };
  check: {
    shown: boolean;
    set: (on: boolean) => void;
    error: string | null;
  };
  reads: { lists: AllergenLists; checked: boolean; stamp: StampState };
  sameNamed: {
    places: readonly SameNamedPlace[];
    apply: (place: SameNamedPlace) => void;
    // The page holds unsaved changes, so Apply says to save first and
    // sends nothing (D-229).
    dirty: boolean;
    // The last Apply's outcome, as a line under the list.
    result: string | null;
  };
};

type Props = {
  strings: AllergenStrings;
  // The diner-facing words, for the sentence diners will read.
  allergenCopy: AllergenCopy;
  group: AllergenGroupView;
  // The group's heading, where it draws one: an option's names the option
  // under its own h2 (D-166). On a dish's Allergens page the h1 is the
  // heading and carries the group's heading id, so none is passed and none
  // is drawn (D-222, D-225).
  heading?: string;
  // The lead under the heading.
  lead: string;
  // The heading's level: 3 under an option's own h2.
  headingLevel?: 2 | 3;
  // The other allergens the restaurant's dishes and lines already name
  // first, then the starter list, each once.
  suggestions: readonly string[];
  // The restaurant's time zone, which the stamp's date is read in.
  timeZone: string;
  lang: string;
};

// The allergen group (D-128, D-148, D-166), under the heading that names
// it, the page's h1 on a dish's Allergens page (D-222): the nine
// major allergens as boxes, each with a hint under its words; the other
// allergens as rows named by their place, each a field that suggests names
// and a Remove button; one box that checks the list; under it, always, the
// sentence diners will read, from the one builder (D-35, module rule 8),
// as one plain line, the builder's text (D-182), and who checked it and
// when; and, while the subject is checked, a line and a button for each
// same-named dish or option elsewhere in the restaurant (D-129). The check box is
// described by its hint, by that sentence, which is always on the page, so
// nothing ever points at a gone id (D-147), and by its error while one
// stands. Everything saves through the page's one queue and status
// (D-111).
export function AllergenGroup({
  strings,
  allergenCopy,
  group,
  heading,
  lead,
  headingLevel = 2,
  suggestions,
  timeZone,
  lang,
}: Props) {
  const { ids } = group;
  const sentence = dinerSentence(
    allergenCopy,
    group.reads.lists,
    group.reads.checked,
  );
  const stamp = stampLine(strings, group.reads.stamp, timeZone, lang);
  const line = `${dinersReadText(strings, sentence)} ${stamp}`;
  const shownMajors = new Set<string>(group.allergens.shown);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <div className="mt-8 flex flex-col gap-6">
      {heading !== undefined ? (
        <Heading id={ids.heading} className="text-xl font-bold">
          {heading}
        </Heading>
      ) : null}

      {/* The lead for the whole group, as a plain paragraph: tied to the
          group, React Aria would read it with every box as well. */}
      <p className="text-foreground-muted">{lead}</p>

      <CheckboxGroup
        label={strings.groupLabel}
        value={[...group.allergens.shown]}
        onChange={(values) => {
          const next = new Set(values);
          for (const id of US_MAJOR_ALLERGENS) {
            if (shownMajors.has(id) !== next.has(id)) {
              group.allergens.set(id, next.has(id));
            }
          }
        }}
      >
        {US_MAJOR_ALLERGENS.map((id) => {
          const error = group.allergens.errorOf(id);
          const errorId = `${ids.box(id)}-error`;
          return (
            <div
              key={id}
              id={ids.box(id)}
              role="presentation"
              tabIndex={-1}
              className="flex flex-col outline-none"
              onFocus={handToBox}
            >
              <Checkbox
                value={id}
                description={strings.hints[id]}
                aria-describedby={error ? errorId : undefined}
                validationBehavior="aria"
                isInvalid={error ? true : undefined}
              >
                {strings.names[id]}
              </Checkbox>
              {error ? (
                <span id={errorId} className="pl-9 text-sm font-semibold">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
      </CheckboxGroup>

      <div className="flex flex-col gap-4">
        {group.others.rows.length > 0 ? (
          <ol aria-label={strings.othersLabel} className="flex flex-col gap-4">
            {group.others.rows.map((row) => (
              <li
                key={row.key}
                className="flex flex-col gap-3 rounded border border-border p-4"
              >
                <ComboBox
                  id={row.field.id}
                  label={strings.otherLabel}
                  labelSuffix={otherSuffix(strings, row.position)}
                  buttonLabel={otherAction(
                    strings,
                    strings.showOtherNames,
                    row.label,
                  )}
                  description={strings.otherHint}
                  items={suggestionItems(suggestions)}
                  value={row.field.value}
                  onChange={row.field.onChange}
                  onCommit={row.field.onCommit}
                  isInvalid={row.field.error ? true : undefined}
                  errorMessage={row.field.error ?? undefined}
                />
                <div>
                  <Button
                    id={ids.otherButton(row.key)}
                    aria-label={otherAction(
                      strings,
                      strings.removeOther,
                      row.label,
                    )}
                    onPress={() => group.others.remove(row.key)}
                  >
                    {strings.removeOther}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <div>
          <Button
            id={ids.addOther}
            aria-disabled={group.others.full ? true : undefined}
            onPress={group.others.add}
          >
            {strings.addOther}
          </Button>
        </div>
      </div>

      <div
        id={ids.check}
        role="presentation"
        tabIndex={-1}
        className="flex flex-col gap-2 outline-none"
        onFocus={handToBox}
      >
        <Checkbox
          isSelected={group.check.shown}
          onChange={(on) => group.check.set(on)}
          description={strings.checkHint}
          aria-describedby={
            group.check.error
              ? `${ids.sentence} ${ids.check}-error`
              : ids.sentence
          }
          validationBehavior="aria"
          isInvalid={group.check.error ? true : undefined}
        >
          {strings.checkLabel}
        </Checkbox>
        {group.check.error ? (
          <span
            id={`${ids.check}-error`}
            className="pl-9 text-sm font-semibold"
          >
            {group.check.error}
          </span>
        ) : null}
        {/* One text node, so a screen reader reads the line as one stop,
            as on the diner page (D-182). */}
        <p id={ids.sentence} className="pl-9">
          {line}
        </p>
      </div>

      {group.sameNamed.places.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {group.sameNamed.places.map((place) => (
            <li key={place.id} className="flex flex-col gap-2">
              <p>{sameNamedLine(strings, place)}</p>
              <div>
                <Button
                  id={ids.apply(place.id)}
                  aria-label={applyName(strings, place)}
                  aria-disabled={group.sameNamed.dirty ? true : undefined}
                  onPress={() => group.sameNamed.apply(place)}
                >
                  {strings.sameNamed.apply}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {group.sameNamed.result !== null ? <p>{group.sameNamed.result}</p> : null}
    </div>
  );
}

export { dinersReadText };
