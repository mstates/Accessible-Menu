"use client";

import { useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  ComboBox as AriaComboBox,
  ComboBoxStateContext,
  FieldError,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";
import { fieldDescription } from "./field-description";

export type ComboBoxItem = { id: string; text: string };

// Items for a list of plain words, where the key is the text: size names,
// a choice list's lead, other allergens.
export function suggestionItems(texts: readonly string[]): ComboBoxItem[] {
  return texts.map((text) => ({ id: text, text }));
}

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
  // What to suggest, in order, each by a key and its text. Filtered as the
  // owner types, unless the list is already the answer to what was typed
  // (prefiltered), when it shows as given and opens once it arrives. Any
  // text typed is kept.
  items: readonly ComboBoxItem[];
  prefiltered?: boolean;
  value: string;
  onChange: (value: string) => void;
  // The text was committed: the field was left, a suggestion was chosen,
  // or Enter was pressed on what was typed.
  onCommit?: () => void;
  // A suggestion was chosen, by keyboard or by pointer, once its text is
  // in the field.
  onPick?: (item: ComboBoxItem) => void;
};

const inputClassName =
  "w-full min-w-0 rounded border border-border bg-background px-3 py-2 text-base text-foreground";

// A text field with suggestions (D-139): the size name field, which offers
// the restaurant's own size names and a short starter list and keeps any
// name typed, and the address finder (D-83), whose list is the answer to
// what was typed. The combobox semantics, the keyboard, and the list come
// from React Aria. The list opens on typing and from the button, never on
// focus alone. It commits the way AutosaveTextField does, when it is left
// or on Enter, and once more when a suggestion is chosen, by keyboard or
// by pointer: the choice goes in the field first, so the commit sends it.
// Enter while a suggestion is in view is React Aria's to take, and the
// choice commits; the field's own Enter handler stands aside then, so a
// half-typed name is never sent ahead of the chosen one. Committing twice
// sends nothing twice: a value on its way is not sent again.
export function ComboBox({
  id,
  label,
  labelSuffix,
  buttonLabel,
  description,
  errorMessage,
  isInvalid,
  items,
  prefiltered = false,
  value,
  onChange,
  onCommit,
  onPick,
}: Props) {
  const name = labelSuffix ? `${label} ${labelSuffix}` : label;
  const [held, setHeld] = useState<string | null>(null);
  return (
    <AriaComboBox
      aria-label={held ?? name}
      allowsCustomValue
      {...(prefiltered ? { items } : { defaultItems: items })}
      inputValue={value}
      onInputChange={onChange}
      onSelectionChange={(key) => {
        if (key === null) return;
        const item = items.find((each) => each.id === String(key));
        onChange(item?.text ?? String(key));
        if (item) onPick?.(item);
        onCommit?.();
      }}
      onFocusChange={(focused) => setHeld(focused ? name : null)}
      onBlur={() => onCommit?.()}
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
            onCommit?.();
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
      {prefiltered ? <OpenOnArrival count={items.length} /> : null}
      <Popover className="max-h-80 w-(--trigger-width) overflow-auto rounded border border-border bg-background-raised shadow-lg">
        <ListBox className="p-1 outline-none">
          {(item: ComboBoxItem) => (
            <ListBoxItem
              id={item.id}
              textValue={item.text}
              className="cursor-default rounded px-3 py-2 outline-none data-[focused]:bg-foreground data-[focused]:text-background data-[selected]:font-semibold"
            >
              {item.text}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

// Opens the list when a prefiltered answer arrives while the field has
// focus. React Aria opens the list on its own only on the keystroke that
// changed the text, and only when the list already has items, so a list
// that lands after a pause would stay closed (react-stately's
// useComboBoxState). Only an arrival counts, from no items to some: a list
// the owner closed with Escape stays closed, and typing again opens it
// through React Aria.
function OpenOnArrival({ count }: { count: number }) {
  const state = useContext(ComboBoxStateContext);
  const last = useRef(count);
  useEffect(() => {
    const arrived = count > 0 && last.current === 0;
    last.current = count;
    if (arrived && state?.isFocused && !state.isOpen) state.open(null, "input");
  });
  return null;
}
