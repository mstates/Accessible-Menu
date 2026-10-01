import type { ReactNode } from "react";
import { LiveRegion } from "@/core/a11y/live-region";

// Every owner route shares one live region, so announcements from any owner
// screen go through a region that was already on the page.
export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <LiveRegion />
    </>
  );
}
