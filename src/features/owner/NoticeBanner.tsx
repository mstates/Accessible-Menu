"use client";

import { useEffect, useRef, useState } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { clearedNoticeCookie, readNotice, type NoticeKey } from "@/core/notice";
import { Banner, type BannerKind } from "@/ui/Banner";

type Props = {
  copy: Copy;
  notice: NoticeKey;
  // The page's path, the cookie's Path, which the clear names too.
  path: string;
  // The page's heading, where focus goes when the flash is dismissed.
  headingId: string;
  // The menu a Publish or an Unpublish landed on, which its words name
  // (D-231).
  menu?: string;
  className?: string;
};

// Each result's kind and words (D-219, Primer's variants): success for a
// result that landed, info for one that changed nothing, critical for a
// failure. The kind's word names the region and is its heading; the words
// are in the trigger's own terms.
function result(
  copy: Copy,
  notice: NoticeKey,
  menu: string,
): { kind: BannerKind; words: string } {
  switch (notice) {
    case "details-saved":
      return { kind: "success", words: copy.owner.restaurants.details.saved };
    case "checkout-success":
      return { kind: "success", words: copy.owner.billing.checkoutSuccess };
    case "checkout-cancel":
      return { kind: "info", words: copy.owner.billing.checkoutCancel };
    case "checkout-missing":
      return { kind: "critical", words: copy.owner.billing.restaurantMissing };
    case "sign-in-link":
      return { kind: "critical", words: copy.owner.signIn.failures.link };
    case "sign-in-google":
      return { kind: "critical", words: copy.owner.signIn.failures.google };
    case "allergens-saved":
      return { kind: "success", words: copy.owner.dish.allergens.saved };
    case "tags-saved":
      return { kind: "success", words: copy.owner.dish.tags.saved };
    case "availability-saved":
      return { kind: "success", words: copy.owner.dish.availability.saved };
    case "menu-published":
      return {
        kind: "success",
        words: fill(copy.owner.publishing.flash.published, { menu }),
      };
    case "menu-unpublished":
      return {
        kind: "success",
        words: fill(copy.owner.publishing.flash.unpublished, { menu }),
      };
  }
}

// The flash a page load brings as its result (D-211, D-219, Q-141): a
// Details save that landed, the return from Checkout, a restaurant the
// trial could not find, a sign-in that failed before the page loaded. The
// page renders it only when the result's cookie came with the request, and
// it clears the cookie once it shows, so a refresh shows nothing. It is a
// flash (D-214): on the load that read the cookie its words are an alert
// and its dismiss button takes focus from the served autofocus, GitHub's
// shape; on any other load there is no banner, so nothing is focused or
// alerted.
//
// Whether it shows is decided once, at mount: the first arrival hydrates
// with the cookie still set and matches the server, and a page Next
// restores from its router cache on Back mounts it again with the cookie
// gone and renders nothing.
//
// A page the browser restores from its back-forward cache is another
// matter: it comes back exactly as it was left, banner and all, and nothing
// of the page mounts or loads again, so neither the server nor the read at
// mount can stop it. So the banner also hides itself on a pageshow that says
// the page was persisted, and a Back from an unrelated full load never shows
// it again (Michael at the plan's approval). If focus was inside it then,
// focus goes to the page's heading, as on dismiss, so it is not lost.
// Since the served autofocus leaves focus on the dismiss button, that is
// the usual case when the owner left by a typed address (D-214). A restore
// runs no autofocus again: the browser processes it once per document.
export function NoticeBanner({
  copy,
  notice,
  path,
  headingId,
  menu = "",
  className,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(
    () =>
      typeof document === "undefined" ||
      readNotice(document.cookie, [notice]) === notice,
  );

  useEffect(() => {
    document.cookie = clearedNoticeCookie(path);
  }, [path]);

  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (ref.current?.contains(document.activeElement)) {
        document.getElementById(headingId)?.focus();
      }
      setShown(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [headingId]);

  if (!shown) return null;
  const { kind, words } = result(copy, notice, menu);
  return (
    <Banner
      ref={ref}
      kind={kind}
      title={copy.ui.banner[kind]}
      dismiss={{ label: copy.ui.banner.dismiss, focusId: headingId }}
      flash
      className={className}
    >
      {words}
    </Banner>
  );
}
