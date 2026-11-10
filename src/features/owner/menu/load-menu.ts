import { cache } from "react";
import { z } from "zod";
import { findOwnerMenu } from "@/core/supabase/menus";
import { loadRestaurant } from "../load-restaurant";

// What both of a menu's pages need (D-224), read once per request and
// shared by the page's metadata and the page itself: the session, the
// restaurant, and the menu. The menu's id in the path is user input: it
// must be a uuid before any query, and the menu must be one of this
// restaurant's that is not deleted. Row level security hides a menu that is
// not this owner's, so a wrong owner, a deleted menu, and an id that matches
// nothing all get the 404 page (D-122). A read that failed is thrown to the
// owner error page, never shown as a missing menu.
//
// The menu's publish state is not read here. The page nav's line needs it
// on both pages, but each page takes it from its own read: Sections from
// menu_publish_states(), and Publishing from the two documents its review
// compares, so that page's state sentence, its nav line, and its review are
// of one reading and cannot disagree.
export const loadMenu = cache(async (rawCode: string, rawMenu: string) => {
  const { supabase, email, restaurant } = await loadRestaurant(rawCode);
  if (!email || !restaurant) return { supabase, email, restaurant, menu: null };
  const id = z.uuid().safeParse(rawMenu);
  if (!id.success) return { supabase, email, restaurant, menu: null };
  const menu = await findOwnerMenu(supabase, restaurant.id, id.data);
  if (menu === "failed") throw new Error("the menu could not be read");
  return {
    supabase,
    email,
    restaurant,
    menu: menu === "not-found" ? null : menu,
  };
});
