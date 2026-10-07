-- Migration 6. The dish page (Phase 1, task 3b): the texts and the price an
-- owner writes on a dish's own page, with their rules; the price choice
-- (D-139); sizes in a table of their own; move_item() (D-129); and
-- price_text retired. Nothing else (D-85). menus_not_published_yet
-- (migration 3) still keeps the published views empty.

-- 1. The price choice: one price, prices by size, or market price, never a
-- range (D-139). Every dish starts as one price, which with no price typed
-- reads as nothing shown.
create type public.price_kind as enum ('one', 'sizes', 'market');
alter table public.items
  add column price_kind public.price_kind not null default 'one';

-- 2. Text and price rules. Existing rows come inside each rule first, with
-- the fixes migrations four and five used, so no row can pass one and fail
-- the other. A description is something to read, five hundred characters
-- at most, over several lines; apart from line breaks it holds no control
-- characters, and a blank one is null. A note is one line, one hundred and
-- twenty characters at most, like a section's every-dish line. A price is
-- at most $99,999.99; the floor from migration one stays.
update public.items
  set description = nullif(regexp_replace(left(regexp_replace(regexp_replace(
    regexp_replace(description, '\r\n?', chr(10), 'g'),
    '(?!\n)[[:cntrl:]]', ' ', 'g'), '^\s+', ''), 500), '\s+$', ''), '')
  where description is not null
    and (description !~ '\S'
      or translate(description, chr(10), ' ') ~ '[[:cntrl:]]'
      or length(description) > 500);
update public.items
  set note = nullif(regexp_replace(left(regexp_replace(
    regexp_replace(note, '[[:cntrl:]]+', ' ', 'g'),
    '^\s+|\s+$', '', 'g'), 120), '\s+$', ''), '')
  where note is not null
    and (note !~ '\S' or note ~ '[[:cntrl:]]' or length(note) > 120);
update public.items set price_cents = 9999999 where price_cents > 9999999;
alter table public.items
  add constraint items_description_text
    check (description ~ '\S'
      and translate(description, chr(10), ' ') !~ '[[:cntrl:]]'
      and length(description) <= 500),
  add constraint items_note_text
    check (note ~ '\S' and note !~ '[[:cntrl:]]' and length(note) <= 120),
  add constraint items_price_cents_range
    check (price_cents <= 9999999);

-- 3. price_text retires: market price is a choice now, not words (D-139).
-- A row that held words and no number was a worded price, so it becomes
-- market price; nothing else is carried. published_items names the column,
-- so the view is made again without it and with nothing new in it, under
-- the same grant; it stays empty until Publish and retires with the
-- snapshot.
update public.items set price_kind = 'market'
  where price_text ~ '\S' and price_cents is null;
drop view public.published_items;
alter table public.items drop column price_text;
create view public.published_items with (security_barrier = true) as
  select i.id, i.section_id, i.restaurant_id, i.name, i.description,
         i.price_cents, i.allergens, i.custom_allergens,
         i.allergens_reviewed, i.dietary_tags, i.note, i.photo_url,
         i.photo_alt, i.available, i.special_schedule, i.sort
  from public.items i
  join public.published_sections ps on ps.id = i.section_id;
grant select on public.published_items to anon, authenticated;

-- 4. Sizes (D-139), a table of their own: each size name is translated and
-- matched to a Square variation on its own, and a row is one place for a
-- size's rules. A size hangs from its dish; its restaurant is its dish's,
-- through the copy trigger, as for dishes and sections, and neither link
-- is a column owners write after insert. A name is one line, forty
-- characters at most, null while the owner has not typed one; a price is
-- at most $99,999.99, null while none is typed: a draft may hold either,
-- and Publish refuses one (D-82). Names that are not deleted differ within
-- a dish, whatever the case or outer spaces, and a deleted size frees its
-- name. Sizes are read in price order, a size with no price last, then the
-- order added, so there is no sort column (Michael, at the plan's tabs).
-- A delete marks the row, so Undo can bring it back.
create table public.item_sizes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text,
  price_cents integer,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_sizes_name_text
    check (name ~ '\S' and name !~ '[[:cntrl:]]' and length(name) <= 40),
  constraint item_sizes_price_cents
    check (price_cents >= 0 and price_cents <= 9999999)
);
create index item_sizes_item_id_idx on public.item_sizes (item_id);
create index item_sizes_restaurant_id_idx on public.item_sizes (restaurant_id);
create unique index item_sizes_name_key
  on public.item_sizes (item_id, lower(btrim(name)))
  where deleted_at is null and name is not null;
