"use client";

import {
  TextField as AriaTextField,
  FieldError,
  Input,
  Label,
  Text,
  type TextFieldProps,
} from "react-aria-components";

type Props = TextFieldProps & {
  label: string;
  description?: string;
  errorMessage?: string;
};

// A labelled text input. The label, description, and error are wired to
// the input by React Aria.
export function TextField({
  label,
  description,
  errorMessage,
  ...props
}: Props) {
  return (
    <AriaTextField {...props} className="flex flex-col gap-1">
      <Label className="font-semibold">{label}</Label>
      <Input className="min-h-11 rounded border border-border bg-background px-3 py-2 text-base text-foreground" />
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
    </AriaTextField>
  );
}
