"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

// Lets a screen with unsaved work stop a link from leaving (D-111). The
// browser's leave warning covers full unloads only, and Next drops a pending
// save's result when a navigation starts, so on an editing screen every
// PageLink asks the screen first. The screen registers one guard; a link
// calls it with its href just before it would navigate. "go" lets the link
// through. "hold" stops it, and the screen that said so takes over: it waits
// for its saves and navigates itself, or stays and says why. The guard lives
// here, in the context, so a link never imports the feature that owns it.
// Outside a provider, and with no guard registered, every link goes. The
// link hands itself along as well, so a screen that asks before leaving
// can put focus back on it when the owner stays (D-229).

export type NavigationGuard = (
  href: string,
  from: HTMLElement | null,
) => "go" | "hold";

const GuardContext = createContext<RefObject<NavigationGuard | null> | null>(
  null,
);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guard = useRef<NavigationGuard | null>(null);
  return (
    <GuardContext.Provider value={guard}>{children}</GuardContext.Provider>
  );
}

// Called by the screen that owns the unsaved work. The guard is in place
// while the screen is mounted and gone when it leaves.
export function useNavigationGuard(guard: NavigationGuard): void {
  const guardRef = useContext(GuardContext);
  useEffect(() => {
    if (!guardRef) return;
    guardRef.current = guard;
    return () => {
      guardRef.current = null;
    };
  }, [guardRef, guard]);
}

// Called by PageLink. The returned function reads the guard at the moment of
// the press, so it always asks the screen as it is then.
export function useAskGuard(): NavigationGuard {
  const guardRef = useContext(GuardContext);
  return (href, from) => guardRef?.current?.(href, from) ?? "go";
}
