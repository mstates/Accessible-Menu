"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
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
// head in front of the one Next wrote for the page. But Next streams the
// page's metadata in a Suspense boundary that can hydrate after this page
// mounts, and React then mounts a new copy of the page's title in front of
// this one (WebKit on CI's Linux image, amd64, Q-137). So while this page
// shows, a layout effect keeps its own title first in head, and puts it back
// whenever head's children change. The observer stops in the same commit
// that takes this page away, so it never moves this title over the next
// page's (D-208, entry 8 of the Departures register).
export default function OwnerError() {
  const heading = useRef<HTMLHeadingElement>(null);
  const titleElement = useRef<HTMLTitleElement>(null);
  const strings = en.owner.error;
  const title = pageTitle(en, strings.title);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useLayoutEffect(() => {
    const own = titleElement.current;
    const head = own?.ownerDocument.head;
    if (!own || !head) return;
    const keepFirst = () => {
      const first = head.querySelector(":scope > title");
      if (first !== own) head.insertBefore(own, first);
    };
    keepFirst();
    const observer = new MutationObserver(keepFirst);
    observer.observe(head, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <PageFrame
      siteName={en.site.name}
      homeHref={dashboardPath}
      loadingLabel={en.ui.loading}
    >
      <title ref={titleElement}>{title}</title>
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
