import type { ReactNode } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import type { DashboardNotice } from "@/core/notice";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";
import { NoticeBanner } from "./NoticeBanner";
import { dashboardPath } from "./paths";

// The dashboard's heading, where focus goes when the flash is dismissed.
const DASHBOARD_HEADING_ID = "dashboard-heading";

type Props = {
  copy: Copy;
  email: string;
  signOut: () => Promise<void>;
  // A result that arrived with the page, the return from Checkout or a
  // restaurant the trial could not find, read from the cookie its sender
  // left (D-219).
  notice: DashboardNotice | null;
  children?: ReactNode;
};

// The dashboard. The page passes each restaurant's billing line as children;
// with none, the empty message shows. Menus arrive with Phase 1.
export function DashboardShell({
  copy,
  email,
  signOut,
  notice,
  children,
}: Props) {
  return (
    <PageFrame
      siteName={copy.site.name}
      homeHref={dashboardPath}
      loadingLabel={copy.ui.loading}
    >
      {/* The flash at the top of the body content, first in main and above
          the heading (D-215), on the load that read the cookie (D-214). */}
      {notice ? (
        <NoticeBanner
          copy={copy}
          notice={notice}
          path={dashboardPath}
          headingId={DASHBOARD_HEADING_ID}
          className="mb-6"
        />
      ) : null}
      {/* Focusable by code alone, for the flash's dismiss button. */}
      <h1
        id={DASHBOARD_HEADING_ID}
        tabIndex={-1}
        className="text-3xl font-bold"
      >
        {copy.owner.heading}
      </h1>
      <p className="mt-2 text-foreground-muted">
        {fill(copy.owner.signedInAs, { email })}
      </p>
      {children ?? <p className="mt-6">{copy.owner.empty}</p>}
      <form action={signOut} className="mt-8">
        <Button type="submit">{copy.owner.signOut}</Button>
      </form>
    </PageFrame>
  );
}
