import { revalidateTag, unstable_cache, updateTag } from "next/cache";

// Every diner page of a restaurant is cached at the edge under one tag, its
// code, and this module is the only caller of Next's revalidation API
// (tests/unit/cache-guard.test.ts holds every other file to that). The
// previous caching model, not Cache Components: the diner route is an ISR
// page per path, the read runs inside unstable_cache under the tag, and the
// page's lifetime is lowered to its next timed change (the diner page task).
// The day the Cache Components flag is turned on, cachedForRestaurant and
// endLifetimeIn become cacheTag and cacheLife inside a "use cache" scope,
// and nothing outside this module changes.

export function restaurantTag(code: string): string {
  return `restaurant:${code}`;
}

// The read a diner page makes, kept until the restaurant's tag is cleared:
// a timed re-render reads nothing from the database, and a write that
// changes what anon reads empties it with the page. A read that throws
// stores nothing, so a failed read is never cached (ISR serves the last
// good page and retries).
export function cachedForRestaurant<T>(
  code: string,
  read: () => Promise<T>,
): Promise<T> {
  return unstable_cache(read, ["published", code], {
    tags: [restaurantTag(code)],
    revalidate: false,
  })();
}

// Ends the page's lifetime after the given seconds, so a special's start
// or end, a sold-out dish's return, or the restaurant's midnight re-renders
// it with nobody pressing anything. unstable_cache lowers the route's
// revalidate to the shortest value any call in the render asked for, as a
// fetch with a shorter revalidate does; the stored value is never read.
// Verified in Next 16.3.8's source; tests/local/diner-page.spec.ts is the
// proof, and a Next update merges only once it passes (D-138).
export async function endLifetimeIn(seconds: number): Promise<void> {
  const whole = Math.max(1, Math.ceil(seconds));
  await unstable_cache(async () => whole, ["lifetime", String(whole)], {
    revalidate: whole,
  })();
}

// From a server action: the next request for any of the restaurant's pages
// waits for a fresh render, so an owner's change is live at once.
export function expireRestaurant(code: string): void {
  updateTag(restaurantTag(code));
}

// From a route handler, where updateTag is not allowed: the pages are
// served once more while they re-render in the background.
export function revalidateRestaurant(code: string): void {
  revalidateTag(restaurantTag(code), "max");
}
