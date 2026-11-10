"use client";

import type { ReactNode } from "react";
import {
  CheckboxButton,
  CheckboxField,
  CheckboxGroup as AriaCheckboxGroup,
  FieldError,
  Label,
  type CheckboxFieldProps,
  type CheckboxGroupProps,
} from "react-aria-components";
import { fieldDescription } from "./field-description";
import { FieldHint } from "./FieldHint";
import { OneNode } from "./OneNode";

type GroupProps = Omit<CheckboxGroupProps, "children"> & {
  // The group's visible label, or none when a heading names the group
  // through aria-labelledby, as the dish page's Dietary tags heading does.
  label?: string;
  description?: string;
  errorMessage?: string;
  children: ReactNode;
};

// A labelled group of checkboxes. Group semantics and the error wiring come
// from React Aria. A description here is read with every box in the group,
// so a hint meant for the group alone is a lead before it, not this. While
// the group is invalid it and its boxes are described by its problem alone,
// the hint still shown (FieldHint, D-230).
export function CheckboxGroup({
  label,
  description,
  errorMessage,
  children,
  ...props
}: GroupProps) {
  return (
    <AriaCheckboxGroup
      {...props}
      {...fieldDescription(description)}
      className="flex flex-col gap-2"
    >
      {({ isInvalid }) => (
        <>
          {label ? <Label className="font-semibold">{label}</Label> : null}
          {description ? (
            <FieldHint
              isInvalid={isInvalid}
              className="text-sm text-foreground-muted"
            >
              {description}
            </FieldHint>
          ) : null}
          {children}
          <FieldError className="text-sm font-semibold">
            {errorMessage}
          </FieldError>
        </>
      )}
    </AriaCheckboxGroup>
  );
}

type ItemProps = Omit<CheckboxFieldProps, "children"> & {
  // A hint shown under the box's words and tied to it, like a major
  // allergen's hint (D-148). It sits in the field's description slot,
  // outside the label, or its words would join the box's name.
  description?: string;
} & (
    | { children: ReactNode; labelSuffix?: undefined }
    // What one of several boxes with the same visible words belongs to: "on
    // Monday" after "Open 24 hours". The box's own label then holds the
    // whole name as one node, "Open 24 hours on Monday" (D-193).
    | { children: string; labelSuffix: string }
  );

// One checkbox, in a group or on its own, like a day's Open 24 hours box,
// in the shape React Aria documents: CheckboxField around CheckboxButton,
// the label that wraps the box, with a hint in the field's description
// slot (D-206). React Aria ties the hint by id and joins any ids the caller
// ties as well, the hint's first. It finds the hint through a ref on the
// slotted Text, so the tie would follow a hint that came or went; every
// caller's hint is fixed for as long as its box exists. The field draws no
// box of its own (contents), so the label and the hint sit in the
// caller's layout as two items, as they did before the field. While the box
// is invalid it is described by its problem alone, the ids its caller ties,
// and the hint stays shown (FieldHint, D-230). The checked state is a check
// mark drawn in currentColor, not a fill alone, so it survives forced
// colors. The box is named by the label React Aria wraps it in, never by
// aria-label, which left that label a stop of its own on iOS, read twice
// (D-188); with a suffix that label holds the whole name as one node, the
// visible words hidden from assistive technology beside it, since a label
// of two pieces never folds on iOS (D-193, OneNode says why).
export function Checkbox({
  children,
  labelSuffix,
  description,
  ...props
}: ItemProps) {
  const words =
    labelSuffix === undefined ? (
      <span className="min-w-0">{children}</span>
    ) : (
      <OneNode visible={children} whole={`${children} ${labelSuffix}`} />
    );
  return (
    <CheckboxField {...props} className="contents">
      {({ isInvalid }) => (
        <>
          <CheckboxButton className="group flex items-start gap-3 py-1">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border-2 border-border bg-background group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 opacity-0 group-data-[selected]:opacity-100"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            {words}
          </CheckboxButton>
          {description ? (
            <FieldHint
              isInvalid={isInvalid}
              className="-mt-1 pl-9 text-sm text-foreground-muted"
            >
              {description}
            </FieldHint>
          ) : null}
        </>
      )}
    </CheckboxField>
  );
}
