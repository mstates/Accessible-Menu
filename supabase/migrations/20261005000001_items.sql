-- Migration 5. Dishes (Phase 1, task 3a): the dish name rule, deletion that
-- Undo can reverse, names that differ within a section, a dish's restaurant
-- kept equal to its section's, the list of columns owners may write,
-- set_item_order(), section_dish_counts(), delete_with_contents() for menus
-- and sections, and move_section(). Nothing else (D-85). The published views
-- are untouched, and menus_not_published_yet (migration 3) still keeps them
-- empty.

-- 1. The name rule. Existing rows come inside it first. A dish name is
-- something to read, on one line, one hundred and twenty characters at
-- most: twice a section name, since many dishes are printed with their
-- sides. The fix trims with the same space class the check reads with, so
-- no row can pass one and fail the other, and trims again after the cut,
-- so a cut name never ends in a space.
update public.items
  set name = coalesce(nullif(regexp_replace(left(regexp_replace(
    regexp_replace(name, '[[:cntrl:]]+', ' ', 'g'),
    '^\s+|\s+$', '', 'g'), 120), '\s+$', ''), ''), 'Dish')
  where name ~ '[[:cntrl:]]' or name !~ '\S' or length(name) > 120;
alter table public.items
  add constraint items_name_text
    check (name ~ '\S' and name !~ '[[:cntrl:]]' and length(name) <= 120);

-- 2. Deleting a dish marks it and keeps the row, so Undo can bring it back
-- (WCAG 3.3.4). Owner reads leave marked rows out. Deleting a section marks
-- the section only: its dishes keep their own state and come back with it.
alter table public.items add column deleted_at timestamptz;

-- 3. A section's dishes that are not deleted have different names, whatever
-- the case or the outer spaces: each names its controls in the editor, and
-- a re-import matches a dish by its section and its name (D-84). A deleted
-- dish frees its name. Existing copies are numbered first, one row at a
-- time, the oldest kept as it is: Soup, Soup 2.
do $$
declare
  r record;
  candidate text;
  n integer;
begin
  for r in
    select d.id, d.section_id, d.name
    from (
      select i.id, i.section_id, i.name, i.created_at,
             row_number() over (
               partition by i.section_id, lower(btrim(i.name))
               order by i.created_at, i.id
             ) as copy
      from public.items i
    ) d
    where d.copy > 1
    order by d.created_at, d.id
  loop
    n := 2;
    loop
      candidate := btrim(left(btrim(r.name), 119 - length(n::text)))
        || ' ' || n::text;
      exit when not exists (
        select 1 from public.items i
        where i.section_id = r.section_id
          and lower(btrim(i.name)) = lower(candidate)
      );
      n := n + 1;
    end loop;
    update public.items set name = candidate where id = r.id;
  end loop;
end;
$$;
create unique index items_name_key
  on public.items (section_id, lower(btrim(name)))
  where deleted_at is null;

-- 4. A dish's restaurant is its section's restaurant. The copy trigger from
-- migration one runs only when section_id is written, and until now owners
-- could write every column of a dish, so a member of two restaurants could
-- point a dish at the other one. This is the gap migration four closed for
-- sections, one level down. Rows that disagree are brought back in line
-- first. The column lists below then leave owners no way to write either
-- link after insert.
update public.items i
  set restaurant_id = s.restaurant_id
  from public.sections s
  where s.id = i.section_id
    and i.restaurant_id is distinct from s.restaurant_id;

-- 5. Owners write the columns this task's screens write, and nothing else.
-- Insert names the section, the name, and the place; the trigger fills
-- restaurant_id from the section, which the caller must be able to read.
-- Never id, and never section_id or restaurant_id after insert. Never a
-- price, a description, a note, a photo, or anything about allergens: each
-- joins the list in the task that builds it, with its own rule. No real
-- delete, which would take the dish for good. service_role keeps every
-- column for server code.
revoke insert, update, delete on public.items from authenticated;
grant insert (section_id, name, sort) on public.items to authenticated;
grant update (name, sort, deleted_at) on public.items to authenticated;

