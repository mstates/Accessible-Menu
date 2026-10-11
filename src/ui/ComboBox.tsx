"use client";

import { useState } from "react";
import {
  Button,
  ComboBox as AriaComboBox,
  FieldError,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";
import { fieldDescription } from "./field-description";

type Props = {
  id: string;
  label: string;
  // What one of several fields with the same visible label belongs to:
  // "for Cup". The field is named whole, "Size for Cup", on the field
  // itself, and keeps that name while it has focus (D-140), as TextField
  // does. A field alone on its page, a choice list's lead, has none.
  labelSuffix?: string;
  // The whole name of the button that opens the list, named the same way.
  buttonLabel: string;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  // What to suggest, in order, filtered as the owner types. Any text typed
  // is kept.
  suggestions: readonly string[];
  value: string;
  onChange: (value: string) => void;
  // The text was committed: the field was left, a suggestion was chosen,
  // or Enter was pressed on what was typed.
  onCommit: () => void;
};

const inputClassName =
  "w-full min-w-0 rounded border border-border bg-background px-3 py-2 text-base text-foreground";

// A text field with suggestions (D-139): the size name field, which offers
// the restaurant's own size names and a short starter list and keeps any
// name typed. The combobox semantics, the keyboard, and the list come from
// React Aria. The list opens on typing and from the button, never on focus
// alone. It commits the way AutosaveTextField does, when it is left or on
// Enter, and once more when a suggestion is chosen, by keyboard or by
// pointer: React Aria puts the choice in the field first, so the commit
// sends it. Enter while a suggestion is in view is React Aria's to take,
// and the choice commits; the field's own Enter handler stands aside then,
// so a half-typed name is never sent ahead of the chosen one. Committing
// twice sends nothing twice: a value on its way is not sent again.
export function ComboBox({
  id,
  label,
  labelSuffix,
  buttonLabel,
  description,
  errorMessage,
  isInvalid,
  suggestions,
  value,
  onChange,
  onCommit,
}: Props) {
  const name = labelSuffix ? `${label} ${labelSuffix}` : label;
  const [held, setHeld] = useState<string | null>(null);
  const items = suggestions.map((text) => ({ id: text }));
  return (
    <AriaComboBox
      aria-label={held ?? name}
      allowsCustomValue
      defaultItems={items}
      inputValue={value}
      onInputChange={onChange}
      onSelectionChange={(key) => {
        if (key === null) return;
        onChange(String(key));
        onCommit();
      }}
      onFocusChange={(focused) => setHeld(focused ? name : null)}
      onBlur={onCommit}
      validationBehavior="aria"
      isInvalid={isInvalid}
      {...fieldDescription(description)}
      className="flex flex-col gap-1"
    >
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          className={`${inputClassName} min-h-11`}
          autoComplete="off"
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            ) {
              return;
            }
            if (event.currentTarget.getAttribute("aria-activedescendant")) {
              return;
            }
            onCommit();
          }}
        />
        <Button
          aria-label={buttonLabel}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded border border-border bg-background text-foreground"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </Button>
      </div>
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
      <Popover className="max-h-80 w-(--trigger-width) overflow-auto rounded border border-border bg-background-raised shadow-lg">
        <ListBox className="p-1 outline-none">
          {(item: { id: string }) => (
            <ListBoxItem
              id={item.id}
              textValue={item.id}
              className="cursor-default rounded px-3 py-2 outline-none data-[focused]:bg-foreground data-[focused]:text-background data-[selected]:font-semibold"
            >
              {item.id}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}
