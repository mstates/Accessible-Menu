import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { listOwnerDishes } from "@/core/supabase/dishes";
import { listOwnerMenuNames } from "@/core/supabase/menus";
import { listOwnerSectionNames } from "@/core/supabase/sections";
import { listOwnerSizeNames, listOwnerSizes } from "@/core/supabase/sizes";
import { nextDish } from "@/domain/dish";
import { dishPageTitle } from "@/features/owner/dish/dish-pages";
import { DishGeneral } from "@/features/owner/dish/DishGeneral";
import { DishPageFrame } from "@/features/owner/dish/DishPageFrame";
import { loadDish } from "@/features/owner/dish/load-dish";
import { signInPath } from "@/features/owner/paths";
import type { SelectGroup } from "@/ui/Select";

type Props = { params: Promise<{ code: string; dish: string }> };

const strings = en.owner.dish;
const PAGE = "general";

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

// A dish's General page, at the dish's own address (D-128, D-222): its
// description, its price (D-139) with calories (D-167), its note, its
// sizes, the link to the next dish, and its move to another section
// (D-129). The page is named for the dish, in the title and in the h1, and
// the title names its section and its menu right after it. The dish's
// other pages sit under the page nav (D-222). The sizes, the section's
// dishes, the restaurant's menus and sections, and the size names in use
// are read on every render, and every save ends with a refresh, so what
// the page shows is what the server holds.
export default async function RestaurantDishPage({ params }: Props) {
  const { code, dish: dishId } = await params;
  const { supabase, email, restaurant, found } = await loadDish(code, dishId);
  if (!email) redirect(signInPath);
  if (!restaurant || !found) notFound();
  const { dish, section, menu, lists, showing } = found;
  const [sizes, dishes, menus, sections, sizeNames] = await Promise.all([
    listOwnerSizes(supabase, dish.id),
    listOwnerDishes(supabase, section.id),
    listOwnerMenuNames(supabase, restaurant.id),
    listOwnerSectionNames(supabase, restaurant.id),
    listOwnerSizeNames(supabase, restaurant.id),
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
      {/* Said before the first field it governs (WCAG 3.3.2). */}
      <p className="mt-6 text-foreground-muted">{strings.lead}</p>
      <DishGeneral
        strings={strings}
        editing={en.owner.editing}
        code={restaurant.code}
        dish={dish}
        section={{ id: section.id, name: section.name }}
        sizes={sizes}
        sizeNames={sizeNames}
        next={nextDish(dishes, dish.id)}
        targets={targets}
      />
    </DishPageFrame>
  );
}
