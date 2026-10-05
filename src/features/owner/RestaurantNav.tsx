import type { Copy } from "@/copy";
import { PageNav, type PageNavLink } from "@/ui/PageNav";
import { restaurantDetailsPath, restaurantMenusPath } from "./paths";

// The page that renders the nav says where it is: on Details, on Menus, or
// on one menu's own page or one section's, which both sit inside Menus.
export type RestaurantPage = "details" | "menus" | "menu" | "section";

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
// menu, on its page or on one of its sections', no link in the nav points
// to the page itself, so Menus is marked as the current part of the nav,
// not as the current page, and stays the way back (D-122).
export function RestaurantNav({ copy, name, code, current }: Props) {
  const labels = copy.owner.restaurants.nav;
  const links: PageNavLink[] = [
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
  return <PageNav label={name} links={links} />;
}
