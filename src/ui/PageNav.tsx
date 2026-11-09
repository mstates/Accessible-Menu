import { PageLink } from "./PageLink";

// One page of the thing the owner is on: where it is, what it is called,
// where it stands in a few words, and whether it is this page.
export type PageNavItem = {
  href: string;
  name: string;
  state?: string | null;
  current: boolean;
};

type Props = {
  // The thing's visible name, the words in the h1 or the breadcrumb.
  label: string;
  items: readonly PageNavItem[];
};

// The third of an owner page's three ways around (D-222), after the
// restaurant nav (TopNav) and the breadcrumb: the pages of the thing the
// owner is on, a dish's five, as a list of links inside main, after the h1.
// A thing's config (features/owner/dish/dish-pages.ts) says which pages
// and in what order, five at most, so this draws and decides nothing.
//
// The nav is named by the thing's name through aria-label, not a visible
// label of its own: on the thing's first page a label here would repeat
// the h1 directly above it, and the words are already visible in the h1
// and in the breadcrumb. No "navigation" in the name, since the landmark's
// role says it.
//
// A page's state sits inside its link, after the page's name, as a second
// visible span with no aria-hidden and no aria-describedby, so the link's
// name is the page's name then its state: "Allergens Not confirmed yet".
// VoiceOver speaks a description as a hint, after a pause and only while
// Speak Hints is on, and the state carries the allergen nudge D-222 relies
// on, so it must be heard with the link every time. The h1 and the title
// keep the page's name alone.
//
// The current page is marked by aria-current="page" and, on screen, by a
// bar on the link's left drawn as its own left border, a raised background,
// and a heavier weight: the bar is a shape, so the mark is never weight or
// color alone, and a border survives forced colors where a background does
// not. The other links take the bar's width as padding, never as a
// transparent border: a transparent border paints in forced colors, the
// trick this repository uses to draw edges there, and every link would
// show a bar. The list is one column at every size; the page lays it out
// beside or above the content.
export function PageNav({ label, items }: Props) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.href}>
            <PageLink
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={
                item.current
                  ? "flex min-h-11 flex-wrap items-baseline gap-x-3 border-l-4 border-current bg-background-raised py-2 pr-3 pl-3 font-semibold text-link"
                  : "flex min-h-11 flex-wrap items-baseline gap-x-3 py-2 pr-3 pl-4 text-link"
              }
            >
              <span className="underline">{item.name}</span>{" "}
              {item.state ? (
                <span className="text-sm text-foreground-muted">
                  {item.state}
                </span>
              ) : null}
            </PageLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
