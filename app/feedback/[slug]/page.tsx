import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { getRestaurant, listRestaurantSlugs } from "@/core/data";
import { FeedbackPage } from "@/features/feedback/FeedbackPage";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return listRestaurantSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = getRestaurant(slug);
  return {
    title: restaurant
      ? fill(en.feedback.title, { restaurant: restaurant.name })
      : en.notFound.title,
  };
}

export default async function MenuFeedbackPage({ params }: Params) {
  const { slug } = await params;
  const restaurant = getRestaurant(slug);
  if (!restaurant) notFound();
  return <FeedbackPage restaurant={restaurant} copy={en} />;
}
