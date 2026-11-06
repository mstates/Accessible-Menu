"use client";

import { useEffect, useRef, useState } from "react";
import { Banner } from "@/ui/Banner";
import {
  clearedSavedNoticeCookie,
  DETAILS_HEADING_ID,
  hasSavedNotice,
} from "./saved-notice";

type Props = {
  code: string;
  title: string;
  dismissLabel: string;
  message: string;
  className?: string;
};

// The success banner after Save details (D-211, Q-141). The page renders it
// only when the save's cookie came with the request, and it clears the
// cookie once it shows, so a refresh shows nothing. It is a flash (D-214):
// on the load that read the cookie its words are an alert and its dismiss
// button takes focus from the served autofocus, GitHub's shape; on any other
// load there is no banner, so nothing is focused or alerted.
//
// Whether it shows is decided once, at mount: the first arrival hydrates
// with the cookie still set and matches the server, and a page Next
// restores from its router cache on Back mounts it again with the cookie
// gone and renders nothing.
//
// A page the browser restores from its back-forward cache is another
// matter: it comes back exactly as it was left, banner and all, and nothing
// of the page mounts or loads again, so neither the server nor the read at
// mount can stop it. So the banner also hides itself on a pageshow that says
// the page was persisted, and a Back from an unrelated full load never shows
// it again (Michael at the plan's approval). If focus was inside it then,
// focus goes to the Details heading, as on dismiss, so it is not lost.
// Since the served autofocus leaves focus on the dismiss button, that is
// the usual case when the owner left by a typed address (D-214). A restore
// runs no autofocus again: the browser processes it once per document.
export function SavedBanner({
  code,
  title,
  dismissLabel,
  message,
  className,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(
    () => typeof document === "undefined" || hasSavedNotice(document.cookie),
  );

  useEffect(() => {
    document.cookie = clearedSavedNoticeCookie(code);
  }, [code]);

  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (ref.current?.contains(document.activeElement)) {
        document.getElementById(DETAILS_HEADING_ID)?.focus();
      }
      setShown(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  if (!shown) return null;
  return (
    <Banner
      ref={ref}
      kind="success"
      title={title}
      dismiss={{ label: dismissLabel, focusId: DETAILS_HEADING_ID }}
      flash
      className={className}
    >
      {message}
    </Banner>
  );
}
