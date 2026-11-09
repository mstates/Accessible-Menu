"use client";

import { fill } from "@/copy/fill";
import type { DietaryCopy } from "@/domain/dietary";
import { DIETARY_TAG_IDS } from "@/domain/types";
import { Checkbox, CheckboxGroup } from "@/ui/CheckboxGroup";
import { handToBox } from "../editing/hand-to-box";
import type { DishStrings } from "./dish-words";
import {
  TAGS_HEADING_ID,
  TAGS_SENTENCE_ID,
  tagBoxId,
  type DishTagsState,
} from "./useDishTags";

type Props = {
  strings: DishStrings["tags"];
  names: DietaryCopy;
  tags: DishTagsState;
  // The group sits directly under the page's h1, which carries its heading
  // id (D-222, D-225), so it draws no heading of its own.
  underPageHeading?: boolean;
};

// The dietary tags (D-66, task 5), under the heading that names them, the
// page's h1 on a dish's Dietary tags page (D-222): three
// boxes named by the words diners read, each with a hint under its words,
// and the sentence diners read under the group, from the one builder
// (module rule 8), or nothing with no tag. A box sits in a wrapper that
// takes a failed save's focus and hands it to the box, as the allergen
// group's do.
export function DishTags({
  strings,
  names,
  tags,
  underPageHeading = false,
}: Props) {
  const shown = new Set<string>(tags.shown);
  return (
    <div className="mt-8 flex flex-col gap-4">
      {underPageHeading ? null : (
        <h2 id={TAGS_HEADING_ID} className="text-xl font-bold">
          {strings.heading}
        </h2>
      )}
      <CheckboxGroup
        aria-labelledby={TAGS_HEADING_ID}
        value={[...tags.shown]}
        onChange={(values) => {
          const next = new Set(values);
          for (const id of DIETARY_TAG_IDS) {
            if (shown.has(id) !== next.has(id)) tags.set(id, next.has(id));
          }
        }}
      >
        {DIETARY_TAG_IDS.map((id) => {
          const error = tags.errorOf(id);
          const errorId = `${tagBoxId(id)}-error`;
          return (
            <div
              key={id}
              id={tagBoxId(id)}
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
                {names.names[id]}
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
      {tags.sentence ? (
        <p id={TAGS_SENTENCE_ID}>
          {fill(strings.dinersRead, { sentence: `"${tags.sentence.text}"` })}
        </p>
      ) : null}
    </div>
  );
}
