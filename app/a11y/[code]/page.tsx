import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { getRestaurant, listRestaurantSlugs } from "@/core/data";
import { StatementPage } from "@/features/diner/StatementPage";

type Params = { params: Promise<{ code: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return listRestaurantSlugs().map((code) => ({ code }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const restaurant = getRestaurant(code);
  return {
    title: restaurant
      ? fill(en.statement.title, { restaurant: restaurant.name })
      : en.notFound.title,
  };
}

export default async function AccessibilityStatementPage({ params }: Params) {
  const { code } = await params;
  const restaurant = getRestaurant(code);
  if (!restaurant) notFound();
  return <StatementPage restaurant={restaurant} copy={en} />;
}
