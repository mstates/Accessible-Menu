import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  siteName: string;
  homeHref: string;
  children: ReactNode;
};

// Header, main, and footer landmarks for every page that is not a menu.
// The skip link in the root layout targets #main.
export function PageFrame({ siteName, homeHref, children }: Props) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto max-w-menu px-4 py-3">
          <Link href={homeHref} className="font-semibold underline">
            {siteName}
          </Link>
        </div>
      </header>
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
}
