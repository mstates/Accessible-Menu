import Link from "next/link";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { menuPath } from "@/domain/menu-url";
import type { City, Restaurant } from "@/domain/types";
import { PageFrame } from "@/ui/PageFrame";

type Props = { city: City; restaurants: Restaurant[]; copy: Copy };

// Directory placeholder. Search and the request card are Phase 5.
export function CityPage({ city, restaurants, copy }: Props) {
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">
        {fill(copy.directory.heading, { city: city.name })}
      </h1>
      {restaurants.length === 0 ? (
        <p className="mt-4">{copy.directory.empty}</p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {restaurants.map((restaurant) => (
            <li key={restaurant.slug} className="py-4">
              <Link
                href={menuPath(restaurant.slug)}
                className="text-lg font-semibold text-link underline"
              >
                {restaurant.name}
              </Link>
              {restaurant.hours ? (
                <p className="mt-1 text-foreground-muted">
                  {fill(copy.menu.hours, { hours: restaurant.hours })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