-- 6. set_item_order(): one statement puts a section's dishes in the given
-- order, so two rows never trade places halfway. It runs as the caller, so
-- row level security decides which rows it sees and writes. The list must
-- be a plain list of exactly the section's dishes that are not deleted,
-- each once; anything else is refused, which is how a page that is out of
-- date finds out. The rows are locked in one fixed order first, so two tabs
-- sending different orders wait for each other and never deadlock. A row
-- already in place is left alone, so its updated_at does not move.
create function public.set_item_order(p_section uuid, p_ids uuid[]) returns void
language plpgsql volatile set search_path = '' as $$
declare
  live integer;
  matched integer;
begin
  perform 1 from public.items i
  where i.section_id = p_section
  order by i.id
  for update;

  select count(*) into live
  from public.items i
  where i.section_id = p_section and i.deleted_at is null;

  select count(distinct i.id) into matched
  from public.items i
  where i.section_id = p_section
    and i.deleted_at is null
    and i.id = any (p_ids);

  if live = 0
     or coalesce(array_ndims(p_ids), 0) <> 1
     or cardinality(p_ids) <> live
     or matched <> live then
    raise exception 'order_mismatch' using errcode = 'P0001';
  end if;

  update public.items i
  set sort = o.ord::integer
  from unnest(p_ids) with ordinality as o (id, ord)
  where i.id = o.id
    and i.section_id = p_section
    and i.sort is distinct from o.ord;
end;
$$;
revoke all on function public.set_item_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_item_order(uuid, uuid[]) to authenticated;

-- 7. section_dish_counts(): what the delete questions name. One row for
-- each section that is not deleted, in a menu of the restaurant that is not
-- deleted, with how many of its dishes are not deleted. The Menus page adds
-- them up by menu, and a menu's page reads its own rows. It only reads, and
-- it runs as the caller, so row level security decides what it sees. The
-- count is taken here because the API returns a thousand rows at most, and
-- a count made from rows read through it would stop at a long wine list.
create function public.section_dish_counts(p_restaurant uuid) returns table (
  menu_id uuid,
  section_id uuid,
  dishes integer
)
language sql stable set search_path = '' as $$
  select s.menu_id, s.id,
    (select count(*) from public.items i
     where i.section_id = s.id and i.deleted_at is null)::integer
  from public.sections s
  join public.menus m on m.id = s.menu_id
  where m.restaurant_id = p_restaurant
    and m.deleted_at is null
    and s.deleted_at is null;
$$;
revoke all on function public.section_dish_counts(uuid) from public, anon;
grant execute on function public.section_dish_counts(uuid) to authenticated;

-- 8. delete_with_contents(): how a menu or a section is deleted. It marks
-- the row only if the row holds no more than the caller says the owner was
-- told about (D-119): for a menu, its sections that are not deleted and
-- their dishes that are not deleted; for a section, its dishes. The count
-- sits inside the statement that marks the row, and everything under the
-- row is locked first, top down, a menu before its sections before their
-- dishes, each in id order. A section or a dish that another session is
-- adding holds a key lock on its parent, so this waits for it and then
-- counts it. Nothing comes between the count and the mark. A refusal says
-- which it was: delete_grew when the row is there and holds more, and
-- delete_not_found when it is not there, is already marked, or is not
-- under p_parent. p_parent is the restaurant for a menu and the menu for a
-- section, so a page never deletes a row that has left it. It runs as the
-- caller: row level security decides which rows it sees, and the mark is
-- the caller's own column write.
create function public.delete_with_contents(
  p_kind text,
  p_parent uuid,
  p_id uuid,
  p_sections integer,
  p_dishes integer
) returns void
language plpgsql volatile set search_path = '' as $$
declare
  marked integer := 0;
  live boolean := false;
