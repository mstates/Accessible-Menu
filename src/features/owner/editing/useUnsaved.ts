"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigationGuard, type NavigationGuard } from "@/ui/NavigationGuard";
import { useReportPending } from "@/ui/NavigationStatus";

// The leave rule of a page that saves by a press (D-229): an owner link
// pressed while the page holds unsaved changes asks first, through the one
// dialog, and the browser's own warning covers a full unload. While a save
// is on its way a link is held with no question: a save that lands loads
// the page again, one that fails keeps the page with its summary focused.
// Once the owner has said Leave, or a save has landed and the page is about
// to load again, nothing holds and nothing warns. Back and forward are not
// guarded (Michael, November 9, 2026): Next owns popstate with no hook to
// refuse it, so the browser's warning is what covers them, on a full
// unload only.

type Asking = {
  href: string;
  // The link that asked, where focus goes back when the owner stays.
  from: HTMLElement | null;
};

type Props = {
  dirty: boolean;
  pending: boolean;
  // The page's h1, where focus goes on Keep when the link is gone.
  headingId: string;
};

export function useUnsaved({ dirty, pending, headingId }: Props) {
  const router = useRouter();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [leaving, setLeaving] = useState(false);
  // The same values for code that runs outside a render: the link guard
  // and the unload warning.
  const live = useRef({ dirty, pending, leaving: false });
  useLayoutEffect(() => {
    live.current.dirty = dirty;
    live.current.pending = pending;
  }, [dirty, pending]);

  const guard = useCallback<NavigationGuard>((href, from) => {
    const state = live.current;
    if (state.leaving) return "go";
    if (state.pending) return "hold";
    if (!state.dirty) return "go";
    setAsking({ href, from });
    return "hold";
  }, []);
  useNavigationGuard(guard);

  // Once the owner said Leave, and until the page they chose arrives, the
  // header's status region counts the wait as pending, so "Loading" shows
  // after a second (D-106).
  useReportPending(leaving);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const state = live.current;
      if (!state.leaving && (state.dirty || state.pending)) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Keep, or Escape: the dialog closes first, in its own commit, since the
  // page behind a React Aria modal is inert and a focus placed before it
  // has closed is lost; then focus goes back to the link that asked, or to
  // the h1 when it is gone.
  function keep() {
    const from = asking?.from ?? null;
    flushSync(() => setAsking(null));
    const target =
      from && from.isConnected ? from : document.getElementById(headingId);
    target?.focus();
  }

  // Leave: the dialog closes, nothing holds or warns any more, and the
  // router goes where the link pointed. router.push never asks the guard.
  function leave() {
    const href = asking?.href;
    if (href === undefined) return;
    flushSync(() => setAsking(null));
    live.current.leaving = true;
    setLeaving(true);
    router.push(href);
  }

  // A save landed and the page is about to load again as a new document:
  // nothing warns on the way out.
  function departing() {
    live.current.leaving = true;
  }

  return { asking: asking !== null, keep, leave, departing };
}
