import Link from "next/link";
import type { ReactNode } from "react";
import { NavigationGuardProvider } from "./NavigationGuard";
import {
  NavigationStatusProvider,
  NavigationStatusRegion,
} from "./NavigationStatus";
import { PageLink } from "./PageLink";

type Props = {
  siteName: string;
  homeHref: string;
  // A page's own navigation, placed between the header and main so the skip
  // link passes it (D-104).
  nav?: ReactNode;
  // Owner pages pass the loading word. The frame then carries the status
  // region in the header, and every PageLink inside reports to it (D-106).
  // It also carries the navigation guard, and the site link becomes a
  // PageLink, so every link on an editing screen asks before it leaves
  // (D-111).
  loadingLabel?: string;
  children: ReactNode;
};

const siteLinkClassName = "min-w-0 font-semibold underline";

// Header, main, and footer landmarks for every page that is not a menu.
// The skip link in the root layout targets #main.
export function PageFrame({
  siteName,
  homeHref,
  nav,
  loadingLabel,
  children,
}: Props) {
  const frame = (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-menu flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
          {loadingLabel ? (
            <PageLink href={homeHref} className={siteLinkClassName}>
              {siteName}
            </PageLink>
          ) : (
            <Link href={homeHref} className={siteLinkClassName}>
              {siteName}
            </Link>
          )}
          {loadingLabel ? (
            <NavigationStatusRegion label={loadingLabel} />
          ) : null}
        </div>
      </header>
      {nav}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-menu px-4 py-8 outline-none"
      >
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-menu px-4 py-6 text-sm text-foreground-muted">
          {siteName}
        </div>
      </footer>
    </>
  );
  return loadingLabel ? (
    <NavigationStatusProvider>
      <NavigationGuardProvider>{frame}</NavigationGuardProvider>
    </NavigationStatusProvider>
  ) : (
    frame
  );
}
