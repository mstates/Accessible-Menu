import Link from "next/link";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { feedbackPath, menuPath } from "@/domain/menu-url";
import type { Restaurant } from "@/domain/types";
import { PageFrame } from "@/ui/PageFrame";

type Props = { restaurant: Restaurant; copy: Copy };

// Placeholder statement with the fixed claim language from Spec 7.
// Phase 4 generates the full statement from data and the release log.
export function StatementPage({ restaurant, copy }: Props) {
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">
        {fill(copy.statement.heading, { restaurant: restaurant.name })}
      </h1>
      <p className="mt-4">{copy.statement.standard}</p>
      <p className="mt-2">{copy.statement.barriers}</p>
      <p className="mt-2">{copy.statement.reply}</p>
      <p className="mt-2">{copy.statement.person}</p>
      <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2">
        <li>
          <Link
            href={feedbackPath(restaurant.slug)}
            className="text-link underline"
          >
            {copy.statement.feedback}
          </Link>
        </li>
        <li>
          <Link
            href={menuPath(restaurant.slug)}
            className="text-link underline"
          >
            {copy.statement.backToMenu}
          </Link>
        </li>
      </ul>
    </PageFrame>
  );
}
