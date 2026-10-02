"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Focus on page change (D-97). A client-side navigation in Next does not
// reset focus the way a full page load does: Next calls focus() on the
// changed segment's first element, which is usually not focusable, so the
// browser keeps a starting point near the old content and the first Tab
// skips the header and the skip link. On every path change after the first
// render this focuses an empty element at the very start of the body, before
// the skip link: no text, no role, no visible outline, no scroll, so nothing
// is spoken over the route announcer and the next Tab is the skip link, as
// after a full page load. Changes to only the query or the hash do not
// change the pathname, so ?saved and in-page section links keep their own
// focus. Pages that place focus on purpose do so on state or query changes,
// never on a path change, so this never takes focus from them.
export function FocusReset() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    sentinel.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div
      ref={sentinel}
      tabIndex={-1}
      data-focus-reset
      className="outline-none"
    />
  );
}
