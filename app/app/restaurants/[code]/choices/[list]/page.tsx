import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import {
  findOwnerChoiceList,
  listOwnerChoiceLists,
  listOwnerOptionOtherAllergenNames,
  listOwnerOptions,
  listOwnerSameNamedOptions,
} from "@/core/supabase/choices";
import {
  findOwnerDish,
  listOwnerDishNames,
  listOwnerOtherAllergenNames,
  listOwnerSameNamedDishes,
} from "@/core/supabase/dishes";
import { findOwnerMenu, listOwnerMenuNames } from "@/core/supabase/menus";
import {
  findOwnerSection,
  listOwnerSectionNames,
} from "@/core/supabase/sections";
import { rankOtherAllergenNames } from "@/domain/allergens";
import type { SameNamedPlace } from "@/features/owner/allergens/allergen-words";
import { dishPlaces, optionPlaces } from "@/features/owner/allergens/places";
import { placeIn } from "@/features/owner/choices/choice-words";
import { ChoiceListPage } from "@/features/owner/choices/ChoiceListPage";
import { loadRestaurant } from "@/features/owner/load-restaurant";
import {
  dashboardPath,
  restaurantDishPath,
  restaurantMenuPath,
  restaurantMenusPath,
  restaurantSectionPath,
} from "@/features/owner/paths";
import { RestaurantNav } from "@/features/owner/RestaurantNav";
import { Breadcrumb, type Crumb } from "@/ui/Breadcrumb";
import { PageFrame } from "@/ui/PageFrame";

type Props = { params: Promise<{ code: string; list: string }> };

const strings = en.owner.choices;

// One read per request, shared by the metadata and the page. The list's id
// in the path is user input: it must be a uuid before any query, the list
// must be one of this restaurant's that is not deleted, and so must its
// home, a dish in a live section of a live menu or a section in a live
// menu. Row level security hides a list that is not this owner's, so a
// wrong owner, a deleted list, a list under a deleted home, and an id that
// matches nothing all get the 404 page (D-122). A read that failed is
// thrown to the owner error page, never shown as a missing list. The
// address names the list alone (D-166); the home chain is read from the
// list every time.
const loadList = cache(async (rawCode: string, rawList: string) => {
  const { supabase, email, userId, restaurant } = await loadRestaurant(rawCode);
  const nothing = {
    supabase,
    email,
    userId,
    restaurant,
    list: null,
    dish: null,
    section: null,
    menu: null,
  };
  if (!email || !restaurant) return nothing;
  const id = z.uuid().safeParse(rawList);
  if (!id.success) return nothing;
  const list = await findOwnerChoiceList(supabase, restaurant.id, id.data);
  if (list === "failed") throw new Error("the choice list could not be read");
  if (list === "not-found") return nothing;
  let dish = null;
  let sectionId = list.home.id;
  if (list.home.kind === "dish") {
    const found = await findOwnerDish(supabase, restaurant.id, list.home.id);
    if (found === "failed") throw new Error("the dish could not be read");
    if (found === "not-found") return nothing;
    dish = found;
    sectionId = found.sectionId;
  }
  const section = await findOwnerSection(supabase, restaurant.id, sectionId);
  if (section === "failed") throw new Error("the section could not be read");
  if (section === "not-found") return nothing;
  const menu = await findOwnerMenu(supabase, restaurant.id, section.menuId);
  if (menu === "failed") throw new Error("the menu could not be read");
  if (menu === "not-found") return nothing;
  return { supabase, email, userId, restaurant, list, dish, section, menu };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, list: listId } = await params;
  const { restaurant, list, dish, section, menu } = await loadList(
    code,
    listId,
  );
  if (!restaurant || !list || !section || !menu) {
    return { title: pageTitle(en, en.notFound.title) };
  }
  return {
    title: pageTitle(en, list.lead, restaurant.name, [
      ...(dish ? [dish.name] : []),
      section.name,
      menu.name,
    ]),
  };
}

