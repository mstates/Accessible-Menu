import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { dishPageTitle } from "@/features/owner/dish/dish-pages";
import { DishPageFrame } from "@/features/owner/dish/DishPageFrame";
import { DishTagsPage } from "@/features/owner/dish/DishTagsPage";
import { loadDish } from "@/features/owner/dish/load-dish";
import { signInPath } from "@/features/owner/paths";

type Props = { params: Promise<{ code: string; dish: string }> };

const PAGE = "tags";

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

// A dish's Dietary tags page (D-66, D-167, D-222): its three tags and its
// Cooked to order mark. The page is named for the page, in the title and
// in the h1, with the dish, its section, and its menu right after it
// (D-225). Every save ends with a refresh, so what the page shows is what
// the server holds.
export default async function RestaurantDishTagsPage({ params }: Props) {
  const { code, dish: dishId } = await params;
  const { email, restaurant, found } = await loadDish(code, dishId);
  if (!email) redirect(signInPath);
  if (!restaurant || !found) notFound();
  const { dish, section, menu, lists, showing } = found;

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
      <DishTagsPage
        strings={en.owner.dish}
        editing={en.owner.editing}
        code={restaurant.code}
        dish={dish}
        dietaryCopy={en.dietary}
      />
    </DishPageFrame>
  );
}
