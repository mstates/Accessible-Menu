import { useId } from "react";
import { PageLink } from "./PageLink";

// A link is the current page, or the part of the nav the current page sits
// inside, or neither. The first is aria-current="page". The second is
// aria-current="true": the link still goes somewhere, one step up.
export type TopNavLink = {
  href: string;
  label: string;
  current: false | "page" | "true";
};

type Props = { label: string; links: readonly TopNavLink[] };

// The bar between the header and main (D-104, D-222): a nav landmark
// around a row of links, named by the visible text in front of them, the
// restaurant's name on owner pages. That text is where a page that belongs
// to a restaurant shows which one, since the h1 is the page's own name. The
// current link carries aria-current and is bold, so its state never rests
// on color. PageFrame places it between the header and main, so the skip
// link passes it. The pages of one thing, a dish's five, are PageNav's,
// inside main.
export function TopNav({ label, links }: Props) {
  const labelId = useId();
  return (
    <nav aria-labelledby={labelId} className="border-b border-border">
      <div className="mx-auto flex max-w-menu flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-3">
        <p id={labelId} className="min-w-0 font-semibold">
          {label}
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map((link) => (
            <li key={link.href} className="min-w-0">
              <PageLink
                href={link.href}
                aria-current={link.current || undefined}
                className={
                  link.current
                    ? "font-bold text-link underline"
                    : "text-link underline"
                }
              >
                {link.label}
              </PageLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
