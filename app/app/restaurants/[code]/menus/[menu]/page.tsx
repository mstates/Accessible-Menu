import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { listOwnerMenuPublishStates } from "@/core/supabase/menus";
import { listOwnerSectionsWithDishes } from "@/core/supabase/sections";
import { loadMenu } from "@/features/owner/menu/load-menu";
import { menuPageState, menuPageTitle } from "@/features/owner/menu/menu-pages";
import { MenuPageFrame } from "@/features/owner/menu/MenuPageFrame";
import { signInPath } from "@/features/owner/paths";
import { SectionList } from "@/features/owner/SectionList";

type Props = { params: Promise<{ code: string; menu: string }> };

const PAGE = "sections";
const strings = en.owner.sections;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, menu: menuId } = await params;
  const { restaurant, menu } = await loadMenu(code, menuId);
  if (!restaurant || !menu) return { title: pageTitle(en, en.notFound.title) };
  return {
    title: menuPageTitle(en, PAGE, {
      menu: menu.name,
      restaurant: restaurant.name,
    }),
  };
}

// A menu's Sections page (D-122, D-224), the first of its two pages, at the
// menu's own address: its sections, each a row that links to its own page,
// where its dishes are (D-128). The page is named for the menu, in the
// title and in the h1, since the page is the menu. Menus stays marked in
// the restaurant's nav as the part this page sits inside, the breadcrumb
// above the h1 is the way back there, and the page nav under the h1 leads
// to Publishing, where Publish and Unpublish are. The list is read on every
// render, with how many dishes each section holds, which is what a delete
// asks about (D-119), and every save ends with a refresh, so what the page
// shows is what the server holds: the menu's publish state is read with the
// sections for the nav's line beside Publishing, which so follows a save on
// this page.
export default async function RestaurantMenuPage({ params }: Props) {
  const { code, menu: menuId } = await params;
  const { supabase, email, restaurant, menu } = await loadMenu(code, menuId);
  if (!email) redirect(signInPath);
  if (!restaurant || !menu) notFound();
  const [sections, states] = await Promise.all([
    listOwnerSectionsWithDishes(supabase, restaurant.id, menu.id),
    listOwnerMenuPublishStates(supabase, restaurant.id),
  ]);
  // A menu the function does not report, added between the two reads, is
  // not published, with nothing compared.
  const state = states.find((candidate) => candidate.id === menu.id) ?? {
    published: false,
    changed: null,
  };

  return (
    <MenuPageFrame
      copy={en}
      restaurant={restaurant}
      menu={menu}
      state={menuPageState(state)}
      page={PAGE}
    >
      <SectionList
        strings={strings}
        editing={en.owner.editing}
        code={restaurant.code}
        menuId={menu.id}
        sections={sections}
        lead={strings.lead}
      />
    </MenuPageFrame>
  );
}
