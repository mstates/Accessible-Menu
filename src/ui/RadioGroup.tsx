"use client";

import type { ReactNode } from "react";
import {
  FieldError,
  Label,
  RadioButton,
  RadioField,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioFieldProps,
  type RadioGroupProps,
} from "react-aria-components";
import { fieldDescription } from "./field-description";

type GroupProps = Omit<RadioGroupProps, "children"> & {
  // The group's visible label, or none when a heading names the group
  // through aria-labelledby, as the dish page's Price heading does.
  label?: string;
  description?: string;
  errorMessage?: string;
  children: ReactNode;
};

// A labelled group of radio buttons, one choice among a few (D-139).
// Group semantics, the arrow keys, and the error wiring come from React
// Aria. A description may come and go with the choice, as market price's
// sentence does, and React Aria ties it to the group and each radio while
// it shows (D-147).
export function RadioGroup({
  label,
  description,
  errorMessage,
  children,
  ...props
}: GroupProps) {
  return (
    <AriaRadioGroup
      {...props}
      {...fieldDescription(description)}
      className="flex flex-col gap-2"
    >
      {label ? <Label className="font-semibold">{label}</Label> : null}
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      {children}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
    </AriaRadioGroup>
  );
}

type ItemProps = Omit<RadioFieldProps, "children"> & {
  children: ReactNode;
  // A hint shown under the radio's words and tied to it, like a sold-out
  // choice's (D-160). It sits in the field's description slot, outside the
  // label, or its words would join the radio's name. The group's own
  // description still reaches every radio through React Aria.
  description?: string;
};

// One radio button, in the shape React Aria documents: RadioField around
// RadioButton, the label that wraps the radio, with a hint in the field's
// description slot (D-206). React Aria ties the hint by id and joins any
// ids the caller ties as well, the caller's first, then the hint's, then
// the group's. It finds the hint through a ref on the slotted Text, so the
// tie would follow a hint that came or went; every caller's hint is fixed
// for as long as its radio exists. The field draws no box of its own
// (contents), so the label and the hint sit in the group's column as two
// items, as they did before the field. The chosen state is a dot drawn in
// currentColor inside a round box with an edge, not a fill alone, so it
// survives forced colors, the way the Checkbox's check mark does.
export function Radio({ children, description, ...props }: ItemProps) {
  return (
    <RadioField {...props} className="contents">
      <RadioButton className="group flex items-start gap-3 py-1">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3 opacity-0 group-data-[selected]:opacity-100"
            fill="currentColor"
          >
            <circle cx="12" cy="12" r="12" />
          </svg>
        </span>
        <span className="min-w-0">{children}</span>
      </RadioButton>
      {description ? (
        <Text
          slot="description"
          className="-mt-1 pl-9 text-sm text-foreground-muted"
        >
          {description}
        </Text>
      ) : null}
    </RadioField>
  );
}
