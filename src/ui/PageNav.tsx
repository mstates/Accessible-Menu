import { useId } from "react";
import { PageLink } from "./PageLink";

export type PageNavLink = { href: string; label: string; current: boolean };

type Props = { label: string; links: readonly PageNavLink[] };

// A page's own navigation (D-104): a nav landmark around a list of links,
// named by the visible text in front of them, the restaurant's name on owner
// pages. That text is where a page that belongs to a restaurant shows which
// one, since the h1 is the page's own name. The current page carries
// aria-current and is bold, so its state never rests on color. PageFrame
// places it between the header and main, so the skip link passes it.
export function PageNav({ label, links }: Props) {
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
                aria-current={link.current ? "page" : undefined}
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
