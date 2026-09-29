import type { City, Restaurant } from "@/domain/types";
import { demoCity, demoRestaurant } from "./demo";

// Phase 0 seam. Phase 1 replaces these with typed Supabase queries in
// core/supabase, reading through the public view of published fields.
const restaurants: readonly Restaurant[] = [demoRestaurant];
const cities: readonly City[] = [demoCity];

export function listRestaurantSlugs(): string[] {
  return restaurants.map((restaurant) => restaurant.slug);
}

export function getRestaurant(slug: string): Restaurant | undefined {
  return restaurants.find((restaurant) => restaurant.slug === slug);
}

export function listCitySlugs(): string[] {
  return cities.map((city) => city.slug);
}

export function getCity(slug: string): City | undefined {
  return cities.find((city) => city.slug === slug);
}

export function listRestaurantsInCity(citySlug: string): Restaurant[] {
  return restaurants.filter((restaurant) => restaurant.city.slug === citySlug);
}
