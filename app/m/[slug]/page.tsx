import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { getRestaurant, listRestaurantSlugs } from "@/core/data";
import { MenuPage } from "@/features/diner/MenuPage";

type Params = { params: Promise<{ slug: string }> };

// Static HTML for every known slug at build time (module rule 1, D-23).
export const dynamicParams = false;

export function generateStaticParams() {
  return listRestaurantSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = getRestaurant(slug);
  return {
    title: restaurant
      ? fill(en.menu.title, { restaurant: restaurant.name })
      : en.notFound.title,
  };
}

export default async function DinerMenuPage({ params }: Params) {
  const { slug } = await params;
  const restaurant = getRestaurant(slug);
  const menu = restaurant?.menus[0];
  if (!restaurant || !menu) notFound();
  return <MenuPage restaurant={restaurant} menu={menu} copy={en} />;
}
