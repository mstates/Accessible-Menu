"use client";

import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type SelectProps as AriaSelectProps,
} from "react-aria-components";

export type SelectItem = { id: string; label: string };

type Props = Omit<AriaSelectProps<SelectItem>, "children"> & {
  label: string;
  description?: string;
  errorMessage?: string;
  items: SelectItem[];
  triggerId?: string;
};

// A labelled single-choice list. Keyboard, typeahead, and the listbox
// semantics come from React Aria. The trigger id lets an error summary link
// to the control. A required field shows an asterisk after its label, hidden
// from assistive technology because isRequired already sets aria-required.
export function Select({
  label,
  description,
  errorMessage,
  items,
  triggerId,
  ...props
}: Props) {
  return (
    <AriaSelect {...props} className="flex flex-col gap-1">
      <Label className="font-semibold">
        {label}
        {props.isRequired ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Button
        id={triggerId}
        className="flex min-h-11 items-center justify-between gap-2 rounded border border-border bg-background px-3 py-2 text-left text-base text-foreground"
      >
        <SelectValue />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </Button>
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
      <Popover className="max-h-80 w-(--trigger-width) overflow-auto rounded border border-border bg-background-raised shadow-lg">
        <ListBox items={items} className="p-1 outline-none">
          {(item) => (
            <ListBoxItem
              id={item.id}
              textValue={item.label}
              className="cursor-default rounded px-3 py-2 outline-none data-[focused]:bg-foreground data-[focused]:text-background data-[selected]:font-semibold"
            >
              {item.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
