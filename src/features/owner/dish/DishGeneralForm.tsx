"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { OwnerDishGeneral } from "@/core/supabase/dishes";
import type { OwnerDish } from "@/domain/dish";
import { AreaHeading } from "@/ui/AreaHeading";
import { Button } from "@/ui/Button";
import { ComboBox, suggestionItems } from "@/ui/ComboBox";
import type { FormError } from "@/ui/Form";
import { PageLink } from "@/ui/PageLink";
import { Radio, RadioGroup } from "@/ui/RadioGroup";
import type { SelectGroup } from "@/ui/Select";
import { TextField } from "@/ui/TextField";
import type { EditingStrings } from "../editing/list-words";
import { useFocusNext } from "../editing/useFocusNext";
import { restaurantDishPath } from "../paths";
import { dishPagePath, GENERAL_HEADING_ID } from "./dish-pages";
import {
  dishWords,
  lastDishSentence,
  nextDishLabel,
  sizeAction,
  sizeSuffix,
  type DishStrings,
} from "./dish-words";
import { DishForm } from "./DishForm";
import type { GeneralPayload } from "./form-actions";
import type { SaveResult } from "./form-result";
import { MoveDish } from "./MoveDish";
import { useDishForm } from "./useDishForm";
import { useGeneralForm } from "./useGeneralForm";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  // The hold's words (D-209).
  pendingLabel: string;
  code: string;
  dish: { id: string; name: string };
  section: { id: string; name: string };
  // What the page shows and writes, as item_general() returned it for this
  // load (migration 16).
  general: OwnerDishGeneral;
  // The size names the restaurant's dishes already use, most used first.
  sizeNames: string[];
  // The dish after this one in its section, or null at the last.
  next: OwnerDish | null;
  // The sections the dish can move to, under their menus.
  targets: SelectGroup[];
  // Save, bound to the restaurant and the dish.
  action: (payload: GeneralPayload) => Promise<SaveResult>;
};

// How long after the page shows the dish in its new section its move is
// said: long enough that Next's reading of the new title has begun, too
// short to notice (D-130).
const AFTER_THE_TITLE_MS = 100;

const PRICE_HEADING_ID = "dish-price-heading";

// A dish's General page (D-128, D-139, D-167, D-222, D-237): one form that
// saves by one press. In order (D-236): the link to the next dish, then
// the form, the line that says how it saves, Description with the
// description and the note, Price with the choice and the chosen choice's
// fields, each size a group named by its size, and Save general at its
// foot; then Move this dish, a press of its own outside the form. Add a
// size, Remove, and Move speak through the page's log. The dish's
// allergens, tags, availability with its schedule, and choice lists are on
// their own pages, under the page nav.
//
// The next dish link sits first, not at the foot: a save that lands loads
// the page again at its top, so the walk to the next dish is the page nav
// and no more (Q-172). It is an owner link, so it asks before it leaves
// unsaved changes.
export function DishGeneralForm(props: Props) {
  return (
    <Announcer>
      <GeneralForm {...props} />
    </Announcer>
  );
}

