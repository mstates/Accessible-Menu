"use client";

import { useEffect, useRef } from "react";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { dashboardPath } from "@/features/owner/paths";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";
import { PageLink } from "@/ui/PageLink";

// The focused error page for every owner screen (D-104). An error thrown
// while rendering, or by a save, lands here instead of Next's bare
// "Application error". A save sent from a page older than the current
// deploy is one such error (Q-41): the server no longer knows the action,
// and only a full load brings the new one, so Reload reloads the document
// rather than retrying inside the old page. Focus moves to the heading on
// arrival, which is what announces it. React hoists the title below into
// head beside the one Next wrote for the page, and WebKit on the preview
// (CI's Linux build, at 8db9610, twice) kept reading the page's title where
// Chromium and macOS WebKit read this one, so the effect that focuses the
// heading sets document.title to the same words as well (Q-137, D-208). The
// page only leaves by reload or by navigation, each of which writes its own
// title, so nothing restores this one.
export default function OwnerError() {
  const heading = useRef<HTMLHeadingElement>(null);
  const strings = en.owner.error;
  const title = pageTitle(en, strings.title);
  useEffect(() => {
    document.title = title;
    heading.current?.focus();
  }, [title]);

  return (
    <PageFrame
      siteName={en.site.name}
      homeHref="/"
      loadingLabel={en.ui.loading}
    >
      <title>{title}</title>
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold">
        {strings.heading}
      </h1>
      <p className="mt-4">{strings.lead}</p>
      <p className="mt-2">{strings.saveNote}</p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Button onPress={() => window.location.reload()}>
          {strings.reload}
        </Button>
        <PageLink href={dashboardPath} className="text-link underline">
          {en.owner.restaurants.backToDashboard}
        </PageLink>
      </div>
    </PageFrame>
  );
}