// One choice list's own page (D-166): its lead, and its options with their
// name, added price, calories, and allergens (D-154, D-167). The page is
// named for the lead, in the title and in the h1, and the title names every
// level inside it, nearest first. Menus stays marked in the restaurant's
// nav as the part this page sits inside, and the breadcrumb above the h1
// leads back to the home, the section, the menu, and Menus. The options,
// the home's other lists, the other allergens in use, and each option's
// same-named dishes and options are read on every render, and every save
// ends with a refresh, so what the page shows is what the server holds.
export default async function RestaurantChoiceListPage({ params }: Props) {
  const { code, list: listId } = await params;
  const { supabase, email, userId, restaurant, list, dish, section, menu } =
    await loadList(code, listId);
  if (!email) redirect("/app/sign-in");
  if (!restaurant || !list || !section || !menu) notFound();
  const [options, siblings, menus, sections, dishOtherNames, optionOtherNames] =
    await Promise.all([
      listOwnerOptions(supabase, list.id, userId),
      listOwnerChoiceLists(supabase, list.home),
      listOwnerMenuNames(supabase, restaurant.id),
      listOwnerSectionNames(supabase, restaurant.id),
      listOwnerOtherAllergenNames(supabase, restaurant.id),
      listOwnerOptionOtherAllergenNames(supabase, restaurant.id),
    ]);
  const otherNames = rankOtherAllergenNames([
    ...dishOtherNames,
    ...optionOtherNames,
  ]);

  // The same-named dishes and options each option's check names (D-129,
  // D-166), read by name, a dish's places and an option's resolved the same
  // way the dish page resolves them.
  const namesakes = await Promise.all(
    options.map(async (option) => {
      const [dishes, others] = await Promise.all([
        listOwnerSameNamedDishes(supabase, restaurant.id, "", option.name),
        listOwnerSameNamedOptions(
          supabase,
          restaurant.id,
          option.name,
          option.id,
        ),
      ]);
      return { option, dishes, others };
    }),
  );
  const homeDishes = await listOwnerDishNames(
    supabase,
    restaurant.id,
    namesakes.flatMap(({ others }) =>
      others
        .filter((other) => other.home.kind === "dish")
        .map((other) => other.home.id),
    ),
  );
  const context = {
    sections,
    menus,
    dishes: homeDishes,
    placeIn: (lead: string, home: string) => placeIn(strings, lead, home),
  };
  const sameNamed: Record<string, SameNamedPlace[]> = {};
  for (const { option, dishes, others } of namesakes) {
    const own = { allergens: option.allergens, others: option.otherAllergens };
    sameNamed[option.id] = [
      ...dishPlaces(dishes, own, context),
      ...optionPlaces(others, own, context),
    ];
  }

  const trail: Crumb[] = [
    {
      href: restaurantMenusPath(restaurant.code),
      label: en.owner.restaurants.nav.menus,
    },
    { href: restaurantMenuPath(restaurant.code, menu.id), label: menu.name },
    {
      href: restaurantSectionPath(restaurant.code, section.id),
      label: section.name,
    },
    ...(dish
      ? [
          {
            href: restaurantDishPath(restaurant.code, dish.id),
            label: dish.name,
          },
        ]
      : []),
  ];

  return (
    <PageFrame
      siteName={en.site.name}
      homeHref={dashboardPath}
      loadingLabel={en.ui.loading}
      nav={
        <RestaurantNav
          copy={en}
          name={restaurant.name}
          code={restaurant.code}
          current="list"
        />
      }
    >
      <Breadcrumb label={en.ui.breadcrumb} trail={trail} current={list.lead} />
      <h1 className="mt-2 text-3xl font-bold">{list.lead}</h1>
      {/* Said before the first field it governs (WCAG 3.3.2). */}
      <p className="mt-6 text-foreground-muted">{strings.page.lead}</p>
      <ChoiceListPage
        strings={strings}
        dishAllergenStrings={en.owner.dish.allergens}
        editing={en.owner.editing}
        code={restaurant.code}
        list={{ id: list.id, lead: list.lead, home: list.home }}
        siblings={siblings
          .filter((other) => other.id !== list.id)
          .map((other) => other.lead)}
        options={options}
        sameNamed={sameNamed}
        allergenCopy={en.allergens}
        otherNames={otherNames}
        timeZone={restaurant.timezone}
        lang={en.lang}
      />
    </PageFrame>
  );
}
