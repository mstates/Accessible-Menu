import type { Copy } from "@/copy";
import { PageNav } from "@/ui/PageNav";
import { restaurantDetailsPath } from "./paths";

export type RestaurantPage = "details";

type Props = {
  copy: Copy;
  name: string;
  code: string;
  current: RestaurantPage;
};

// The pages that belong to one restaurant (D-89, D-104), in a nav landmark
// named for it. Today only Details; Menus joins with the menus section. The
// page that renders it says which page is current, so aria-current is set on
// the server and needs no client hook.
export function RestaurantNav({ copy, name, code, current }: Props) {
  const pages: { page: RestaurantPage; href: string; label: string }[] = [
    {
      page: "details",
      href: restaurantDetailsPath(code),
      label: copy.owner.restaurants.nav.details,
    },
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
