import { revalidateTag, unstable_cache, updateTag } from "next/cache";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

// Every diner page of a restaurant is cached at the edge under one tag, its
// code, and this module is the only caller of Next's revalidation API and
// the only reader of its render store (tests/unit/cache-guard.test.ts holds
// every other file to that). The previous caching model, not Cache
// Components: the diner route is an ISR page per path, the read runs inside
// unstable_cache under the tag, and the page's lifetime ends at its next
// timed change with a one-second stale window after it, the one Vercel's
// edge bounds (the diner page task, Q-95).
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

// Seconds a page may still be served after its lifetime ends while a fresh
// one renders, sent as the stale-while-revalidate directive of the page's
// header. One, measured on October 13, 2026 on two branch previews of Test
// Bistro: with no directive at all, Vercel's edge served the old page STALE
// at both timed ends and landed the fresh one about a second later; with
// an explicit one-second window, the first read past each end was a MISS
// that waited for the render (226 ms warm, 1.4 s cold) and showed the
// change. A read inside that first second can still get the old copy,
// accepted (Q-95). Zero sends no directive and falls back to the edge's
// own default, which is to serve stale.
export const STALE_WINDOW_SECONDS = 1;

// Ends the page's lifetime after the given seconds, so a special's start
// or end, a sold-out dish's return, or the restaurant's midnight re-renders
// it with nobody pressing anything. The render's store carries the
// revalidate and expire that become the page's Cache-Control
// (s-maxage=revalidate, and stale-while-revalidate only when expire is
// longer), and this is the one place that lowers them: unstable_cache and
// fetch lower revalidate the same way, and nothing public lowers expire in
// this model. This is the second coupling to a Next internal, beside the
// one D-172 verified; tests/local/diner-page.spec.ts reads the header it
// produces, and a Next update merges only once that passes (D-138). A
// store without the two numbers is a Next that changed shape, and the throw
// says so instead of a page quietly living until a write.
export async function endLifetimeIn(seconds: number): Promise<void> {
  const whole = Math.max(1, Math.ceil(seconds));
  const store = workUnitAsyncStorage.getStore();
  // A request store is a dynamic render (next dev, or a route Next refused
  // to keep static), where nothing is cached and a lifetime means nothing.
  if (store?.type === "request") return;
  if (
    store === undefined ||
    !("revalidate" in store) ||
    !("expire" in store) ||
    typeof store.revalidate !== "number" ||
    typeof store.expire !== "number"
  ) {
    throw new Error(
      "core/cache: no render store carries a revalidate and an expire to end the page's lifetime on. Next changed shape; read endLifetimeIn against the installed version (D-138).",
    );
  }
  if (whole < store.revalidate) store.revalidate = whole;
  const expire = whole + STALE_WINDOW_SECONDS;
  if (expire < store.expire) store.expire = expire;
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
