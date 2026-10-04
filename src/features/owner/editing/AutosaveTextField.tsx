"use client";

import { TextField } from "@/ui/TextField";

type Props = {
  id: string;
  label: string;
  labelSuffix?: string;
  // What the field shows: what the owner typed, or the saved value.
  value: string;
  // The problem with the last save of this field, shown as its error.
  error: string | null;
  onChange: (value: string) => void;
  // The field was committed. The screen decides whether anything is sent.
  onCommit: () => void;
};

// A real, always-visible field that saves when it is committed (D-111):
// when focus leaves it, or on Enter. Never on a keystroke. Enter that ends
// an input method's composition is not a commit. The field sits outside any
// form, so Enter does nothing else. While a save has failed the field is
// invalid and described by its error; isInvalid is set only then, because
// React Aria treats it as controlled.
export function AutosaveTextField({
  id,
  label,
  labelSuffix,
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
      value={value}
      onChange={onChange}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229
        ) {
          onCommit();
        }
      }}
      autoComplete="off"
      validationBehavior="aria"
      isInvalid={error ? true : undefined}
      errorMessage={error ?? undefined}
    />
  );
}
