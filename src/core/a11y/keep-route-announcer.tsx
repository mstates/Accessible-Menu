"use client";

import { useEffect } from "react";

// Next's route announcer kept out of React Aria's hide (Q-127, D-201). After
// an in-page navigation Next leaves the new page's title in its announcer,
// an assertive alert at the end of the body, until the next navigation. A
// Select's list is a modal layer: while it is open React Aria makes
// everything outside it inert, and on close it gives it all back. VoiceOver
// on iOS reads an alert that comes back, so the next open of any Select read
// the page's title after the option. React Aria's ariaHideOutside keeps
// every element marked data-live-announcer="true" visible, a convention it
// keeps for its own announcer and does not document, so Next's announcer
// carries that mark for the life of the page and never loses it. The cost:
// while a list is open the announcer's text can be reached by a swipe.
//
// Next creates its element in an effect of its own that runs after the root
// layout's, so on a full load it is not there yet: a watch on the body waits
// for it and stops once it is marked. In development Strict Mode runs both
// effects twice, and Next takes its element away and makes a new one on the
// second run, so each run marks what is there or waits for what comes; the
// cleanup only stops the watch.

const ANNOUNCER = "next-route-announcer";
const MARK = "data-live-announcer";

export function KeepRouteAnnouncer() {
  useEffect(() => {
    const mark = () => {
      const announcer = document.querySelector(ANNOUNCER);
      if (!announcer) return false;
      announcer.setAttribute(MARK, "true");
      return true;
    };
    if (mark()) return;
    const observer = new MutationObserver(() => {
      if (mark()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
