import Link from "next/link";
import { Fragment } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { InPageLinks } from "@/core/a11y/section-links";
import type {
  DinerChoiceList,
  DinerDish,
  DinerMenuView,
  DinerSection,
} from "@/domain/diner";
import { feedbackPath, statementPath } from "@/domain/menu-url";
import type { PriceText } from "@/domain/money";
import { drawnIcons } from "@/ui/icons/glyphs";
import { IconRow, IconSprite } from "@/ui/icons/IconRow";
import type { MenuPageData } from "./load";

type Props = { data: MenuPageData; copy: Copy };

// The diner menu (Spec 3.1, 3.2, 3.4): static HTML, readable with
// JavaScript off (module rule 1). The headings are "Accessible menu", the
// restaurant's name, one per section, and one per dish inside its list
// item, and nothing else (D-81, D-181). Every allergen sentence is one plain
// run of text with no element inside it, so a screen reader reads it as one
// stop (D-182). main
// starts at the h1, so the skip link never passes the allergen note or the
// confirmation line; the two navs sit inside it and the footer outside
// (Michael, at the plan's approval). Every sentence comes from the view
// model, which built it with the domain's one builder for it (rule 8).
// Choice lists (D-166, Q-74) are real lists: a dish's own after its lines,
// and a section's repeated inside every dish while they hold few options
// in all, or once under the section heading past that, with a link in
// each dish that lands on them. A menu that shows no dish right now, every
// dish off the menu or every special outside its hours, keeps everything
// above the note and reads one line where its sections would be, with no
// section list and no confirmation line (D-177). After the footer, the last
// thing on the page, one application/ld+json script carries the schema.org
// graph the view model built (Spec 3.1, D-184): data only, nothing
// executes, outside every landmark, and behind everything a diner reads in
// the byte stream. When the owner turned icons on (D-189), a row of its own
// follows each Contains sentence and each diet line, hidden from assistive
// technology, drawn from one sprite that sits after the footer only when a
// row does; off, nothing of it is in the HTML.
export function MenuPage({ data, copy }: Props) {
  const { restaurant, menus, menuLine, menu, code } = data;
  const icons = restaurant.showIcons;
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
        ) : menuLine ? (
          <p className="mt-3">{menuLine}</p>
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
          {menu.confirmation ? (
            <p className="mt-2 font-semibold">{menu.confirmation.text}</p>
          ) : null}
        </div>
        {menu.sections.length === 0 ? (
          <p className="pt-6">{copy.menu.nothingServed}</p>
        ) : null}
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
        {menu.sections.length > 0 ? (
          <InPageLinks as="div">
            {menu.sections.map((section) => (
              <section
                key={section.id}
                aria-labelledby={`${section.id}-heading`}
                className="pt-8"
              >
                {/* A section link lands here (D-81). The focus ring is the one
                  every Tab stop wears, from app/globals.css (Q-100), and the
                  scroll margin keeps its top edge on the screen. */}
                <h3
                  id={section.id}
                  tabIndex={-1}
                  className="scroll-mt-4 text-2xl font-bold"
                >
                  <span id={`${section.id}-heading`}>{section.name}</span>
                </h3>
                {section.note ? (
                  <p className="mt-1 text-foreground-muted">
                    <Lines text={section.note} />
                  </p>
                ) : null}
                {/* A dish's link lands here (Q-74), with the same ring. The
                  scroll margin leaves room above for the section's heading
                  and a note of up to two lines, so a diner sees whose
                  choices these are (Q-100). */}
                {!section.repeatLists && section.lists.length > 0 ? (
                  <div
                    id={choicesId(section)}
                    tabIndex={-1}
                    role="group"
                    aria-label={choicesWords(section, copy)}
                    className="mt-3 scroll-mt-24"
                  >
                    {section.lists.map((list) => (
                      <ChoiceList key={list.id} list={list} icons={icons} />
                    ))}
                  </div>
                ) : null}
                <ul className="mt-2 divide-y divide-border">
                  {section.dishes.map((dish) => (
                    <Dish
                      key={dish.id}
                      dish={dish}
                      section={section}
                      copy={copy}
                      icons={icons}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </InPageLinks>
        ) : null}
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
      {icons && drawsIcons(menu) ? <IconSprite /> : null}
      {/* The markup's text comes from serializeJsonLd(), which escapes every
        less-than sign, so a name an owner typed can never close this tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: data.jsonLd }}
      />
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

// The block a section's lists sit in when they show once under the
// heading (Q-74), and the words of the link each dish carries to it and
// of the block's own name, so a diner who follows the link hears where
// they landed. The h3 keeps the section's id; the block has its own.
function choicesId(section: DinerSection): string {
  return `${section.id}-choices`;
}

function choicesWords(section: DinerSection, copy: Copy): string {
  return fill(copy.menu.sectionChoicesLink, { section: section.name });
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

// Whether any shown dish or option gives the page an icon to draw, so the
// sprite is on the page only when a row is (D-189).
function drawsIcons(menu: DinerMenuView): boolean {
  const inLists = (lists: DinerChoiceList[]) =>
    lists.some((list) =>
      list.options.some(
        (option) => drawnIcons(option.allergenIcons).length > 0,
      ),
    );
  return menu.sections.some(
    (section) =>
      inLists(section.lists) ||
      section.dishes.some(
        (dish) =>
          drawnIcons(dish.allergenIcons).length > 0 ||
          drawnIcons(dish.dietaryIcons).length > 0 ||
          inLists(dish.lists),
      ),
  );
}

// Words that have a spoken form (Q-6): the numerals for the eye and the
// words for a screen reader, drawn once and spoken once, or the bare text
// when the two are the same, so nothing is rendered twice for no reason
// and a line with no spoken form is one text node in its element (D-182).
function Words({ text }: { text: PriceText }) {
  if (text.display === text.spoken) return <>{text.display}</>;
  return (
    <>
      <span aria-hidden="true">{text.display}</span>
      <span className="sr-only">{text.spoken}</span>
    </>
  );
}

// One choice list (D-166): its lead, then its options as a real list, each
// one line in regular weight, its words (name, added price, calories) then
// its own allergen sentence, the two forms optionSentence() builds, read
// where the option is and never behind a disclosure (D-40). The line is one
// text node, or the drawn-once, spoken-once pair when the words have a
// spoken form, and nothing else, so it is one stop (D-182); its icon row,
// when icons are on, is an element of its own after it (D-189).
function ChoiceList({
  list,
  icons,
}: {
  list: DinerChoiceList;
  icons: boolean;
}) {
  return (
    <div className="mt-2">
      <p className="font-semibold">{list.lead}</p>
      <ul className="mt-1 list-disc pl-5">
        {list.options.map((option) => (
          <li key={option.id}>
            <Words text={option.line} />
            {icons ? <IconRow ids={option.allergenIcons} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// One dish (Spec 3.2): its name as an h4, the last heading level (D-181),
// its price in numerals with the words for a screen reader (Q-6) and its
// calories beside it, its description in full (D-39), its allergen
// sentence as one semibold line whatever it says (D-35, D-40, D-182), its
// tags, Cooked to order, Sold out today, its special's days and hours, and
// its note; then its own choice lists, and after them its section's,
// repeated here while they hold few options in all, or one link to the
// block under the section heading past that (Q-74). The dish's own lines
// come first, so its allergen sentence stays beside its name whatever its
// lists hold. With icons on, the allergen line and the diet line are each
// followed by their own hidden row of icons (D-189).
function Dish({
  dish,
  section,
  copy,
  icons,
}: {
  dish: DinerDish;
  section: DinerSection;
  copy: Copy;
  icons: boolean;
}) {
  const linked = !section.repeatLists && section.lists.length > 0;
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h4 className="min-w-0 text-lg font-semibold">{dish.name}</h4>
        {dish.price ? (
          <p className="text-lg">
            <Words text={dish.price} />
          </p>
        ) : null}
      </div>
      {dish.description ? (
        <p className="mt-1">
          <Lines text={dish.description} />
        </p>
      ) : null}
      <p className="mt-2 font-semibold">{dish.allergen.text}</p>
      {icons ? <IconRow ids={dish.allergenIcons} /> : null}
      {dish.dietary ? (
        <>
          <p className="mt-1 text-foreground-muted">{dish.dietary.text}</p>
          {icons ? <IconRow ids={dish.dietaryIcons} /> : null}
        </>
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
      {dish.lists.map((list) => (
        <ChoiceList key={list.id} list={list} icons={icons} />
      ))}
      {section.repeatLists
        ? section.lists.map((list) => (
            <ChoiceList key={list.id} list={list} icons={icons} />
          ))
        : null}
      {linked ? (
        <p className="mt-2">
          <a href={`#${choicesId(section)}`} className="text-link underline">
            {choicesWords(section, copy)}
          </a>
        </p>
      ) : null}
    </li>
  );
}
