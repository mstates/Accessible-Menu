-- Migration 16. General's own Save (Phase 1, D-237 task 1, Q-170): one
-- reader and one writer for the fields a dish's General page writes, its
-- description, note, price choice, one price, and calories, and its sizes.
-- Both run as the caller, so row level security and the owners' column
-- lists (migrations 6 and 11) stay the only gate: no table, column,
-- policy, or privilege on a table changes here. Nothing else (D-85).

-- 1. The reader: what the General page shows and writes, as one document,
-- read in one statement. The page reads it when it loads and hands it back
-- with its Save; the writer reads it again under its lock and compares the
-- two. One reader on both sides, so the two differ only when the dish does.
-- The six fields of the dish, then its sizes that are not removed, each
-- with its id, in price order, a size with no price last, then the order
-- added, as every other reader of sizes has them. Null for a dish that is
-- removed, missing, or not the caller's to read.
create function public.item_general(p_item uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'description', i.description,
    'note', i.note,
    'price_kind', i.price_kind,
    'price_cents', i.price_cents,
    'calories_low', i.calories_low,
    'calories_high', i.calories_high,
    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id, 'name', z.name, 'price_cents', z.price_cents,
        'calories_low', z.calories_low, 'calories_high', z.calories_high)
        order by z.price_cents nulls last, z.created_at, z.id)
      from public.item_sizes z
      where z.item_id = i.id and z.deleted_at is null), '[]'::jsonb))
  from public.items i
  where i.id = p_item and i.deleted_at is null;
$$;
revoke all on function public.item_general(uuid) from public, anon;
grant execute on function public.item_general(uuid) to authenticated;