begin
  if p_kind = 'menu' then
    perform 1 from public.menus m
    where m.id = p_id and m.restaurant_id = p_parent
    for update;
    perform 1 from public.sections s
    where s.menu_id = p_id
    order by s.id
    for update;
    perform 1 from public.items i
    where i.section_id in (
      select s.id from public.sections s where s.menu_id = p_id
    )
    order by i.id
    for update of i;

    update public.menus m
    set deleted_at = now()
    where m.id = p_id
      and m.restaurant_id = p_parent
      and m.deleted_at is null
      and (
        select count(*) from public.sections s
        where s.menu_id = m.id and s.deleted_at is null
      ) <= coalesce(p_sections, 0)
      and (
        select count(*) from public.items i
        join public.sections s on s.id = i.section_id
        where s.menu_id = m.id
          and s.deleted_at is null
          and i.deleted_at is null
      ) <= coalesce(p_dishes, 0);
    get diagnostics marked = row_count;

    if marked = 0 then
      select exists (
        select 1 from public.menus m
        where m.id = p_id
          and m.restaurant_id = p_parent
          and m.deleted_at is null
      ) into live;
    end if;
  elsif p_kind = 'section' then
    perform 1 from public.sections s
    where s.id = p_id and s.menu_id = p_parent
    for update;
    perform 1 from public.items i
    where i.section_id = p_id
    order by i.id
    for update;

    update public.sections s
    set deleted_at = now()
    where s.id = p_id
      and s.menu_id = p_parent
      and s.deleted_at is null
      and (
        select count(*) from public.items i
        where i.section_id = s.id and i.deleted_at is null
      ) <= coalesce(p_dishes, 0);
    get diagnostics marked = row_count;

    if marked = 0 then
      select exists (
        select 1 from public.sections s
        where s.id = p_id
          and s.menu_id = p_parent
          and s.deleted_at is null
      ) into live;
    end if;
  else
    raise exception 'delete_unknown_kind' using errcode = 'P0001';
  end if;

  if marked = 0 then
    if live then
      raise exception 'delete_grew' using errcode = 'P0001';
    end if;
    raise exception 'delete_not_found' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.delete_with_contents(
  text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.delete_with_contents(
  text, uuid, uuid, integer, integer) to authenticated;

-- 9. move_section(): a section goes to another menu of its own restaurant
-- (D-129), last in that menu, and its dishes go with it, since they hang
-- from the section. Owners cannot write menu_id (migration 4), so this
-- runs as the table owner and checks for itself: the caller must be a
-- member of the section's restaurant, and the menu must belong to that
-- same restaurant, so a member of two restaurants cannot carry a section
-- across. A section that is not the caller's reads like one that is not
-- there, and is read before anything is locked, so a stranger holds no
-- lock. The menu is locked before the section, the order
-- delete_with_contents() uses, and with a key share lock: enough to make a
-- delete of that menu wait, and no more, so an add to that menu never
-- waits on a move. A name the menu already has is refused by
-- sections_name_key, the one place that rule lives. Two moves into one
-- menu at the same instant can draw the same place, as two adds can; the
-- read's tie-break keeps the order steady and the next reorder renumbers.
create function public.move_section(p_section uuid, p_menu uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  home uuid;
  held_in uuid;
  target uuid;
  place integer;
begin
  select s.restaurant_id into home
  from public.sections s
  where s.id = p_section;
  if home is null or not public.is_owner(home) then
    raise exception 'move_not_found' using errcode = 'P0001';
  end if;

  select m.id into target
  from public.menus m
  where m.id = p_menu
    and m.restaurant_id = home
    and m.deleted_at is null
  for key share;
  if target is null then
    raise exception 'move_menu_gone' using errcode = 'P0001';
  end if;

  select s.menu_id into held_in
  from public.sections s
  where s.id = p_section
    and s.restaurant_id = home
    and s.deleted_at is null
  for update;
  if held_in is null or not exists (
    select 1 from public.menus m
    where m.id = held_in and m.deleted_at is null
  ) then
    raise exception 'move_not_found' using errcode = 'P0001';
  end if;
  if held_in = p_menu then
    raise exception 'move_same_menu' using errcode = 'P0001';
  end if;

  select coalesce(max(s.sort), 0) + 1 into place
  from public.sections s
  where s.menu_id = p_menu and s.deleted_at is null;

  begin
    update public.sections s
    set menu_id = p_menu, sort = place
    where s.id = p_section;
  exception when unique_violation then
    raise exception 'move_name_taken' using errcode = 'P0001';
  end;
end;
$$;
revoke all on function public.move_section(uuid, uuid) from public, anon;
grant execute on function public.move_section(uuid, uuid) to authenticated;
