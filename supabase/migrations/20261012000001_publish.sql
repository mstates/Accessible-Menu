-- Migration 12. Publish and unpublish per menu (Phase 1, the Publish task,
-- D-82, D-85): Publish writes a snapshot of the menu to
-- menus.published_snapshot, and the diner page reads only that. Drops
-- menus_not_published_yet (D-114); retires the section and item views,
-- which read drafts (D-121, D-144), and with them the photo columns
-- (D-165) and restaurants.slug (D-95); remakes the restaurant and menu
-- views; adds the view that carries a dish's state. Operational state
-- (availability, the sold-out mark, a special's schedule) is read live by
-- dish id through published_item_states, never patched into the snapshot
-- (refines D-84, D-159, D-160). The snapshot leaves out deleted rows,
-- unchecked lists, who checked and when, and anything a diner never reads
-- (D-149, D-166, D-167). Nothing else (D-85).

-- 1. The snapshot column, with the three publish columns kept whole: a
-- published menu has a time and a snapshot, an unpublished one has
-- neither. Owners write none of the three (migration 3); the functions
-- below are the only way to publish or unpublish. Migration one's trigger
-- stamped published_at on its own and never cleared it; the functions
-- stamp and clear it themselves, so it goes. A row left with a time and
-- no flag comes inside the rule first.
alter table public.menus add column published_snapshot jsonb;
alter table public.menus drop constraint menus_not_published_yet;
update public.menus set published_at = null
  where not published and published_at is not null;
alter table public.menus add constraint menus_published_whole check (
  (published and published_at is not null and published_snapshot is not null)
  or (not published and published_at is null and published_snapshot is null)
);
drop trigger menus_published_at on public.menus;
drop function public.set_menu_published_at();

-- 2. The views that read drafts go, the ones that stay are remade below,
-- and then the columns the views kept alive: the photo columns, unused
-- since dish photos were parked (D-165), and the slug, replaced by the
-- code (D-86, D-95), with its trigger and function.
drop view public.published_items;
drop view public.published_sections;
drop view public.published_menus;
drop view public.published_restaurants;

alter table public.items drop constraint items_photo_requires_alt;
alter table public.items drop column photo_url;
alter table public.items drop column photo_alt;

drop trigger restaurants_keep_slug on public.restaurants;
drop function public.keep_slug();
alter table public.restaurants drop column slug;

-- 3. The snapshot builder. Runs as the caller, so row level security
-- decides what it can read; inside publish_menu() it runs as the definer
-- after the ownership check. Keys are the columns' names; every array is
-- ordered as the diner page reads it, so two builds of the same rows are
-- equal and "changed" is a value comparison. A list with no live option
-- is absent (D-166). An unchecked dish or option carries no list (D-149).
-- A one price's cents may be null and a sizes list may be empty: no price
-- is shown either way (D-139, D-143). Returns null for a menu that is
-- missing, deleted, or not readable. The shape is v1; a later shape bumps
-- v and gets its own reader, since a published snapshot is never rewritten.
create function public.menu_snapshot(p_menu uuid) returns jsonb
language sql stable set search_path = '' as $$
  with lists as (
    select l.id, l.item_id, l.section_id, l.sort, l.created_at,
      jsonb_build_object('id', l.id, 'lead', l.lead, 'options', o.options) as list
    from public.choice_lists l
    join lateral (
      select jsonb_agg(jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'added_price_cents', o.added_price_cents,
          'calories_low', o.calories_low,
          'calories_high', o.calories_high,
          'allergens', case when o.allergens_reviewed
            then jsonb_build_object('checked', true,
              'major', to_jsonb(o.allergens), 'other', to_jsonb(o.custom_allergens))
            else jsonb_build_object('checked', false) end
        ) order by o.sort, o.created_at, o.id) as options
      from public.choice_options o
      where o.choice_list_id = l.id and o.deleted_at is null
    ) o on o.options is not null
    where l.deleted_at is null
      and l.restaurant_id = (select m.restaurant_id from public.menus m where m.id = p_menu)
  )
  select jsonb_build_object(
    'v', 1,
    'menu', jsonb_build_object('id', m.id, 'name', m.name),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'note', s.note,
        'choice_lists', coalesce((
          select jsonb_agg(ls.list order by ls.sort, ls.created_at, ls.id)
          from lists ls where ls.section_id = s.id), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id,
            'name', i.name,
            'description', i.description,
            'note', i.note,
            'price', case i.price_kind
              when 'one' then jsonb_build_object('kind', 'one',
                'price_cents', i.price_cents,
                'calories_low', i.calories_low, 'calories_high', i.calories_high)
              when 'market' then jsonb_build_object('kind', 'market',
                'calories_low', i.calories_low, 'calories_high', i.calories_high)
              else jsonb_build_object('kind', 'sizes', 'sizes', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', z.id, 'name', z.name, 'price_cents', z.price_cents,
                  'calories_low', z.calories_low, 'calories_high', z.calories_high)
                  order by z.price_cents nulls last, z.created_at, z.id)
                from public.item_sizes z
                where z.item_id = i.id and z.deleted_at is null), '[]'::jsonb))
            end,
            'cooked_to_order', i.cooked_to_order,
            'dietary_tags', to_jsonb(i.dietary_tags),
            'allergens', case when i.allergens_reviewed
              then jsonb_build_object('checked', true,
                'major', to_jsonb(i.allergens), 'other', to_jsonb(i.custom_allergens))
              else jsonb_build_object('checked', false) end,
            'choice_lists', coalesce((
              select jsonb_agg(li.list order by li.sort, li.created_at, li.id)
              from lists li where li.item_id = i.id), '[]'::jsonb)
          ) order by i.sort, i.created_at, i.id)
          from public.items i
          where i.section_id = s.id and i.deleted_at is null), '[]'::jsonb)
      ) order by s.sort, s.created_at, s.id)
      from public.sections s
      where s.menu_id = p_menu and s.deleted_at is null), '[]'::jsonb)
  )
  from public.menus m
  where m.id = p_menu and m.deleted_at is null;
