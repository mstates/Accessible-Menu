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
-- and at least one menu that holds no section. Nothing here can publish
-- (migration 3).

do $$
declare
  diner uuid;
  dinner uuid;
  wanted text;
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
end $$;

-- 3. What CI Diner holds now, in the order its screens show it. The first
-- row says whether the owner gate can run; every other row is a menu or a
-- section, marked needed or extra.
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
  select s.menu_id, s.name,
    row_number() over (
      partition by s.menu_id order by s.sort, s.created_at, s.id
    ) as place
  from public.sections s
  join live_menus on s.menu_id = live_menus.id
  where s.deleted_at is null
),
dinner as (
  select lm.id from live_menus lm where lower(btrim(lm.name)) = 'dinner'
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
    ) as one_empty
)
select item, status
from (
  select 0 as menu_place, 0 as section_place,
    'CI Diner (56097672)' as item,
    case
      when not v.menus_ok then
        'not ready: Lunch, Dinner, and Drinks are not the first three menus'
      when not v.sections_ok then
        'not ready: Starters, Mains, and Desserts are not Dinner''s first three sections'
      when not v.one_empty then
        'not ready: every menu holds sections, and the gate needs one that holds none. Delete the extra sections below on their menu''s page.'
      else 'ready for the owner gate'
    end as status
  from verdict v
  union all
  select lm.place, 0,
    'menu ' || lm.place || ': ' || lm.name,
    case
      when lm.place <= 3
        and lower(btrim(lm.name)) in ('lunch', 'dinner', 'drinks')
        then 'needed'
      else 'extra, left as it is'
    end
  from live_menus lm
  union all
  select lm.place, ls.place,
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
) report
order by menu_place, section_place;
