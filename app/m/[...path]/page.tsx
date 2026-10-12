import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { endLifetimeIn } from "@/core/cache";
import { loadDinerPage } from "@/features/diner/load";
import { MenuPage } from "@/features/diner/MenuPage";
import { UnavailablePage } from "@/features/diner/UnavailablePage";

type Params = { params: Promise<{ path: string[] }> };

// Every path under the menu prefix (D-88): the bare code, or the code and
// a menu's id, through the one resolver. Static HTML per path, rendered on
// its first visit and kept at the edge under the restaurant's tag until a
// write clears it or its next timed change (core/cache). Nothing is listed
// at build time: codes are made when restaurants are; and nothing here
// reads cookies or headers, so every response is the same for everyone.
export function generateStaticParams(): { path: string[] }[] {
  return [];
}

// How long a page for a menu id that is not one of the restaurant's
// published menus lives: a made-up id makes a small entry that goes stale
// at once and clears on the restaurant's next write (Michael, at the
// plan's second tab).
const UNAVAILABLE_MENU_LIFETIME = 60;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { path } = await params;
  const data = await loadDinerPage(path);
  switch (data.kind) {
    case "not-found":
      return { title: en.notFound.title };
    case "unavailable":
    case "menu-unavailable":
      return {
        title: fill(en.menu.title, { restaurant: data.name }),
        robots: { index: false, follow: false },
      };
    case "menu":
      return {
        title: data.page.title,
        // The canonical link is the permanent address from the one builder.
        alternates: { canonical: data.page.canonical },
      };
  }
}

export default async function DinerMenuPage({ params }: Params) {
  const { path } = await params;
  const data = await loadDinerPage(path);
  switch (data.kind) {
    case "not-found":
      // After the tagged read, so the 404 clears when the restaurant is made.
      return notFound();
    case "unavailable":
      return (
        <UnavailablePage
          code={data.code}
          name={data.name}
          kind="restaurant"
          copy={en}
        />
      );
    case "menu-unavailable":
      await endLifetimeIn(UNAVAILABLE_MENU_LIFETIME);
      return (
        <UnavailablePage
          code={data.code}
          name={data.name}
          kind="menu"
          copy={en}
        />
      );
    case "menu":
      if (data.page.lifetime !== null) await endLifetimeIn(data.page.lifetime);
      return <MenuPage data={data.page} copy={en} />;
  }
}
