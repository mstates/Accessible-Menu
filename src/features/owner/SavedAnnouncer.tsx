"use client";

import { useEffect } from "react";
import { announce } from "@/core/a11y/live-region";

// Mounted with key={saved} by the details page, so every save, including two
// in a row, is spoken through the layout's live region. Content that is on
// the page at load is not announced by a status region on its own.
export function SavedAnnouncer({ message }: { message: string }) {
  useEffect(() => {
    announce(message);
  }, [message]);
  return null;
}
