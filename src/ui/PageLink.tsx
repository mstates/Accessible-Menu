"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { useReportPending } from "./NavigationStatus";

type Props = ComponentProps<typeof Link>;

// A route link on an owner page. While its navigation is pending it tells the
// page's status region, which says "Loading" once the wait passes a second
// (D-106). useLinkStatus reads the Link it sits inside, so the report is a
// child of the link; it renders nothing.
export function PageLink({ children, ...props }: Props) {
  return (
    <Link {...props}>
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
