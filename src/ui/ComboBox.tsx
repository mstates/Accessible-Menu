"use client";

import {
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  ButtonContext,
  ComboBox as AriaComboBox,
  ComboBoxStateContext,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
  useSlottedContext,
} from "react-aria-components";
import { fieldDescription } from "./field-description";
import { HiddenWords } from "./HiddenWords";

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
  // "for Cup". The words follow the label inside it, hidden, so the one
  // label names the field whole, "Size for Cup", and the field keeps that
  // name while it has focus (D-140, D-188), as TextField does. A field alone
  // on its page, a choice list's lead or the address finder, has none.
  labelSuffix?: string;
  // The whole name of the button that opens the list, named the same way.
  buttonLabel: string;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  // What to suggest, in order, each by a key and its text. Filtered as the
  // owner types, unless the list is already the answer to what was typed
  // (prefiltered): then it shows as given, opens when a reply brings it
  // while the field has focus, and never opens on a keystroke by itself,
  // since what it holds answered older text (Q-114). Null, for a
  // prefiltered list, means nothing is asked for what is typed: the list
  // closes, keeping its items until it has closed (Q-121), and once closed
  // holds nothing, so nothing opens it until the next reply. Any text typed
  // is kept.
  items: readonly ComboBoxItem[] | null;
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

const NONE: readonly ComboBoxItem[] = [];

// A text field with suggestions (D-139): the size name field, which offers
// the restaurant's own size names and a short starter list and keeps any
// name typed, and the address finder (D-83), whose list is the answer to
// what was typed. The combobox semantics, the keyboard, and the list come
// from React Aria. The list opens on typing and from the button, never on
// focus alone; a prefiltered list opens from the reply instead (below). It
// commits the way AutosaveTextField does, when it is left or on Enter, and
// once more when a suggestion is chosen, by keyboard or by pointer: the
// choice goes in the field first, so the commit sends it. Enter while a
// suggestion is in view is React Aria's to take, and the choice commits;
// the field's own Enter handler stands aside then, so a half-typed name is
// never sent ahead of the chosen one. Committing twice sends nothing
// twice: a value on its way is not sent again.
//
// Named as TextField names a field (D-140, D-188): by one label, React
// Aria's, with a suffix as hidden words inside it after the visible words,
// held while the field has focus. One label is what VoiceOver on iOS folds
// into the field; a name on the field itself left the plain label beside it
// a stop of its own, read twice (Q-116, Q-118).
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
  const [held, setHeld] = useState<string | null>(null);
  const suffix = labelSuffix ? (held ?? labelSuffix) : null;
  // A prefiltered list keeps the last items it was given while it is open,
  // and hands nothing over only once it has closed (Q-121). On a pick the
  // finder's items turn null while the list is still open; a list handed
  // over as nothing in that render is filtered by React Aria against the
  // collection it still holds, the reply's, by the picked text, and its
  // count is said again, "1 option available." before "selected". So the
  // items stay controlled through the close. The close, FollowAnswer's or
  // React Aria's own on a pick, reports through onOpenChange, and the empty
  // list goes over in the same render, closed, so no open render ever
  // changes its count. The last items are kept as state, taken when the
  // items change, since a prefiltered caller hands over the same list until
  // the next reply.
  const [listOpen, setListOpen] = useState(false);
  const [kept, setKept] = useState(items);
  if (prefiltered && items !== null && items !== kept) setKept(items);
  const shown = items ?? (prefiltered && listOpen ? kept : null) ?? NONE;
  // A prefiltered list never opens on a keystroke (manual). A reply with
  // matches is the list, as given. Nothing, or a reply with none, goes over
  // as a default list, which React Aria will not open from the button, the
  // arrow keys, or a tap: a given list it lets open empty, and then says
  // that zero options are available (useComboBoxState's open guard).
  const listProps = prefiltered
    ? {
        menuTrigger: "manual" as const,
        onOpenChange: (open: boolean) => setListOpen(open),
        ...(shown.length > 0 ? { items: shown } : { defaultItems: shown }),
      }
    : { defaultItems: shown };
  return (
    <AriaComboBox
      id={id}
      allowsCustomValue
      {...listProps}
      inputValue={value}
      onInputChange={onChange}
      onSelectionChange={(key) => {
        if (key === null) return;
        const item = shown.find((each) => each.id === String(key));
        onChange(item?.text ?? String(key));
        if (item) onPick?.(item);
        onCommit?.();
      }}
      onFocusChange={(focused) =>
        setHeld(focused && labelSuffix ? labelSuffix : null)
      }
      onBlur={() => onCommit?.()}
      validationBehavior="aria"
      isInvalid={isInvalid}
      {...fieldDescription(description)}
      className="flex flex-col gap-1"
    >
      <Label className="font-semibold">
        {suffix === null ? label : `${label} `}
        {suffix === null ? null : <HiddenWords text={suffix} />}
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
            onCommit?.();
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
        <Text slot="description" className="text-sm text-foreground-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-sm font-semibold">{errorMessage}</FieldError>
      {prefiltered ? <FollowAnswer items={items} /> : null}
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

// A prefiltered list follows the lookup, not the keystrokes (Q-114, D-187).
// React Aria opens a list on the keystroke that changed the text whenever
// its collection holds items, and that collection trails the items prop by
// one render (the collection store notifies while React commits), so after
// a pick or a pause the first keystroke of a new lookup would reopen the
// last reply's list, and emptying it then would say that zero options are
// available. So the field's trigger is manual, and this child does the
// opening and closing. A reply with matches opens the list when the field
// has focus and the list is closed, unless the owner closed it on the text
// as it stands (Escape, the button, a click outside, a blur) while the
// lookup was still in flight; typing again clears that. Null closes the
// list, which keeps its items until the close has landed (the hold above,
// Q-121). The close is a layout effect on purpose: its update lands in the
// same synchronous render as the handed-over empty list, so no render is
// ever open and empty, where a passive effect would land one render later
// with the zero said between. setOpen is the trigger state's own; the
// combobox state's close commits the value as well.
function FollowAnswer({ items }: { items: readonly ComboBoxItem[] | null }) {
  const state = useContext(ComboBoxStateContext);
  const last = useRef(items);
  const wasOpen = useRef(false);
  const lastValue = useRef<string | null>(null);
  const dismissed = useRef(false);
  useLayoutEffect(() => {
    if (!state) return;
    if (state.inputValue !== lastValue.current) dismissed.current = false;
    lastValue.current = state.inputValue;
    if (wasOpen.current && !state.isOpen) dismissed.current = true;
    wasOpen.current = state.isOpen;
    const landed = items !== last.current;
    last.current = items;
    if (items === null) {
      if (state.isOpen) state.setOpen(false);
      return;
    }
    if (
      landed &&
      items.length > 0 &&
      state.isFocused &&
      !state.isOpen &&
      !dismissed.current
    ) {
      state.open(null, "input");
    }
  });
  return null;
}