$$;
revoke all on function public.menu_snapshot(uuid) from public, anon;
grant execute on function public.menu_snapshot(uuid) to authenticated;

-- 4. What would block Publish: a live size with no name or no price under
-- a live dish priced by size (D-139, D-144). Runs as the caller. Output
-- names avoid the columns they come from, so nothing shadows.
create function public.publish_problems(p_menu uuid) returns table (
  problem text, dish uuid, dish_name text, section_name text, size uuid
)
language sql stable set search_path = '' as $$
  select case when z.name is null then 'size_unnamed' else 'size_unpriced' end,
    i.id, i.name, s.name, z.id
  from public.menus m
  join public.sections s on s.menu_id = m.id and s.deleted_at is null
  join public.items i on i.section_id = s.id and i.deleted_at is null
    and i.price_kind = 'sizes'
  join public.item_sizes z on z.item_id = i.id and z.deleted_at is null
  where m.id = p_menu and m.deleted_at is null
    and (z.name is null or z.price_cents is null)
  order by s.sort, s.created_at, s.id, i.sort, i.created_at, i.id,
    z.price_cents nulls last, z.created_at, z.id;
$$;
revoke all on function public.publish_problems(uuid) from public, anon;
grant execute on function public.publish_problems(uuid) to authenticated;

-- 5. One row per live menu for the owner pages: published or not, when,
-- and whether the draft differs from what was published (null while
-- unpublished). A value comparison, never a clock (refines D-82): no
-- updated_at moves on a parent when a child changes, an Undo would leave a
-- false "changed", and a sold-out mark is not a change. Runs as the caller.
create function public.menu_publish_states(p_restaurant uuid) returns table (
  menu uuid, menu_name text, published boolean, published_at timestamptz,
  changed boolean
)
language sql stable set search_path = '' as $$
  select m.id, m.name, m.published, m.published_at,
    case when m.published
      then public.menu_snapshot(m.id) is distinct from m.published_snapshot
    end
  from public.menus m
  where m.restaurant_id = p_restaurant and m.deleted_at is null
  order by m.sort, m.created_at, m.id;
