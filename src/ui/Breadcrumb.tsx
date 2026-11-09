import { PageLink } from "./PageLink";

// A level above the current page: where it leads, and its name.
export type Crumb = { href: string; label: string };

type Props = {
  // The nav's name, from copy.
  label: string;
  // The levels above this page, outermost first.
  trail: readonly Crumb[];
  // This page's own name. A page of a thing, a dish's Allergens page, has
  // none here (D-222): the trail ends with the thing, as a link, and the
  // page is named by its h1 and marked in the page nav.
  current?: string;
};

// Where a page sits, as a trail (D-128): a nav landmark around an ordered
// list, each level above the page a link, and the page itself last, as
// text. The page's own name is not a link, since a link to the page a
// reader is on is a tab stop that only reloads; it carries
// aria-current="page", so the trail still says which entry is this page.
// A breadcrumb only goes up, so a sub page's trail carries no
// aria-current: the page nav marks the page (D-222). The slash between
// entries is decoration and hidden from assistive technology; the list
// already says how many entries there are and in what order.
//
// Each link is a PageLink, so on an editing screen it waits for saves on
// their way and stays when one has failed (D-111), and it reports to the
// page's loading status (D-106). That is why this is not React Aria's
// Breadcrumbs, whose links are its own. Links keep the 44px height every
// row link has. It sits first in main, above the h1, where the way back
// was.
export function Breadcrumb({ label, trail, current }: Props) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-2">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-x-2">
            <PageLink
              href={crumb.href}
              className="inline-flex min-h-11 min-w-0 items-center text-link underline"
            >
              {crumb.label}
            </PageLink>
            {current !== undefined || index < trail.length - 1 ? (
              <span aria-hidden="true">/</span>
            ) : null}
          </li>
        ))}
        {current !== undefined ? (
          <li className="flex min-h-11 min-w-0 items-center">
            <span aria-current="page" className="min-w-0 font-semibold">
              {current}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
