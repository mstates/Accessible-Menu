import Link from "next/link";
import { Fragment } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import {
  allergenSentence,
  confirmationLine,
  restaurantAllergenNote,
  type AllergenSentence,
} from "@/domain/allergens";
import { dietarySentence } from "@/domain/dietary";
import { feedbackPath, statementPath } from "@/domain/menu-url";
import { formatPrice } from "@/domain/money";
import type { Item, Menu, Restaurant, Section } from "@/domain/types";

type Props = {
  restaurant: Restaurant;
  menu: Menu;
  copy: Copy;
};

// The diner menu. Static HTML, readable with JavaScript off (module rule 1).
export function MenuPage({ restaurant, menu, copy }: Props) {
  const note = restaurantAllergenNote(restaurant, copy.allergens);
  const confirmation = confirmationLine(menu, copy.allergens);
  return (
    <>
      <header className="mx-auto max-w-menu px-4 pt-6">
        <p className="text-sm text-foreground-muted">{copy.site.descriptor}</p>
        <h1 className="text-3xl font-bold">{restaurant.name}</h1>
        <p className="mt-1 text-xl">{menu.name}</p>
        {restaurant.hours ? (
          <p className="mt-2">
            {fill(copy.menu.hours, { hours: restaurant.hours })}
          </p>
        ) : null}
        {restaurant.website ? (
          <p className="mt-1">
            <a href={restaurant.website} className="text-link underline">
              {copy.menu.website}
            </a>
          </p>
        ) : null}
        <div className="mt-4 rounded bg-background-raised p-4">
          {note.map((paragraph) => (
            <p key={paragraph} className="mt-2 first:mt-0">
              {paragraph}
            </p>
          ))}
          <p className="mt-2 font-semibold">{confirmation.text}</p>
        </div>
      </header>
      <nav
        aria-label={copy.menu.sectionsLabel}
        className="mx-auto max-w-menu px-4 pt-6"
      >
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {menu.sections.map((section) => (
            <li key={section.id} className="min-w-0">
              <a href={`#${section.id}`} className="text-link underline">
                {sectionLink(section, copy)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-menu px-4 pb-10 outline-none"
      >
        {menu.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="pt-8"
          >
            <h2 id={`${section.id}-heading`} className="text-2xl font-bold">
              {section.name}
            </h2>
            {section.note ? (
              <p className="mt-1 text-foreground-muted">{section.note}</p>
            ) : null}
            <ul className="mt-2 divide-y divide-border">
              {section.items.map((item) => (
                <MenuItem key={item.id} item={item} copy={copy} />
              ))}
            </ul>
          </section>
        ))}
      </main>
      <footer className="mx-auto max-w-menu border-t border-border px-4 pt-6 pb-10 text-sm">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          <li className="min-w-0">
            <Link
              prefetch={false}
              href={feedbackPath(restaurant.slug)}
              className="text-link underline"
            >
              {copy.menu.footer.feedback}
            </Link>
          </li>
          <li className="min-w-0">
            <Link
              prefetch={false}
              href={statementPath(restaurant.slug)}
              className="text-link underline"
            >
              {copy.menu.footer.statement}
            </Link>
          </li>
        </ul>
        <p className="mt-4 text-foreground-muted">
          {copy.site.menuBy}{" "}
          <Link
            prefetch={false}
            href={`/d/${restaurant.city.slug}`}
            className="text-link underline"
          >
            {copy.site.name}
          </Link>
        </p>
      </footer>
    </>
  );
}

function sectionLink(section: Section, copy: Copy): string {
  const count = section.items.length;
  const items = fill(
    count === 1 ? copy.menu.items.one : copy.menu.items.other,
    {
      count,
    },
  );
  return fill(copy.menu.sectionLink, { section: section.name, items });
}

function MenuItem({ item, copy }: { item: Item; copy: Copy }) {
  const price = formatPrice(item.price, copy.money);
  const sentence = allergenSentence(item, copy.allergens);
  // The tags in words, from the one builder the owner's page reads too
  // (module rule 8, D-66).
  const dietary = dietarySentence(item.dietaryTags, copy.dietary);
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="min-w-0 text-lg font-semibold">{item.name}</p>
        <p className="text-lg">
          <span aria-hidden="true">{price.display}</span>
          <span className="sr-only">{price.spoken}</span>
        </p>
      </div>
      {item.description ? <p className="mt-1">{item.description}</p> : null}
      <p className="mt-2">
        <AllergenLine sentence={sentence} />
      </p>
      {dietary ? (
        <p className="mt-1 text-foreground-muted">{dietary.text}</p>
      ) : null}
      {item.note ? (
        <p className="mt-1 text-foreground-muted">{item.note}</p>
      ) : null}
    </li>
  );
}

// The allergen words are bold and the sentence is inline in the item,
// never behind a popover or disclosure (D-35, D-40).
function AllergenLine({ sentence }: { sentence: AllergenSentence }) {
  if (sentence.kind !== "contains") {
    return <>{sentence.text}</>;
  }
  return (
    <>
      {sentence.lead}{" "}
      {sentence.words.map((word, index) => (
        <Fragment key={word}>
          {index > 0 ? ", " : null}
          <strong>{word}</strong>
        </Fragment>
      ))}
      {"."}
    </>
  );
}
