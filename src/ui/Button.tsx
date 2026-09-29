"use client";

import { Button as AriaButton, type ButtonProps } from "react-aria-components";

// The one button. Semantics and keyboard handling come from React Aria.
export function Button(props: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className="inline-flex min-h-11 items-center justify-center rounded bg-foreground px-4 py-2 font-semibold text-background data-[pressed]:opacity-90 data-[disabled]:opacity-60"
    />
  );
}
