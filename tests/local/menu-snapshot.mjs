// The stand-in's copy of menu_snapshot() and publish_problems() (migration
// 12, D-82), over its in-memory rows, in the SQL builder's shape: keys are
// the columns' names, every array is in diner order, deleted rows and lists
// with no option are absent, an unchecked dish or option carries no list,
// and state (availability, the sold-out mark, a special's schedule) stays
// out. tests/unit/snapshot.test.ts parses what this builds with the one
// schema in src/domain/snapshot.ts, so the stand-in and the database agree.

const byOrder = (a, b) =>
  a.sort - b.sort ||
  a.created_at.localeCompare(b.created_at) ||
  a.id.localeCompare(b.id);

const bySizeOrder = (a, b) => {
  if (a.price_cents === null && b.price_cents !== null) return 1;
  if (a.price_cents !== null && b.price_cents === null) return -1;
  return (
    (a.price_cents ?? 0) - (b.price_cents ?? 0) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
};

const live = (row) => row.deleted_at === null;

function allergensOf(row) {
  return row.allergens_reviewed
    ? {
        checked: true,
        major: [...row.allergens],
        other: [...row.custom_allergens],
      }
    : { checked: false };
}

function listsOf(store, home) {
  return store.lists
    .filter(
      (list) =>
        live(list) &&
        (home.item_id
          ? list.item_id === home.item_id
          : list.section_id === home.section_id && list.item_id === null),
    )
    .sort(byOrder)
    .map((list) => ({
      id: list.id,
      lead: list.lead,
      options: store.options
        .filter((option) => option.choice_list_id === list.id && live(option))
        .sort(byOrder)
        .map((option) => ({
          id: option.id,
          name: option.name,
          added_price_cents: option.added_price_cents ?? null,
          calories_low: option.calories_low ?? null,
          calories_high: option.calories_high ?? null,
          allergens: allergensOf(option),
        })),
    }))
    .filter((list) => list.options.length > 0);
}

function priceOf(store, dish) {
  if (dish.price_kind === "one") {
    return {
      kind: "one",
      price_cents: dish.price_cents ?? null,
      calories_low: dish.calories_low ?? null,
      calories_high: dish.calories_high ?? null,
    };
  }
  if (dish.price_kind === "market") {
    return {
      kind: "market",
      calories_low: dish.calories_low ?? null,
      calories_high: dish.calories_high ?? null,
    };
  }
  return {
    kind: "sizes",
    sizes: store.sizes
      .filter((size) => size.item_id === dish.id && live(size))
      .sort(bySizeOrder)
      .map((size) => ({
        id: size.id,
        name: size.name,
        price_cents: size.price_cents,
        calories_low: size.calories_low ?? null,
        calories_high: size.calories_high ?? null,
      })),
  };
}

export function menuSnapshot(store, menuId) {
  const menu = store.menus.find((row) => row.id === menuId && live(row));
  if (!menu) return null;
  return {
    v: 1,
    menu: { id: menu.id, name: menu.name },
    sections: store.sections
      .filter((section) => section.menu_id === menu.id && live(section))
      .sort(byOrder)
      .map((section) => ({
        id: section.id,
        name: section.name,
        note: section.note ?? null,
        choice_lists: listsOf(store, { section_id: section.id }),
        items: store.items
          .filter((dish) => dish.section_id === section.id && live(dish))
          .sort(byOrder)
          .map((dish) => ({
            id: dish.id,
            name: dish.name,
            description: dish.description ?? null,
            note: dish.note ?? null,
            price: priceOf(store, dish),
            cooked_to_order: Boolean(dish.cooked_to_order),
            dietary_tags: [...(dish.dietary_tags ?? [])],
            allergens: allergensOf(dish),
            choice_lists: listsOf(store, { item_id: dish.id }),
          })),
      })),
  };
}

// What would block Publish: a live size with no name or no price under a
// live dish by size, in page order, as publish_problems() reports it
// (migration 12); or the menu itself, with nothing named, while no live
// dish sits in a live section of it (migration 14, D-177). Availability
// and schedules are not read, as in the database.
export function publishProblems(store, menuId) {
  const menu = store.menus.find((row) => row.id === menuId && live(row));
  if (!menu) return [];
  const sections = store.sections.filter(
    (section) => section.menu_id === menu.id && live(section),
  );
  const hasDish = sections.some((section) =>
    store.items.some((dish) => dish.section_id === section.id && live(dish)),
  );
  if (!hasDish) {
    return [
      {
        problem: "no_dishes",
        dish: null,
        dish_name: null,
        section_name: null,
        size: null,
      },
    ];
  }
  return sections.sort(byOrder).flatMap((section) =>
    store.items
      .filter(
        (dish) =>
          dish.section_id === section.id &&
          live(dish) &&
          dish.price_kind === "sizes",
      )
      .sort(byOrder)
      .flatMap((dish) =>
        store.sizes
          .filter(
            (size) =>
              size.item_id === dish.id &&
              live(size) &&
              (size.name === null || size.price_cents === null),
          )
          .sort(bySizeOrder)
          .map((size) => ({
            problem: size.name === null ? "size_unnamed" : "size_unpriced",
            dish: dish.id,
            dish_name: dish.name,
            section_name: section.name,
            size: size.id,
          })),
      ),
  );
}
