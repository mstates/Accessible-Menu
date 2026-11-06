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
// inside it, so nothing is shown or said for them and only the result is
// heard. Heard on iOS and on the Mac (Q-140): the hold keeps a quick save
// silent until its result.
const PENDING_DELAY_MS = 1000;

// React Aria announces pending through its live announcer, by reference: it
// appends <div role="img" aria-labelledby={button id}> to an assertive log
// inside [data-live-announcer], removes it after seven seconds, and holds
// back the first message on a page for 100 ms while that log attaches
// (D-109). A button that unmounts inside those seven seconds leaves a
// message naming nothing. What three platforms heard (Q-140, D-210): with
// VoiceOver on iOS that orphan is a stop, a jump to the top lands on
// "image", and the message is cut when its button goes whatever is done to
// the node, so taking the node away costs nothing audible and takes the
// stop away; with VoiceOver on macOS, in Chromium and in WebKit, the orphan
// is never a stop and a message added after its button is gone says
// nothing. So the node is taken away. Renaming it instead (D-207) lost
// "Saved." on iOS, where the kept message won over the result's focus, and
// read a stale "in progress" after "Saved." on the Mac.
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

// Takes each message that names the button out of React Aria's logs
// (D-109, D-210).
function dropMessagesNaming(id: string): void {
  for (const node of document.querySelectorAll(
    "[data-live-announcer] [aria-labelledby]",
  )) {
    const ids = node.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
    if (ids.includes(id)) node.remove();
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
// second says nothing but its result. The second is timed in a layout
// effect, from the commit that holds the press, and cleared at once when
// pending ends or the button unmounts.
//
// A button that cannot act right now but must keep focus, a Move up on the
// first row, takes aria-disabled instead of isDisabled: it stays in the tab
// order and React Aria still fires the press, so its handler returns early
// and says why. It dims like a disabled button and takes the system's
// disabled color in forced colors, where opacity alone is not a signal.
//
// A button that unmounts while its pending message is still in React Aria's
// log (the error page replacing the form) would leave an image named by
// nothing, a stop on iOS. So the button carries a known id, and on unmount
// within seven seconds of a change in the pending state React Aria was
// handed, it takes the messages naming that id out of the log, then watches
// for one second for the late first message React Aria may still add and
// takes that out too. Nothing is renamed (D-210). A Details save that lands
// takes the whole document with it (D-211).
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

  useEffect(() => {
    const changedAt = shownChangedAt;
    return () => {
      const at = changedAt.current;
      if (at === null || Date.now() - at > MESSAGE_LIFETIME_MS) return;
      dropMessagesNaming(buttonId);
      const late = new MutationObserver(() => dropMessagesNaming(buttonId));
      late.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => late.disconnect(), LATE_MESSAGE_WINDOW_MS);
    };
  }, [buttonId]);

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
