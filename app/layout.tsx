import type { Metadata } from "next";
import { en } from "@/copy";
import { FocusReset } from "@/core/a11y/focus-reset";
import { KeepRouteAnnouncer } from "@/core/a11y/keep-route-announcer";
import "./globals.css";

export const metadata: Metadata = {
  title: en.site.name,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={en.lang}>
      <head>
        {/* Chrome follows the phone's text size only on pages that opt in
            (D-103). A literal tag, not metadata, so it is never streamed. */}
        <meta name="text-scale" content="scale" />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <FocusReset />
        <KeepRouteAnnouncer />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-3 focus:underline"
        >
          {en.skipLink}
        </a>
        {/* Every page mounts inside this one element, which stays across
            navigations, so a link press never puts a page after Next's
            route announcer at the end of the body (Q-154, D-228). */}
        <div>{children}</div>
      </body>
    </html>
  );
}
