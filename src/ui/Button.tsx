"use client";

import { Button as AriaButton, type ButtonProps } from "react-aria-components";

// The one button. Semantics, keyboard handling, and the pending announcement
// come from React Aria. While pending the label stays as it is and an
// aria-hidden spinner shows beside it, stroked in currentColor so it survives
// forced colors, the way React Aria's own Tailwind starter does it. Opacity
// alone would read as disabled, not as working.
export function Button({ children, ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-foreground px-4 py-2 font-semibold text-background data-[pressed]:opacity-90 data-[disabled]:opacity-60 data-[pending]:opacity-60"
    >
      {(renderProps) => (
        <>
          {typeof children === "function" ? children(renderProps) : children}
          {renderProps.isPending ? (
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
          ) : null}
        </>
      )}
    </AriaButton>
  );
}
