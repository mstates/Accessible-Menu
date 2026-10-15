"use client";

import { useEffect, useRef, type ReactNode } from "react";

// In-page links that land focus on their target (D-81). A fragment link
// scrolls to its section, but VoiceOver does not move to the heading on its
// own, so after the browser has followed the link the heading, or a
// section's choices block (Q-74), which carries tabIndex -1, takes focus.
// It takes it without scrolling, so the target's scroll margin, kept by the
// browser's own scroll, still shows above it (Q-100). With JavaScript off
// the plain fragment link does the scrolling and nothing else, which is the
// fallback D-81 names. The listener sits on the wrapper once the page has hydrated, so
// every link inside it enhances, and the links stay plain anchors in the
// served HTML.
type Props = {
  as?: "nav" | "div";
  label?: string;
  className?: string;
  children: ReactNode;
};

function followLink(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const href = target.closest('a[href^="#"]')?.getAttribute("href");
  if (!href || href.length < 2) return;
  let id: string;
  try {
    id = decodeURIComponent(href.slice(1));
  } catch {
    return;
  }
  const heading = document.getElementById(id);
  if (!(heading instanceof HTMLElement)) return;
  // After the browser has moved to the fragment, not before.
  setTimeout(() => heading.focus({ preventScroll: true }), 0);
}

export function InPageLinks({ as = "nav", label, className, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.addEventListener("click", followLink);
    return () => element.removeEventListener("click", followLink);
  }, []);
  if (as === "div") {
    return (
      <div ref={ref as React.RefObject<HTMLDivElement>} className={className}>
        {children}
      </div>
    );
  }
  return (
    <nav ref={ref} aria-label={label} className={className}>
      {children}
    </nav>
  );
}