create trigger item_sizes_updated_at before update on public.item_sizes
  for each row execute function public.set_updated_at();

-- The copy trigger reads the dish as the caller, so a dish the caller
-- cannot read is one that is not there. A trigger function runs without an
-- execute check on the caller, so the revoke costs nothing and rule 14
-- holds.
create function public.set_item_size_restaurant() returns trigger
language plpgsql set search_path = '' as $$
begin
  select i.restaurant_id into new.restaurant_id
  from public.items i where i.id = new.item_id;
  if new.restaurant_id is null then
    raise exception 'A size needs an existing dish.';
  end if;
  return new;
end;
$$;
revoke all on function public.set_item_size_restaurant()
  from public, anon, authenticated;
create trigger item_sizes_restaurant
  before insert or update of item_id on public.item_sizes
  for each row execute function public.set_item_size_restaurant();

alter table public.item_sizes enable row level security;
create policy "owners read sizes" on public.item_sizes
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add sizes" on public.item_sizes
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update sizes" on public.item_sizes
  for update to authenticated
  using (public.is_owner(restaurant_id))
  with check (public.is_owner(restaurant_id));
grant select on public.item_sizes to authenticated;
grant insert (item_id, name, price_cents) on public.item_sizes to authenticated;
grant update (name, price_cents, deleted_at) on public.item_sizes to authenticated;
grant select, insert, update, delete on public.item_sizes to service_role;

-- 5. Owners write a dish's description, price choice, price, and note on
-- its page (D-128), and nothing else new. The insert list is unchanged: a
-- dish is added by name. Never a photo or anything about allergens, each of
-- which joins the list in the task that builds it.
revoke update on public.items from authenticated;
grant update (name, description, price_kind, price_cents, note, sort, deleted_at) on public.items to authenticated;

-- 6. move_item(): a dish goes to another section of its own restaurant
-- (D-129), last there, with its sizes, since they hang from it. Owners
-- cannot write section_id (migration 5), so this runs as the table owner
-- and checks for itself, as move_section() does: the caller must be a
-- member of the dish's restaurant, read before anything is locked, so a
-- stranger holds no lock; and the section must be live, in a live menu, of
-- that same restaurant, so a member of two restaurants cannot carry a dish
-- across. The section is locked before the dish, the order
-- delete_with_contents() uses, with a key share lock: enough to make a
-- delete of that section wait, and no more. A name the section already has
-- is refused by items_name_key, the one place that rule lives. The copy
-- trigger then keeps the dish's restaurant, which is already the same.
create function public.move_item(p_item uuid, p_section uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  home uuid;
  held_in uuid;
  target uuid;
  place integer;
begin
  select i.restaurant_id into home
  from public.items i
  where i.id = p_item;
  if home is null or not public.is_owner(home) then
    raise exception 'move_not_found' using errcode = 'P0001';
  end if;

  select s.id into target
  from public.sections s
  join public.menus m on m.id = s.menu_id
  where s.id = p_section
    and s.restaurant_id = home
    and s.deleted_at is null
    and m.deleted_at is null
  for key share of s;
  if target is null then
    raise exception 'move_section_gone' using errcode = 'P0001';
  end if;

  select i.section_id into held_in
  from public.items i
  where i.id = p_item
    and i.restaurant_id = home
    and i.deleted_at is null
  for update;
  if held_in is null or not exists (
    select 1 from public.sections s
    join public.menus m on m.id = s.menu_id
    where s.id = held_in
      and s.deleted_at is null
      and m.deleted_at is null
  ) then
    raise exception 'move_not_found' using errcode = 'P0001';
  end if;
  if held_in = p_section then
    raise exception 'move_same_section' using errcode = 'P0001';
  end if;

  select coalesce(max(i.sort), 0) + 1 into place
  from public.items i
  where i.section_id = p_section and i.deleted_at is null;

  begin
    update public.items i
    set section_id = p_section, sort = place
    where i.id = p_item;
  exception when unique_violation then
    raise exception 'move_name_taken' using errcode = 'P0001';
  end;
end;
$$;
revoke all on function public.move_item(uuid, uuid) from public, anon;
grant execute on function public.move_item(uuid, uuid) to authenticated;
