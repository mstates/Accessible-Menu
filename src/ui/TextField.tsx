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
import { fieldDescription } from "./field-description";
import { HiddenWords } from "./HiddenWords";

type Props = TextFieldProps & {
  label: string;
  // What one of several fields with the same visible label belongs to:
  // "for Dinner". The words follow the label inside it, hidden, so the one
  // label names the field whole: "Menu name for Dinner" (D-140, D-188).
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
// A field with a suffix is named by the same one label, the suffix as
// hidden words inside it after the visible words and a space (HiddenWords
// says why the words are in the flow and why the space sits in the visible
// words' own text). One label is what VoiceOver on iOS folds into its
// field: a name set on the field itself with aria-label left the plain
// label beside it a stop of its own, read twice (D-188), and a label with
// the suffix taken out of the flow was read in pieces with no space between
// them (D-140).
//
// Such a field also keeps the name it had when focus arrived until focus
// leaves. The suffix names a row that a save can rename while the field
// still has focus, after Enter, and Chrome reads a focused field again when
// its name changes, which drowned out the polite "Saved." (D-140). So the
// hidden words hold the suffix focus arrived with.
export function TextField({
  label,
  labelSuffix,
  description,
  errorMessage,
  multiline = false,
  prefix,
  ...props
}: Props) {
  const [held, setHeld] = useState<string | null>(null);
  const suffix = labelSuffix ? (held ?? labelSuffix) : null;
  const required = props.isRequired ? <span aria-hidden="true"> *</span> : null;
  const input = multiline ? (
    <TextArea className={`${inputClassName} min-h-32`} />
  ) : (
    <Input className={`${inputClassName} min-h-11`} />
  );
  return (
    <AriaTextField
      {...props}
      {...fieldDescription(description)}
      onFocusChange={(focused) => {
        setHeld(focused && labelSuffix ? labelSuffix : null);
        props.onFocusChange?.(focused);
      }}
      className="flex flex-col gap-1"
    >
      <Label className="font-semibold">
        {suffix === null ? label : `${label} `}
        {suffix === null ? null : <HiddenWords text={suffix} />}
        {required}
      </Label>
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
