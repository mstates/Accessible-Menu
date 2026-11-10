"use client";

import { useLayoutEffect, useState } from "react";
import {
  TextField as AriaTextField,
  FieldError,
  Input,
  Label,
  TextArea,
  type TextFieldProps,
} from "react-aria-components";
import { fieldDescription } from "./field-description";
import { FieldHint } from "./FieldHint";
import { OneNode } from "./OneNode";

type Props = TextFieldProps & {
  label: string;
  // What one of several fields with the same visible label belongs to:
  // "for Dinner". The one label names the field whole, "Menu name for
  // Dinner", as one node (D-140, D-193).
  labelSuffix?: string;
  description?: string;
  // The id of a hint shown elsewhere and shared by several fields, the
  // hours grid's (D-105): tied after the caller's own ids while the field
  // is valid, and left out while it is invalid (D-230).
  hintId?: string;
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
// A field with a suffix is named by the same one label, whose accessible
// text is one node: the whole name, "Menu name for Dinner", as a single
// clipped text node, with the visible words inside the label hidden from
// assistive technology (OneNode says why). One label of one node is what
// VoiceOver on iOS folds into its field: a name set on the field itself
// with aria-label left the plain label beside it a stop of its own, read
// twice (D-188), and a label of two pieces, the suffix hidden after the
// visible words, never folded either (D-193).
//
// Such a field also keeps the name it had when focus arrived until focus
// leaves. The suffix names a row that a save can rename while the field
// still has focus, after Enter, and Chrome reads a focused field again when
// its name changes, which drowned out the polite "Saved." (D-140). So the
// node holds the whole name focus arrived with, as one string.
//
// While the field is invalid it is described by its problem alone, and its
// hint stays on screen (D-230, Q-157): VoiceOver on iOS reads a field's
// description, and again as its hint after the value, so a hint tied beside
// the problem was read with it each time. Its own hint leaves React Aria's
// description slot (FieldHint), and a hint shared by id is left out of the
// ids handed over. Validity for the shared one is the caller's isInvalid,
// or React Aria's own, reported up from its render props before paint, since
// an error the server sent through the Form makes a field invalid with no
// prop saying so, and React Aria clears it once the owner changes the field
// and leaves it.
export function TextField({
  label,
  labelSuffix,
  description,
  hintId,
  errorMessage,
  multiline = false,
  prefix,
  ...props
}: Props) {
  const [held, setHeld] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const invalid = props.isInvalid === true || reported;
  const describedBy =
    [props["aria-describedby"], invalid ? undefined : hintId]
      .filter(Boolean)
      .join(" ") || undefined;
  const whole = labelSuffix ? (held ?? `${label} ${labelSuffix}`) : null;
  const required = props.isRequired ? <span aria-hidden="true"> *</span> : null;
  const input = multiline ? (
    <TextArea className={`${inputClassName} min-h-32`} />
  ) : (
    <Input className={`${inputClassName} min-h-11`} />
  );
  return (
    <AriaTextField
      {...props}
      aria-describedby={describedBy}
      {...fieldDescription(description)}
      onFocusChange={(focused) => {
        setHeld(focused && labelSuffix ? `${label} ${labelSuffix}` : null);
        props.onFocusChange?.(focused);
      }}
      className="flex flex-col gap-1"
    >
      {({ isInvalid }) => (
        <>
          {hintId ? (
            <Validity isInvalid={isInvalid} onChange={setReported} />
          ) : null}
          <Label className="font-semibold">
            {whole === null ? label : <OneNode visible={label} whole={whole} />}
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
            <FieldHint
              isInvalid={isInvalid}
              className="text-sm text-foreground-muted"
            >
              {description}
            </FieldHint>
          ) : null}
          <FieldError className="text-sm font-semibold">
            {errorMessage}
          </FieldError>
        </>
      )}
    </AriaTextField>
  );
}

// React Aria's validity, handed up to the field before paint, so a hint
// shared by id is untied while the field is invalid (D-230).
function Validity({
  isInvalid,
  onChange,
}: {
  isInvalid: boolean;
  onChange: (invalid: boolean) => void;
}) {
  useLayoutEffect(() => {
    onChange(isInvalid);
  }, [isInvalid, onChange]);
  return null;
}
