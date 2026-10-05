"use client";

import type { ReactNode } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  FieldError,
  Label,
  Text,
  type CheckboxGroupProps,
  type CheckboxProps,
} from "react-aria-components";

type GroupProps = Omit<CheckboxGroupProps, "children"> & {
  label: string;
  description?: string;
  errorMessage?: string;
  children: ReactNode;
};

// A labelled group of checkboxes. Group semantics and the error wiring come
// from React Aria.
export function CheckboxGroup({
  label,
  description,
  errorMessage,
  children,
  ...props
}: GroupProps) {
  return (
    <AriaCheckboxGroup {...props} className="flex flex-col gap-2">
      <Label className="font-semibold">{label}</Label>
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

type ItemProps = Omit<CheckboxProps, "children"> & { children: ReactNode };

// One checkbox, in a group or on its own, like a day's Open 24 hours box.
// The checked state is a check mark drawn in currentColor, not a fill alone,
// so it survives forced colors.
export function Checkbox({ children, ...props }: ItemProps) {
  return (
    <AriaCheckbox {...props} className="group flex items-start gap-3 py-1">
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
  );
}
