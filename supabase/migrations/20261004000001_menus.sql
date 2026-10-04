-- Migration 3. Menus (Phase 1, the menus task): nothing can publish until
-- the Publish task, the name rule, deletion that Undo can reverse, names
-- that differ within a restaurant, the list of columns owners may write,
-- and set_menu_order(). Nothing else (D-85). The published views are
-- untouched.

-- 1. Nothing can publish until the Publish task (D-82, D-85). Drafts live in
-- menus, sections, and items, and the published views read those tables for
-- published menus, so a published menu would show its draft rows and any
-- allergens the owner has not confirmed. Until the snapshot exists no row
-- may be published, for any role. The Publish task's migration drops this
-- constraint when it adds the snapshot. Existing rows come inside the rule
-- first.
update public.menus set published = false, published_at = null where published;
alter table public.menus
  add constraint menus_not_published_yet check (not published);

-- 2. The name rule: something to read, on one line, sixty characters at
-- most. Migration one's check lets a lone tab or line break through.
update public.menus
  set name = coalesce(nullif(left(btrim(
    regexp_replace(name, '[[:cntrl:]]+', ' ', 'g')), 60), ''), 'Menu')
  where name ~ '[[:cntrl:]]' or name !~ '\S' or length(name) > 60;
alter table public.menus
  add constraint menus_name_text
    check (name ~ '\S' and name !~ '[[:cntrl:]]' and length(name) <= 60);

-- 3. Deleting a menu marks it and keeps the row, so Undo can bring it back
-- with everything under it (WCAG 3.3.4). Owner reads leave marked rows out.
alter table public.menus add column deleted_at timestamptz;

-- 4. A restaurant's menus that are not deleted have different names,
-- whatever the case or the outer spaces. Two menus called Dinner would give
-- two controls the same name and two entries in the diner's menu switcher.
-- A deleted menu frees its name. Existing copies are numbered first, one row
-- at a time, the oldest kept as it is: Dinner, Dinner 2.
do $$
declare
  r record;
  candidate text;
  n integer;
begin
  for r in
    select d.id, d.restaurant_id, d.name
    from (
      select m.id, m.restaurant_id, m.name, m.created_at,
             row_number() over (
               partition by m.restaurant_id, lower(btrim(m.name))
               order by m.created_at, m.id
             ) as copy
      from public.menus m
    ) d
    where d.copy > 1
    order by d.created_at, d.id
  loop
    n := 2;
    loop
      candidate := btrim(left(btrim(r.name), 59 - length(n::text)))
        || ' ' || n::text;
      exit when not exists (
        select 1 from public.menus m
        where m.restaurant_id = r.restaurant_id
          and lower(btrim(m.name)) = lower(candidate)
      );
      n := n + 1;
    end loop;
    update public.menus set name = candidate where id = r.id;
  end loop;
end;
$$;
create unique index menus_name_key
  on public.menus (restaurant_id, lower(btrim(name)))
  where deleted_at is null;

-- 5. Owners write the columns this task writes, and nothing else. Never id,
-- published, published_at, or source, and never restaurant_id after insert:
-- the section and item triggers copy it from the parent only when the parent
-- link changes, so a moved menu would leave its rows behind. No delete: a
-- real delete would take the menu's sections and items for good.
-- service_role keeps every column for server code.
revoke insert, update, delete on public.menus from authenticated;
grant insert (restaurant_id, name, sort) on public.menus to authenticated;
grant update (name, sort, deleted_at) on public.menus to authenticated;

-- 6. set_menu_order(): one statement puts a restaurant's menus in the given
-- order, so two rows never trade places halfway. It runs as the caller, so
-- row level security decides which rows it sees and writes. The list must be
-- a plain list of exactly the restaurant's menus that are not deleted, each
-- once; anything else is refused, which is how a page that is out of date
-- finds out. The rows are locked in one fixed order first, so two tabs
-- sending different orders wait for each other and never deadlock. A row
-- already in place is left alone, so its updated_at does not move.
create function public.set_menu_order(p_restaurant uuid, p_ids uuid[]) returns void
language plpgsql volatile set search_path = '' as $$
declare
  live integer;
  matched integer;
begin
  perform 1 from public.menus m
  where m.restaurant_id = p_restaurant
  order by m.id
  for update;

  select count(*) into live
  from public.menus m
  where m.restaurant_id = p_restaurant and m.deleted_at is null;

  select count(distinct m.id) into matched
  from public.menus m
  where m.restaurant_id = p_restaurant
    and m.deleted_at is null
    and m.id = any (p_ids);

  if live = 0
     or coalesce(array_ndims(p_ids), 0) <> 1
     or cardinality(p_ids) <> live
     or matched <> live then
    raise exception 'order_mismatch' using errcode = 'P0001';
  end if;

  update public.menus m
  set sort = o.ord::integer
  from unnest(p_ids) with ordinality as o (id, ord)
  where m.id = o.id
    and m.restaurant_id = p_restaurant
    and m.sort is distinct from o.ord;
end;
$$;
revoke all on function public.set_menu_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_menu_order(uuid, uuid[]) to authenticated;
