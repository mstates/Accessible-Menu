"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Button as AriaButton,
  ProgressBar,
  type ButtonProps,
} from "react-aria-components";

// A button that can be pending must say what the pending state is called,
// so the two travel together: isPending without pendingLabel is a type error.
type PendingProps =
  | { isPending?: undefined; pendingLabel?: undefined }
  | { isPending: boolean; pendingLabel: string };

type Props = Omit<ButtonProps, "isPending"> & PendingProps;

// One second, the rule a pending link follows before it says Loading
// (D-106, DELAY_MS in NavigationStatus.tsx); the two are one rule (D-209).
// Under about a second a wait does not break the flow, and most saves land
// inside it, so nothing is shown or said for them and the result's focus is
// the only thing read.
const PENDING_DELAY_MS = 1000;

// React Aria announces pending through its live announcer, by reference: it
// appends <div role="img" aria-labelledby={button id}> to an assertive log
// inside [data-live-announcer], removes it after seven seconds, and holds
// back the first message on a page for 100 ms while that log attaches
// (D-109). D-109 read the log's additions-only rule as meaning a node could
// be taken away without unsaying its message; that was heard wrong on the
// iPhone, where "Save details, in progress" was cut off (Q-135). So nothing
// here takes a node away while it may be read: a message that outlives its
// button is renamed instead, and React Aria removes it at seven seconds as
// it does for a button that stays (D-207).
const MESSAGE_LIFETIME_MS = 7000;
const LATE_MESSAGE_WINDOW_MS = 1000;

// The class list. A caller's own aria-disabled (Move up on the first row)
// dims the button and takes the system's disabled color in forced colors,
// where opacity alone is not a signal. The aria-disabled this component sets
// while a press is held inside the second is not styled: the dim comes with
// the spinner at the second (D-209).
const BASE_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 border-transparent bg-foreground px-3.5 py-1.5 font-semibold text-background data-[pressed]:opacity-90 data-[disabled]:opacity-60 data-[pending]:opacity-60";
const CALLER_DISABLED_CLASS =
  "opacity-60 forced-colors:border-[color:GrayText] forced-colors:text-[color:GrayText]";

// Names each message that points at the button by the words the button's
// name had, and drops the pointer, so the message keeps its words once the
// button is gone. The node stays where React Aria put it.
function renameMessagesNaming(id: string, words: string): void {
  for (const node of document.querySelectorAll(
    "[data-live-announcer] [aria-labelledby]",
  )) {
    const ids = node.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
    if (!ids.includes(id)) continue;
    node.setAttribute("aria-label", words);
    node.removeAttribute("aria-labelledby");
  }
}

// The one button. Semantics, keyboard handling, and the pending announcement
// come from React Aria. While pending the label stays as it is and a
// ProgressBar, labelled from copy, sits inside the button: its name joins
// the button's text in the button's accessible name, and React Aria
// announces that name when pending begins and ends while the button has
// focus, so VoiceOver hears "Save details, in progress". The spinner inside
// it is decoration, stroked in currentColor so it survives forced colors.
// Nothing here is ever hidden while pending, or the announcement would lose
// its words. Opacity alone would read as disabled, not as working. The
// transparent border is for forced colors too: the background is dropped
// there, and the border is what gets painted as the button's edge. Padding
// gives back the border's two pixels, so the rendered size is unchanged.
//
// Pending is shown only once it has lasted a second (D-209). The caller's
// isPending holds the press at once: from its first render the button is
// aria-disabled, a submit button becomes type="button" so a second press
// submits nothing, and the press handlers are left out, which is what React
// Aria does while pending. React Aria is handed isPending only after a
// second of it, so the spinner, the dim, data-pending, and React Aria's
// assertive announcement arrive together, and a save that lands inside the
// second says nothing but its result, read on focus. The second is timed in
// a layout effect, from the commit that holds the press, and cleared at
// once when pending ends or the button unmounts.
//
// A button that cannot act right now but must keep focus, a Move up on the
// first row, takes aria-disabled instead of isDisabled: it stays in the tab
// order and React Aria still fires the press, so its handler returns early
// and says why. It dims like a disabled button and takes the system's
// disabled color in forced colors, where opacity alone is not a signal.
//
// A button that unmounts while its pending message is still in React Aria's
// log (a save remounting the form, the error page replacing it) would leave
// an image named by nothing. So the button carries a known id, and on
// unmount within seven seconds of a change in the pending state React Aria
// was handed, it renames the messages naming that id with the words its
// name had while pending: its text, a comma and a space, then the pending
// label ("Save details, in progress"), or the pending label alone when it
// has no text. The words are read in a layout effect's cleanup, which React
// runs before it takes the button's node off the page. A one-second watch
// renames the late first message React Aria may still add the same way.
export function Button({ children, pendingLabel, id, ...props }: Props) {
  const fallbackId = useId();
  const buttonId = id ?? fallbackId;
  const pending = props.isPending ?? false;
  const [lasted, setLasted] = useState(false);
  const shown = pending && lasted;
  const wasShown = useRef(false);
  const shownChangedAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setLasted(true), PENDING_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setLasted(false);
    };
  }, [pending]);

  useEffect(() => {
    if (shown === wasShown.current) return;
    wasShown.current = shown;
    shownChangedAt.current = Date.now();
  }, [shown]);

  useLayoutEffect(() => {
    const changedAt = shownChangedAt;
    return () => {
      const at = changedAt.current;
      if (at === null || Date.now() - at > MESSAGE_LIFETIME_MS) return;
      const text = (document.getElementById(buttonId)?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const words = [text, pendingLabel].filter(Boolean).join(", ");
      renameMessagesNaming(buttonId, words);
      const late = new MutationObserver(() =>
        renameMessagesNaming(buttonId, words),
      );
      late.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => late.disconnect(), LATE_MESSAGE_WINDOW_MS);
    };
  }, [buttonId, pendingLabel]);

  const disabledByCaller =
    props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const held = pending
    ? {
        onPress: undefined,
        onPressStart: undefined,
        onPressEnd: undefined,
        onPressChange: undefined,
        onPressUp: undefined,
      }
    : {};

  return (
    <AriaButton
      {...props}
      {...held}
      isPending={shown}
      aria-disabled={pending ? true : props["aria-disabled"]}
      type={pending && props.type === "submit" ? "button" : props.type}
      id={buttonId}
      className={
        disabledByCaller ? `${BASE_CLASS} ${CALLER_DISABLED_CLASS}` : BASE_CLASS
      }
    >
      {(renderProps) => (
        <>
          {typeof children === "function" ? children(renderProps) : children}
          {renderProps.isPending && pendingLabel ? (
            <ProgressBar
              isIndeterminate
              aria-label={pendingLabel}
              className="flex"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5 shrink-0 motion-safe:animate-spin"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              >
                <path d="M12 3a9 9 0 1 1-6.4 2.6" />
              </svg>
            </ProgressBar>
          ) : null}
        </>
      )}
    </AriaButton>
  );
}
