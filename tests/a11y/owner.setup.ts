import { createServerClient } from "@supabase/ssr";
import { test as setup } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  cookieJar,
  ownerEnv,
  ownerFixturePath,
  ownerStatePath,
  toStorageState,
  type OwnerFixture,
} from "./owner-env";

// Signs in the test owner in Node, with no browser, and fails closed before
// any page loads: the user must hold exactly one membership, that
// restaurant's code must be the configured one (D-100), and it must have
// the menus the menus checks read, the sections the sections checks read,
// the dishes the dishes checks read, one dish priced each way for the
// dish page checks (D-139), and the two choice lists the choices checks
// read (D-166), and the menu with sections published while the empty one
// is not, for the publishing checks (D-82, migration 12). Messages name
// counts, codes, and the test menus' and sections' names, never a token,
// and say how to fix the data: one file, run by hand in the SQL editor,
// since the gate never writes (D-126). A failure after sign-in signs out
// first, since the teardown has no session file to work from yet.

const MENUS_NEEDED = 3;
const SECTIONS_NEEDED = 3;
const DISHES_NEEDED = 3;
const FIX_DATA =
  "Run supabase/checks/ci_diner.sql in the Supabase SQL editor, then re-run the failed jobs.";

const listedMenus = z.array(z.object({ id: z.string(), name: z.string() }));
const listedSections = z.array(
  z.object({ id: z.string(), name: z.string(), menu_id: z.string() }),
);
const heldDishes = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    section_id: z.string(),
    price_kind: z.enum(["one", "sizes", "market"]),
  }),
);

const listedLists = z.array(
  z.object({
    id: z.string(),
    lead: z.string(),
    item_id: z.string().nullable(),
    section_id: z.string().nullable(),
  }),
);
const listedOptions = z.array(z.object({ choice_list_id: z.string() }));

const memberships = z.array(
  z.object({
    restaurant_id: z.string(),
    restaurants: z.object({ code: z.string() }).nullable(),
  }),
);
const publishStates = z.array(
  z.object({
    menu: z.string(),
    menu_name: z.string(),
    published: z.boolean(),
    changed: z.boolean().nullable(),
  }),
);

