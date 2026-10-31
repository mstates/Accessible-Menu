"use client";

import {
  FieldError,
  Input,
  Label,
  SearchField as AriaSearchField,
  Text,
  type SearchFieldProps,
} from "react-aria-components";
import { Button } from "./Button";
import { fieldDescription } from "./field-description";

type Props = SearchFieldProps & {
  id: string;
  label: string;
  // The clear button's whole name, from copy.
  clearLabel: string;
  description?: string;
  errorMessage?: string;
};

const inputClassName =
  "w-full min-w-0 rounded border border-border bg-background px-3 py-2 text-base text-foreground";

// A search field (D-200): a text input whose Return runs a lookup and never
// submits the form, with a clear button beside it. The semantics, the keys,
// and the clear button's press come from React Aria's SearchField. The
// address finder is the one caller; it lists its matches after the field,
// in the page flow, never inside this component, because React Aria hands
// every Button inside the field the clear button's props through its
// button context.
//
// Named as TextField names a field (D-187, D-193): by one label, React
// Aria's, one visible text node, with the id set on the field so React
// Aria puts it on the input and the label's for agrees with it from the
// first render; no name on the input itself. The description is handed to
// React Aria as well as shown, so the hint stays tied to the input
// (fieldDescription).
//
// Return goes to React Aria's onSubmit, which takes the key from the form:
// without an onSubmit the browser submits the form the field sits in,
// which is how the finder's Return saved the Details page (Q-125). Escape
// empties the field through onChange and then calls onClear; with the
// field already empty the key goes on to the page.
//
// The clear button is React Aria's, rendered as the one Button. React Aria
// names it "Clear search" through its button context, keeps it out of the
// tab order, and focuses the input as the press starts so a phone's
// keyboard stays up; the name from copy wins because React Aria merges the
// context's props first and the component's own second. It is shown only
// while the field holds text: React Aria marks the root with data-empty
// while the value is empty, and the button's wrapper hides on that mark,
// which also takes it out of the swipe order. The input is type search, so
// a phone's keyboard offers a search key (enterKeyHint), and WebKit's own
// cancel button and decoration are hidden so the one clear button is the
// only one; appearance none drops iOS Safari's searchfield look so the
// border and the padding apply.
export function SearchField({
  id,
  label,
  clearLabel,
  description,
  errorMessage,
  ...props
}: Props) {
  return (
    <AriaSearchField
      {...props}
      id={id}
      validationBehavior="aria"
      {...fieldDescription(description)}
      className="group flex flex-col gap-1"
    >
      <Label className="font-semibold">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          enterKeyHint="search"
          autoComplete="off"
          className={`${inputClassName} min-h-11 appearance-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:hidden`}
        />
        <span className="group-data-[empty]:hidden">
          <Button aria-label={clearLabel}>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </Button>
        </span>
      </div>
      {description ? (
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
    </AriaSearchField>
  );
}
