import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import {
  listOwnerOptionOtherAllergenNames,
  listOwnerSameNamedOptions,
} from "@/core/supabase/choices";
import {
  listOwnerDishNames,
  listOwnerOtherAllergenNames,
  listOwnerSameNamedDishes,
} from "@/core/supabase/dishes";
import { listOwnerMenuNames } from "@/core/supabase/menus";
import { listOwnerSectionNames } from "@/core/supabase/sections";
import { rankOtherAllergenNames } from "@/domain/allergens";
import { dishPlaces, optionPlaces } from "@/features/owner/allergens/places";
import { placeIn } from "@/features/owner/choices/choice-words";
import { dishPageTitle } from "@/features/owner/dish/dish-pages";
import { DishAllergensPage } from "@/features/owner/dish/DishAllergensPage";
import { DishPageFrame } from "@/features/owner/dish/DishPageFrame";
import { loadDish } from "@/features/owner/dish/load-dish";
import { signInPath } from "@/features/owner/paths";

type Props = { params: Promise<{ code: string; dish: string }> };

const PAGE = "allergens";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, dish: dishId } = await params;
  const { restaurant, found } = await loadDish(code, dishId);
  if (!restaurant || !found) {
    return { title: pageTitle(en, en.notFound.title) };
  }
  return {
    title: dishPageTitle(en, PAGE, {
      dish: found.dish.name,
      section: found.section.name,
      menu: found.menu.name,
      restaurant: restaurant.name,
    }),
  };
}

// A dish's Allergens page (D-148, D-222): its allergens and their check,
// and the same-named offer (D-129). The page is named for the page, in the
// title and in the h1, with the dish, its section, and its menu right
// after it (D-225). The other allergens in use on dishes and on options
// and the same-named dishes and options are read on every render, and
// every save ends with a refresh, so what the page shows is what the
// server holds.
export default async function RestaurantDishAllergensPage({ params }: Props) {
  const { code, dish: dishId } = await params;
  const { supabase, email, restaurant, found } = await loadDish(code, dishId);
  if (!email) redirect(signInPath);
  if (!restaurant || !found) notFound();
  const { dish, section, menu, lists, showing } = found;
  const [
    menus,
    sections,
    dishOtherNames,
    optionOtherNames,
    namesakes,
    sameOptions,
  ] = await Promise.all([
    listOwnerMenuNames(supabase, restaurant.id),
    listOwnerSectionNames(supabase, restaurant.id),
    listOwnerOtherAllergenNames(supabase, restaurant.id),
    listOwnerOptionOtherAllergenNames(supabase, restaurant.id),
    listOwnerSameNamedDishes(supabase, restaurant.id, dish.id, dish.name),
    listOwnerSameNamedOptions(supabase, restaurant.id, dish.name, null),
  ]);
  // The restaurant's own other allergens, on dishes and on options, most
  // used first (D-149, D-166).
  const otherNames = rankOtherAllergenNames([
    ...dishOtherNames,
    ...optionOtherNames,
  ]);
  // The same-named dishes and options the allergen check names (D-129,
  // D-166): live ones, in live sections of live menus, whose lists differ
  // from this dish's as a diner reads them, or which are not checked. Where
  // each one is comes from the restaurant's menus and sections, and from
  // the dishes the options' lists hang under.
  const ownLists = { allergens: dish.allergens, others: dish.otherAllergens };
  const homeDishes = await listOwnerDishNames(
    supabase,
    restaurant.id,
    sameOptions
      .filter((other) => other.home.kind === "dish")
      .map((other) => other.home.id),
  );
  const context = {
    sections,
    menus,
    dishes: homeDishes,
    placeIn: (lead: string, home: string) =>
      placeIn(en.owner.choices, lead, home),
  };
  const sameNamed = [
    ...dishPlaces(namesakes, ownLists, context),
    ...optionPlaces(sameOptions, ownLists, context),
  ];

  return (
    <DishPageFrame
      copy={en}
      restaurant={restaurant}
      dish={dish}
      section={section}
      menu={menu}
      lists={lists}
      showing={showing}
      page={PAGE}
    >
      <DishAllergensPage
        strings={en.owner.dish}
        editing={en.owner.editing}
        code={restaurant.code}
        dish={dish}
        allergenCopy={en.allergens}
        otherNames={otherNames}
        sameNamed={sameNamed}
        timeZone={restaurant.timezone}
        lang={en.lang}
      />
    </DishPageFrame>
  );
}
