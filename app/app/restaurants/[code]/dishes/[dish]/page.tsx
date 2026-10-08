import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import {
  findOwnerDish,
  listOwnerDishes,
  listOwnerOtherAllergenNames,
  listOwnerSameNamedDishes,
} from "@/core/supabase/dishes";
import { findOwnerMenu, listOwnerMenuNames } from "@/core/supabase/menus";
import {
  findOwnerSection,
  listOwnerSectionNames,
} from "@/core/supabase/sections";
import { listOwnerSizeNames, listOwnerSizes } from "@/core/supabase/sizes";
import { sameAllergenLists } from "@/domain/allergens";
import { nextDish } from "@/domain/dish";
import type { SameNamedPlace } from "@/features/owner/dish/allergen-words";
import { DishPage } from "@/features/owner/dish/DishPage";
import { loadRestaurant } from "@/features/owner/load-restaurant";
import {
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "@/features/owner/paths";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { Breadcrumb } from "@/ui/Breadcrumb";
import { PageFrame } from "@/ui/PageFrame";
import type { SelectGroup } from "@/ui/Select";

type Props = { params: Promise<{ code: string; dish: string }> };

const strings = en.owner.dish;

// One read per request, shared by the metadata and the page. The dish's id
// in the path is user input: it must be a uuid before any query, the dish
// must be one of this restaurant's that is not deleted, and so must the
// section it is in and that section's menu. Row level security hides a dish
// that is not this owner's, so a wrong owner, a deleted dish, a dish of a
// deleted section or menu, and an id that matches nothing all get the 404
// page (D-122). A read that failed is thrown to the owner error page, never
// shown as a missing dish. The address names the dish and not its section,
// so it stays good when the dish moves (D-128, D-129); the section and the
// menu are read from the dish every time.
const loadDish = cache(async (rawCode: string, rawDish: string) => {
  const { supabase, email, userId, restaurant } = await loadRestaurant(rawCode);
  const nothing = {
    supabase,
    email,
    restaurant,
    dish: null,
    section: null,
    menu: null,
  };
  if (!email || !restaurant) return nothing;
  const id = z.uuid().safeParse(rawDish);
  if (!id.success) return nothing;
  const dish = await findOwnerDish(supabase, restaurant.id, id.data, userId);
  if (dish === "failed") throw new Error("the dish could not be read");
  if (dish === "not-found") return nothing;
  const section = await findOwnerSection(
    supabase,
    restaurant.id,
    dish.sectionId,
  );
  if (section === "failed") throw new Error("the section could not be read");
  if (section === "not-found") return nothing;
  const menu = await findOwnerMenu(supabase, restaurant.id, section.menuId);
  if (menu === "failed") throw new Error("the menu could not be read");
  if (menu === "not-found") return nothing;
  return { supabase, email, restaurant, dish, section, menu };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, dish: dishId } = await params;
  const { restaurant, dish, section, menu } = await loadDish(code, dishId);
  if (!restaurant || !dish || !section || !menu) {
    return { title: pageTitle(en, en.notFound.title) };
  }
  return {
    title: pageTitle(en, dish.name, restaurant.name, [section.name, menu.name]),
  };
}

// One dish's own page (D-128): its description, its price (D-139), and its
// note, its sizes, its allergens and their check (D-148), the link to the
// next dish, and its move to another section (D-129). The page is named for
// the dish, in the title and in the h1, and the title names its section and
// its menu right after it. Menus stays marked in the restaurant's nav as
// the part this page sits inside, and the breadcrumb above the h1 leads
// back to the section, the menu, and Menus. The sizes, the section's
// dishes, the restaurant's menus and sections, the size names in use, the
// other allergens in use, and the same-named dishes are read on every
// render, and every save ends with a refresh, so what the page shows is
// what the server holds.
export default async function RestaurantDishPage({ params }: Props) {
  const { code, dish: dishId } = await params;
  const { supabase, email, restaurant, dish, section, menu } = await loadDish(
    code,
    dishId,
  );
  if (!email) redirect("/app/sign-in");
  if (!restaurant || !dish || !section || !menu) notFound();
  const [sizes, dishes, menus, sections, sizeNames, otherNames, namesakes] =
    await Promise.all([
      listOwnerSizes(supabase, dish.id),
      listOwnerDishes(supabase, section.id),
      listOwnerMenuNames(supabase, restaurant.id),
      listOwnerSectionNames(supabase, restaurant.id),
      listOwnerSizeNames(supabase, restaurant.id),
      listOwnerOtherAllergenNames(supabase, restaurant.id),
      listOwnerSameNamedDishes(supabase, restaurant.id, dish.id, dish.name),
    ]);
  // Every other live section of a live menu, under its menu (D-129).
  const targets: SelectGroup[] = menus
    .map((other) => ({
      id: other.id,
      label: other.name,
      items: sections
        .filter((entry) => entry.menuId === other.id && entry.id !== section.id)
        .map((entry) => ({ id: entry.id, label: entry.name })),
    }))
    .filter((group) => group.items.length > 0);
  // The same-named dishes the allergen check names (D-129): live dishes, in
  // live sections of live menus, whose lists differ from this dish's as a
  // diner reads them, or which are not checked. Where each one is comes
  // from the same reads the move targets use.
  const ownLists = { allergens: dish.allergens, others: dish.otherAllergens };
  const sameNamed: SameNamedPlace[] = namesakes.flatMap((other) => {
    const inSection = sections.find((entry) => entry.id === other.sectionId);
    const inMenu = inSection
      ? menus.find((entry) => entry.id === inSection.menuId)
      : undefined;
    if (!inSection || !inMenu) return [];
    const lists = { allergens: other.allergens, others: other.otherAllergens };
    if (other.reviewed && sameAllergenLists(lists, ownLists)) return [];
    return [
      {
        id: other.id,
        name: other.name,
        section: inSection.name,
        menu: inMenu.name,
        lists,
        reviewed: other.reviewed,
        reason: other.reviewed
          ? ("different" as const)
          : ("unchecked" as const),
      },
    ];
  });

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
          current="dish"
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
          {
            href: restaurantSectionPath(restaurant.code, section.id),
            label: section.name,
          },
        ]}
        current={dish.name}
      />
      <h1 className="mt-2 text-3xl font-bold">{dish.name}</h1>
      {/* Said before the first field it governs (WCAG 3.3.2). */}
      <p className="mt-6 text-foreground-muted">{strings.lead}</p>
      <DishPage
        strings={strings}
        editing={en.owner.editing}
        code={restaurant.code}
        dish={{
          id: dish.id,
          name: dish.name,
          description: dish.description,
          note: dish.note,
          priceKind: dish.priceKind,
          price: dish.price,
          allergens: dish.allergens,
          otherAllergens: dish.otherAllergens,
          check: dish.check,
        }}
        section={{ id: section.id, name: section.name }}
        menu={menu}
        sizes={sizes}
        sizeNames={sizeNames}
        next={nextDish(dishes, dish.id)}
        targets={targets}
        allergenCopy={en.allergens}
        otherNames={otherNames}
        sameNamed={sameNamed}
        timeZone={restaurant.timezone}
        lang={en.lang}
      />
    </PageFrame>
  );
}
