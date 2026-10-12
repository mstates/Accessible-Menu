import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { menuOrigin } from "@/core/config";
import { getRestaurant, listRestaurantSlugs } from "@/core/data";
import { menuUrl } from "@/domain/menu-url";
import { MenuPage } from "@/features/diner/MenuPage";

type Params = { params: Promise<{ code: string }> };

// Static HTML for every known code at build time (module rule 1, D-23,
// D-86). The demo still answers to its Phase 0 name until the diner page
// task reads real data (D-78).
export const dynamicParams = false;

export function generateStaticParams() {
  return listRestaurantSlugs().map((code) => ({ code }));
}

// The canonical link is the menu URL from the one builder (D-88): the path
// is permanent, and a search engine that reaches the page any other way is
// told the one address it has.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const restaurant = getRestaurant(code);
  if (!restaurant) return { title: en.notFound.title };
  return {
    title: fill(en.menu.title, { restaurant: restaurant.name }),
    alternates: { canonical: menuUrl(menuOrigin.origin, code) },
  };
}

export default async function DinerMenuPage({ params }: Params) {
  const { code } = await params;
  const restaurant = getRestaurant(code);
  const menu = restaurant?.menus[0];
  if (!restaurant || !menu) notFound();
  return <MenuPage restaurant={restaurant} menu={menu} copy={en} />;
}
