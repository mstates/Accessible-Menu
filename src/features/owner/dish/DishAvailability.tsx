"use client";

import { isAvailability } from "@/domain/availability";
import { Radio, RadioGroup } from "@/ui/RadioGroup";
import type { DishStrings } from "./dish-words";
import type { DishAvailabilityState } from "./useDishAvailability";

type Props = {
  strings: DishStrings["availability"];
  availability: DishAvailabilityState;
};

// Availability (D-160, task 5), under its own heading (D-128): three radios
// as Price's are (D-143), the two that change what diners see with a hint
// under their words, and the group's line saying what the choice means now,
// which React Aria reads with the group and each radio while it shows
// (D-147). The wrapper takes a failed save's focus and hands it to the
// chosen radio, so a reader hears the group and the choice.
export function DishAvailability({ strings, availability }: Props) {
  return (
    <div className="mt-8 flex flex-col gap-4">
      <h2 id={availability.headingId} className="text-xl font-bold">
        {strings.heading}
      </h2>
      <div
        id={availability.id}
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
          aria-labelledby={availability.headingId}
          value={availability.value}
          onChange={(value) => {
            if (isAvailability(value)) availability.set(value);
          }}
          description={availability.description}
          validationBehavior="aria"
          isInvalid={availability.error ? true : undefined}
          errorMessage={availability.error ?? undefined}
        >
          <Radio value="available">{strings.available}</Radio>
          <Radio value="sold-out" description={strings.soldOutHint}>
            {strings.soldOut}
          </Radio>
          <Radio value="off" description={strings.offHint}>
            {strings.off}
          </Radio>
        </RadioGroup>
      </div>
    </div>
  );
}
