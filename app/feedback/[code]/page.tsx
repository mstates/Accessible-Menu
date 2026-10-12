import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { loadRestaurantName } from "@/features/diner/load";
import { FeedbackPage } from "@/features/feedback/FeedbackPage";

type Params = { params: Promise<{ code: string }> };

// The feedback page by code (D-88), kept at the edge under the
// restaurant's tag like its menu. A placeholder until the form is built.
export function generateStaticParams(): { code: string }[] {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const restaurant = await loadRestaurantName(code);
  return {
    title: restaurant
      ? fill(en.feedback.title, { restaurant: restaurant.name })
      : en.notFound.title,
  };
}

export default async function MenuFeedbackPage({ params }: Params) {
  const { code } = await params;
  const restaurant = await loadRestaurantName(code);
  if (!restaurant) notFound();
  return (
    <FeedbackPage code={restaurant.code} name={restaurant.name} copy={en} />
  );
}