$$;
revoke all on function public.menu_publish_states(uuid) from public, anon;
grant execute on function public.menu_publish_states(uuid) to authenticated;

-- 6. Publish. A definer, since owners cannot write published, published_at,
-- or the snapshot (D-114): the ownership check comes before any lock, so a
-- stranger's menu reads as not there (move_section()'s shape, D-131). The
-- lock serializes two presses and a delete; the re-read sees a delete that
-- landed first. Refuses while anything would block, and writes nothing
-- then. A press with nothing changed publishes again and moves the time.
create function public.publish_menu(p_menu uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select m.restaurant_id into v_restaurant
  from public.menus m where m.id = p_menu and m.deleted_at is null;
  if v_restaurant is null or not public.is_owner(v_restaurant) then
    raise exception 'publish_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.menus m where m.id = p_menu for update;
  if not exists (
    select 1 from public.menus m where m.id = p_menu and m.deleted_at is null
  ) then
    raise exception 'publish_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.publish_problems(p_menu)) then
    raise exception 'publish_blocked' using errcode = 'P0001';
  end if;
  update public.menus m
  set published = true,
      published_at = now(),
      published_snapshot = public.menu_snapshot(p_menu)
  where m.id = p_menu;
end;
$$;
revoke all on function public.publish_menu(uuid) from public, anon;
grant execute on function public.publish_menu(uuid) to authenticated;

-- 7. Unpublish: unpublished means absent, so the time and the snapshot go
-- with the flag. The same guard as publish. A second press changes nothing.
create function public.unpublish_menu(p_menu uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select m.restaurant_id into v_restaurant
  from public.menus m where m.id = p_menu and m.deleted_at is null;
  if v_restaurant is null or not public.is_owner(v_restaurant) then
    raise exception 'unpublish_not_found' using errcode = 'P0001';
  end if;
  update public.menus m
  set published = false, published_at = null, published_snapshot = null
  where m.id = p_menu and m.deleted_at is null and m.published;
end;
$$;
revoke all on function public.unpublish_menu(uuid) from public, anon;
grant execute on function public.unpublish_menu(uuid) to authenticated;

-- 8. What anon reads: three views, with the owner's privileges and a
-- security barrier (D-75), for restaurants on trial or active (Q-8).
-- Content comes from the snapshot alone, so a renamed-but-unpublished menu
-- name stays a draft; a menu's place among menus stays live, as the
-- restaurant's details do (D-82). A deleted menu is off at once, and a
-- restore puts it back as it was published (D-114). A dish's state is live,
-- keyed by the dish ids inside each published snapshot, so anon reads the
-- state of published dishes only: a dish added after Publish has no row,
-- and a dish deleted after Publish keeps the state its owner last gave it
-- until the next Publish. The path is the v1 shape's; a v2 shape remakes
-- this view.
create view public.published_restaurants with (security_barrier = true) as
  select r.id, r.code, r.name, r.city, r.city_slug, r.country, r.hours,
         r.website, r.timezone, r.enabled_languages, r.allergen_note,
         r.prep_notes, r.show_icons
  from public.restaurants r
  where r.status in ('trial', 'active')
    and exists (
      select 1 from public.menus m
      where m.restaurant_id = r.id and m.published and m.deleted_at is null
    );

create view public.published_menus with (security_barrier = true) as
  select m.id, m.restaurant_id, r.code, m.sort, m.published_at,
         m.published_snapshot
  from public.menus m
  join public.restaurants r on r.id = m.restaurant_id
  where m.published and m.deleted_at is null
    and r.status in ('trial', 'active');

create view public.published_item_states with (security_barrier = true) as
  select i.id, pm.id as menu_id, i.available, i.sold_out_at, i.special_schedule
  from public.published_menus pm
  cross join lateral jsonb_path_query(pm.published_snapshot,
    '$.sections[*].items[*].id') as d(id)
  join public.items i on i.id = (d.id #>> '{}')::uuid;

grant select on public.published_restaurants, public.published_menus,
  public.published_item_states to anon, authenticated;
