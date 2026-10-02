"use client";

import { useEffect, useId, useRef } from "react";
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
// back the first message on a page for 100 ms while that log attaches. The
// logs take additions only, so a message is spoken when it is added and
// taking it out later unsays nothing (D-109).
const MESSAGE_LIFETIME_MS = 7000;
const LATE_MESSAGE_WINDOW_MS = 1000;

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
// ProgressBar, labelled from copy, sits inside the button: React Aria gives
// it the id it folds into the button's accessible name and announces that
// name when pending begins and ends while the button has focus, so VoiceOver
// hears "Save details, in progress". The spinner inside it is decoration,
// stroked in currentColor so it survives forced colors. Nothing here is ever
// hidden while pending, or the announcement would lose its words. Opacity
// alone would read as disabled, not as working. The transparent border is
// for forced colors too: the background is dropped there, and the border is
// what gets painted as the button's edge. Padding gives back the border's
// two pixels, so the rendered size is unchanged.
//
// A button that unmounts while its pending message is still in React Aria's
// log (a save remounting the form, the error page replacing it) would leave
// an image named by nothing. So the button carries a known id, and on
// unmount within seven seconds of a pending change it takes the messages
// naming that id out of the log, then watches for one second for the late
// first message React Aria may still add.
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

  useEffect(() => {
    const changedAt = pendingChangedAt;
    return () => {
      const at = changedAt.current;
      if (at === null || Date.now() - at > MESSAGE_LIFETIME_MS) return;
      dropMessagesNaming(buttonId);
      const late = new MutationObserver(() => dropMessagesNaming(buttonId));
      late.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => late.disconnect(), LATE_MESSAGE_WINDOW_MS);
    };
  }, [buttonId]);

  return (
    <AriaButton
      {...props}
      id={buttonId}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 border-transparent bg-foreground px-3.5 py-1.5 font-semibold text-background data-[pressed]:opacity-90 data-[disabled]:opacity-60 data-[pending]:opacity-60"
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
