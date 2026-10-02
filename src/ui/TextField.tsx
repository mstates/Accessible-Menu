"use client";

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
  description?: string;
  errorMessage?: string;
  multiline?: boolean;
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
export function TextField({
  label,
  description,
  errorMessage,
  multiline = false,
  ...props
}: Props) {
  return (
    <AriaTextField {...props} className="flex flex-col gap-1">
      <Label className="font-semibold">
        {label}
        {props.isRequired ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {multiline ? (
        <TextArea className={`${inputClassName} min-h-32`} />
      ) : (
        <Input className={`${inputClassName} min-h-11`} />
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
