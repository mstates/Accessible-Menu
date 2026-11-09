import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { dishPageTitle } from "@/features/owner/dish/dish-pages";
import { DishChoicesPage } from "@/features/owner/dish/DishChoicesPage";
import { DishPageFrame } from "@/features/owner/dish/DishPageFrame";
import { loadDish } from "@/features/owner/dish/load-dish";
import { signInPath } from "@/features/owner/paths";

type Props = { params: Promise<{ code: string; dish: string }> };

const PAGE = "choices";

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

// A dish's Choice lists page (D-166, D-222): its choice lists as rows,
// each leading to the list's own page. The page is named for the page, in
// the title and in the h1, with the dish, its section, and its menu right
// after it (D-225). The lists are read on every render, and every save
// ends with a refresh, so what the page shows is what the server holds.
export default async function RestaurantDishChoicesPage({ params }: Props) {
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
      <DishChoicesPage
        strings={en.owner.choices}
        editing={en.owner.editing}
        code={restaurant.code}
        dish={{ id: dish.id }}
        lists={lists}
      />
    </DishPageFrame>
  );
}
