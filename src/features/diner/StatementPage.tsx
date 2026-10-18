import Link from "next/link";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { feedbackPath, menuPath } from "@/domain/menu-url";
import { PageFrame } from "@/ui/PageFrame";
import type { StatementData } from "./load";

type Props = StatementData & { copy: Copy };

const sectionHeading = "mt-8 text-2xl font-bold";
const link = "text-link underline";

// The accessibility statement for one restaurant (Spec 3.4, 7, D-38,
// D-184), generated from its data and the fixed words in src/copy: the
// heading with the name, the standard, how it is tested, the fix
// commitment with the reply promise and the named person, what we count,
// a link to each published menu by name, the feedback link, and the way
// back. Each part under its own h2, so a screen reader's headings list
// walks the page. The last-tested date, the known issues, and the direct
// email are Phase 4's and Q-1's; nothing here stands in for them. A
// restaurant with nothing published gets the statement with its name and
// no Menus section.
export function StatementPage({ code, name, menus, copy }: Props) {
  const words = copy.statement;
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">
        {fill(words.heading, { restaurant: name })}
      </h1>
      <p className="mt-4">{words.standard}</p>
      <h2 className={sectionHeading}>{words.tested.heading}</h2>
      <p className="mt-2">{words.tested.text}</p>
      <h2 className={sectionHeading}>{words.barriers.heading}</h2>
      <p className="mt-2">{words.barriers.fixed}</p>
      <p className="mt-2">{words.barriers.reply}</p>
      <p className="mt-2">{words.barriers.person}</p>
      <p className="mt-2">
        <Link prefetch={false} href={feedbackPath(code)} className={link}>
          {words.feedback}
        </Link>
      </p>
      <h2 className={sectionHeading}>{words.counts.heading}</h2>
      <p className="mt-2">{words.counts.lead}</p>
      <ul className="mt-2 list-disc pl-5">
        {words.counts.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {menus.length > 0 ? (
        <>
          <h2 className={sectionHeading}>{words.menus.heading}</h2>
          <ul className="mt-2 list-disc pl-5">
            {menus.map((menu) => (
              <li key={menu.id} className="min-w-0">
                <Link prefetch={false} href={menu.href} className={link}>
                  {menu.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-8">
        <Link prefetch={false} href={menuPath(code)} className={link}>
          {words.backToMenu}
        </Link>
      </p>
    </PageFrame>
  );
}
