import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { loadRestaurantName } from "@/features/diner/load";
import { StatementPage } from "@/features/diner/StatementPage";

type Params = { params: Promise<{ code: string }> };

// The statement by code (D-88), kept at the edge under the restaurant's
// tag like its menu. A placeholder until the next small task generates it.
export function generateStaticParams(): { code: string }[] {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const restaurant = await loadRestaurantName(code);
  return {
    title: restaurant
      ? fill(en.statement.title, { restaurant: restaurant.name })
      : en.notFound.title,
  };
}

export default async function AccessibilityStatementPage({ params }: Params) {
  const { code } = await params;
  const restaurant = await loadRestaurantName(code);
  if (!restaurant) notFound();
  return (
    <StatementPage code={restaurant.code} name={restaurant.name} copy={en} />
  );
}
