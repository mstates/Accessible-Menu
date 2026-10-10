"use client";

import { useId, type ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  FieldError,
  Label,
  Text,
  type CheckboxGroupProps,
  type CheckboxProps,
} from "react-aria-components";
import { fieldDescription } from "./field-description";

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
// so a hint meant for the group alone is a lead before it, not this.
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
      {label ? <Label className="font-semibold">{label}</Label> : null}
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      {children}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
    </AriaCheckboxGroup>
  );
}

type ItemProps = Omit<CheckboxProps, "children"> & {
  children: ReactNode;
  // A hint shown under the box's words and tied to it, like a major
  // allergen's hint (D-148). It sits beside the label, not inside it, or its
  // words would join the box's name.
  description?: string;
};

// One checkbox, in a group or on its own, like a day's Open 24 hours box.
// The checked state is a check mark drawn in currentColor, not a fill alone,
// so it survives forced colors. React Aria's Checkbox has no description
// slot, so a hint is tied by id to a span that is always on the page while
// the box is, joined with any ids the caller ties as well; nothing here
// comes or goes, so the tie never points at a gone id (D-147).
export function Checkbox({
  children,
  description,
  "aria-describedby": describedByToo,
  ...props
}: ItemProps) {
  const hintId = useId();
  const describedBy =
    [description ? hintId : null, describedByToo ?? null]
      .filter((id) => id !== null)
      .join(" ") || undefined;
  return (
    <>
      <AriaCheckbox
        {...props}
        aria-describedby={describedBy}
        className="group flex items-start gap-3 py-1"
      >
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
        <span className="min-w-0">{children}</span>
      </AriaCheckbox>
      {description ? (
        <span id={hintId} className="-mt-1 pl-9 text-sm text-foreground-muted">
          {description}
        </span>
      ) : null}
    </>
  );
}
