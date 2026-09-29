import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { getCity, listCitySlugs, listRestaurantsInCity } from "@/core/data";
import { CityPage } from "@/features/directory/CityPage";

type Params = { params: Promise<{ city: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return listCitySlugs().map((city) => ({ city }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getCity(slug);
  return {
    title: city
      ? fill(en.directory.title, { city: city.name })
      : en.notFound.title,
  };
}

export default async function DirectoryCityPage({ params }: Params) {
  const { city: slug } = await params;
  const city = getCity(slug);
  if (!city) notFound();
  return (
    <CityPage
      city={city}
      restaurants={listRestaurantsInCity(city.slug)}
      copy={en}
    />
  );
}
