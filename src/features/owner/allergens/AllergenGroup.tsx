"use client";

import { Fragment, type FocusEvent } from "react";
import {
  US_MAJOR_ALLERGENS,
  type AllergenCopy,
  type AllergenSentence,
} from "@/domain/allergens";
import { Button } from "@/ui/Button";
import { Checkbox, CheckboxGroup } from "@/ui/CheckboxGroup";
import { ComboBox } from "@/ui/ComboBox";
import {
  applyName,
  dinerSentence,
  dinersReadText,
  otherAction,
  otherSuffix,
  sameNamedLine,
  stampLine,
  type AllergenStrings,
} from "./allergen-words";
import {
  ADD_OTHER_ID,
  allergenBoxId,
  applyButtonId,
  CHECK_ID,
  otherButtonId,
  type AllergenGroupState,
} from "./useDishAllergens";

type Props = {
  strings: AllergenStrings;
  // The diner-facing words, for the sentence diners will read.
  allergenCopy: AllergenCopy;
  group: AllergenGroupState;
  // The other allergens the restaurant's dishes already name first, then
  // the starter list, each once.
  suggestions: readonly string[];
  // The restaurant's time zone, which the stamp's date is read in.
  timeZone: string;
  lang: string;
};

const HEADING_ID = "dish-allergens-heading";
const SENTENCE_ID = "dish-allergen-sentence";

// A wrapper that takes a failed save's focus and hands it to the box
// inside, so a reader hears the box and its state (the price group's
// pattern, D-143).
function handToBox(event: FocusEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  event.currentTarget
    .querySelector<HTMLInputElement>('input[type="checkbox"]')
    ?.focus();
}

// The allergen group on a dish's page (D-128, D-148), under its own
// heading: the nine major allergens as boxes, each with a hint under its
// words; the other allergens as rows named by their place, each a field
// that suggests names and a Remove button; one box that checks the list;
// under it, always, the sentence diners will read, from the one builder
// (D-35, module rule 8), with the words in bold as the diner page draws
// them, and who checked it and when; and, while the dish is checked, a
// line and a button for each same-named dish elsewhere in the restaurant
// (D-129). The check box is described by its hint, by that sentence, which
// is always on the page, so nothing ever points at a gone id (D-147), and
// by its error while one stands. Everything saves through the page's one
// queue, status, and Undo (D-111).
export function DishAllergens({
  strings,
  allergenCopy,
  group,
  suggestions,
  timeZone,
  lang,
}: Props) {
  const sentence = dinerSentence(allergenCopy, group.lists, group.check.shown);
  const stamp = stampLine(strings, group.check.stamp, timeZone, lang);
  const shownMajors = new Set<string>(group.allergens.shown);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <h2 id={HEADING_ID} className="text-xl font-bold">
        {strings.heading}
      </h2>

      {/* The lead for the whole group, as a plain paragraph: tied to the
          group, React Aria would read it with every box as well. */}
      <p className="text-foreground-muted">{strings.groupHint}</p>

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
          const errorId = `${allergenBoxId(id)}-error`;
          return (
            <div
              key={id}
              id={allergenBoxId(id)}
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
                  suggestions={suggestions}
                  value={row.field.value}
                  onChange={row.field.onChange}
                  onCommit={row.field.onCommit}
                  isInvalid={row.field.error ? true : undefined}
                  errorMessage={row.field.error ?? undefined}
                />
                <div>
                  <Button
                    id={otherButtonId(row.key)}
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
            id={ADD_OTHER_ID}
            aria-disabled={group.others.full ? true : undefined}
            onPress={group.others.add}
          >
            {strings.addOther}
          </Button>
        </div>
      </div>

      <div
        id={CHECK_ID}
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
            group.check.error ? `${SENTENCE_ID} ${CHECK_ID}-error` : SENTENCE_ID
          }
          validationBehavior="aria"
          isInvalid={group.check.error ? true : undefined}
        >
          {strings.checkLabel}
        </Checkbox>
        {group.check.error ? (
          <span id={`${CHECK_ID}-error`} className="pl-9 text-sm font-semibold">
            {group.check.error}
          </span>
        ) : null}
        <p id={SENTENCE_ID} className="pl-9">
          <DinersRead strings={strings} sentence={sentence} /> {stamp}
        </p>
      </div>

      {group.sameNamed.places.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {group.sameNamed.places.map((place) => (
            <li key={place.id} className="flex flex-col gap-2">
              <p>{sameNamedLine(strings, place)}</p>
              <div>
                <Button
                  id={applyButtonId(place.id)}
                  aria-label={applyName(strings, place)}
                  onPress={() => group.sameNamed.apply(place)}
                >
                  {strings.sameNamed.apply}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// 'Diners read: "Contains milk, wheat."', with the allergen words in bold,
// as the diner page draws them (D-35). Its text is exactly the words a
// reader is handed as the check box's description. This is that
// rendering's second use (the diner page's AllergenLine is the first); the
// third lifts it to src/ui (module rule 12).
function DinersRead({
  strings,
  sentence,
}: {
  strings: AllergenStrings;
  sentence: AllergenSentence;
}) {
  const [before = "", after = ""] = strings.dinersRead.split("{sentence}");
  const words =
    sentence.kind === "contains" ? (
      <>
        {sentence.lead}{" "}
        {sentence.words.map((word, index) => (
          <Fragment key={`${index}-${word}`}>
            {index > 0 ? ", " : null}
            <strong>{word}</strong>
          </Fragment>
        ))}
        {"."}
      </>
    ) : (
      sentence.text
    );
  return (
    <>
      {before}
      {words}
      {after}
    </>
  );
}

export { dinersReadText };
