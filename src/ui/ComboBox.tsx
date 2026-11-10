"use client";

import { type ReactNode, useState } from "react";
import {
  Button,
  ButtonContext,
  ComboBox as AriaComboBox,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  useSlottedContext,
} from "react-aria-components";
import { fieldDescription } from "./field-description";
import { FieldHint } from "./FieldHint";
import { OneNode } from "./OneNode";

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
  // "for Cup". The one label names the field whole, "Size for Cup", as one
  // node, and the field keeps that name while it has focus (D-140, D-193),
  // as TextField does. A field alone on its page, a choice list's lead,
  // has none.
  labelSuffix?: string;
  // The whole name of the button that opens the list, named the same way.
  buttonLabel: string;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  // What to suggest, in order, each by a key and its text, filtered as the
  // owner types. Any text typed is kept.
  items: readonly ComboBoxItem[];
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
// name typed; a choice list's lead; an other allergen. The combobox
// semantics, the keyboard, and the list come from React Aria. The list
// opens on typing and from the button, never on focus alone. It commits
// the way AutosaveTextField does, when it is left or on Enter, and once
// more when a suggestion is chosen, by keyboard or by pointer: the choice
// goes in the field first, so the commit sends it. Enter while a
// suggestion is in view is React Aria's to take, and the choice commits;
// the field's own Enter handler stands aside then, so a half-typed name is
// never sent ahead of the chosen one. Committing twice sends nothing
// twice: a value on its way is not sent again. The address finder, whose
// list was a lookup's answer rather than a filter of given items, left for
// a search field with its matches in the page flow (D-200).
//
// Named as TextField names a field (D-140, D-188, D-193): by one label,
// React Aria's, whose accessible text is one node, the whole name with the
// suffix, held while the field has focus, and the visible words inside it
// hidden from assistive technology (OneNode). One label of one node is
// what VoiceOver on iOS folds into the field; a name on the field itself
// left the plain label beside it a stop of its own, read twice (Q-116,
// Q-118), and the suffix as a second piece inside the label was a stop
// too.
export function ComboBox({
  id,
  label,
  labelSuffix,
  buttonLabel,
  description,
  errorMessage,
  isInvalid,
  items,
  value,
  onChange,
  onCommit,
}: Props) {
  const [held, setHeld] = useState<string | null>(null);
  const whole = labelSuffix ? (held ?? `${label} ${labelSuffix}`) : null;
  return (
    <AriaComboBox
      id={id}
      allowsCustomValue
      defaultItems={items}
      inputValue={value}
      onInputChange={onChange}
      onSelectionChange={(key) => {
        if (key === null) return;
        const item = items.find((each) => each.id === String(key));
        onChange(item?.text ?? String(key));
        onCommit();
      }}
      onFocusChange={(focused) =>
        setHeld(focused && labelSuffix ? `${label} ${labelSuffix}` : null)
      }
      onBlur={() => onCommit()}
      validationBehavior="aria"
      isInvalid={isInvalid}
      {...fieldDescription(description)}
      className="flex flex-col gap-1"
    >
      {({ isInvalid: invalid }) => (
        <>
          <Label className="font-semibold">
            {whole === null ? label : <OneNode visible={label} whole={whole} />}
          </Label>
          <div className="flex items-center gap-2">
            <Input
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
            <OpenButton label={buttonLabel}>
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
            </OpenButton>
          </div>
          {description ? (
            <FieldHint
              isInvalid={invalid}
              className="text-sm text-foreground-muted"
            >
              {description}
            </FieldHint>
          ) : null}
          <FieldError className="text-sm font-semibold">
            {errorMessage}
          </FieldError>
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
        </>
      )}
    </AriaComboBox>
  );
}

// The button that opens the list. React Aria names it with its own words
// and then the field's label (useComboBox's trigger labels), through an
// aria-labelledby in the button context that a prop of our own cannot
// unset. The callers hand the button its whole name, so the context goes on
// without that pairing, and the name is the words alone (D-187).
function OpenButton({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const given = useSlottedContext(ButtonContext);
  const kept = { ...given };
  delete kept["aria-labelledby"];
  return (
    <ButtonContext.Provider value={kept}>
      <Button
        aria-label={label}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded border border-border bg-background text-foreground"
      >
        {children}
      </Button>
    </ButtonContext.Provider>
  );
}
