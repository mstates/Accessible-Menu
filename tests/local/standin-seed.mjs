import { randomUUID } from "node:crypto";
import { menuSnapshot } from "./menu-snapshot.mjs";

// The stand-in's rows (D-142), as CI Diner's data file leaves them (D-126):
// four menus, Dinner's three sections, Starters' three dishes priced one
// way each with their allergens, tags, schedule, calories, and the mark, a
// second unchecked Soup of the day in Mains, the soup's two sizes, the two
// choice lists, Drinks' Soft drinks with Lemonade and its Kids section
// with three dishes and two lists of eleven options in all (the diner page
// task, Build 2, Q-74), and Brunch's Eggs with Shakshuka off the menu for
// now, a published menu that shows no dish (D-177). Lives apart from the
// server so the unit test of the snapshot builder can read the same rows
// (tests/unit/snapshot.test.ts).

// A choice list and an option, as the stand-in makes them for its seed and
// for a test that adds one elsewhere.
export function rowMakers({ restaurant, user, stamp }) {
  function listRow(home, lead, sort = 1) {
    return {
      id: randomUUID(),
      restaurant_id: restaurant.id,
      item_id: home.item_id ?? null,
      section_id: home.section_id ?? null,
      lead,
      sort,
      deleted_at: null,
      created_at: stamp(),
    };
  }

  function optionRow(list, name, sort, given = {}) {
    return {
      id: randomUUID(),
      choice_list_id: list.id,
      restaurant_id: list.restaurant_id,
      name,
      added_price_cents: given.added_price_cents ?? null,
      calories_low: given.calories_low ?? null,
      calories_high: given.calories_high ?? null,
      allergens: given.allergens ?? [],
      custom_allergens: given.custom_allergens ?? [],
      allergens_reviewed: Boolean(given.checked),
      allergens_reviewed_by: given.checked ? user.id : null,
      allergens_reviewed_at: given.checked ? stamp() : null,
      sort,
      deleted_at: null,
      created_at: stamp(),
    };
  }
  return { listRow, optionRow };
}

