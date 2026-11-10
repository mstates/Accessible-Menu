import type { ReactNode } from "react";
import type { Copy } from "@/copy";
import type { MenuNotice } from "@/core/notice";
import type { OwnerMenu } from "@/domain/menu";
import { Breadcrumb, type Crumb } from "@/ui/Breadcrumb";
import { PageFrame } from "@/ui/PageFrame";
import { PageNav } from "@/ui/PageNav";
import { NoticeBanner } from "../NoticeBanner";
import {
  dashboardPath,
  restaurantMenuPath,
  restaurantMenusPath,
} from "../paths";
import { RestaurantNav } from "../RestaurantNav";
import {
  menuPageHeadingId,
  menuPageName,
  menuPageNavItems,
  menuPagePath,
  type MenuPageKey,
  type MenuPageState,
} from "./menu-pages";

type Props = {
  copy: Copy;
  restaurant: { name: string; code: string };
  menu: OwnerMenu;
  // Where the menu stands, for the nav's line beside Publishing: each page
  // hands over its own reading (load-menu.ts says why).
  state: MenuPageState;
  page: MenuPageKey;
  // The result the page load brings, when the request carried one: a
  // Publish or an Unpublish that landed (D-219, D-231).
  notice?: MenuNotice | null;
  children: ReactNode;
};

// The frame both of a menu's pages share (D-224), in the shape of a dish's
// (D-222, D-225): the restaurant nav with Menus marked as the part the page
// sits in (D-122), then in main the breadcrumb, the h1, the page nav, and
// the page's content, in that order at every size, so the reading order is
// the same whatever the screen. Sections' breadcrumb ends with the menu as
// text, the page itself, and its h1 is the menu's name, as the menu's page
// has always been; Publishing's ends with the menu as a link and carries no
// current entry, since a breadcrumb only goes up and the page nav marks the
// page, and its h1 is the page's name. When a press on Publishing lands,
// the page loads again with the success flash first in main, before the
// breadcrumb and the h1 (D-215, D-219, Q-156): jumping to main lands on it,
// and its dismiss button hands focus to the h1, which takes it.
//
// The layout is the dish frame's: once main has 36rem of room inside its
// padding, the nav takes a narrow left column and the content the rest;
// narrower, one column, the nav stacked under the h1 and never collapsed.
// The break is a container query on main's width, whose rem follows the
// root's size, so at a large text size the columns stack wherever the room
// runs out (D-226). The two frames repeat these few classes; a shared shell
// waits for the third thing with pages (rule 12).
export function MenuPageFrame({
  copy,
  restaurant,
  menu,
  state,
  page,
  notice = null,
  children,
}: Props) {
  const headingId = menuPageHeadingId(page);
  const trail: Crumb[] = [
    {
      href: restaurantMenusPath(restaurant.code),
      label: copy.owner.restaurants.nav.menus,
    },
    ...(page === "sections"
      ? []
      : [
          {
            href: restaurantMenuPath(restaurant.code, menu.id),
            label: menu.name,
          },
        ]),
  ];
  const heading =
    page === "sections"
      ? menu.name
      : menuPageName(page, copy.owner.menuPages, copy.owner.publishing);
  const items = menuPageNavItems(
    restaurant.code,
    menu.id,
    page,
    state,
    copy.owner.menuPages,
    copy.owner.publishing,
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
          current="menu"
        />
      }
    >
      {notice && headingId ? (
        <NoticeBanner
          copy={copy}
          notice={notice}
          path={menuPagePath(restaurant.code, menu.id, page)}
          headingId={headingId}
          menu={menu.name}
          className="mb-6"
        />
      ) : null}
      <Breadcrumb
        label={copy.ui.breadcrumb}
        trail={trail}
        current={page === "sections" ? menu.name : undefined}
      />
      <h1
        id={headingId}
        tabIndex={headingId ? -1 : undefined}
        className="mt-2 text-3xl font-bold"
      >
        {heading}
      </h1>
      <div className="@container">
        <div className="mt-6 @xl:grid @xl:grid-cols-[11rem_minmax(0,1fr)] @xl:items-start @xl:gap-x-8">
          <PageNav label={menu.name} items={items} />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </PageFrame>
  );
}
