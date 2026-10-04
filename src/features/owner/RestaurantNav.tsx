import type { Copy } from "@/copy";
import { PageNav } from "@/ui/PageNav";
import { restaurantDetailsPath, restaurantMenusPath } from "./paths";

export type RestaurantPage = "details" | "menus";

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
// aria-current is set on the server and needs no client hook.
export function RestaurantNav({ copy, name, code, current }: Props) {
  const labels = copy.owner.restaurants.nav;
  const pages: { page: RestaurantPage; href: string; label: string }[] = [
    {
      page: "details",
      href: restaurantDetailsPath(code),
      label: labels.details,
    },
    { page: "menus", href: restaurantMenusPath(code), label: labels.menus },
  ];
  return (
    <PageNav
      label={name}
      links={pages.map(({ page, href, label }) => ({
        href,
        label,
        current: page === current,
      }))}
    />
  );
}
