import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { readNotice } from "@/core/notice";
import { dishPageTitle } from "@/features/owner/dish/dish-pages";
import { DishAvailabilityForm } from "@/features/owner/dish/DishAvailabilityForm";
import { DishPageFrame } from "@/features/owner/dish/DishPageFrame";
import { saveDishAvailability } from "@/features/owner/dish/form-actions";
import { loadDish } from "@/features/owner/dish/load-dish";
import { signInPath } from "@/features/owner/paths";

type Props = { params: Promise<{ code: string; dish: string }> };

const PAGE = "availability";

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

// A dish's Availability page (D-159, D-160, D-222, D-229): its
// availability and its schedule, saved by one press. The page is named for
// the page, in the title and in the h1, with the dish, its section, and
// its menu right after it (D-225). What the dish's availability is now is
// decided once, by the loader, from the row, the restaurant's hours and
// zone, and this render's clock, which the page's time-dependent lines
// read too. A save that lands loads the page again, with its result in the
// request's cookie, so what the page shows is what the server holds.
export default async function RestaurantDishAvailabilityPage({
  params,
}: Props) {
  const { code, dish: dishId } = await params;
  const { email, restaurant, found } = await loadDish(code, dishId);
  if (!email) redirect(signInPath);
  if (!restaurant || !found) notFound();
  const { dish, section, menu, lists, showing, now } = found;
  const action = saveDishAvailability.bind(null, restaurant.code, dish.id);
  const notice = readNotice((await headers()).get("cookie"), [
    "availability-saved",
  ]);

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
      <DishAvailabilityForm
        strings={en.owner.dish}
        editing={en.owner.editing}
        pendingLabel={en.ui.pending}
        code={restaurant.code}
        dish={dish}
        showing={showing}
        timeZone={restaurant.timezone}
        lang={en.lang}
        now={now}
        scheduleCopy={{ ...en.schedule, day: en.owner.restaurants.days }}
        timeCopy={en.time}
        action={action}
      />
    </DishPageFrame>
  );
}
