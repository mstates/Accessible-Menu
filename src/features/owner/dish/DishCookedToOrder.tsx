"use client";

import { Checkbox } from "@/ui/CheckboxGroup";
import { handToBox } from "../editing/hand-to-box";
import type { DishStrings } from "./dish-words";

// What the component draws: the box's state and a problem under it if
// one stands.
export type DishCookedToOrderView = {
  id: string;
  headingId: string;
  shown: boolean;
  set: (on: boolean) => void;
  error: string | null;
};

type Props = {
  strings: DishStrings["cookedToOrder"];
  cookedToOrder: DishCookedToOrderView;
};

// The Cooked to order box (D-167, task 7), under its own heading after
// Schedule (Michael, October 10, 2026): one box with its hint under its
// words. The wrapper takes a failed save's focus and hands it to the box,
// as the allergen group's do.
export function DishCookedToOrder({ strings, cookedToOrder }: Props) {
  const errorId = `${cookedToOrder.id}-error`;
  return (
    <div className="mt-8 flex flex-col gap-4">
      <h2 id={cookedToOrder.headingId} className="text-xl font-bold">
        {strings.heading}
      </h2>
      <div
        id={cookedToOrder.id}
        role="presentation"
        tabIndex={-1}
        className="flex flex-col outline-none"
        onFocus={handToBox}
      >
        <Checkbox
          isSelected={cookedToOrder.shown}
          onChange={(on) => cookedToOrder.set(on)}
          description={strings.hint}
          aria-describedby={cookedToOrder.error ? errorId : undefined}
          validationBehavior="aria"
          isInvalid={cookedToOrder.error ? true : undefined}
        >
          {strings.label}
        </Checkbox>
        {cookedToOrder.error ? (
          <span id={errorId} className="pl-9 text-sm font-semibold">
            {cookedToOrder.error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
