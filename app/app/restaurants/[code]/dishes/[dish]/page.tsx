import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { readNotice } from "@/core/notice";
import { listOwnerDishes, readOwnerDishGeneral } from "@/core/supabase/dishes";
import { listOwnerMenuNames } from "@/core/supabase/menus";
import { listOwnerSectionNames } from "@/core/supabase/sections";
import { listOwnerSizeNames } from "@/core/supabase/sizes";
import { nextDish } from "@/domain/dish";
import { dishPageTitle } from "@/features/owner/dish/dish-pages";
import { DishGeneralForm } from "@/features/owner/dish/DishGeneralForm";
import { DishPageFrame } from "@/features/owner/dish/DishPageFrame";
import { saveDishGeneral } from "@/features/owner/dish/form-actions";
import { loadDish } from "@/features/owner/dish/load-dish";
import { signInPath } from "@/features/owner/paths";
import type { SelectGroup } from "@/ui/Select";

type Props = { params: Promise<{ code: string; dish: string }> };

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
// description and note, its price (D-139) with calories (D-167) and its
// sizes, the link to the next dish, and its move to another section
// (D-129). The page is named for the dish, in the title and in the h1, and
// the title names its section and its menu right after it. The dish's
// other pages sit under the page nav (D-222).
//
// The page is one form saved by one press (D-237). What it shows and
// writes is read whole, in one statement, through item_general()
// (migration 16), and handed to the form with the document as it arrived:
// the Save hands that document back, and the database refuses the save
// when the dish no longer holds it. A save that lands loads the page
// again, with its result in the request's cookie, so what the page shows
// is what the server holds. The section's dishes, the restaurant's menus
// and sections, and the size names in use are read beside it.
export default async function RestaurantDishPage({ params }: Props) {
  const { code, dish: dishId } = await params;
  const { supabase, email, restaurant, found } = await loadDish(code, dishId);
  if (!email) redirect(signInPath);
  if (!restaurant || !found) notFound();
  const { dish, section, menu, lists, showing } = found;
  const [general, dishes, menus, sections, sizeNames] = await Promise.all([
    readOwnerDishGeneral(supabase, dish.id),
    listOwnerDishes(supabase, section.id),
    listOwnerMenuNames(supabase, restaurant.id),
    listOwnerSectionNames(supabase, restaurant.id),
    listOwnerSizeNames(supabase, restaurant.id),
  ]);
  // The dish went between the frame's read and this one: the page is gone.
  // A read that failed is thrown to the owner error page, never shown as a
  // missing dish.
  if (general === "not-found") notFound();
  if (general === "failed") {
    throw new Error("the dish's General fields could not be read");
  }
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
  const action = saveDishGeneral.bind(null, restaurant.code, dish.id);
  const notice = readNotice((await headers()).get("cookie"), ["general-saved"]);

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
      notice={notice}
    >
      <DishGeneralForm
        strings={en.owner.dish}
        editing={en.owner.editing}
        pendingLabel={en.ui.pending}
        code={restaurant.code}
        dish={{ id: dish.id, name: dish.name }}
        section={{ id: section.id, name: section.name }}
        general={general}
        sizeNames={sizeNames}
        next={nextDish(dishes, dish.id)}
        targets={targets}
        action={action}
      />
    </DishPageFrame>
  );
}
