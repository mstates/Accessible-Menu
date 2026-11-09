import type { ReactNode } from "react";
import type { Copy } from "@/copy";
import type { OwnerChoiceList } from "@/domain/choices";
import type { OwnerDishDetail } from "@/domain/dish";
import { Breadcrumb, type Crumb } from "@/ui/Breadcrumb";
import { PageFrame } from "@/ui/PageFrame";
import { PageNav } from "@/ui/PageNav";
import {
  dashboardPath,
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "../paths";
import { RestaurantNav } from "../RestaurantNav";
import {
  dishPageHeadingId,
  dishPageName,
  dishPageNavItems,
  dishPageState,
  type DishPageKey,
} from "./dish-pages";
import type { ShowingNow } from "./schedule-words";

type Props = {
  copy: Copy;
  restaurant: { name: string; code: string };
  dish: OwnerDishDetail;
  section: { id: string; name: string };
  menu: { id: string; name: string };
  // The dish's choice lists and what its availability is now, for the
  // nav's state lines.
  lists: readonly OwnerChoiceList[];
  showing: ShowingNow;
  page: DishPageKey;
  children: ReactNode;
};

// The frame every one of a dish's pages shares (D-222, D-225): the
// restaurant nav with Menus marked as the part the page sits in (D-122),
// then in main the breadcrumb, the h1, the page nav, and the page's
// content, in that order at every size, so the reading order is the same
// whatever the screen. General's breadcrumb ends with the dish as text,
// the page itself; a sub page's ends with the dish as a link and carries
// no current entry, since a breadcrumb only goes up and the page nav marks
// the page. General's h1 is the dish's name; a sub page's is the page's
// name, carrying the id its first group labels itself by, so the group
// sits directly under the h1 with no heading of its own.
//
// Once main has 36rem of room inside its padding (Tailwind's xl container
// step; its full width is 40rem), the nav takes a narrow left column and
// the content the rest; narrower, one column, the nav stacked under the h1
// and never collapsed. The break is a container query on main's width, not
// a media query: a media query's rem is the browser's default font size,
// which a root size raised in the page (iOS Dynamic Type through the root's
// system font, a stylesheet, the gate's largest-text run in WebKit and
// Firefox) never moves, while a container query's rem follows the root's
// size. So at a large text size the columns stack wherever the room runs
// out, in every engine, which is the right reflow. Main keeps its width;
// the column widths are bones for the design pass.
export function DishPageFrame({
  copy,
  restaurant,
  dish,
  section,
  menu,
  lists,
  showing,
  page,
  children,
}: Props) {
  const dishStrings = copy.owner.dish;
  const choiceStrings = copy.owner.choices;
  const trail: Crumb[] = [
    {
      href: restaurantMenusPath(restaurant.code),
      label: copy.owner.restaurants.nav.menus,
    },
    { href: restaurantMenuPath(restaurant.code, menu.id), label: menu.name },
    {
      href: restaurantSectionPath(restaurant.code, section.id),
      label: section.name,
    },
    ...(page === "general"
      ? []
      : [
          {
            href: restaurantDishPath(restaurant.code, dish.id),
            label: dish.name,
          },
        ]),
  ];
  const heading =
    page === "general"
      ? dish.name
      : dishPageName(page, dishStrings, choiceStrings);
  const items = dishPageNavItems(
    restaurant.code,
    dish.id,
    page,
    dishPageState(dish, lists, showing),
    dishStrings,
    choiceStrings,
  );

  return (
    <PageFrame
      siteName={copy.site.name}
      homeHref={dashboardPath}
      loadingLabel={copy.ui.loading}
      nav={
        <RestaurantNav
          copy={copy}
          name={restaurant.name}
          code={restaurant.code}
          current="dish"
        />
      }
    >
      <Breadcrumb
        label={copy.ui.breadcrumb}
        trail={trail}
        current={page === "general" ? dish.name : undefined}
      />
      <h1 id={dishPageHeadingId(page)} className="mt-2 text-3xl font-bold">
        {heading}
      </h1>
      <div className="@container">
        <div className="mt-6 @xl:grid @xl:grid-cols-[11rem_minmax(0,1fr)] @xl:items-start @xl:gap-x-8">
          <PageNav label={dish.name} items={items} />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </PageFrame>
  );
}
