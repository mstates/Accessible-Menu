"use client";

import { useState } from "react";
import {
  TextField as AriaTextField,
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  type TextFieldProps,
} from "react-aria-components";

type Props = TextFieldProps & {
  label: string;
  // What one of several fields with the same visible label belongs to:
  // "for Dinner". The field is then named whole, the label first, as one
  // string on the field itself: "Menu name for Dinner" (D-140).
  labelSuffix?: string;
  description?: string;
  errorMessage?: string;
  multiline?: boolean;
  // Text shown beside the input and hidden from assistive technology, the
  // "$" before a price (D-139); the hint says what the field takes.
  prefix?: string;
};

const inputClassName =
  "w-full rounded border border-border bg-background px-3 py-2 text-base text-foreground";

// A labelled text input. The label, description, and error are wired to
// the input by React Aria. The id lands on the input, so an error summary
// can link to it. A required field shows an asterisk after its label, hidden
// from assistive technology because isRequired already sets aria-required.
// No maxLength attribute anywhere: a cap is reported as an error, never
// applied by cutting pasted text. Every input fills its column. The
// percentage width also keeps an input's built-in width, twenty characters,
// out of the minimum width of the fieldset around it: at a 32px root that
// built-in width alone is wider than a 320px screen (D-105).
//
// A field with a suffix is named whole, with aria-label, and its visible
// label is a plain label that only shows the words and takes a click. A
// label with the suffix hidden inside it gave Chrome one element to hand a
// screen reader, and VoiceOver read that element's pieces with no space
// between them: "Menu namefor Dinner" (D-140). React Aria's own Label is
// left out then, or its id would be added to the name.
//
// Such a field also keeps the name it had when focus arrived until focus
// leaves. The suffix names a row that a save can rename while the field
// still has focus, after Enter, and Chrome reads a focused field again when
// its name changes, which drowned out the polite "Saved." (D-140).
export function TextField({
  label,
  labelSuffix,
  description,
  errorMessage,
  multiline = false,
  prefix,
  ...props
}: Props) {
  const name = labelSuffix ? `${label} ${labelSuffix}` : null;
  const [held, setHeld] = useState<string | null>(null);
  const required = props.isRequired ? <span aria-hidden="true"> *</span> : null;
  const input = multiline ? (
    <TextArea className={`${inputClassName} min-h-32`} />
  ) : (
    <Input className={`${inputClassName} min-h-11`} />
  );
  return (
    <AriaTextField
      {...props}
      {...(name ? { "aria-label": held ?? name } : {})}
      onFocusChange={(focused) => {
        setHeld(focused ? name : null);
        props.onFocusChange?.(focused);
      }}
      className="flex flex-col gap-1"
    >
      {name ? (
        <label htmlFor={props.id} className="font-semibold">
          {label}
          {required}
        </label>
      ) : (
        <Label className="font-semibold">
          {label}
          {required}
        </Label>
      )}
      {prefix ? (
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="font-semibold">
            {prefix}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
    </AriaTextField>
  );
}