-- 2. The writer: the dish's fields and its sizes in one call, whole or not
-- at all. It locks the dish's row, then every size of the dish in id
-- order, the removed ones too, so a second save, a size added from
-- outside, and a size brought back from outside all wait. Then it reads
-- the document again through the reader and refuses, with nothing written,
-- when it is not the one the page showed: the version is the values, never
-- a clock or a counter, so a rename, a sold-out mark, or an allergen save
-- from another page never refuses a General save. The section and the menu
-- are read and never locked, so the lock order crosses no other function's.
-- This is made for read committed, the level every request through the
-- Data API runs at: each statement below sees what is committed when it
-- starts.
-- What to write is the same kind of document, checked key by key and kind
-- by kind before the first write, a new size carrying a null id. The
-- dish's own fields are written first and only when one differs. Then the
-- sizes: the ones the page no longer holds are marked removed first, so a
-- name they held is free; a size whose name changes lets go of its old
-- name before any takes a new one, since the names index is checked row by
-- row and two sizes trading names would refuse each other; then the
-- changed sizes take their values; then the new ones go in, in the page's
-- order. Owners insert a size's dish, name, and price and nothing else
-- (migration 6), so a new size's calories follow as an update. Any error,
-- a refusal below, a table rule, or the names index, undoes the whole call.
-- It refuses with general_not_found (the dish, its section, or its menu is
-- removed, missing, or not the caller's), general_moved, and
-- general_malformed.
create function public.save_item_general(p_item uuid, p_shown jsonb, p_next jsonb) returns void
language plpgsql volatile set search_path = '' as $$
declare
  held_in uuid;
  now_holds jsonb;
  listed integer;
  matched integer;
  added record;
  new_id uuid;
begin
  select i.section_id into held_in
  from public.items i
  where i.id = p_item and i.deleted_at is null
  for update;
  if held_in is null or not exists (
    select 1 from public.sections s
    join public.menus m on m.id = s.menu_id
    where s.id = held_in
      and s.deleted_at is null
      and m.deleted_at is null
  ) then
    raise exception 'general_not_found' using errcode = 'P0001';
  end if;

  perform 1 from public.item_sizes z
  where z.item_id = p_item
  order by z.id
  for update;

  select public.item_general(p_item) into now_holds;
  if now_holds is distinct from p_shown then
    raise exception 'general_moved' using errcode = 'P0001';
  end if;

  -- Three statements, in order, and none of them can fail on a value.
  if jsonb_typeof(p_next) is distinct from 'object' then
    raise exception 'general_malformed' using errcode = 'P0001';
  end if;
  if not p_next ?& array['description', 'note', 'price_kind',
       'price_cents', 'calories_low', 'calories_high', 'sizes']
     or jsonb_typeof(p_next -> 'sizes') is distinct from 'array'
     or jsonb_typeof(p_next -> 'description') not in ('string', 'null')
     or jsonb_typeof(p_next -> 'note') not in ('string', 'null')
     or jsonb_typeof(p_next -> 'price_kind') is distinct from 'string'
     or jsonb_typeof(p_next -> 'price_cents') not in ('number', 'null')
     or jsonb_typeof(p_next -> 'calories_low') not in ('number', 'null')
     or jsonb_typeof(p_next -> 'calories_high') not in ('number', 'null') then
    raise exception 'general_malformed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_next -> 'sizes') as n(size)
    where jsonb_typeof(n.size) <> 'object'
       or not n.size ?& array['id', 'name', 'price_cents',
         'calories_low', 'calories_high']
       or jsonb_typeof(n.size -> 'id') not in ('string', 'null')
       or jsonb_typeof(n.size -> 'name') not in ('string', 'null')
       or jsonb_typeof(n.size -> 'price_cents') not in ('number', 'null')
       or jsonb_typeof(n.size -> 'calories_low') not in ('number', 'null')
       or jsonb_typeof(n.size -> 'calories_high') not in ('number', 'null')
  ) then
    raise exception 'general_malformed' using errcode = 'P0001';
  end if;

  -- Every size with an id is one of this dish's own that is not removed,
  -- named once.
  select count(*) into listed
  from jsonb_array_elements(p_next -> 'sizes') as n(size)
  where n.size ->> 'id' is not null;
  select count(*) into matched
  from public.item_sizes z
  where z.item_id = p_item
    and z.deleted_at is null
    and z.id::text in (
      select n.size ->> 'id'
      from jsonb_array_elements(p_next -> 'sizes') as n(size));
  if listed <> matched then
    raise exception 'general_malformed' using errcode = 'P0001';
  end if;

  update public.items i
  set description = n.description,
      note = n.note,
      price_kind = n.price_kind,
      price_cents = n.price_cents,
      calories_low = n.calories_low,
      calories_high = n.calories_high
  from jsonb_to_record(p_next) as n(
    description text, note text, price_kind public.price_kind,
    price_cents integer, calories_low integer, calories_high integer)
  where i.id = p_item
    and (i.description, i.note, i.price_kind, i.price_cents,
         i.calories_low, i.calories_high)
      is distinct from
        (n.description, n.note, n.price_kind, n.price_cents,
         n.calories_low, n.calories_high);

  update public.item_sizes z
  set deleted_at = now()
  where z.item_id = p_item
    and z.deleted_at is null
    and not exists (
      select 1 from jsonb_array_elements(p_next -> 'sizes') as n(size)
      where n.size ->> 'id' = z.id::text);

  update public.item_sizes z
  set name = null
  from jsonb_to_recordset(p_next -> 'sizes') as n(id uuid, name text)
  where z.id = n.id
    and z.item_id = p_item
    and z.deleted_at is null
    and z.name is not null
    and z.name is distinct from n.name;

  update public.item_sizes z
  set name = n.name,
      price_cents = n.price_cents,
      calories_low = n.calories_low,
      calories_high = n.calories_high
  from jsonb_to_recordset(p_next -> 'sizes') as n(
    id uuid, name text, price_cents integer,
    calories_low integer, calories_high integer)
  where z.id = n.id
    and z.item_id = p_item
    and z.deleted_at is null
    and (z.name, z.price_cents, z.calories_low, z.calories_high)
      is distinct from
        (n.name, n.price_cents, n.calories_low, n.calories_high);

  for added in
    select n.size
    from jsonb_array_elements(p_next -> 'sizes')
      with ordinality as n(size, place)
    where n.size ->> 'id' is null
    order by n.place
  loop
    insert into public.item_sizes (item_id, name, price_cents)
    values (p_item, added.size ->> 'name',
      (added.size ->> 'price_cents')::integer)
    returning id into new_id;
    if added.size ->> 'calories_low' is not null
       or added.size ->> 'calories_high' is not null then
      update public.item_sizes z
      set calories_low = (added.size ->> 'calories_low')::integer,
          calories_high = (added.size ->> 'calories_high')::integer
      where z.id = new_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.save_item_general(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_item_general(uuid, jsonb, jsonb) to authenticated;
