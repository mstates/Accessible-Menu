import type { Copy } from "@/copy";
import { TopNav, type TopNavLink } from "@/ui/TopNav";
import { restaurantDetailsPath, restaurantMenusPath } from "./paths";

// The page that renders the nav says where it is: on Details, on Menus, or
// on one menu's own page, one section's, one dish's, or one choice list's,
// which all sit inside Menus.
export type RestaurantPage =
  "details" | "menus" | "menu" | "section" | "dish" | "list";

type Props = {
  copy: Copy;
  name: string;
  code: string;
  current: RestaurantPage;
};

// The pages that belong to one restaurant (D-89, D-104), in a nav landmark
// named for it by the restaurant's name shown in front of the links. Each
// page's h1 is the page's own name, so this is where the restaurant shows on
// screen (D-113). The page that renders it says which page is current, so
// aria-current is set on the server and needs no client hook. Inside a
// menu, on its page, on one of its sections', or on one of their dishes',
// no link in the nav points to the page itself, so Menus is marked as the
// current part of the nav, not as the current page, and stays the way back
// (D-122).
export function RestaurantNav({ copy, name, code, current }: Props) {
  const labels = copy.owner.restaurants.nav;
  const links: TopNavLink[] = [
    {
      href: restaurantDetailsPath(code),
      label: labels.details,
      current: current === "details" ? "page" : false,
    },
    {
      href: restaurantMenusPath(code),
      label: labels.menus,
      current: current === "menus" ? "page" : current !== "details" && "true",
    },
  ];
  return <TopNav label={name} links={links} />;
}
