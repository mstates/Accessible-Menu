import Link from "next/link";
import { Fragment } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { InPageLinks } from "@/core/a11y/section-links";
import type { DinerDish, DinerSection } from "@/domain/diner";
import { feedbackPath, statementPath } from "@/domain/menu-url";
import { AllergenSentence } from "@/ui/AllergenSentence";
import type { MenuPageData } from "./load";

type Props = { data: MenuPageData; copy: Copy };

// The diner menu (Spec 3.1, 3.2, 3.4): static HTML, readable with
// JavaScript off (module rule 1). The headings are "Accessible menu", the
// restaurant's name, then one per section, and nothing else (D-81). main
// starts at the h1, so the skip link never passes the allergen note or the
// confirmation line; the two navs sit inside it and the footer outside
// (Michael, at the plan's approval). Every sentence comes from the view
// model, which built it with the domain's one builder for it (rule 8).
export function MenuPage({ data, copy }: Props) {
  const { restaurant, menus, menu, code } = data;
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-menu px-4 pt-6 pb-10 outline-none"
      >
        <h1 className="text-sm font-semibold text-foreground-muted">
          {copy.site.descriptor}
        </h1>
        <h2 className="text-3xl font-bold">{restaurant.name}</h2>
        {menus.length > 1 ? (
          <nav aria-label={copy.menu.menusLabel} className="mt-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {menus.map((entry) => (
                <li key={entry.id} className="min-w-0">
                  <Link
                    prefetch={false}
                    href={entry.href}
                    aria-current={entry.current ? "page" : undefined}
                    className="text-link underline"
                  >
                    {entry.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {restaurant.hoursLines.length > 0 ? (
          <div className="mt-4">
            <p className="font-semibold">{copy.menu.hoursLabel}</p>
            <ul className="mt-1">
              {restaurant.hoursLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {restaurant.website ? (
          <p className="mt-2">
            <a href={restaurant.website} className="text-link underline">
              {copy.menu.website}
            </a>
          </p>
        ) : null}
        <div className="mt-4 rounded bg-background-raised p-4">
          {restaurant.note.map((paragraph) => (
            <p key={paragraph} className="mt-2 first:mt-0">
              {paragraph}
            </p>
          ))}
          <p className="mt-2 font-semibold">{menu.confirmation.text}</p>
        </div>
        {menu.sections.length > 0 ? (
          <InPageLinks label={copy.menu.sectionsLabel} className="pt-6">
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {menu.sections.map((section) => (
                <li key={section.id} className="min-w-0">
                  <a href={`#${section.id}`} className="text-link underline">
                    {sectionLink(section, copy)}
                  </a>
                </li>
              ))}
            </ul>
          </InPageLinks>
        ) : null}
        {menu.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="pt-8"
          >
            <h3
              id={section.id}
              tabIndex={-1}
              className="text-2xl font-bold outline-none focus-visible:outline"
            >
              <span id={`${section.id}-heading`}>{section.name}</span>
            </h3>
            {section.note ? (
              <p className="mt-1 text-foreground-muted">
                <Lines text={section.note} />
              </p>
            ) : null}
            <ul className="mt-2 divide-y divide-border">
              {section.dishes.map((dish) => (
                <Dish key={dish.id} dish={dish} copy={copy} />
              ))}
            </ul>
          </section>
        ))}
      </main>
      <footer className="mx-auto max-w-menu border-t border-border px-4 pt-6 pb-10 text-sm">
        {menu.notices.calories ? (
          <>
            <p>{copy.menu.notices.calories}</p>
            <p className="mt-2">{copy.menu.notices.nutrition}</p>
          </>
        ) : null}
        {menu.notices.cookedToOrder ? (
          <p className="mt-2 first:mt-0">{copy.menu.notices.advisory}</p>
        ) : null}
        <QuietLinks code={code} copy={copy} />
      </footer>
    </>
  );
}

// The two links every menu ends with, and the brand mark (Spec 3.4). The
// restaurant-level and menu-level unavailable pages carry them too, since
// a diner whose card led nowhere is the one who most needs the barrier
// report (Michael, at the plan's approval).
export function QuietLinks({ code, copy }: { code: string; copy: Copy }) {
  return (
    <>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 first:mt-0">
        <li className="min-w-0">
          <Link
            prefetch={false}
            href={feedbackPath(code)}
            className="text-link underline"
          >
            {copy.menu.footer.feedback}
          </Link>
        </li>
        <li className="min-w-0">
          <Link
            prefetch={false}
            href={statementPath(code)}
            className="text-link underline"
          >
            {copy.menu.footer.statement}
          </Link>
        </li>
      </ul>
      <p className="mt-4 text-foreground-muted">
        {copy.site.menuBy}{" "}
        <Link prefetch={false} href="/" className="text-link underline">
          {copy.site.name}
        </Link>
      </p>
    </>
  );
}

function sectionLink(section: DinerSection, copy: Copy): string {
  const count = section.dishes.length;
  const items = fill(
    count === 1 ? copy.menu.items.one : copy.menu.items.other,
    { count },
  );
  return fill(copy.menu.sectionLink, { section: section.name, items });
}

// A note or a description keeps its line breaks, inside one paragraph
// (Q-47, D-121, D-144).
function Lines({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={`${index}-${line}`}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

// One dish (Spec 3.2): its name, its price in numerals with the words for
// a screen reader (Q-6) and its calories beside it, its description in
// full (D-39), its allergen sentence with the words in bold (D-35, D-40),
// its tags, Cooked to order, Sold out today, its special's days and
// hours, and its note. Its choice lists render in Build 2.
function Dish({ dish, copy }: { dish: DinerDish; copy: Copy }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="min-w-0 text-lg font-semibold">{dish.name}</p>
        {dish.price ? (
          <p className="text-lg">
            <span aria-hidden="true">{dish.price.display}</span>
            <span className="sr-only">{dish.price.spoken}</span>
          </p>
        ) : null}
      </div>
      {dish.description ? (
        <p className="mt-1">
          <Lines text={dish.description} />
        </p>
      ) : null}
      <p className="mt-2">
        <AllergenSentence sentence={dish.allergen} />
      </p>
      {dish.dietary ? (
        <p className="mt-1 text-foreground-muted">{dish.dietary.text}</p>
      ) : null}
      {dish.cookedToOrder ? (
        <p className="mt-1 text-foreground-muted">{copy.menu.cookedToOrder}</p>
      ) : null}
      {dish.soldOut ? (
        <p className="mt-1 font-semibold">{copy.availability.soldOut}</p>
      ) : null}
      {dish.special ? (
        <p className="mt-1 text-foreground-muted">{dish.special}</p>
      ) : null}
      {dish.note ? (
        <p className="mt-1 text-foreground-muted">{dish.note}</p>
      ) : null}
    </li>
  );
}
