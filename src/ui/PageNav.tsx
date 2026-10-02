import { PageLink } from "./PageLink";

export type PageNavLink = { href: string; label: string; current: boolean };

type Props = { label: string; links: readonly PageNavLink[] };

// A page's own navigation (D-104): a labelled nav landmark around a list of
// links. The current page carries aria-current and is bold, so its state
// never rests on color. PageFrame places it between the header and main, so
// the skip link passes it.
export function PageNav({ label, links }: Props) {
  return (
    <nav aria-label={label} className="border-b border-border">
      <ul className="mx-auto flex max-w-menu flex-wrap gap-x-6 gap-y-2 px-4 py-3">
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
    </nav>
  );
}
