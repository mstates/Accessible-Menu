"use client";

import { TextField } from "@/ui/TextField";

type Props = {
  id: string;
  label: string;
  labelSuffix?: string;
  // A hint shown under the field and tied to it.
  description?: string;
  // A field that takes several lines. Enter adds a line, so only leaving
  // the field commits it.
  multiline?: boolean;
  // A price field asks a phone for its number keypad (D-139).
  inputMode?: "decimal";
  // Text shown beside the input, the "$" before a price.
  prefix?: string;
  // What the field shows: what the owner typed, or the saved value.
  value: string;
  // The problem with the last save of this field, shown as its error.
  error: string | null;
  onChange: (value: string) => void;
  // The field was committed. The screen decides whether anything is sent.
  onCommit: () => void;
};

// A real, always-visible field that saves when it is committed (D-111):
// when focus leaves it, or on Enter in a field of one line. Never on a
// keystroke. Enter that ends an input method's composition is not a commit.
// In a field of several lines Enter is a line break and nothing else, so it
// has no key handler at all. The field sits outside any form, so Enter does
// nothing else. While a save has failed the field is invalid and described
// by its error; isInvalid is set only then, because React Aria treats it as
// controlled.
export function AutosaveTextField({
  id,
  label,
  labelSuffix,
  description,
  multiline = false,
  inputMode,
  prefix,
  value,
  error,
  onChange,
  onCommit,
}: Props) {
  return (
    <TextField
      id={id}
      label={label}
      labelSuffix={labelSuffix}
      description={description}
      multiline={multiline}
      inputMode={inputMode}
      prefix={prefix}
      value={value}
      onChange={onChange}
      onBlur={onCommit}
      onKeyDown={
        multiline
          ? undefined
          : (event) => {
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                onCommit();
              }
            }
      }
      autoComplete="off"
      validationBehavior="aria"
      isInvalid={error ? true : undefined}
      errorMessage={error ?? undefined}
    />
  );
}
