"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { useAskGuard } from "./NavigationGuard";
import { useReportPending } from "./NavigationStatus";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

// A route link on an owner page. While its navigation is pending it tells the
// page's status region, which says "Loading" once the wait passes a second
// (D-106). useLinkStatus reads the Link it sits inside, so the report is a
// child of the link; it renders nothing. Before it navigates it asks the
// page's guard, through Next's onNavigate, which is how a screen with
// unsaved work keeps the link from leaving (D-111). The href is a string, so
// the guard can navigate to it later.
//
// It never prefetches (D-134). A link pressed while its own prefetch is
// still on its way arrives with an empty title for one render, and Next's
// route announcer reads the h1 alone. An owner page is rendered for each
// request anyway, so a prefetch saved no wait; it cost a server render, the
// session and the database read again, for every link in view.
export function PageLink({ children, href, onNavigate, ...props }: Props) {
  const ask = useAskGuard();
  return (
    <Link
      {...props}
      prefetch={false}
      href={href}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (ask(href) === "hold") event.preventDefault();
      }}
    >
      {children}
      <PendingReport />
    </Link>
  );
}

function PendingReport() {
  const { pending } = useLinkStatus();
  useReportPending(pending);
  return null;
}