function GeneralForm({
  strings,
  editing: editingStrings,
  pendingLabel,
  code,
  dish,
  section,
  general,
  sizeNames,
  next,
  targets,
  action,
}: Props) {
  // A move changes the page's title, since the title names the section and
  // the menu, and Next's route announcer reads a changed title at once and
  // assertively. So a move owes its sentence until the page shows the dish
  // in its new section, and says it a moment after that, on a timer and not
  // an animation frame (D-130, D-141).
  const announce = useAnnounce();
  const owed = useRef<{ sectionId: string; sentence: string } | null>(null);
  useEffect(() => {
    const due = owed.current;
    if (!due || due.sectionId !== section.id) return;
    const timer = window.setTimeout(() => {
      if (owed.current !== due) return;
      owed.current = null;
      announce(due.sentence);
    }, AFTER_THE_TITLE_MS);
    return () => window.clearTimeout(timer);
  }, [section.id, announce]);
  function sayOnceIn(sectionId: string, sentence: string) {
    owed.current = { sectionId, sentence };
  }

  const focusNextRef = useFocusNext();
  const words = useMemo(
    () => dishWords(strings, editingStrings),
    [strings, editingStrings],
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const [moving, setMoving] = useState(false);
  const page = useGeneralForm({
    strings,
    words,
    announce,
    focusNextRef,
    dish,
    general,
    errors,
    setErrors,
  });
  const form = useDishForm<GeneralPayload>({
    action,
    notice: "general-saved",
    path: dishPagePath(code, dish.id, "general"),
    headingId: GENERAL_HEADING_ID,
    dirty: page.dirty,
    busy: moving,
    errors,
    setErrors,
    failureOf: page.failureOf,
  });

  // The restaurant's own size names first, then the starter list, each
  // once (D-139).
  const suggestions = useMemo(() => {
    const seen = new Set(sizeNames.map((name) => name.toLowerCase()));
    return [
      ...sizeNames,
      ...strings.price.suggestions.filter(
        (name) => !seen.has(name.toLowerCase()),
      ),
    ];
  }, [sizeNames, strings.price.suggestions]);

  const kind = page.kind.value;
  // The dish's own calories sit beside its one price, or alone under
  // Market price; with prices by size each size has its own (D-167).
  const ownCalories = (
    <TextField
      id={page.calories.id}
      label={strings.price.caloriesLabel}
      description={strings.price.caloriesHint}
      value={page.calories.value}
      onChange={page.calories.onChange}
      autoComplete="off"
      isInvalid={page.calories.error ? true : undefined}
      errorMessage={page.calories.error ?? undefined}
    />
  );

  return (
    <>
      {/* The next dish in the section, so typing a section is one pass
          (D-128). */}
      <p className="mt-6">
        {next ? (
          <PageLink
            href={restaurantDishPath(code, next.id)}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            {nextDishLabel(strings, next.name)}
          </PageLink>
        ) : (
          lastDishSentence(strings, section.name)
        )}
      </p>

      <DishForm
        strings={strings}
        pendingLabel={pendingLabel}
        submit={strings.general.submit}
        form={form}
        onSubmit={() => form.submit(page.prepare())}
      >
        <div className="mt-8 flex flex-col gap-4">
          <AreaHeading>{strings.general.descriptionHeading}</AreaHeading>
          <TextField
            id={page.description.id}
            label={strings.descriptionLabel}
            description={strings.descriptionHint}
            multiline
            value={page.description.value}
            onChange={page.description.onChange}
            autoComplete="off"
            isInvalid={page.description.error ? true : undefined}
            errorMessage={page.description.error ?? undefined}
          />
          <TextField
            id={page.note.id}
            label={strings.noteLabel}
            description={strings.noteHint}
            value={page.note.value}
            onChange={page.note.onChange}
            autoComplete="off"
            isInvalid={page.note.error ? true : undefined}
            errorMessage={page.note.error ?? undefined}
          />
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <AreaHeading id={PRICE_HEADING_ID}>
            {strings.price.heading}
          </AreaHeading>
          {/* The group's heading names it. Choosing, or arrowing through
              the choices, changes the form only: Save general sends the
              chosen one (D-237). */}
          <RadioGroup
            aria-labelledby={PRICE_HEADING_ID}
            value={kind}
            onChange={(value) => {
              if (value === "one" || value === "sizes" || value === "market") {
                page.kind.set(value);
              }
            }}
            description={
              kind === "market" ? strings.price.marketHint : undefined
            }
          >
            <Radio value="one">{strings.price.one}</Radio>
            <Radio value="sizes">{strings.price.sizes}</Radio>
            <Radio value="market">{strings.price.market}</Radio>
          </RadioGroup>
          {kind === "one" ? (
            <>
              <TextField
                id={page.price.id}
                label={strings.price.amountLabel}
                description={strings.price.amountHint}
                inputMode="decimal"
                prefix={strings.price.currency}
                value={page.price.value}
                onChange={page.price.onChange}
                autoComplete="off"
                isInvalid={page.price.error ? true : undefined}
                errorMessage={page.price.error ?? undefined}
              />
              {ownCalories}
            </>
          ) : null}
          {kind === "market" ? ownCalories : null}
          {kind === "sizes" ? (
            <>
              {page.sizes.rows.length > 0 ? (
                <ol
                  aria-label={strings.price.sizesLabel}
                  className="flex flex-col gap-4"
                >
                  {page.sizes.rows.map((row) => (
                    <li key={row.key}>
                      {/* Each size is a group named by its size (D-236);
                          its controls keep the size in their own names
                          too (D-140, D-193; Q-173). */}
                      <fieldset className="flex min-w-0 flex-col gap-3 rounded border border-border p-4">
                        <legend className="px-1 font-semibold">
                          {row.legend}
                        </legend>
                        <ComboBox
                          id={row.name.id}
                          label={strings.price.sizeNameLabel}
                          labelSuffix={sizeSuffix(strings, row.label)}
                          buttonLabel={sizeAction(
                            strings,
                            strings.price.showNames,
                            row.label,
                          )}
                          description={strings.price.sizeHint}
                          items={suggestionItems(suggestions)}
                          value={row.name.value}
                          onChange={row.name.onChange}
                          onCommit={row.name.onCommit}
                          isInvalid={row.name.error ? true : undefined}
                          errorMessage={row.name.error ?? undefined}
                        />
                        <TextField
                          id={row.price.id}
                          label={strings.price.sizePriceLabel}
                          labelSuffix={sizeSuffix(strings, row.label)}
                          description={strings.price.amountHint}
                          inputMode="decimal"
                          prefix={strings.price.currency}
                          value={row.price.value}
                          onChange={row.price.onChange}
                          autoComplete="off"
                          isInvalid={row.price.error ? true : undefined}
                          errorMessage={row.price.error ?? undefined}
                        />
                        <TextField
                          id={row.calories.id}
                          label={strings.price.sizeCaloriesLabel}
                          labelSuffix={sizeSuffix(strings, row.label)}
                          description={strings.price.caloriesHint}
                          value={row.calories.value}
                          onChange={row.calories.onChange}
                          autoComplete="off"
                          isInvalid={row.calories.error ? true : undefined}
                          errorMessage={row.calories.error ?? undefined}
                        />
                        <div>
                          <Button
                            id={row.removeId}
                            aria-label={sizeAction(
                              strings,
                              strings.price.removeSize,
                              row.label,
                            )}
                            onPress={() => page.sizes.remove(row.key)}
                          >
                            {strings.price.removeSize}
                          </Button>
                        </div>
                      </fieldset>
                    </li>
                  ))}
                </ol>
              ) : null}
              <div>
                <Button id={page.sizes.addId} onPress={page.sizes.add}>
                  {strings.price.addSize}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DishForm>

      <MoveDish
        strings={strings.move}
        editing={editingStrings}
        pendingLabel={pendingLabel}
        dishGone={strings.errors.parentGone}
        code={code}
        dish={dish}
        targets={targets}
        saveFirst={page.dirty}
        held={form.pending || form.leaving}
        onMoving={setMoving}
        sayOnceIn={sayOnceIn}
      />
    </>
  );
}
