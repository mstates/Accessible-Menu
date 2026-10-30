"use client";

import { type ReactNode, useContext, useId } from "react";
import {
  Button,
  FieldError,
  Header,
  Label,
  LabelContext,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select as AriaSelect,
  SelectStateContext,
  SelectValue,
  Text,
  useSlottedContext,
  type SelectProps as AriaSelectProps,
} from "react-aria-components";
import { fieldDescription } from "./field-description";
import { OneNode } from "./OneNode";

export type SelectItem = { id: string; label: string };

// Items under a heading: the sections of one menu, in a dish's move.
export type SelectGroup = { id: string; label: string; items: SelectItem[] };

type Props = Omit<AriaSelectProps<SelectItem>, "children"> & {
  label: string;
  description?: string;
  errorMessage?: string;
  // A flat list, or lists under headings; one of the two.
  items?: SelectItem[];
  groups?: SelectGroup[];
  // The button's id, for an error summary to link to; made here otherwise.
  triggerId?: string;
};

const itemClassName =
  "cursor-default rounded px-3 py-2 outline-none data-[focused]:bg-foreground data-[focused]:text-background data-[selected]:font-semibold";

// A labelled single-choice list. Keyboard, typeahead, and the listbox
// semantics come from React Aria, and so do the groups: each heading names
// its group, so a reader says which menu a section sits in. A required
// field shows an asterisk after its label, hidden from assistive technology
// because isRequired already sets aria-required.
//
// The name (D-193, D-195). React Aria names the button by two elements, the
// value span and then a span label, and VoiceOver on iOS folds a label into
// its control only when that one element labels it, so the span label was
// a stop of its own, read twice (Q-119). Here the label is a real label for
// the button and the button's one labelling element, and its accessible
// text is one node: the visible label, a comma and a space, then the
// chosen value's words, "State, Pennsylvania", as a single clipped text
// node rendered again on each pick, with the visible label inside it
// hidden from assistive technology (OneNode). One node is what folds, and
// its order is ours to write: every other field reads label then value,
// and the comma gives the pause the ear wants, so D-188's value-then-label
// order, kept from React Aria's default, is superseded (D-195). The
// value's words stay in the button for the eye. The id is set on the
// Select itself, so React Aria gives the button that id and the label's
// for agrees with it from the first render (D-187).
export function Select({
  label,
  description,
  errorMessage,
  items,
  groups,
  triggerId,
  ...props
}: Props) {
  const made = useId();
  const id = triggerId ?? made;
  return (
    <AriaSelect
      {...props}
      id={id}
      {...fieldDescription(description)}
      className="flex flex-col gap-1"
    >
      <Label elementType="label" htmlFor={id} className="font-semibold">
        <Words label={label} placeholder={props.placeholder} />
        {props.isRequired ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <Trigger>
        <SelectValue className="min-w-0" />
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
      </Trigger>
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
      <Popover className="max-h-80 w-(--trigger-width) overflow-auto rounded border border-border bg-background-raised shadow-lg">
        {groups ? (
          <ListBox className="p-1 outline-none">
            {groups.map((group) => (
              <ListBoxSection key={group.id} id={group.id}>
                <Header className="px-3 pt-2 pb-1 text-sm font-semibold text-foreground-muted">
                  {group.label}
                </Header>
                {group.items.map((item) => (
                  <ListBoxItem
                    key={item.id}
                    id={item.id}
                    textValue={item.label}
                    className={itemClassName}
                  >
                    {item.label}
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            ))}
          </ListBox>
        ) : (
          <ListBox items={items ?? []} className="p-1 outline-none">
            {(item) => (
              <ListBoxItem
                id={item.id}
                textValue={item.label}
                className={itemClassName}
              >
                {item.label}
              </ListBoxItem>
            )}
          </ListBox>
        )}
      </Popover>
    </AriaSelect>
  );
}

// The label's one node: the visible label, a comma and a space, then the
// chosen value's words, or the placeholder's while nothing is chosen; the
// label alone with neither (D-195).
function Words({
  label,
  placeholder,
}: {
  label: string;
  placeholder?: string;
}) {
  const state = useContext(SelectStateContext);
  const value = state?.selectedItem?.textValue ?? placeholder ?? "";
  return (
    <OneNode
      visible={label}
      whole={value === "" ? label : `${label}, ${value}`}
    />
  );
}

// The button, named by the label alone. React Aria's button context pairs
// it with the value span and then the label; the label holds the value's
// words itself, so the one id is the label's, and a prop set here wins over
// the context's.
function Trigger({ children }: { children: ReactNode }) {
  const label = useSlottedContext(LabelContext);
  return (
    <Button
      aria-labelledby={label?.id}
      className="flex min-h-11 items-center justify-between gap-2 rounded border border-border bg-background px-3 py-2 text-left text-base text-foreground"
    >
      {children}
    </Button>
  );
}
