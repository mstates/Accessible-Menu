"use client";

import type { ReactNode } from "react";
import {
  FieldError,
  Label,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioGroupProps,
  type RadioProps,
} from "react-aria-components";

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
// Aria.
export function RadioGroup({
  label,
  description,
  errorMessage,
  children,
  ...props
}: GroupProps) {
  return (
    <AriaRadioGroup {...props} className="flex flex-col gap-2">
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

type ItemProps = Omit<RadioProps, "children"> & { children: ReactNode };

// One radio button. The chosen state is a dot drawn in currentColor inside
// a round box with an edge, not a fill alone, so it survives forced colors,
// the way the Checkbox's check mark does.
export function Radio({ children, ...props }: ItemProps) {
  return (
    <AriaRadio {...props} className="group flex items-start gap-3 py-1">
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
    </AriaRadio>
  );
}