setup(
  "the test owner signs in and holds exactly one restaurant, with its menus, sections, and dishes",
  async ({ baseURL }) => {
    if (!baseURL) throw new Error("the owner checks need a baseURL");
    const env = ownerEnv();
    const jar = cookieJar();
    const supabase = createServerClient(env.supabaseUrl, env.supabaseKey, {
      cookies: jar.methods,
    });
    const signIn = await supabase.auth.signInWithPassword({
      email: env.email,
      password: env.password,
    });
    if (signIn.error) {
      throw new Error(`sign-in failed: ${signIn.error.message}`);
    }
    try {
      const { data, error } = await supabase
        .from("owners")
        .select("restaurant_id, restaurants(code)")
        .eq("user_id", signIn.data.user.id);
      if (error) {
        throw new Error(`could not read memberships: ${error.message}`);
      }
      const members = memberships.parse(data);
      const codes = members.map((row) => row.restaurants?.code ?? "unknown");
      if (codes.length !== 1 || codes[0] !== env.code) {
        const found =
          codes.length === 0 ? "none" : `${codes.length}: ${codes.join(", ")}`;
        throw new Error(
          `expected one membership with code ${env.code}, found ${found}`,
        );
      }
      const restaurantId = members[0]?.restaurant_id ?? "";
      // The menus checks read three rows: a first, a last, and one between
      // with both moves on. The gate never writes, so the menus come from
      // the data file, and their absence stops the run here with the reason.
      const menus = await supabase
        .from("menus")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (menus.error) {
        throw new Error(`could not count menus: ${menus.error.message}`);
      }
      const count = menus.count ?? 0;
      if (count < MENUS_NEEDED) {
        throw new Error(
          `the test restaurant (${env.code}) needs three menus, found ${count}. ${FIX_DATA}`,
        );
      }
      // The sections checks read one menu with a first section, a last one,
      // and one between, and the delete checks also need a menu with none.
      // The dishes checks read one section of that menu with a first dish,
      // a last one, and one between, and need a section with none. Which
      // menus and sections those are is found here, in the order the pages
      // show them, and handed to the specs, since a menu's page and a
      // section's page are named by an id. The gate never writes, so the
      // rows come from the data file.
      const menuRows = await supabase
        .from("menus")
        .select("id, name")
        .is("deleted_at", null)
        .order("sort")
        .order("created_at")
        .order("id");
      if (menuRows.error) {
        throw new Error(`could not read menus: ${menuRows.error.message}`);
      }
      const sectionRows = await supabase
        .from("sections")
        .select("id, name, menu_id")
        .is("deleted_at", null)
        .order("sort")
        .order("created_at")
        .order("id");
      if (sectionRows.error) {
        throw new Error(
          `could not read sections: ${sectionRows.error.message}`,
        );
      }
      const dishRows = await supabase
        .from("items")
        .select("id, name, section_id, price_kind")
        .is("deleted_at", null)
        .order("sort")
        .order("created_at")
        .order("id");
      if (dishRows.error) {
        throw new Error(`could not read dishes: ${dishRows.error.message}`);
      }
      const dishes = heldDishes.parse(dishRows.data);
      const dishesIn = new Map<string, number>();
      for (const row of dishes) {
        dishesIn.set(row.section_id, (dishesIn.get(row.section_id) ?? 0) + 1);
      }
      const sections = listedSections
        .parse(sectionRows.data)
        .map((section) => ({
          ...section,
          dishes: dishesIn.get(section.id) ?? 0,
        }));
      const listed = listedMenus.parse(menuRows.data).map((menu) => {
        const own = sections.filter((section) => section.menu_id === menu.id);
        return {
          ...menu,
          own,
          sections: own.length,
          dishes: own.reduce((sum, section) => sum + section.dishes, 0),
        };
      });
      const withSections = listed.find(
        (menu) =>
          menu.sections >= SECTIONS_NEEDED &&
          menu.own.some((section) => section.dishes >= DISHES_NEEDED) &&
          menu.own.some((section) => section.dishes === 0),
      );
      const empty = listed.find((menu) => menu.sections === 0);
      const withDishes = withSections?.own.find(
        (section) => section.dishes >= DISHES_NEEDED,
      );
      const emptySection = withSections?.own.find(
        (section) => section.dishes === 0,
      );
      // The dish page checks read one dish priced each way in the section
      // with dishes (D-139), which the data file sets.
      const own = withDishes
        ? dishes.filter((dish) => dish.section_id === withDishes.id)
        : [];
      const priced = (kind: "one" | "sizes" | "market") =>
        own.find((dish) => dish.price_kind === kind);
      const bySize = priced("sizes");
      const atOne = priced("one");
      const atMarket = priced("market");
      if (withDishes && (!bySize || !atOne || !atMarket)) {
        throw new Error(
          `the section ${withDishes.name} of the test restaurant (${env.code}) needs one dish priced by size, one at one price, and one at market price; found ${own
            .map((dish) => `${dish.name} ${dish.price_kind}`)
            .join(", ")}. ${FIX_DATA}`,
        );
      }
      // The choices checks read one list on the section with dishes and
      // one on its one-price dish (D-166), which the data file sets, each
      // with its live options counted.
      const listRows = await supabase
        .from("choice_lists")
        .select("id, lead, item_id, section_id")
        .is("deleted_at", null)
        .order("sort")
        .order("created_at")
        .order("id");
      if (listRows.error) {
        throw new Error(
          `could not read choice lists: ${listRows.error.message}`,
        );
      }
      const optionRows = await supabase
        .from("choice_options")
        .select("choice_list_id")
        .is("deleted_at", null);
      if (optionRows.error) {
        throw new Error(`could not read options: ${optionRows.error.message}`);
      }
      const optionsIn = new Map<string, number>();
      for (const row of listedOptions.parse(optionRows.data)) {
        optionsIn.set(
          row.choice_list_id,
          (optionsIn.get(row.choice_list_id) ?? 0) + 1,
        );
      }
      const allLists = listedLists.parse(listRows.data);
      const sectionList = withDishes
        ? allLists.find((list) => list.section_id === withDishes.id)
        : undefined;
      const dishList = atOne
        ? allLists.find((list) => list.item_id === atOne.id)
        : undefined;
      if (withDishes && atOne && (!sectionList || !dishList)) {
        throw new Error(
          `the test restaurant (${env.code}) needs a choice list on the section ${withDishes.name} and one on the dish ${atOne.name}; found ${allLists.length} lists. ${FIX_DATA}`,
        );
      }
      if (
        !withSections ||
        !empty ||
        !withDishes ||
        !emptySection ||
        !bySize ||
        !atOne ||
        !atMarket ||
        !sectionList ||
        !dishList
      ) {
        const found = listed
          .map(
            (menu) =>
              `${menu.name} ${menu.sections}` +
              (menu.own.length > 0
                ? ` (${menu.own
                    .map((section) => `${section.name} ${section.dishes}`)
                    .join(", ")})`
                : ""),
          )
          .join(", ");
        throw new Error(
          `the test restaurant (${env.code}) needs one menu with three sections, one of them with three dishes and one with none, and one menu with no section; found ${found}. ${FIX_DATA}`,
        );
      }
      // The publishing checks read the menu with sections as published and
      // the empty menu as not (D-82), which the data file sets through
      // publish_menu() as the owner, so the gate never presses Publish.
      const states = await supabase.rpc("menu_publish_states", {
        p_restaurant: restaurantId,
      });
      if (states.error) {
        throw new Error(
          `could not read the publish states: ${states.error.message}`,
        );
      }
      const stateRows = publishStates.parse(states.data);
      const published = new Map(
        stateRows.map((row) => [row.menu, row.published]),
      );
      if (
        published.get(withSections.id) !== true ||
        published.get(empty.id) !== false
      ) {
        throw new Error(
          `the test restaurant (${env.code}) needs ${withSections.name} published and ${empty.name} not; found ${withSections.name} ${published.get(withSections.id) ? "published" : "not published"}, ${empty.name} ${published.get(empty.id) ? "published" : "not published"}. ${FIX_DATA}`,
        );
      }
      const fixture: OwnerFixture = {
        withSections: {
          id: withSections.id,
          name: withSections.name,
          sections: withSections.sections,
          dishes: withSections.dishes,
        },
        empty: { id: empty.id, name: empty.name },
        withDishes: {
          id: withDishes.id,
          name: withDishes.name,
          dishes: withDishes.dishes,
        },
        emptySection: { id: emptySection.id, name: emptySection.name },
        dishes: {
          sizes: { id: bySize.id, name: bySize.name },
          one: { id: atOne.id, name: atOne.name },
          market: { id: atMarket.id, name: atMarket.name },
        },
        lists: {
          section: {
            id: sectionList.id,
            lead: sectionList.lead,
            options: optionsIn.get(sectionList.id) ?? 0,
          },
          dish: {
            id: dishList.id,
            lead: dishList.lead,
            options: optionsIn.get(dishList.id) ?? 0,
          },
        },
        published: stateRows
          .filter((row) => row.published)
          .map((row) => row.menu_name),
        states: stateRows.map((row) => ({
          id: row.menu,
          name: row.menu_name,
          published: row.published,
          changed: row.changed,
        })),
        sectionsInRestaurant: sections.length,
      };
      writeFileSync(ownerFixturePath, JSON.stringify(fixture), { mode: 0o600 });
      writeFileSync(
        ownerStatePath,
        JSON.stringify(toStorageState(jar.cookies, baseURL)),
        { mode: 0o600 },
      );
    } catch (error) {
      await supabase.auth.signOut({ scope: "local" });
      throw error;
    }
  },
);
