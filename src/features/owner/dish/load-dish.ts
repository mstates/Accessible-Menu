import { cache } from "react";
import { z } from "zod";
import { listOwnerChoiceLists } from "@/core/supabase/choices";
import { findOwnerDish } from "@/core/supabase/dishes";
import { findOwnerMenu } from "@/core/supabase/menus";
import { findOwnerSection } from "@/core/supabase/sections";
import { availabilityAt } from "@/domain/availability";
import type { OwnerChoiceList } from "@/domain/choices";
import type { OwnerDishDetail } from "@/domain/dish";
import { loadRestaurant } from "../load-restaurant";
import type { ShowingNow } from "./schedule-words";

// What every one of a dish's pages needs (D-222), read once per request
// and shared by the page's metadata and the page itself. The dish's id in
// the path is user input: it must be a uuid before any query, the dish
// must be one of this restaurant's that is not deleted, and so must the
// section it is in and that section's menu. Row level security hides a
// dish that is not this owner's, so a wrong owner, a deleted dish, a dish
// of a deleted section or menu, and an id that matches nothing all get the
// 404 page (D-122). A read that failed is thrown to the owner error page,
// never shown as a missing dish. The address names the dish and not its
// section, so it stays good when the dish moves (D-128, D-129); the
// section and the menu are read from the dish every time.
//
// The dish's choice lists and what its availability is now are read here
// too, since the page nav's state lines need them on every page, and the
// Choice lists page and the Availability page show them. Availability is
// decided once, from the row, the restaurant's hours and zone, and this
// render's clock (D-160), which the page's time-dependent lines read too.
// This is the one owner file outside the actions that hands the sold-out
// mark to the decider (tests/unit/availability-guard.test.ts).

export type LoadedDish = {
  dish: OwnerDishDetail;
  section: { id: string; name: string; menuId: string };
  menu: { id: string; name: string };
  lists: OwnerChoiceList[];
  showing: ShowingNow;
  now: string;
};

export const loadDish = cache(async (rawCode: string, rawDish: string) => {
  const { supabase, email, userId, restaurant } = await loadRestaurant(rawCode);
  const nothing = { supabase, email, userId, restaurant, found: null };
  if (!email || !restaurant) return nothing;
  const id = z.uuid().safeParse(rawDish);
  if (!id.success) return nothing;
  const row = await findOwnerDish(supabase, restaurant.id, id.data, userId);
  if (row === "failed") throw new Error("the dish could not be read");
  if (row === "not-found") return nothing;
  const { sectionId, ...dish } = row;
  const section = await findOwnerSection(supabase, restaurant.id, sectionId);
  if (section === "failed") throw new Error("the section could not be read");
  if (section === "not-found") return nothing;
  const menu = await findOwnerMenu(supabase, restaurant.id, section.menuId);
  if (menu === "failed") throw new Error("the menu could not be read");
  if (menu === "not-found") return nothing;
  const lists = await listOwnerChoiceLists(supabase, {
    kind: "dish",
    id: dish.id,
  });
  const now = new Date();
  const decided = availabilityAt(
    { available: dish.available, soldOutAt: dish.soldOutAt },
    now,
    restaurant.hours,
    restaurant.timezone,
  );
  const found: LoadedDish = {
    dish,
    section,
    menu,
    lists,
    showing: {
      state: decided.state,
      until: decided.state === "sold-out" ? decided.until.toISOString() : null,
    },
    now: now.toISOString(),
  };
  return { supabase, email, userId, restaurant, found };
});
