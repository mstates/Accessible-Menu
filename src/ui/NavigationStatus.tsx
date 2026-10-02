"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// The announced loading state (D-104, D-106). It comes from the link, not
// from a loading page: the old page stays on screen until the new one
// commits, so Next's route announcer reads the arriving page as it always
// has. Every PageLink inside the provider reports while its navigation is
// pending. The status region is on the page and empty from the start; it
// shows and says the word only once a link has been pending for a second,
// so a quick load says nothing, and it can only speak before the commit,
// while the announcer speaks at it. It never moves focus and sets no title.

// Under about a second a wait does not break the flow, and the page usually
// arrives before the word could be spoken. Past a second, silence starts to
// sound like nothing happened.
const DELAY_MS = 1000;

type Status = {
  pendingLinks: number;
  add: () => void;
  remove: () => void;
};

const StatusContext = createContext<Status | null>(null);

export function NavigationStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pendingLinks, setPendingLinks] = useState(0);
  const add = useCallback(() => setPendingLinks((count) => count + 1), []);
  const remove = useCallback(
    () => setPendingLinks((count) => Math.max(0, count - 1)),
    [],
  );
  const value = useMemo(
    () => ({ pendingLinks, add, remove }),
    [pendingLinks, add, remove],
  );
  return (
    <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
  );
}

// Called by a child of each PageLink with the link's own pending state. Outside
// a provider, on the public pages, it reports nothing.
export function useReportPending(pending: boolean): void {
  const status = useContext(StatusContext);
  const add = status?.add;
  const remove = status?.remove;
  useEffect(() => {
    if (!pending || !add || !remove) return;
    add();
    return remove;
  }, [pending, add, remove]);
}

// A polite live region, present while the page is. The word mounts inside it
// after the delay, so the region already exists when its text changes, which
// is what makes a screen reader speak it.
export function NavigationStatusRegion({ label }: { label: string }) {
  const status = useContext(StatusContext);
  const pending = (status?.pendingLinks ?? 0) > 0;
  return (
    <div role="status" className="min-w-0 text-foreground-muted">
      {pending ? <AfterDelay label={label} /> : null}
    </div>
  );
}

// Mounted when a navigation starts pending and unmounted when it ends, so
// each wait starts its own second.
function AfterDelay({ label }: { label: string }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLate(true), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return late ? label : null;
}
