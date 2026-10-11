-- CI Diner's data for the owner gate (D-126). Unlike the boundary checks
-- beside it, this file writes, and what it writes stays. Run it in the
-- Supabase SQL editor whenever the owner gate's setup asks for it: paste the
-- whole file and press Run. It touches only CI Diner (test restaurant, not
-- real), the restaurant with code 56097672. It adds what is missing, puts
-- what the gate reads first and in order, and deletes nothing, so a second
-- run changes nothing. It ends with a table of everything CI Diner holds,
-- each row marked needed or extra. An extra row is left as it is, for you to
-- delete on the screens if it gets in the gate's way. The gate itself never
-- writes (D-100, D-108). Later tasks add their rows here.
--
-- What the gate reads: the menus Lunch, Dinner, and Drinks, in that order;
-- Dinner holding the sections Starters, Mains, and Desserts, in that order;
-- Starters holding the dishes Soup of the day, House salad, and Garlic
-- bread, in that order, priced one way each (Soup of the day by size with
-- Cup and Bowl, House salad at one price, Garlic bread at market price),
-- with their allergens (Soup of the day checked with milk, wheat, and
-- celery; House salad checked with none; Garlic bread not checked); a
-- second Soup of the day in Mains, not checked, for the same-named line on
-- the first (D-129); Starters' choice list "Add a buttered roll to any
-- dish" with its one option, Buttered roll, at two dollars, checked with
-- milk and wheat, and Desserts with no list (migration 11, task 7); House
-- salad tagged vegetarian and made without gluten ingredients, Garlic bread
-- off the menu for now, and Soup of the day a special every day from 4 to
-- 9 pm (migration 9, task 5); House salad at 320 calories with the list
-- "Choose a dressing" holding Ranch (150 calories, milk and eggs, checked)
-- and Vinaigrette (90 calories, checked with none), Soup of the day's Cup
-- at 180 and Bowl at 290 calories, and Garlic bread at 410 calories and
-- cooked to order (migration 11, task 7); at least one menu that holds no
-- section; and at least one section of Dinner that holds no dish. Nothing
-- here can publish (migration 3).

do $$
declare
  diner uuid;
  dinner uuid;
  starters uuid;
  mains uuid;
  soup uuid;
  salad uuid;
  bread uuid;
  owner_uid uuid;
  roll_list uuid;
  roll uuid;
  dressing uuid;
  option_id uuid;
  wanted text;
  size_name text;
  size_price integer;
  option_name text;
  option_calories integer;
  option_allergens public.allergen[];
  option_place integer;
  placed integer;
