"use client";

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
export function Button({ children, pendingLabel, ...props }: Props) {
  return (
    <AriaButton
      {...props}
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
