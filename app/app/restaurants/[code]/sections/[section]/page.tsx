import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { listOwnerDishes } from "@/core/supabase/dishes";
import { findOwnerMenu, listOwnerMenuNames } from "@/core/supabase/menus";
import { findOwnerSection } from "@/core/supabase/sections";
import { DishList } from "@/features/owner/DishList";
import { loadRestaurant } from "@/features/owner/load-restaurant";
import {
  restaurantMenuPath,
  restaurantMenusPath,
} from "@/features/owner/paths";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { Breadcrumb } from "@/ui/Breadcrumb";
import { PageFrame } from "@/ui/PageFrame";

type Props = { params: Promise<{ code: string; section: string }> };

const strings = en.owner.dishes;

// One read per request, shared by the metadata and the page. The section's
// id in the path is user input: it must be a uuid before any query, the
// section must be one of this restaurant's that is not deleted, and so must
// the menu it is in. Row level security hides a section that is not this
// owner's, so a wrong owner, a deleted section, a section of a deleted
// menu, and an id that matches nothing all get the 404 page (D-122). A read
// that failed is thrown to the owner error page, never shown as a missing
// section. The address names the section and not its menu, so it stays good
// when the section moves to another menu (D-128, D-129); the menu is read
// from the section every time.
const loadSection = cache(async (rawCode: string, rawSection: string) => {
  const { supabase, email, restaurant } = await loadRestaurant(rawCode);
  const nothing = { supabase, email, restaurant, section: null, menu: null };
  if (!email || !restaurant) return nothing;
  const id = z.uuid().safeParse(rawSection);
  if (!id.success) return nothing;
  const section = await findOwnerSection(supabase, restaurant.id, id.data);
  if (section === "failed") throw new Error("the section could not be read");
  if (section === "not-found") return nothing;
  const menu = await findOwnerMenu(supabase, restaurant.id, section.menuId);
  if (menu === "failed") throw new Error("the menu could not be read");
  if (menu === "not-found") return nothing;
  return { supabase, email, restaurant, section, menu };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, section: sectionId } = await params;
  const { restaurant, section, menu } = await loadSection(code, sectionId);
  if (!restaurant || !section || !menu) {
    return { title: pageTitle(en, en.notFound.title) };
  }
  return {
    title: pageTitle(en, section.name, restaurant.name, menu.name),
  };
}

// One section's own page (D-128): its dishes, and its move to another menu
// (D-129). The page is named for the section, in the title and in the h1,
// and the title names its menu right after it. Menus stays marked in the
// restaurant's nav as the part this page sits inside, and the breadcrumb
// above the h1 leads back to the menu and to Menus. The dishes and the
// restaurant's other menus are read on every render, and every save ends
// with a refresh, so what the page shows is what the server holds.
export default async function RestaurantSectionPage({ params }: Props) {
  const { code, section: sectionId } = await params;
  const { supabase, email, restaurant, section, menu } = await loadSection(
    code,
    sectionId,
  );
  if (!email) redirect("/app/sign-in");
  if (!restaurant || !section || !menu) notFound();
  const [dishes, menus] = await Promise.all([
    listOwnerDishes(supabase, section.id),
    listOwnerMenuNames(supabase, restaurant.id),
  ]);

  return (
    <PageFrame
      siteName={en.site.name}
      homeHref="/"
      loadingLabel={en.ui.loading}
      nav={
        <RestaurantNav
          copy={en}
          name={restaurant.name}
          code={restaurant.code}
          current="section"
        />
      }
    >
      <Breadcrumb
        label={en.ui.breadcrumb}
        trail={[
          {
            href: restaurantMenusPath(restaurant.code),
            label: en.owner.restaurants.nav.menus,
          },
          {
            href: restaurantMenuPath(restaurant.code, menu.id),
            label: menu.name,
          },
        ]}
        current={section.name}
      />
      <h1 className="mt-2 text-3xl font-bold">{section.name}</h1>
      <p className="mt-6 text-foreground-muted">{strings.lead}</p>
      <DishList
        strings={strings}
        editing={en.owner.editing}
        code={restaurant.code}
        section={{ id: section.id, name: section.name }}
        menu={menu}
        otherMenus={menus.filter((other) => other.id !== menu.id)}
        dishes={dishes}
      />
    </PageFrame>
  );
}
