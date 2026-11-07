"use client";

import { useEffect, useRef } from "react";

// One focused result message (D-104): the sign-in outcomes shown in place,
// sent and failed. It takes focus when it mounts, and moving focus is what
// announces it: no live role, and a focus-visible outline shows a keyboard
// user where focus landed. The caller keys it per attempt, so the same
// message twice mounts twice and is read twice. A result a page load brings
// is not this: it is the flash, carried by the notice cookie (D-211, D-219,
// NoticeBanner in features/owner).

type Props = { message: string; className?: string };

export function ResultMessage({ message, className }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <p
      ref={ref}
      tabIndex={-1}
      className={`rounded bg-background-raised p-4 ${className ?? ""}`}
    >
      {message}
    </p>
  );
}
