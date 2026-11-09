"use client";

import { useEffect, useMemo, useRef } from "react";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import type { OwnerDish, OwnerDishDetail, OwnerSize } from "@/domain/dish";
import { Button } from "@/ui/Button";
import { ComboBox, suggestionItems } from "@/ui/ComboBox";
import { PageLink } from "@/ui/PageLink";
import { Radio, RadioGroup } from "@/ui/RadioGroup";
import type { SelectGroup } from "@/ui/Select";
import { AutosaveTextField } from "../editing/AutosaveTextField";
import type { EditingStrings } from "../editing/list-words";
import { PageSavedStatus } from "../editing/SavedStatus";
import { restaurantDishPath } from "../paths";
import {
  lastDishSentence,
  nextDishLabel,
  sizeAction,
  sizeSuffix,
  type DishStrings,
} from "./dish-words";
import { MoveDish } from "./MoveDish";
import {
  ADD_SIZE_ID,
  KIND_ID,
  sizeButtonId,
  useDishGeneral,
} from "./useDishGeneral";

type Props = {
  strings: DishStrings;
  editing: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  section: { id: string; name: string };
  // The dish's sizes, in price order, as the server holds them.
  sizes: OwnerSize[];
  // The size names the restaurant's dishes already use, most used first.
  sizeNames: string[];
  // The dish after this one in its section, or null at the last.
  next: OwnerDish | null;
  // The sections the dish can move to, under their menus.
  targets: SelectGroup[];
};

// How long after the page shows the dish in its new section its move is
// said: long enough that Next's reading of the new title has begun, too
// short to notice (D-130).
const AFTER_THE_TITLE_MS = 100;

const PRICE_HEADING_ID = "dish-price-heading";

// A dish's General page (D-128, D-139, D-167, D-222): the description, the
// price group under its heading with calories beside each price, the note,
// the saved status, the link to the next dish, and the move to another
// section (D-129). Everything on it shares one queue and one status
// (D-111). The dish's allergens, tags, availability with its schedule, and
// choice lists are on their own pages, under the page nav.
export function DishGeneral(props: Props) {
  return (
    <Announcer>
      <GeneralEditor {...props} />
    </Announcer>
  );
}

function GeneralEditor({
  strings,
  editing,
  code,
  dish,
  section,
  sizes,
  sizeNames,
  next,
  targets,
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

  const page = useDishGeneral({ strings, editing, code, dish, sizes });

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

  const description = page.own.fieldOf("description");
  const price = page.own.fieldOf("price");
  const calories = page.own.fieldOf("calories");
  const note = page.own.fieldOf("note");
  // The dish's own calories sit beside its one price, or alone under
  // Market price; with prices by size each size has its own (D-167).
  const ownCalories = (
    <AutosaveTextField
      {...calories}
      label={strings.price.caloriesLabel}
      description={strings.price.caloriesHint}
    />
  );

  return (
    <>
      <div className="mt-6 flex flex-col gap-4">
        <AutosaveTextField
          {...description}
          label={strings.descriptionLabel}
          description={strings.descriptionHint}
          multiline
        />
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <h2 id={PRICE_HEADING_ID} className="text-xl font-bold">
          {strings.price.heading}
        </h2>
        {/* The group's heading names it. A failed save of the choice points
            focus here, and the wrapper hands it to the chosen radio, so a
            reader hears the group and the choice. */}
        <div
          id={KIND_ID}
          role="presentation"
          tabIndex={-1}
          className="outline-none"
          onFocus={(event) => {
            if (event.target !== event.currentTarget) return;
            event.currentTarget
              .querySelector<HTMLInputElement>('input[type="radio"]:checked')
              ?.focus();
          }}
        >
          <RadioGroup
            aria-labelledby={PRICE_HEADING_ID}
            value={page.kind.value}
            onChange={(value) => {
              if (value === "one" || value === "sizes" || value === "market") {
                page.kind.set(value);
              }
            }}
            description={
              page.kind.value === "market"
                ? strings.price.marketHint
                : undefined
            }
            validationBehavior="aria"
            isInvalid={page.kind.error ? true : undefined}
            errorMessage={page.kind.error ?? undefined}
          >
            <Radio value="one">{strings.price.one}</Radio>
            <Radio value="sizes">{strings.price.sizes}</Radio>
            <Radio value="market">{strings.price.market}</Radio>
          </RadioGroup>
        </div>
        {page.kind.value === "one" ? (
          <>
            <AutosaveTextField
              {...price}
              label={strings.price.amountLabel}
              description={strings.price.amountHint}
              inputMode="decimal"
              prefix={strings.price.currency}
            />
            {ownCalories}
          </>
        ) : null}
        {page.kind.value === "market" ? ownCalories : null}
        {page.kind.value === "sizes" ? (
          <>
            {page.sizes.shown.length > 0 ? (
              <ol
                aria-label={strings.price.sizesLabel}
                className="flex flex-col gap-4"
              >
                {page.sizes.shown.map((size, index) => {
                  const label = page.sizes.labelOf(size, index);
                  const name = page.sizes.fieldOf(size, index, "name");
                  const amount = page.sizes.fieldOf(size, index, "price");
                  const sizeCalories = page.sizes.fieldOf(
                    size,
                    index,
                    "calories",
                  );
                  return (
                    <li
                      key={size.id}
                      className="flex flex-col gap-3 rounded border border-border p-4"
                    >
                      <ComboBox
                        id={name.id}
                        label={strings.price.sizeNameLabel}
                        labelSuffix={sizeSuffix(strings, label)}
                        buttonLabel={sizeAction(
                          strings,
                          strings.price.showNames,
                          label,
                        )}
                        description={strings.price.sizeHint}
                        items={suggestionItems(suggestions)}
                        value={name.value}
                        onChange={name.onChange}
                        onCommit={name.onCommit}
                        isInvalid={name.error ? true : undefined}
                        errorMessage={name.error ?? undefined}
                      />
                      <AutosaveTextField
                        {...amount}
                        label={strings.price.sizePriceLabel}
                        labelSuffix={sizeSuffix(strings, label)}
                        description={strings.price.amountHint}
                        inputMode="decimal"
                        prefix={strings.price.currency}
                      />
                      <AutosaveTextField
                        {...sizeCalories}
                        label={strings.price.sizeCaloriesLabel}
                        labelSuffix={sizeSuffix(strings, label)}
                        description={strings.price.caloriesHint}
                      />
                      <div>
                        <Button
                          id={sizeButtonId(size.id)}
                          aria-label={sizeAction(
                            strings,
                            strings.price.removeSize,
                            label,
                          )}
                          onPress={() => page.sizes.remove(size, index)}
                        >
                          {strings.price.removeSize}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <div>
              <Button id={ADD_SIZE_ID} onPress={page.sizes.add}>
                {strings.price.addSize}
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <AutosaveTextField
          {...note}
          label={strings.noteLabel}
          description={strings.noteHint}
        />
      </div>

      <PageSavedStatus
        strings={editing}
        editing={page.editing}
        onRetry={page.tryAgain}
      />

      {/* The next dish in the section, so typing a section is one pass
          (D-128). The link waits for saves on their way, as every owner
          link does. */}
      <p className="mt-8">
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

      <MoveDish
        strings={strings.move}
        editing={editing}
        dishGone={strings.errors.parentGone}
        code={code}
        dish={{ id: dish.id, name: dish.name }}
        targets={targets}
        saves={page.editing}
        sayOnceIn={sayOnceIn}
      />
    </>
  );
}
