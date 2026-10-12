import type { ReactNode } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { menuUrl } from "@/domain/menu-url";
import { PageLink } from "@/ui/PageLink";
import { restaurantDetailsPath, restaurantMenusPath } from "./paths";

type Props = {
  copy: Copy;
  name: string;
  code: string;
  origin: { origin: string; permanent: boolean };
  // What the restaurant's menus say about Publish (D-82): which are
  // published, and which have changes not published yet; nothing for a
  // restaurant with no menu.
  publishing: readonly string[];
  children?: ReactNode;
};

// One restaurant on the dashboard: its name, its menu link from the one
// builder (D-88), its menus' publish state, the way to its details and to
// its menus, and whatever the page passes in (the billing line). The "never
// changes" note shows only when the origin is the configured one; a
// preview URL is not permanent. Each link names the restaurant in visually
// hidden text, so a list of links reads one entry per restaurant instead of
// "Edit details" over and over.
export function RestaurantCard({
  copy,
  name,
  code,
  origin,
  publishing,
  children,
}: Props) {
  const headingId = `restaurant-${code}`;
  const strings = copy.owner.restaurants;
  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 rounded border border-border p-4"
    >
      <h2 id={headingId} className="text-xl font-bold">
        {name}
      </h2>
      <p className="mt-2">
        <span className="font-semibold">{strings.menuLink}</span>{" "}
        <span className="break-all">{menuUrl(origin.origin, code)}</span>
      </p>
      {origin.permanent ? (
        <p className="mt-1 text-sm text-foreground-muted">
          {strings.menuLinkPermanent}
        </p>
      ) : null}
      {publishing.map((sentence) => (
        <p key={sentence} className="mt-2">
          {sentence}
        </p>
      ))}
      <p className="mt-2">
        <PageLink
          href={restaurantDetailsPath(code)}
          className="text-link underline"
        >
          {strings.editDetails}
          <span className="sr-only">
            {" "}
            {fill(strings.editDetailsFor, { restaurant: name })}
          </span>
        </PageLink>
      </p>
      <p className="mt-2">
        <PageLink
          href={restaurantMenusPath(code)}
          className="text-link underline"
        >
          {strings.editMenus}
          <span className="sr-only">
            {" "}
            {fill(strings.editMenusFor, { restaurant: name })}
          </span>
        </PageLink>
      </p>
      {children}
    </section>
  );
}
