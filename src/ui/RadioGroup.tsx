"use client";

import { useId, type ReactNode } from "react";
import {
  FieldError,
  Label,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioGroupProps,
  type RadioProps,
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

type ItemProps = Omit<RadioProps, "children"> & {
  children: ReactNode;
  // A hint shown under the radio's words and tied to it, like a sold-out
  // choice's (D-160). It sits beside the label, not inside it, or its words
  // would join the radio's name. The group's own description still reaches
  // every radio through React Aria.
  description?: string;
};

// One radio button. The chosen state is a dot drawn in currentColor inside
// a round box with an edge, not a fill alone, so it survives forced colors,
// the way the Checkbox's check mark does. React Aria's Radio has no
// description slot, so a hint is tied by id to a span that is always on the
// page while the radio is, joined with any ids the caller ties as well;
// nothing here comes or goes, so the tie never points at a gone id (D-147).
export function Radio({
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
      <AriaRadio
        {...props}
        aria-describedby={describedBy}
        className="group flex items-start gap-3 py-1"
      >
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
      {description ? (
        <span id={hintId} className="-mt-1 pl-9 text-sm text-foreground-muted">
          {description}
        </span>
      ) : null}
    </>
  );
}
