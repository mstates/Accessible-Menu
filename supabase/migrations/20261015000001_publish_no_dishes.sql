-- Migration 14. Publish refuses a menu with no dishes (Phase 1, D-177,
-- Q-101): a menu with nothing to show must never reach diners claiming
-- its allergens are confirmed, so publish_problems() reports the menu
-- itself, once, while no live dish sits in a live section of it, and
-- publish_menu(), which raises publish_blocked for any row, needs no
-- change. Availability and schedules are not read here: a menu of
-- specials still publishes outside their hours, and a dish off the menu
-- for now still counts as a dish (D-159, D-160). The same five columns as
-- twelve, so the owner pages' reader keeps its shape and the function is
-- replaced in place; the menu's row is null in the dish columns, since
-- the page knows its own menu's name. Nothing else (D-85).

-- 1. The function, replaced whole. Runs as the caller, so a stranger's or
-- a deleted menu reports no row, as before; inside publish_menu() it runs
-- as the definer after the ownership check. The two kinds never meet, no
-- live dish meaning no live size, and the size rows keep the page's
-- order through the keys the first branch carries.
create or replace function public.publish_problems(p_menu uuid) returns table (
  problem text, dish uuid, dish_name text, section_name text, size uuid
)
language sql stable set search_path = '' as $$
  with found as (
    select
      case when z.name is null then 'size_unnamed' else 'size_unpriced' end
        as problem,
      i.id as dish, i.name as dish_name, s.name as section_name, z.id as size,
      s.sort as section_sort, s.created_at as section_made, s.id as section,
      i.sort as dish_sort, i.created_at as dish_made,
      z.price_cents as size_price, z.created_at as size_made
    from public.menus m
    join public.sections s on s.menu_id = m.id and s.deleted_at is null
    join public.items i on i.section_id = s.id and i.deleted_at is null
      and i.price_kind = 'sizes'
    join public.item_sizes z on z.item_id = i.id and z.deleted_at is null
    where m.id = p_menu and m.deleted_at is null
      and (z.name is null or z.price_cents is null)
    union all
    select 'no_dishes', null::uuid, null::text, null::text, null::uuid,
      null::integer, null::timestamptz, null::uuid,
      null::integer, null::timestamptz,
      null::integer, null::timestamptz
    from public.menus m
    where m.id = p_menu and m.deleted_at is null
      and not exists (
        select 1
        from public.sections s
        join public.items i on i.section_id = s.id and i.deleted_at is null
        where s.menu_id = m.id and s.deleted_at is null
      )
  )
  select f.problem, f.dish, f.dish_name, f.section_name, f.size
  from found f
  order by f.section_sort, f.section_made, f.section, f.dish_sort, f.dish_made,
    f.dish, f.size_price nulls last, f.size_made, f.size;
$$;

-- 2. Rule 14, restated: a replace keeps the privileges the function had,
-- and the file says so by name.
revoke all on function public.publish_problems(uuid) from public, anon;
grant execute on function public.publish_problems(uuid) to authenticated;
