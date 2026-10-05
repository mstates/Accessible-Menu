-- Migration 4. Sections (Phase 1, the sections task): the line shown with
-- every dish, the text rules, deletion that Undo can reverse, names that
-- differ within a menu, a section's restaurant kept equal to its menu's,
-- the list of columns owners may write, and set_section_order(). Nothing
-- else (D-85). The published views are untouched.

-- 1. The line shown with every dish. One line an owner writes once for a
-- section, for an option or side that goes with each dish in it. The
-- section note still shows once, under the heading. None of the published
-- views names this column, so it reaches no diner from here.
alter table public.sections add column every_item text;

-- 2. Text rules. Existing rows come inside each rule first. A name is
-- something to read, on one line, sixty characters at most: it becomes a
-- heading on the diner page. A note is something to read, five hundred
-- characters at most, and may run over several lines; apart from line
-- breaks it holds no control characters. A Windows or old Mac line break
-- becomes a plain one, and a blank note is stored as null. The every-dish
-- line is one line, one hundred and twenty characters at most, and is new,
-- so no row needs fixing. The fixes trim with the same space class the
-- checks read with, so no row can pass one and fail the other.
update public.sections
  set name = coalesce(nullif(left(regexp_replace(
    regexp_replace(name, '[[:cntrl:]]+', ' ', 'g'),
    '^\s+|\s+$', '', 'g'), 60), ''), 'Section')
  where name ~ '[[:cntrl:]]' or name !~ '\S' or length(name) > 60;
update public.sections
  set note = nullif(regexp_replace(left(regexp_replace(regexp_replace(
    regexp_replace(note, '\r\n?', chr(10), 'g'),
    '(?!\n)[[:cntrl:]]', ' ', 'g'), '^\s+', ''), 500), '\s+$', ''), '')
  where note is not null
    and (note !~ '\S'
      or translate(note, chr(10), ' ') ~ '[[:cntrl:]]'
      or length(note) > 500);
alter table public.sections
  add constraint sections_name_text
    check (name ~ '\S' and name !~ '[[:cntrl:]]' and length(name) <= 60),
  add constraint sections_note_text
    check (note ~ '\S'
      and translate(note, chr(10), ' ') !~ '[[:cntrl:]]'
      and length(note) <= 500),
  add constraint sections_every_item_text
    check (every_item ~ '\S' and every_item !~ '[[:cntrl:]]'
      and length(every_item) <= 120);

-- 3. Deleting a section marks it and keeps the row, so Undo can bring it
-- back with everything under it (WCAG 3.3.4). Owner reads leave marked rows
-- out. Deleting a menu marks the menu only: its sections keep their own
-- state and come back with it.
alter table public.sections add column deleted_at timestamptz;

-- 4. A menu's sections that are not deleted have different names, whatever
-- the case or the outer spaces: each becomes a heading on the diner page and
-- names its controls in the editor. A deleted section frees its name.
-- Existing copies are numbered first, one row at a time, the oldest kept as
-- it is: Mains, Mains 2.
do $$
declare
  r record;
  candidate text;
  n integer;
begin
  for r in
    select d.id, d.menu_id, d.name
    from (
      select s.id, s.menu_id, s.name, s.created_at,
             row_number() over (
               partition by s.menu_id, lower(btrim(s.name))
               order by s.created_at, s.id
             ) as copy
      from public.sections s
    ) d
    where d.copy > 1
    order by d.created_at, d.id
  loop
    n := 2;
    loop
      candidate := btrim(left(btrim(r.name), 59 - length(n::text)))
        || ' ' || n::text;
      exit when not exists (
        select 1 from public.sections s
        where s.menu_id = r.menu_id
          and lower(btrim(s.name)) = lower(candidate)
      );
      n := n + 1;
    end loop;
    update public.sections set name = candidate where id = r.id;
  end loop;
end;
$$;
create unique index sections_name_key
  on public.sections (menu_id, lower(btrim(name)))
  where deleted_at is null;

-- 5. A section's restaurant is its menu's restaurant. The copy trigger from
-- migration one runs only when menu_id is written, so until now a member of
-- two restaurants could write restaurant_id alone and point a section at
-- the other one. Rows that disagree are brought back in line first, and
-- their items follow, so none is left pointing at the old restaurant. The
-- column lists below then leave owners no way to write either link after
-- insert.
update public.sections s
  set restaurant_id = m.restaurant_id
  from public.menus m
  where m.id = s.menu_id
    and s.restaurant_id is distinct from m.restaurant_id;
update public.items i
  set restaurant_id = s.restaurant_id
  from public.sections s
  where s.id = i.section_id
    and i.restaurant_id is distinct from s.restaurant_id;

-- 6. Owners write the columns this task's screens write, and nothing else.
-- Insert names the menu, the name, and the place; the trigger fills
-- restaurant_id from the menu, which the caller must be able to read. Never
-- id, and never menu_id or restaurant_id after insert: a section does not
-- move between menus, and a moved section would leave its items behind with
-- the old restaurant. No delete: a real delete would take the section's
-- items for good. service_role keeps every column for server code.
revoke insert, update, delete on public.sections from authenticated;
grant insert (menu_id, name, sort) on public.sections to authenticated;
grant update (name, note, every_item, sort, deleted_at) on public.sections to authenticated;

-- 7. set_section_order(): one statement puts a menu's sections in the given
-- order, so two rows never trade places halfway. It runs as the caller, so
-- row level security decides which rows it sees and writes. The list must be
-- a plain list of exactly the menu's sections that are not deleted, each
-- once; anything else is refused, which is how a page that is out of date
-- finds out. The rows are locked in one fixed order first, so two tabs
-- sending different orders wait for each other and never deadlock. A row
-- already in place is left alone, so its updated_at does not move.
create function public.set_section_order(p_menu uuid, p_ids uuid[]) returns void
language plpgsql volatile set search_path = '' as $$
declare
  live integer;
  matched integer;
begin
  perform 1 from public.sections s
  where s.menu_id = p_menu
  order by s.id
  for update;

  select count(*) into live
  from public.sections s
  where s.menu_id = p_menu and s.deleted_at is null;

  select count(distinct s.id) into matched
  from public.sections s
  where s.menu_id = p_menu
    and s.deleted_at is null
    and s.id = any (p_ids);

  if live = 0
     or coalesce(array_ndims(p_ids), 0) <> 1
     or cardinality(p_ids) <> live
     or matched <> live then
    raise exception 'order_mismatch' using errcode = 'P0001';
  end if;

  update public.sections s
  set sort = o.ord::integer
  from unnest(p_ids) with ordinality as o (id, ord)
  where s.id = o.id
    and s.menu_id = p_menu
    and s.sort is distinct from o.ord;
end;
$$;
revoke all on function public.set_section_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_section_order(uuid, uuid[]) to authenticated;