begin
  select r.id into diner from public.restaurants r where r.code = '56097672';
  if diner is null then
    raise exception 'FAIL: no restaurant has code 56097672';
  end if;

  -- 1. The menus. A name matches the way menus_name_key reads it, whatever
  -- the case or the outer spaces, among menus that are not deleted. A
  -- deleted menu stays deleted, and a new one takes its name.
  foreach wanted in array array['Lunch', 'Dinner', 'Drinks'] loop
    if not exists (
      select 1 from public.menus m
      where m.restaurant_id = diner
        and m.deleted_at is null
        and lower(btrim(m.name)) = lower(wanted)
    ) then
      insert into public.menus (restaurant_id, name, sort)
      values (diner, wanted, 0);
      raise notice 'added the menu %', wanted;
    end if;
  end loop;

  -- The three come first, in that order, and anything else after them, in
  -- the order the Menus screen shows it. Only a place that is wrong is
  -- written, so a second run leaves every row as it was.
  update public.menus m
  set sort = ranked.place
  from (
    select m2.id,
      row_number() over (
        order by
          array_position(array['lunch', 'dinner', 'drinks'],
            lower(btrim(m2.name))) nulls last,
          m2.sort, m2.created_at, m2.id
      )::integer as place
    from public.menus m2
    where m2.restaurant_id = diner and m2.deleted_at is null
  ) ranked
  where m.id = ranked.id and m.sort is distinct from ranked.place;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'put % menus in place', placed;
  end if;

  -- 2. Dinner's sections, the same way, among its sections that are not
  -- deleted. The trigger gives each new one Dinner's restaurant.
  select m.id into dinner from public.menus m
  where m.restaurant_id = diner
    and m.deleted_at is null
    and lower(btrim(m.name)) = 'dinner';

  foreach wanted in array array['Starters', 'Mains', 'Desserts'] loop
    if not exists (
      select 1 from public.sections s
      where s.menu_id = dinner
        and s.deleted_at is null
        and lower(btrim(s.name)) = lower(wanted)
    ) then
      insert into public.sections (menu_id, name, sort)
      values (dinner, wanted, 0);
      raise notice 'added the section % to Dinner', wanted;
    end if;
  end loop;

  update public.sections s
  set sort = ranked.place
  from (
    select s2.id,
      row_number() over (
        order by
          array_position(array['starters', 'mains', 'desserts'],
            lower(btrim(s2.name))) nulls last,
          s2.sort, s2.created_at, s2.id
      )::integer as place
    from public.sections s2
    where s2.menu_id = dinner and s2.deleted_at is null
  ) ranked
  where s.id = ranked.id and s.sort is distinct from ranked.place;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'put % of Dinner''s sections in place', placed;
  end if;

  -- 3. Starters' dishes, the same way, among its dishes that are not
  -- deleted. A name matches the way items_name_key reads it. The trigger
  -- gives each new one Starters' restaurant.
  select s.id into starters from public.sections s
  where s.menu_id = dinner
    and s.deleted_at is null
    and lower(btrim(s.name)) = 'starters';

  foreach wanted in array
    array['Soup of the day', 'House salad', 'Garlic bread'] loop
    if not exists (
      select 1 from public.items i
      where i.section_id = starters
        and i.deleted_at is null
        and lower(btrim(i.name)) = lower(wanted)
    ) then
      insert into public.items (section_id, name, sort)
      values (starters, wanted, 0);
      raise notice 'added the dish % to Starters', wanted;
    end if;
  end loop;

  update public.items i
  set sort = ranked.place
  from (
    select i2.id,
      row_number() over (
        order by
          array_position(
            array['soup of the day', 'house salad', 'garlic bread'],
            lower(btrim(i2.name))) nulls last,
          i2.sort, i2.created_at, i2.id
      )::integer as place
    from public.items i2
    where i2.section_id = starters and i2.deleted_at is null
  ) ranked
  where i.id = ranked.id and i.sort is distinct from ranked.place;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'put % of Starters'' dishes in place', placed;
  end if;

  -- 3b. Starters' dishes priced one way each (migration 6, task 3b): Soup
  -- of the day by size, with Cup and Bowl; House salad at one price; Garlic
  -- bread at market price. The gate reads the three dish pages and never
  -- writes them. Only a choice or a price that differs is written, and a
  -- size is added only when missing, so a second run leaves every row as
  -- it was.
  select i.id into soup from public.items i
  where i.section_id = starters and i.deleted_at is null
    and lower(btrim(i.name)) = 'soup of the day';
  select i.id into salad from public.items i
  where i.section_id = starters and i.deleted_at is null
    and lower(btrim(i.name)) = 'house salad';
  select i.id into bread from public.items i
  where i.section_id = starters and i.deleted_at is null
    and lower(btrim(i.name)) = 'garlic bread';

  update public.items i
  set price_kind = 'sizes', price_cents = null
  where i.id = soup
    and (i.price_kind <> 'sizes' or i.price_cents is not null);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'priced Soup of the day by size';
  end if;
  for size_name, size_price in
    select v.n, v.p from (values ('Cup', 500), ('Bowl', 800)) as v (n, p)
  loop
    if not exists (
      select 1 from public.item_sizes z
      where z.item_id = soup
        and z.deleted_at is null
        and lower(btrim(z.name)) = lower(size_name)
    ) then
      insert into public.item_sizes (item_id, name, price_cents)
      values (soup, size_name, size_price);
      raise notice 'added the size % to Soup of the day', size_name;
    end if;
  end loop;

  update public.items i
  set price_kind = 'one', price_cents = 900
  where i.id = salad
    and (i.price_kind <> 'one' or i.price_cents is distinct from 900);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'priced House salad at one price';
  end if;

  update public.items i
  set price_kind = 'market'
  where i.id = bread and i.price_kind <> 'market';
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'priced Garlic bread at market price';
  end if;

  -- 3c. Starters' dishes with their allergens and their check (migration 7,
  -- task 4): Soup of the day checked with milk, wheat, and celery; House
  -- salad checked with none; Garlic bread not checked. A check needs a
  -- person (D-148), so from here the block acts as CI Diner's owner, the
  -- way the boundary checks act as a user: the request claims name that
  -- user, and the database stamps the check with them. A list is written
  -- only when it differs, and a check only when it is not there, in two
  -- statements, since one statement that changes a list and checks it
  -- ends unchecked. A second Soup of the day, in Mains and not checked, is
  -- added when missing, for the same-named line on Starters' soup (D-129);
  -- Desserts stays empty, which the gate needs.
  select o.user_id into owner_uid
  from public.owners o
  where o.restaurant_id = diner
  order by o.created_at, o.user_id
  limit 1;
  if owner_uid is null then
    raise exception 'FAIL: CI Diner (56097672) has no owner to check allergens as';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_uid, 'role', 'authenticated')::text, true);

  update public.items i
  set allergens = '{milk,wheat}', custom_allergens = '{celery}'
  where i.id = soup
    and (i.allergens is distinct from '{milk,wheat}'::public.allergen[]
      or i.custom_allergens is distinct from '{celery}'::text[]);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'listed milk, wheat, and celery for Soup of the day';
  end if;
  update public.items i
  set allergens_reviewed = true
  where i.id = soup and not i.allergens_reviewed;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'checked the allergens of Soup of the day';
  end if;

  update public.items i
  set allergens = '{}', custom_allergens = '{}'
  where i.id = salad
    and (cardinality(i.allergens) > 0 or cardinality(i.custom_allergens) > 0);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'cleared the allergen lists of House salad';
  end if;
  update public.items i
  set allergens_reviewed = true
  where i.id = salad and not i.allergens_reviewed;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'checked the allergens of House salad';
  end if;

  select s.id into mains from public.sections s
  where s.menu_id = dinner
    and s.deleted_at is null
    and lower(btrim(s.name)) = 'mains';
  if not exists (
    select 1 from public.items i
    where i.section_id = mains
      and i.deleted_at is null
      and lower(btrim(i.name)) = 'soup of the day'
  ) then
    insert into public.items (section_id, name, sort)
    values (mains, 'Soup of the day', 1);
    raise notice 'added the dish Soup of the day to Mains';
  end if;

  -- 3d. Starters' choice list, in place of the line shown with every dish
  -- (migration 11, task 7, D-166): "Add a buttered roll to any dish" with
  -- one option, Buttered roll, at two dollars with milk and wheat, checked
  -- as CI Diner's owner, the check in its own statement, since one
  -- statement that changes a list and checks it ends unchecked. The list
  -- and the option are added only when missing, and each value is written
  -- only when it differs. No lead or option names a dish in Starters, since
  -- the gate matches names by substring. Desserts keeps no list, so the
  -- gate reads a section page without one too.
  select l.id into roll_list from public.choice_lists l
  where l.section_id = starters
    and l.deleted_at is null
    and lower(btrim(l.lead)) = 'add a buttered roll to any dish';
  if roll_list is null then
    insert into public.choice_lists (section_id, lead, sort)
    values (starters, 'Add a buttered roll to any dish', 1)
    returning id into roll_list;
    raise notice 'added the choice list Add a buttered roll to any dish to Starters';
  end if;
  select o.id into roll from public.choice_options o
  where o.choice_list_id = roll_list
    and o.deleted_at is null
    and lower(btrim(o.name)) = 'buttered roll';
  if roll is null then
    insert into public.choice_options (choice_list_id, name, sort)
    values (roll_list, 'Buttered roll', 1) returning id into roll;
    raise notice 'added the option Buttered roll to Add a buttered roll to any dish';
  end if;
  update public.choice_options o
  set added_price_cents = 200, allergens = '{milk,wheat}',
      custom_allergens = '{}'
  where o.id = roll
    and (o.added_price_cents is distinct from 200
      or o.allergens is distinct from '{milk,wheat}'::public.allergen[]
      or o.custom_allergens is distinct from '{}'::text[]);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'priced Buttered roll at two dollars, with milk and wheat';
  end if;
  update public.choice_options o
  set allergens_reviewed = true
  where o.id = roll and not o.allergens_reviewed;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'checked the allergens of Buttered roll';
  end if;

  -- 3e. Starters' dishes with their tags, availability, and schedule
  -- (migration 9, task 5, D-159, D-160): House salad tagged vegetarian and
  -- made without gluten ingredients; Garlic bread off the menu for now with
  -- no sold-out mark, so its availability line reads the same on any day;
  -- Soup of the day a special every day from 4 to 9 pm, so its sentence
  -- reads the same on any day and its next-shows line is today or
  -- tomorrow. Each written only when it differs.
  update public.items i
  set dietary_tags = '{vegetarian,made-without-gluten}'
  where i.id = salad
    and i.dietary_tags is distinct from
      '{vegetarian,made-without-gluten}'::public.dietary_tag[];
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'tagged House salad vegetarian and made without gluten ingredients';
  end if;
  update public.items i
  set available = false, sold_out_at = null
  where i.id = bread and (i.available or i.sold_out_at is not null);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'took Garlic bread off the menu for now';
  end if;
  update public.items i
  set special_schedule = '{"hours":{"open":"16:00","close":"21:00"}}'::jsonb
  where i.id = soup
    and i.special_schedule is distinct from
      '{"hours":{"open":"16:00","close":"21:00"}}'::jsonb;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'made Soup of the day a special, every day from 4 to 9 pm';
  end if;

  -- 3f. Calories, a dish's choice list, and the Cooked to order mark
  -- (migration 11, task 7, D-166, D-167): House salad at 320 calories with
  -- the list "Choose a dressing" holding Ranch (150 calories, milk and
  -- eggs, checked) and Vinaigrette (90 calories, checked with none), in
  -- that order, so the list page's Move up and Move down have two rows;
  -- Soup of the day's Cup at 180 and Bowl at 290 calories, so the field in
  -- a size's row reads a value back; Garlic bread at 410 calories and
  -- cooked to order, so the market price branch carries the field and the
  -- box reads ticked on one page. Each written only when it differs; the
  -- list and its options added only when missing, each option checked in
  -- its own statement, as CI Diner's owner.
  update public.items i
  set calories_low = 320, calories_high = null
  where i.id = salad
    and (i.calories_low is distinct from 320 or i.calories_high is not null);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'gave House salad 320 calories';
  end if;

  select l.id into dressing from public.choice_lists l
  where l.item_id = salad
    and l.deleted_at is null
    and lower(btrim(l.lead)) = 'choose a dressing';
  if dressing is null then
    insert into public.choice_lists (item_id, lead, sort)
    values (salad, 'Choose a dressing', 1) returning id into dressing;
    raise notice 'added the choice list Choose a dressing to House salad';
  end if;
  for option_name, option_calories, option_allergens, option_place in
    select v.n, v.c, v.a, v.p from (values
      ('Ranch', 150, '{milk,eggs}'::public.allergen[], 1),
      ('Vinaigrette', 90, '{}'::public.allergen[], 2)
    ) as v (n, c, a, p)
  loop
    select o.id into option_id from public.choice_options o
    where o.choice_list_id = dressing
      and o.deleted_at is null
      and lower(btrim(o.name)) = lower(option_name);
    if option_id is null then
      insert into public.choice_options (choice_list_id, name, sort)
      values (dressing, option_name, option_place) returning id into option_id;
      raise notice 'added the option % to Choose a dressing', option_name;
    end if;
    update public.choice_options o
    set calories_low = option_calories, calories_high = null,
        allergens = option_allergens, custom_allergens = '{}'
    where o.id = option_id
      and (o.calories_low is distinct from option_calories
        or o.calories_high is not null
        or o.allergens is distinct from option_allergens
        or o.custom_allergens is distinct from '{}'::text[]);
    get diagnostics placed = row_count;
    if placed > 0 then
      raise notice 'gave % its calories and allergens', option_name;
    end if;
    update public.choice_options o
    set allergens_reviewed = true
    where o.id = option_id and not o.allergens_reviewed;
    get diagnostics placed = row_count;
    if placed > 0 then
      raise notice 'checked the allergens of %', option_name;
    end if;
  end loop;

  -- Ranch first, then Vinaigrette, then anything else, in the order the
  -- list page shows it. Only a place that is wrong is written.
  update public.choice_options o
  set sort = ranked.place
  from (
    select o2.id,
      row_number() over (
        order by
          array_position(array['ranch', 'vinaigrette'],
            lower(btrim(o2.name))) nulls last,
          o2.sort, o2.created_at, o2.id
      )::integer as place
    from public.choice_options o2
    where o2.choice_list_id = dressing and o2.deleted_at is null
  ) ranked
  where o.id = ranked.id and o.sort is distinct from ranked.place;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'put % of Choose a dressing''s options in place', placed;
  end if;

  update public.item_sizes z
  set calories_low = v.c, calories_high = null
  from (values ('cup', 180), ('bowl', 290)) as v (n, c)
  where z.item_id = soup
    and z.deleted_at is null
    and lower(btrim(z.name)) = v.n
    and (z.calories_low is distinct from v.c or z.calories_high is not null);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'gave % of Soup of the day''s sizes their calories', placed;
  end if;

  update public.items i
  set calories_low = 410, calories_high = null, cooked_to_order = true
  where i.id = bread
    and (i.calories_low is distinct from 410
      or i.calories_high is not null
      or not i.cooked_to_order);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'gave Garlic bread 410 calories and marked it cooked to order';
  end if;
