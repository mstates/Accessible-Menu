"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
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
// A button that cannot act right now but must keep focus, a Move up on the
// first row, takes aria-disabled instead of isDisabled: it stays in the tab
// order and React Aria still fires the press, so its handler returns early
// and says why. It dims like a disabled button and takes the system's
// disabled color in forced colors, where opacity alone is not a signal.
//
// A button that unmounts while its pending message is still in React Aria's
// log (a save remounting the form, the error page replacing it) would leave
// an image named by nothing. So the button carries a known id, and on
// unmount within seven seconds of a pending change it renames the messages
// naming that id with the words its name had while pending: its text, a
// comma and a space, then the pending label ("Save details, in progress"),
// or the pending label alone when it has no text. The words are read in a
// layout effect's cleanup, which React runs before it takes the button's
// node off the page. A one-second watch renames the late first message
// React Aria may still add the same way.
export function Button({ children, pendingLabel, id, ...props }: Props) {
  const fallbackId = useId();
  const buttonId = id ?? fallbackId;
  const isPending = props.isPending ?? false;
  const wasPending = useRef(false);
  const pendingChangedAt = useRef<number | null>(null);

  useEffect(() => {
    if (isPending === wasPending.current) return;
    wasPending.current = isPending;
    pendingChangedAt.current = Date.now();
  }, [isPending]);

  useLayoutEffect(() => {
    const changedAt = pendingChangedAt;
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

  return (
    <AriaButton
      {...props}
      id={buttonId}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 border-transparent bg-foreground px-3.5 py-1.5 font-semibold text-background data-[pressed]:opacity-90 data-[disabled]:opacity-60 data-[pending]:opacity-60 aria-disabled:opacity-60 forced-colors:aria-disabled:not-data-[pending]:border-[color:GrayText] forced-colors:aria-disabled:not-data-[pending]:text-[color:GrayText]"
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
