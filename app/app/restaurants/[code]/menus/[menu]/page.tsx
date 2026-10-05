import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { findOwnerMenu } from "@/core/supabase/menus";
import { listOwnerSections } from "@/core/supabase/sections";
import { loadRestaurant } from "@/features/owner/load-restaurant";
import { restaurantMenusPath } from "@/features/owner/paths";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { SectionList } from "@/features/owner/SectionList";
import { PageFrame } from "@/ui/PageFrame";
import { PageLink } from "@/ui/PageLink";

type Props = { params: Promise<{ code: string; menu: string }> };

const strings = en.owner.sections;

// One read per request, shared by the metadata and the page. The menu's id
// in the path is user input: it must be a uuid before any query, and the
// menu must be one of this restaurant's that is not deleted. Row level
// security hides a menu that is not this owner's, so a wrong owner, a
// deleted menu, and an id that matches nothing all get the 404 page. A read
// that failed is thrown to the owner error page, never shown as a missing
// menu.
const loadMenu = cache(async (rawCode: string, rawMenu: string) => {
  const { supabase, email, restaurant } = await loadRestaurant(rawCode);
  if (!email || !restaurant) return { supabase, email, restaurant, menu: null };
  const id = z.uuid().safeParse(rawMenu);
  if (!id.success) return { supabase, email, restaurant, menu: null };
  const menu = await findOwnerMenu(supabase, restaurant.id, id.data);
  if (menu === "failed") throw new Error("the menu could not be read");
  return {
    supabase,
    email,
    restaurant,
    menu: menu === "not-found" ? null : menu,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, menu: menuId } = await params;
  const { restaurant, menu } = await loadMenu(code, menuId);
  if (!restaurant || !menu) return { title: pageTitle(en, en.notFound.title) };
  return { title: pageTitle(en, menu.name, restaurant.name) };
}

// One menu's own page (D-122): its sections today, its dishes later. The
// page is named for the menu, in the title and in the h1, since the page is
// the menu. Menus stays marked in the restaurant's nav as the part this page
// sits inside, and the link under the h1 goes back there. The list is read
// on every render, and every save ends with a refresh, so what the page
// shows is what the server holds.
export default async function RestaurantMenuPage({ params }: Props) {
  const { code, menu: menuId } = await params;
  const { supabase, email, restaurant, menu } = await loadMenu(code, menuId);
  if (!email) redirect("/app/sign-in");
  if (!restaurant || !menu) notFound();
  const sections = await listOwnerSections(supabase, menu.id);

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
          current="menu"
        />
      }
    >
      <h1 className="text-3xl font-bold">{menu.name}</h1>
      <p className="mt-2">
        <PageLink
          href={restaurantMenusPath(restaurant.code)}
          className="text-link underline"
        >
          {strings.backToMenus}
        </PageLink>
      </p>
      <p className="mt-6 text-foreground-muted">{strings.lead}</p>
      <SectionList
        strings={strings}
        editing={en.owner.editing}
        pendingLabel={en.ui.pending}
        code={restaurant.code}
        menuId={menu.id}
        sections={sections}
      />
    </PageFrame>
  );
}
