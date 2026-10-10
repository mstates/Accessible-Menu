"use client";

import type { RefObject } from "react";
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
  // Fields that commit together, like a special's Starts and Ends (D-159):
  // a blur that lands inside this element is not a commit, so Tab from one
  // to the other sends nothing; leaving the pair, or Enter, commits.
  commitWithin?: RefObject<HTMLElement | null>;
  // One hint shared by several fields, tied by id, the hours grid's
  // pattern (D-105), beside any description of the field's own.
  "aria-describedby"?: string;
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
  commitWithin,
  "aria-describedby": describedBy,
}: Props) {
  return (
    <TextField
      id={id}
      aria-describedby={describedBy}
      label={label}
      labelSuffix={labelSuffix}
      description={description}
      multiline={multiline}
      inputMode={inputMode}
      prefix={prefix}
      value={value}
      onChange={onChange}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          commitWithin?.current &&
          next instanceof Node &&
          commitWithin.current.contains(next)
        ) {
          return;
        }
        onCommit();
      }}
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
