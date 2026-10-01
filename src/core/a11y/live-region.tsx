"use client";

import { useEffect, useState } from "react";

// One polite live region per page, mounted once by a layout, and announce()
// to speak through it. The region is cleared before the next message lands,
// so the same text can be announced twice in a row (two saves, for example).
// Content already on the page when it loads is not announced by this; put
// arrival outcomes in the page title instead.

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

const CLEAR_DELAY_MS = 50;

export function announce(message: string): void {
  listeners.forEach((listener) => listener(message));
}

export function LiveRegion() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener: Listener = (next) => {
      setMessage("");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(next), CLEAR_DELAY_MS);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
