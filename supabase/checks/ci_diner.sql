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
-- the first (D-129); Starters' line shown with every dish, "Add a buttered
-- roll to any dish for 2 dollars.", checked with milk and wheat, and
-- Desserts with no line (migration 8, task 4b); at least one menu that
-- holds no section; and at least one section of Dinner that holds no dish.
-- Nothing here can publish (migration 3).

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
  wanted text;
  size_name text;
  size_price integer;
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

  -- 3d. Starters' line shown with every dish, with its own allergens and
  -- its check (migration 8, task 4b, D-152): "Add a buttered roll to any
  -- dish for 2 dollars." with milk and wheat, checked as CI Diner's owner,
  -- in two statements, since one statement that changes the words or a
  -- list and checks it ends unchecked; each written only when it differs.
  -- The line names no dish in Starters, since the gate matches names by
  -- substring. Desserts keeps no line, so the gate reads a page without
  -- the group too.
  update public.sections s
  set every_item = 'Add a buttered roll to any dish for 2 dollars.',
      every_item_allergens = '{milk,wheat}',
      every_item_custom_allergens = '{}'
  where s.id = starters
    and (s.every_item is distinct from
        'Add a buttered roll to any dish for 2 dollars.'
      or s.every_item_allergens is distinct from '{milk,wheat}'::public.allergen[]
      or s.every_item_custom_allergens is distinct from '{}'::text[]);
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'gave Starters its line shown with every dish, with milk and wheat';
  end if;
  update public.sections s
  set every_item_allergens_reviewed = true
  where s.id = starters and not s.every_item_allergens_reviewed;
  get diagnostics placed = row_count;
  if placed > 0 then
    raise notice 'checked the allergens of Starters'' line';
  end if;
end $$;

-- 4. What CI Diner holds now, in the order its screens show it. The first
-- row says whether the owner gate can run; every other row is a menu, a
-- section, a dish, or a size, marked needed or extra.
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
  select s.id, s.menu_id, s.name, s.every_item, s.every_item_allergens,
    s.every_item_custom_allergens, s.every_item_allergens_reviewed,
    row_number() over (
      partition by s.menu_id order by s.sort, s.created_at, s.id
    ) as place
  from public.sections s
  join live_menus on s.menu_id = live_menus.id
  where s.deleted_at is null
),
live_items as (
  select i.id, i.section_id, i.name, i.price_kind, i.price_cents,
    i.allergens, i.custom_allergens, i.allergens_reviewed,
    row_number() over (
      partition by i.section_id order by i.sort, i.created_at, i.id
    ) as place
  from public.items i
  join live_sections on i.section_id = live_sections.id
  where i.deleted_at is null
),
live_sizes as (
  select z.item_id, z.name, z.price_cents,
    row_number() over (
      partition by z.item_id
      order by z.price_cents nulls last, z.created_at, z.id
    ) as place
  from public.item_sizes z
  join live_items on z.item_id = live_items.id
  where z.deleted_at is null
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
      (select ls.every_item = 'Add a buttered roll to any dish for 2 dollars.'
         and ls.every_item_allergens = '{milk,wheat}'::public.allergen[]
         and ls.every_item_custom_allergens = '{}'::text[]
         and ls.every_item_allergens_reviewed
       from live_sections ls join starters on ls.id = starters.id)
      and not exists (
        select 1 from live_sections ls
        join dinner on ls.menu_id = dinner.id
        where lower(btrim(ls.name)) = 'desserts'
          and ls.every_item is not null),
      false) as line_ok
)
select item, status
from (
  select 0 as menu_place, 0 as section_place, 0 as dish_place,
    0 as size_place,
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
      when not v.line_ok then
        'not ready: Starters'' line shown with every dish is not "Add a buttered roll to any dish for 2 dollars." checked with milk and wheat, or Desserts has a line'
      else 'ready for the owner gate'
    end as status
  from verdict v
  union all
  select lm.place, 0, 0, 0,
    'menu ' || lm.place || ': ' || lm.name,
    case
      when lm.place <= 3
        and lower(btrim(lm.name)) in ('lunch', 'dinner', 'drinks')
        then 'needed'
      else 'extra, left as it is'
    end
  from live_menus lm
  union all
  select lm.place, ls.place, 0, 0,
    'section ' || ls.place || ' of ' || lm.name || ': ' || ls.name
      || coalesce(', line: ' || ls.every_item || ', allergens '
        || coalesce(nullif(array_to_string(ls.every_item_allergens, ' '), ''), 'none')
        || coalesce(' and ' || nullif(array_to_string(ls.every_item_custom_allergens, ' '), ''), '')
        || case when ls.every_item_allergens_reviewed then ', checked' else ', not checked' end,
        ''),
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
  select lm.place, ls.place, li.place, 0,
    'dish ' || li.place || ' of ' || ls.name || ', ' || lm.name || ': '
      || li.name || ', ' || li.price_kind
      || coalesce(', $' || round(li.price_cents::numeric / 100, 2)::text, '')
      || ', allergens '
      || coalesce(nullif(array_to_string(li.allergens, ' '), ''), 'none')
      || coalesce(' and ' || nullif(array_to_string(li.custom_allergens, ' '), ''), '')
      || case when li.allergens_reviewed then ', checked' else ', not checked' end,
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
  select lm.place, ls.place, li.place, lz.place,
    'size ' || lz.place || ' of ' || li.name || ', ' || ls.name || ': '
      || coalesce(lz.name, '(no name yet)')
      || coalesce(', $' || round(lz.price_cents::numeric / 100, 2)::text, ''),
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
) report
order by menu_place, section_place, dish_place, size_place;