export function seedStore({ restaurant, user, stamp }, withDishes = true) {
  const { listRow, optionRow } = rowMakers({ restaurant, user, stamp });
  const menus = ["Lunch", "Dinner", "Drinks", "Brunch"].map((name, index) => ({
    id: randomUUID(),
    restaurant_id: restaurant.id,
    name,
    sort: index + 1,
    published: false,
    published_at: null,
    published_snapshot: null,
    deleted_at: null,
    created_at: stamp(),
  }));
  const dinner = menus[1];
  const sections = ["Starters", "Mains", "Desserts"].map((name, index) => ({
    id: randomUUID(),
    menu_id: dinner.id,
    restaurant_id: restaurant.id,
    name,
    sort: index + 1,
    note: null,
    deleted_at: null,
    created_at: stamp(),
  }));
  const starters = sections[0];
  const mains = sections[1];
  // Drinks holds Soft drinks with Lemonade, as CI Diner's data file gives
  // it (the diner page task), so the diner page has a switcher and a
  // second published menu's page; Lunch stays empty.
  const drinks = menus[2];
  const soft = {
    id: randomUUID(),
    menu_id: drinks.id,
    restaurant_id: restaurant.id,
    name: "Soft drinks",
    sort: 1,
    note: null,
    deleted_at: null,
    created_at: stamp(),
  };
  sections.push(soft);
  // Kids, second under Drinks, as the data file gives it (Build 2, Q-74):
  // three dishes with a short description each, at one price and checked,
  // and two section lists of six and five options, every one checked, so a
  // section's lists sit past the constant on the diner page and render
  // once under the heading with a link in each dish.
  const kids = {
    id: randomUUID(),
    menu_id: drinks.id,
    restaurant_id: restaurant.id,
    name: "Kids",
    sort: 2,
    note: null,
    deleted_at: null,
    created_at: stamp(),
  };
  sections.push(kids);
  // Brunch, fourth and published, holds Eggs with its one dish off the menu
  // for now, as the data file gives it (D-177): a published menu that shows
  // no dish, so the diner page reads "Nothing on this menu is served right
  // now." where its sections would be, and the gate can read that page.
  const brunch = menus[3];
  const eggs = {
    id: randomUUID(),
    menu_id: brunch.id,
    restaurant_id: restaurant.id,
    name: "Eggs",
    sort: 1,
    note: null,
    deleted_at: null,
    created_at: stamp(),
  };
  sections.push(eggs);
  // Priced one way each, as CI Diner's data file prices them (D-139): the
  // soup by size, the salad at one price, the bread at market price. With
  // their allergens, as the file lists them (D-148): the soup checked with
  // milk, wheat, and celery, the salad checked with none, the bread not
  // checked; and a second Soup of the day in Mains, not checked, for the
  // same-named line on the first (D-129).
  const priced = [
    {
      name: "Soup of the day",
      price_kind: "sizes",
      price_cents: null,
      allergens: ["milk", "wheat"],
      custom_allergens: ["celery"],
      checked: true,
      schedule: { hours: { open: "16:00", close: "21:00" } },
    },
    {
      name: "House salad",
      price_kind: "one",
      price_cents: 900,
      calories: 320,
      allergens: [],
      custom_allergens: [],
      checked: true,
      tags: ["vegetarian", "made-without-gluten"],
    },
    {
      name: "Garlic bread",
      price_kind: "market",
      price_cents: null,
      calories: 410,
      cooked: true,
      allergens: [],
      custom_allergens: [],
      checked: false,
      available: false,
    },
  ];
  // As CI Diner's data file leaves Starters (migrations 9 and 11, tasks 5
  // and 7): House salad tagged with 320 calories, Garlic bread off the menu
  // for now with 410 calories and cooked to order, Soup of the day a
  // special every day from 4 to 9 pm with calories on each size.
  const items = (withDishes ? priced : []).map((dish, index) => ({
    id: randomUUID(),
    section_id: starters.id,
    restaurant_id: restaurant.id,
    name: dish.name,
    description: null,
    price_kind: dish.price_kind,
    price_cents: dish.price_cents,
    calories_low: dish.calories ?? null,
    calories_high: null,
    cooked_to_order: dish.cooked ?? false,
    note: null,
    allergens: dish.allergens,
    custom_allergens: dish.custom_allergens,
    allergens_reviewed: dish.checked,
    allergens_reviewed_by: dish.checked ? user.id : null,
    allergens_reviewed_at: dish.checked ? stamp() : null,
    dietary_tags: dish.tags ?? [],
    available: dish.available ?? true,
    sold_out_at: null,
    special_schedule: dish.schedule ?? null,
    sort: index + 1,
    deleted_at: null,
    created_at: stamp(),
  }));
  if (withDishes) {
    items.push({
      id: randomUUID(),
      section_id: mains.id,
      restaurant_id: restaurant.id,
      name: "Soup of the day",
      description: null,
      price_kind: "one",
      price_cents: null,
      calories_low: null,
      calories_high: null,
      cooked_to_order: false,
      note: null,
      allergens: [],
      custom_allergens: [],
      allergens_reviewed: false,
      allergens_reviewed_by: null,
      allergens_reviewed_at: null,
      dietary_tags: [],
      available: true,
      sold_out_at: null,
      special_schedule: null,
      sort: 1,
      deleted_at: null,
      created_at: stamp(),
    });
  }
  if (withDishes) {
    items.push({
      id: randomUUID(),
      section_id: soft.id,
      restaurant_id: restaurant.id,
      name: "Lemonade",
      description: null,
      price_kind: "one",
      price_cents: 300,
      calories_low: null,
      calories_high: null,
      cooked_to_order: false,
      note: null,
      allergens: [],
      custom_allergens: [],
      allergens_reviewed: true,
      allergens_reviewed_by: user.id,
      allergens_reviewed_at: stamp(),
      dietary_tags: [],
      available: true,
      sold_out_at: null,
      special_schedule: null,
      sort: 1,
      deleted_at: null,
      created_at: stamp(),
    });
  }
  if (withDishes) {
    const kidsDishes = [
      {
        name: "Kids burger",
        price_cents: 700,
        description: "A small beef patty on a soft bun.",
        allergens: ["wheat"],
      },
      {
        name: "Chicken tenders",
        price_cents: 700,
        description: "Three crispy tenders.",
        allergens: ["wheat"],
      },
      {
        name: "Grilled cheese",
        price_cents: 600,
        description: "Melted cheddar on white bread.",
        allergens: ["milk", "wheat"],
      },
    ];
    kidsDishes.forEach((dish, index) => {
      items.push({
        id: randomUUID(),
        section_id: kids.id,
        restaurant_id: restaurant.id,
        name: dish.name,
        description: dish.description,
        price_kind: "one",
        price_cents: dish.price_cents,
        calories_low: null,
        calories_high: null,
        cooked_to_order: false,
        note: null,
        allergens: dish.allergens,
        custom_allergens: [],
        allergens_reviewed: true,
        allergens_reviewed_by: user.id,
        allergens_reviewed_at: stamp(),
        dietary_tags: [],
        available: true,
        sold_out_at: null,
        special_schedule: null,
        sort: index + 1,
        deleted_at: null,
        created_at: stamp(),
      });
    });
  }
  if (withDishes) {
    items.push({
      id: randomUUID(),
      section_id: eggs.id,
      restaurant_id: restaurant.id,
      name: "Shakshuka",
      description: "Eggs poached in a spiced tomato sauce.",
      price_kind: "one",
      price_cents: 1200,
      calories_low: null,
      calories_high: null,
      cooked_to_order: false,
      note: null,
      allergens: ["eggs"],
      custom_allergens: [],
      allergens_reviewed: true,
      allergens_reviewed_by: user.id,
      allergens_reviewed_at: stamp(),
      dietary_tags: [],
      available: false,
      sold_out_at: null,
      special_schedule: null,
      sort: 1,
      deleted_at: null,
      created_at: stamp(),
    });
  }
  const soup = items[0];
  const salad = items[1];
  const sizes = (
    withDishes
      ? [
          { name: "Cup", price_cents: 500, calories: 180 },
          { name: "Bowl", price_cents: 800, calories: 290 },
        ]
      : []
  ).map((size) => ({
    id: randomUUID(),
    item_id: soup.id,
    restaurant_id: restaurant.id,
    name: size.name,
    price_cents: size.price_cents,
    calories_low: size.calories,
    calories_high: null,
    deleted_at: null,
    created_at: stamp(),
  }));
  // The choice lists, as CI Diner's data file gives them (D-166): Starters'
  // roll list with its one option, checked with milk and wheat, and House
  // salad's dressing list with Ranch and Vinaigrette, each checked; Mains,
  // Desserts, and the other dishes keep none.
  const lists = [];
  const options = [];
  const roll = listRow(
    { section_id: starters.id },
    "Add a buttered roll to any dish",
  );
  lists.push(roll);
  options.push(
    optionRow(roll, "Buttered roll", 1, {
      added_price_cents: 200,
      allergens: ["milk", "wheat"],
      checked: true,
    }),
  );
  if (withDishes) {
    const dressing = listRow({ item_id: salad.id }, "Choose a dressing");
    lists.push(dressing);
    options.push(
      optionRow(dressing, "Ranch", 1, {
        calories_low: 150,
        allergens: ["milk", "eggs"],
        checked: true,
      }),
      optionRow(dressing, "Vinaigrette", 2, {
        calories_low: 90,
        checked: true,
      }),
    );
  }
  // Kids' two section lists, as the data file gives them: no Lemonade among
  // the drinks, since the gate matches Soft drinks' dish by that exact name.
  const sides = listRow({ section_id: kids.id }, "Choose one side", 1);
  const kidsDrinks = listRow({ section_id: kids.id }, "Choose one drink", 2);
  lists.push(sides, kidsDrinks);
  const kidsOptions = [
    [sides, "Fries", { calories_low: 320 }],
    [sides, "Apple slices", { calories_low: 60 }],
    [
      sides,
      "Mac and cheese",
      { calories_low: 410, allergens: ["milk", "wheat"] },
    ],
    [sides, "Steamed broccoli", {}],
    [sides, "Mashed potatoes", { allergens: ["milk"] }],
    [sides, "Side salad", {}],
    [kidsDrinks, "Milk", { allergens: ["milk"] }],
    [kidsDrinks, "Chocolate milk", { allergens: ["milk"] }],
    [kidsDrinks, "Apple juice", {}],
    [kidsDrinks, "Orange juice", {}],
    [kidsDrinks, "Water", {}],
  ];
  const placed = new Map();
  for (const [list, name, given] of kidsOptions) {
    const place = (placed.get(list.id) ?? 0) + 1;
    placed.set(list.id, place);
    options.push(optionRow(list, name, place, { ...given, checked: true }));
  }

  // Dinner, Drinks, and Brunch published, as CI Diner's data file publishes
  // them through publish_menu() (migration 12): the gate reads a published
  // menu's page and an unpublished one's. The snapshot is the builder's, so
  // the stand-in reads as nothing changed until a save lands.
  const store = { menus, sections, items, sizes, lists, options };
  dinner.published = true;
  dinner.published_at = stamp();
  dinner.published_snapshot = menuSnapshot(store, dinner.id);
  drinks.published = true;
  drinks.published_at = stamp();
  drinks.published_snapshot = menuSnapshot(store, drinks.id);
  brunch.published = true;
  brunch.published_at = stamp();
  brunch.published_snapshot = menuSnapshot(store, brunch.id);
  return store;
}