end $$;

-- 4. What CI Diner holds now, in the order its screens show it. The first
-- row says whether the owner gate can run; every other row is a menu, a
-- section, a dish, a size, a choice list, or an option, marked needed or
-- extra.
with diner as (
  select r.id from public.restaurants r where r.code = '56097672'
),
live_menus as (
  select m.id, m.name,
    row_number() over (order by m.sort, m.created_at, m.id) as place
  from public.menus m
  join diner on m.restaurant_id = diner.id
  where m.deleted_at is null
),
live_sections as (
  select s.id, s.menu_id, s.name,
    row_number() over (
      partition by s.menu_id order by s.sort, s.created_at, s.id
    ) as place
  from public.sections s
  join live_menus on s.menu_id = live_menus.id
  where s.deleted_at is null
),
live_items as (
  select i.id, i.section_id, i.name, i.price_kind, i.price_cents,
    i.calories_low, i.calories_high, i.cooked_to_order,
    i.allergens, i.custom_allergens, i.allergens_reviewed,
    i.dietary_tags, i.available, i.sold_out_at, i.special_schedule,
    row_number() over (
      partition by i.section_id order by i.sort, i.created_at, i.id
    ) as place
  from public.items i
  join live_sections on i.section_id = live_sections.id
  where i.deleted_at is null
),
live_sizes as (
  select z.item_id, z.name, z.price_cents, z.calories_low, z.calories_high,
    row_number() over (
      partition by z.item_id
      order by z.price_cents nulls last, z.created_at, z.id
    ) as place
  from public.item_sizes z
  join live_items on z.item_id = live_items.id
  where z.deleted_at is null
),
-- A list under a live dish or a live section, with the names of the
-- levels above it; a list under a deleted home is absent.
live_lists as (
  select l.id, l.lead, l.item_id is null as on_section,
    li.id as dish_id, li.name as dish_name, coalesce(li.place, 0) as dish_place,
    ls.id as section_id, ls.name as section_name, ls.place as section_place,
    lm.name as menu_name, lm.place as menu_place,
    row_number() over (
      partition by coalesce(l.item_id, l.section_id)
      order by l.sort, l.created_at, l.id
    ) as place
  from public.choice_lists l
  left join live_items li on li.id = l.item_id
  join live_sections ls on ls.id = coalesce(li.section_id, l.section_id)
  join live_menus lm on lm.id = ls.menu_id
  where l.deleted_at is null
),
live_options as (
  select o.id, o.choice_list_id, o.name, o.added_price_cents,
    o.calories_low, o.calories_high,
    o.allergens, o.custom_allergens, o.allergens_reviewed,
    row_number() over (
      partition by o.choice_list_id order by o.sort, o.created_at, o.id
    ) as place
  from public.choice_options o
  join live_lists on o.choice_list_id = live_lists.id
  where o.deleted_at is null
),
dinner as (
  select lm.id from live_menus lm where lower(btrim(lm.name)) = 'dinner'
),
starters as (
  select ls.id from live_sections ls
  join dinner on ls.menu_id = dinner.id
  where lower(btrim(ls.name)) = 'starters'
),
mains as (
  select ls.id from live_sections ls
  join dinner on ls.menu_id = dinner.id
  where lower(btrim(ls.name)) = 'mains'
),
salad as (
  select li.id from live_items li
  join starters on li.section_id = starters.id
  where lower(btrim(li.name)) = 'house salad'
),
roll_list as (
  select ll.id from live_lists ll
  join starters on ll.section_id = starters.id
  where ll.on_section and ll.place = 1
    and lower(btrim(ll.lead)) = 'add a buttered roll to any dish'
),
dressing as (
  select ll.id from live_lists ll
  join salad on ll.dish_id = salad.id
  where ll.place = 1 and lower(btrim(ll.lead)) = 'choose a dressing'
),
verdict as (
  select
    (select coalesce(array_agg(lower(btrim(lm.name)) order by lm.place), '{}')
       from live_menus lm where lm.place <= 3)
      = array['lunch', 'dinner', 'drinks'] as menus_ok,
    (select coalesce(array_agg(lower(btrim(ls.name)) order by ls.place), '{}')
       from live_sections ls join dinner on ls.menu_id = dinner.id
       where ls.place <= 3)
      = array['starters', 'mains', 'desserts'] as sections_ok,
    exists (
      select 1 from live_menus lm
      where not exists (
        select 1 from live_sections ls where ls.menu_id = lm.id
      )
    ) as one_empty,
    (select coalesce(array_agg(lower(btrim(li.name)) order by li.place), '{}')
       from live_items li join starters on li.section_id = starters.id
       where li.place <= 3)
      = array['soup of the day', 'house salad', 'garlic bread'] as dishes_ok,
    exists (
      select 1 from live_sections ls
      join dinner on ls.menu_id = dinner.id
      where not exists (
        select 1 from live_items li where li.section_id = ls.id
      )
    ) as one_empty_section,
    coalesce(
      (select li.price_kind = 'sizes' and li.price_cents is null
         and (select coalesce(array_agg(lower(btrim(lz.name)) order by lz.place), '{}')
              from live_sizes lz where lz.item_id = li.id)
           = array['cup', 'bowl']
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'soup of the day')
      and (select li.price_kind = 'one' and li.price_cents = 900
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'house salad')
      and (select li.price_kind = 'market'
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'garlic bread'),
      false) as prices_ok,
    coalesce(
      (select li.allergens_reviewed
         and li.allergens = '{milk,wheat}'::public.allergen[]
         and li.custom_allergens = '{celery}'::text[]
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'soup of the day')
      and (select li.allergens_reviewed
         and cardinality(li.allergens) = 0
         and cardinality(li.custom_allergens) = 0
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'house salad')
      and (select not li.allergens_reviewed
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'garlic bread')
      and exists (
        select 1 from live_items li join mains on li.section_id = mains.id
        where lower(btrim(li.name)) = 'soup of the day'
          and not li.allergens_reviewed),
      false) as allergens_ok,
    coalesce(
      exists (select 1 from roll_list)
      and (select lo.name = 'Buttered roll' and lo.added_price_cents = 200
         and lo.calories_low is null
         and lo.allergens = '{milk,wheat}'::public.allergen[]
         and lo.custom_allergens = '{}'::text[]
         and lo.allergens_reviewed
       from live_options lo join roll_list on lo.choice_list_id = roll_list.id
       where lo.place = 1)
      and exists (select 1 from dressing)
      and (select coalesce(array_agg(lower(btrim(lo.name)) order by lo.place), '{}')
         from live_options lo join dressing on lo.choice_list_id = dressing.id
         where lo.place <= 2)
        = array['ranch', 'vinaigrette']
      and (select lo.calories_low = 150 and lo.calories_high is null
         and lo.added_price_cents is null
         and lo.allergens = '{milk,eggs}'::public.allergen[]
         and lo.custom_allergens = '{}'::text[]
         and lo.allergens_reviewed
       from live_options lo join dressing on lo.choice_list_id = dressing.id
       where lower(btrim(lo.name)) = 'ranch')
      and (select lo.calories_low = 90 and lo.calories_high is null
         and lo.added_price_cents is null
         and cardinality(lo.allergens) = 0
         and cardinality(lo.custom_allergens) = 0
         and lo.allergens_reviewed
       from live_options lo join dressing on lo.choice_list_id = dressing.id
       where lower(btrim(lo.name)) = 'vinaigrette')
      and not exists (
        select 1 from live_lists ll
        join live_sections ls on ls.id = ll.section_id
        join dinner on ls.menu_id = dinner.id
        where ll.on_section and lower(btrim(ls.name)) = 'desserts'),
      false) as lists_ok,
    coalesce(
      (select li.calories_low = 320 and li.calories_high is null
         and not li.cooked_to_order
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'house salad')
      and (select li.calories_low = 410 and li.calories_high is null
         and li.cooked_to_order
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'garlic bread')
      and (select li.calories_low is null and not li.cooked_to_order
         and (select coalesce(array_agg(lz.calories_low order by lz.place), '{}')
              from live_sizes lz where lz.item_id = li.id)
           = array[180, 290]
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'soup of the day'),
      false) as calories_ok,
    coalesce(
      (select li.dietary_tags
         = '{vegetarian,made-without-gluten}'::public.dietary_tag[]
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'house salad')
      and (select not li.available and li.sold_out_at is null
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'garlic bread')
      and (select li.special_schedule
         = '{"hours":{"open":"16:00","close":"21:00"}}'::jsonb
       from live_items li join starters on li.section_id = starters.id
       where lower(btrim(li.name)) = 'soup of the day'),
      false) as showing_ok
)
select item, status
from (
  select 0 as menu_place, 0 as section_place, 0 as dish_place,
    0 as size_place, 0 as list_place, 0 as option_place,
    'CI Diner (56097672)' as item,
    case
      when not v.menus_ok then
        'not ready: Lunch, Dinner, and Drinks are not the first three menus'
      when not v.sections_ok then
        'not ready: Starters, Mains, and Desserts are not Dinner''s first three sections'
      when not v.one_empty then
        'not ready: every menu holds sections, and the gate needs one that holds none. Delete the extra sections below on their menu''s page.'
      when not v.dishes_ok then
        'not ready: Soup of the day, House salad, and Garlic bread are not Starters'' first three dishes'
      when not v.one_empty_section then
        'not ready: every section of Dinner holds dishes, and the gate needs one that holds none. Delete the extra dishes below on their section''s page.'
      when not v.prices_ok then
        'not ready: Soup of the day is not priced by size with Cup and Bowl, House salad at one price, and Garlic bread at market price'
      when not v.allergens_ok then
        'not ready: Soup of the day is not checked with milk, wheat, and celery, House salad checked with none, Garlic bread not checked, or Mains has no unchecked Soup of the day'
      when not v.lists_ok then
        'not ready: Starters'' first choice list is not "Add a buttered roll to any dish" with Buttered roll at $2.00 checked with milk and wheat, House salad''s first list is not "Choose a dressing" with Ranch and Vinaigrette checked, or Desserts has a list'
      when not v.calories_ok then
        'not ready: House salad is not at 320 calories, Garlic bread at 410 and cooked to order, or Soup of the day''s Cup and Bowl at 180 and 290'
      when not v.showing_ok then
        'not ready: House salad is not tagged vegetarian and made without gluten ingredients, Garlic bread is not off the menu for now, or Soup of the day is not a special every day from 4 to 9 pm'
      else 'ready for the owner gate'
    end as status
  from verdict v
  union all
  select lm.place, 0, 0, 0, 0, 0,
    'menu ' || lm.place || ': ' || lm.name,
    case
      when lm.place <= 3
        and lower(btrim(lm.name)) in ('lunch', 'dinner', 'drinks')
        then 'needed'
      else 'extra, left as it is'
    end
  from live_menus lm
  union all
  select lm.place, ls.place, 0, 0, 0, 0,
    'section ' || ls.place || ' of ' || lm.name || ': ' || ls.name,
    case
      when lower(btrim(lm.name)) = 'dinner'
        and ls.place <= 3
        and lower(btrim(ls.name)) in ('starters', 'mains', 'desserts')
        then 'needed'
      else 'extra, left as it is'
    end
  from live_sections ls
  join live_menus lm on lm.id = ls.menu_id
  union all
  select lm.place, ls.place, li.place, 0, 0, 0,
    'dish ' || li.place || ' of ' || ls.name || ', ' || lm.name || ': '
      || li.name || ', ' || li.price_kind
      || coalesce(', $' || round(li.price_cents::numeric / 100, 2)::text, '')
      || coalesce(', ' || li.calories_low
        || coalesce(' to ' || li.calories_high, '') || ' calories', '')
      || case when li.cooked_to_order then ', cooked to order' else '' end
      || ', allergens '
      || coalesce(nullif(array_to_string(li.allergens, ' '), ''), 'none')
      || coalesce(' and ' || nullif(array_to_string(li.custom_allergens, ' '), ''), '')
      || case when li.allergens_reviewed then ', checked' else ', not checked' end
      || coalesce(', tags ' || nullif(array_to_string(li.dietary_tags, ' '), ''), '')
      || case
        when not li.available then ', off the menu for now'
        when li.sold_out_at is not null then ', sold out at ' || li.sold_out_at::text
        else '' end
      || coalesce(', special ' || li.special_schedule::text, ''),
    case
      when lower(btrim(lm.name)) = 'dinner'
        and lower(btrim(ls.name)) = 'starters'
        and li.place <= 3
        and lower(btrim(li.name))
          in ('soup of the day', 'house salad', 'garlic bread')
        then 'needed'
      when lower(btrim(lm.name)) = 'dinner'
        and lower(btrim(ls.name)) = 'mains'
        and li.place <= 1
        and lower(btrim(li.name)) = 'soup of the day'
        then 'needed'
      else 'extra, left as it is'
    end
  from live_items li
  join live_sections ls on ls.id = li.section_id
  join live_menus lm on lm.id = ls.menu_id
  union all
  select lm.place, ls.place, li.place, lz.place, 0, 0,
    'size ' || lz.place || ' of ' || li.name || ', ' || ls.name || ': '
      || coalesce(lz.name, '(no name yet)')
      || coalesce(', $' || round(lz.price_cents::numeric / 100, 2)::text, '')
      || coalesce(', ' || lz.calories_low
        || coalesce(' to ' || lz.calories_high, '') || ' calories', ''),
    case
      when lower(btrim(lm.name)) = 'dinner'
        and lower(btrim(ls.name)) = 'starters'
        and lower(btrim(li.name)) = 'soup of the day'
        and lz.place <= 2
        and lower(btrim(lz.name)) in ('cup', 'bowl')
        then 'needed'
      else 'extra, left as it is'
    end
  from live_sizes lz
  join live_items li on li.id = lz.item_id
  join live_sections ls on ls.id = li.section_id
  join live_menus lm on lm.id = ls.menu_id
  union all
  select ll.menu_place, ll.section_place, ll.dish_place, 0, ll.place, 0,
    'list ' || ll.place || ' of '
      || coalesce(ll.dish_name || ', ' || ll.section_name,
           ll.section_name || ', ' || ll.menu_name)
      || ': ' || ll.lead,
    case
      when ll.id in (select roll_list.id from roll_list) then 'needed'
      when ll.id in (select dressing.id from dressing) then 'needed'
      else 'extra, left as it is'
    end
  from live_lists ll
  union all
  select ll.menu_place, ll.section_place, ll.dish_place, 0, ll.place, lo.place,
    'option ' || lo.place || ' of ' || ll.lead || ': ' || lo.name
      || coalesce(', +$' || round(lo.added_price_cents::numeric / 100, 2)::text, '')
      || coalesce(', ' || lo.calories_low
        || coalesce(' to ' || lo.calories_high, '') || ' calories', '')
      || ', allergens '
      || coalesce(nullif(array_to_string(lo.allergens, ' '), ''), 'none')
      || coalesce(' and ' || nullif(array_to_string(lo.custom_allergens, ' '), ''), '')
      || case when lo.allergens_reviewed then ', checked' else ', not checked' end,
    case
      when ll.id in (select roll_list.id from roll_list)
        and lo.place = 1 and lower(btrim(lo.name)) = 'buttered roll'
        then 'needed'
      when ll.id in (select dressing.id from dressing)
        and lo.place <= 2 and lower(btrim(lo.name)) in ('ranch', 'vinaigrette')
        then 'needed'
      else 'extra, left as it is'
    end
  from live_options lo
  join live_lists ll on ll.id = lo.choice_list_id
) report
order by menu_place, section_place, dish_place, size_place, list_place,
  option_place;
