-- Migration 11. Choices, calories, and Cooked to order (Phase 1, task 7,
-- D-166, D-167): choice lists on a dish or a section, with options that
-- carry a name, an added price, calories, and their own allergens and
-- check in a dish's shape; calories on a dish and on each size; a Cooked
-- to order mark; the line shown with every dish retired, since a section
-- choice list with one option replaces it; the order and delete functions
-- grown. Nothing else (D-85). menus_not_published_yet (migration 3) still
-- keeps the published views empty, and the views are untouched: they never
-- named the line's columns and name none of the new ones, and they retire
-- with the snapshot, which carries lists, options, calories, and the mark.

-- 1. The line shown with every dish leaves, and a migration never rewrites
-- an allergen (D-7): a section that still holds a line, its words, a list,
-- or a check, deleted or not, stops the migration and is cleared by hand
-- first, by SQL, since the pushed app no longer shows the field. The two
-- known lines are Test Bistro's Starters and CI Diner's roll.
do $$
declare
  off integer;
begin
  select count(*) into off from public.sections s
  where s.every_item is not null
     or s.every_item_allergens <> '{}'
     or s.every_item_custom_allergens <> '{}'
     or s.every_item_allergens_reviewed;
  if off <> 0 then
    raise exception 'migration 11: % sections still hold a line shown with every dish; clear them by hand first', off;
  end if;
end $$;

-- 2. The line's two triggers go first: a trigger named on a column keeps
-- the column from dropping, and the check trigger's body names the
-- columns, so a sections write would fail once they were gone. Then their
-- functions, the five constraints by name, and the six columns.
-- allergen_lists_problem() stays: it is the one lists rule (D-155), and an
-- option's lists go through it below.
drop trigger sections_line_allergen_check on public.sections;
drop trigger sections_line_allergen_lists on public.sections;
drop function public.set_section_line_allergen_check();
drop function public.check_section_line_allergen_lists();
alter table public.sections
  drop constraint sections_line_blank_holds_nothing,
  drop constraint sections_line_other_allergens_count,
  drop constraint sections_line_allergens_offered,
  drop constraint sections_line_check_whole,
  drop constraint sections_every_item_text,
  drop column every_item_allergens_reviewed_at,
  drop column every_item_allergens_reviewed_by,
  drop column every_item_allergens_reviewed,
  drop column every_item_custom_allergens,
  drop column every_item_allergens,
  drop column every_item;

-- 3. Owners' update list on sections loses the line and its lists. The
-- insert list is unchanged.
revoke update on public.sections from authenticated;
grant update (name, note, sort, deleted_at) on public.sections to authenticated;

-- 4. Calories (D-167) on a dish and on each size, and below on each option:
-- a low number and an optional high one, whole numbers, both absent or the
-- low one set, the high one at least the low, neither past 99,999, so a
-- price typed into the wrong field is refused and the heaviest dish on any
-- menu fits. The low one is tested for presence by name: a check passes
-- when it comes out null, and a between on a null low would. Cooked to order (D-167): one mark, off until the owner ticks
-- it. Nothing has written any of these, so no row needs fixing. With prices
-- by size the calories live on the sizes; a dish's own pair stays stored
-- across a switch, as its one price does (D-143).
alter table public.items
  add column calories_low integer,
  add column calories_high integer,
  add column cooked_to_order boolean not null default false,
  add constraint items_calories_shape check (
    (calories_low is null and calories_high is null)
    or (calories_low is not null
      and calories_low between 0 and 99999
      and (calories_high is null
        or calories_high between calories_low and 99999))
  );
alter table public.item_sizes
  add column calories_low integer,
  add column calories_high integer,
  add constraint item_sizes_calories_shape check (
    (calories_low is null and calories_high is null)
    or (calories_low is not null
      and calories_low between 0 and 99999
      and (calories_high is null
        or calories_high between calories_low and 99999))
  );

-- 5. Choice lists (D-166): what a diner picks or adds with a dish. A list
-- belongs to one dish or one section, never both; its restaurant is its
-- home's, through a copy trigger, as a size's is its dish's, and neither
-- link is a column owners write after insert. The lead is the line diners
-- read first, one line of 120 characters at most, like the every-dish line
-- it replaces; leads that are not deleted differ within a home, whatever
-- the case or outer spaces, so no two rows on a page read alike. The
-- owner's order is sort, written by set_choice_list_order() below. A
-- delete marks the row, so Undo can bring it back; a list under a deleted
-- home keeps its own state and comes back with it. The database accepts a
-- list under a deleted home until the Q-44 and Q-45 migration, as it does
-- a size (D-144); the app's scope reads refuse it.
create table public.choice_lists (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  section_id uuid references public.sections (id) on delete cascade,
  lead text not null,
  sort integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint choice_lists_one_home
    check (num_nonnulls(item_id, section_id) = 1),
  constraint choice_lists_lead_text
    check (lead ~ '\S' and lead !~ '[[:cntrl:]]' and length(lead) <= 120)
);
create index choice_lists_item_id_idx on public.choice_lists (item_id);
create index choice_lists_section_id_idx on public.choice_lists (section_id);
create index choice_lists_restaurant_id_idx on public.choice_lists (restaurant_id);
create unique index choice_lists_lead_key
  on public.choice_lists (coalesce(item_id, section_id), lower(btrim(lead)))
  where deleted_at is null;
create trigger choice_lists_updated_at before update on public.choice_lists
  for each row execute function public.set_updated_at();

-- The copy trigger reads the home as the caller, so a dish or a section
-- the caller cannot read is one that is not there. A trigger function runs
-- without an execute check on the caller, so the revoke costs nothing and
-- rule 14 holds.
create function public.set_choice_list_restaurant() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.item_id is not null then
    select i.restaurant_id into new.restaurant_id
    from public.items i where i.id = new.item_id;
  else
    select s.restaurant_id into new.restaurant_id
    from public.sections s where s.id = new.section_id;
  end if;
  if new.restaurant_id is null then
    raise exception 'A choice list needs an existing dish or section.';
  end if;
  return new;
end;
$$;
revoke all on function public.set_choice_list_restaurant()
  from public, anon, authenticated;
create trigger choice_lists_restaurant
  before insert or update of item_id, section_id on public.choice_lists
  for each row execute function public.set_choice_list_restaurant();

alter table public.choice_lists enable row level security;
create policy "owners read choice lists" on public.choice_lists
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add choice lists" on public.choice_lists
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update choice lists" on public.choice_lists
  for update to authenticated
  using (public.is_owner(restaurant_id))
  with check (public.is_owner(restaurant_id));
grant select on public.choice_lists to authenticated;
grant insert (item_id, section_id, lead, sort) on public.choice_lists to authenticated;
grant update (lead, sort, deleted_at) on public.choice_lists to authenticated;
grant select, insert, update, delete on public.choice_lists to service_role;

-- 6. Options (D-166, D-167): each a row under its list, its restaurant kept
-- equal to the list's. A name is one line of 60 characters at most, a
-- section name's cap, and names that are not deleted differ within a list,
-- whatever the case or outer spaces. An added price is one number in
-- cents, null while none is typed, never a range (D-139); calories as on a
-- dish. The allergens are a dish's (migration 7): the nine offered while
-- the country is US only (Q-4), ten other allergens at most, the lists
-- rule through allergen_lists_problem() (D-155), and the check whole,
-- stamped by the database with no foreign key. The owner's order is sort.
create table public.choice_options (
  id uuid primary key default gen_random_uuid(),
  choice_list_id uuid not null references public.choice_lists (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  added_price_cents integer,
  calories_low integer,
  calories_high integer,
  allergens public.allergen[] not null default '{}',
  custom_allergens text[] not null default '{}',
  allergens_reviewed boolean not null default false,
  allergens_reviewed_by uuid,
  allergens_reviewed_at timestamptz,
  sort integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint choice_options_name_text
    check (name ~ '\S' and name !~ '[[:cntrl:]]' and length(name) <= 60),
  constraint choice_options_added_price_cents
    check (added_price_cents >= 0 and added_price_cents <= 9999999),
  constraint choice_options_calories_shape check (
    (calories_low is null and calories_high is null)
    or (calories_low is not null
      and calories_low between 0 and 99999
      and (calories_high is null
        or calories_high between calories_low and 99999))
  ),
  constraint choice_options_allergens_offered check (
    allergens <@ '{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame}'::public.allergen[]
  ),
  constraint choice_options_other_allergens_count check (
    cardinality(custom_allergens) <= 10
  ),
  constraint choice_options_allergen_check_whole check (
    (allergens_reviewed
      and allergens_reviewed_by is not null
      and allergens_reviewed_at is not null)
    or (not allergens_reviewed
      and allergens_reviewed_by is null
      and allergens_reviewed_at is null)
  )
);
create index choice_options_choice_list_id_idx on public.choice_options (choice_list_id);
create index choice_options_restaurant_id_idx on public.choice_options (restaurant_id);
create unique index choice_options_name_key
  on public.choice_options (choice_list_id, lower(btrim(name)))
  where deleted_at is null;
create trigger choice_options_updated_at before update on public.choice_options
  for each row execute function public.set_updated_at();

create function public.set_choice_option_restaurant() returns trigger
language plpgsql set search_path = '' as $$
begin
  select l.restaurant_id into new.restaurant_id
  from public.choice_lists l where l.id = new.choice_list_id;
  if new.restaurant_id is null then
    raise exception 'An option needs an existing choice list.';
  end if;
  return new;
end;
$$;
revoke all on function public.set_choice_option_restaurant()
  from public, anon, authenticated;
create trigger choice_options_restaurant
  before insert or update of choice_list_id on public.choice_options
  for each row execute function public.set_choice_option_restaurant();

-- The lists rule (D-155): the same function, the same names, run as its
-- owner for the one call.
create function public.check_choice_option_allergen_lists() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  problem text :=
    public.allergen_lists_problem(new.allergens, new.custom_allergens);
begin
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.check_choice_option_allergen_lists()
  from public, anon, authenticated;
create trigger choice_options_allergen_lists
  before insert or update of allergens, custom_allergens on public.choice_options
  for each row execute function public.check_choice_option_allergen_lists();

-- The check, stamped and cleared by the database (D-148, migration 7):
-- never born checked, a check needs a signed-in person, and any change to
-- a list clears it in the statement that makes it. As the line's words did
-- (D-152), a change to the name clears it too, since the name is all that
-- names the food (Michael, at the plan's tabs, October 10, 2026). A change
-- to the price, the calories, the place, or deleted_at leaves it as it is.
-- Every statement the app sends that changes or checks a list also names,
-- in its where clause, the name and the lists the page showed (D-149,
-- D-153); that rule is the app's, and the boundary script shows what it
-- does here.
create function public.set_choice_option_allergen_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  person uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.allergens_reviewed then
      raise exception 'allergen_check_on_insert' using errcode = 'P0001';
    end if;
    new.allergens_reviewed_by := null;
    new.allergens_reviewed_at := null;
    return new;
  end if;
  new.allergens_reviewed_by := old.allergens_reviewed_by;
  new.allergens_reviewed_at := old.allergens_reviewed_at;
  if new.name is distinct from old.name
     or new.allergens is distinct from old.allergens
     or new.custom_allergens is distinct from old.custom_allergens then
    new.allergens_reviewed := false;
  end if;
  if new.allergens_reviewed and not old.allergens_reviewed then
    if person is null then
      raise exception 'allergen_check_needs_person' using errcode = 'P0001';
    end if;
    new.allergens_reviewed_by := person;
    new.allergens_reviewed_at := now();
  elsif not new.allergens_reviewed then
    new.allergens_reviewed_by := null;
    new.allergens_reviewed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.set_choice_option_allergen_check()
  from public, anon, authenticated;
create trigger choice_options_allergen_check
  before insert or update on public.choice_options
  for each row execute function public.set_choice_option_allergen_check();

alter table public.choice_options enable row level security;
create policy "owners read options" on public.choice_options
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add options" on public.choice_options
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update options" on public.choice_options
  for update to authenticated
  using (public.is_owner(restaurant_id))
  with check (public.is_owner(restaurant_id));
grant select on public.choice_options to authenticated;
grant insert (choice_list_id, name, sort) on public.choice_options to authenticated;
grant update (name, added_price_cents, calories_low, calories_high, allergens, custom_allergens, allergens_reviewed, sort, deleted_at) on public.choice_options to authenticated;
grant select, insert, update, delete on public.choice_options to service_role;

-- 7. Owners write a dish's calories and its mark on its page, and a size's
-- calories in its row. The insert lists are unchanged.
revoke update on public.items from authenticated;
grant update (name, description, price_kind, price_cents, calories_low, calories_high, cooked_to_order, note, allergens, custom_allergens, allergens_reviewed, dietary_tags, available, sold_out_at, special_schedule, sort, deleted_at) on public.items to authenticated;
revoke update on public.item_sizes from authenticated;
grant update (name, price_cents, calories_low, calories_high, deleted_at) on public.item_sizes to authenticated;

-- 8. set_choice_list_order() and set_choice_option_order(): one statement
-- each puts a home's lists or a list's options in the given order, in
-- set_item_order()'s shape (migration 5): run as the caller, the rows
-- locked in one fixed order first, exactly the live rows each once or
-- order_mismatch, and a row already in place left alone. A home is named
-- by its id alone: a list hangs from one of two columns, and
-- coalesce(item_id, section_id) is the home, as choice_lists_lead_key
-- reads it.
create function public.set_choice_list_order(p_home uuid, p_ids uuid[]) returns void
language plpgsql volatile set search_path = '' as $$
declare
  live integer;
  matched integer;
begin
  perform 1 from public.choice_lists l
  where coalesce(l.item_id, l.section_id) = p_home
  order by l.id
  for update;

  select count(*) into live
  from public.choice_lists l
  where coalesce(l.item_id, l.section_id) = p_home and l.deleted_at is null;

  select count(distinct l.id) into matched
  from public.choice_lists l
  where coalesce(l.item_id, l.section_id) = p_home
    and l.deleted_at is null
    and l.id = any (p_ids);

  if live = 0
     or coalesce(array_ndims(p_ids), 0) <> 1
     or cardinality(p_ids) <> live
     or matched <> live then
    raise exception 'order_mismatch' using errcode = 'P0001';
  end if;

  update public.choice_lists l
  set sort = o.ord::integer
  from unnest(p_ids) with ordinality as o (id, ord)
  where l.id = o.id
    and coalesce(l.item_id, l.section_id) = p_home
    and l.sort is distinct from o.ord;
end;
$$;
revoke all on function public.set_choice_list_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_choice_list_order(uuid, uuid[]) to authenticated;

create function public.set_choice_option_order(p_list uuid, p_ids uuid[]) returns void
language plpgsql volatile set search_path = '' as $$
declare
  live integer;
  matched integer;
begin
  perform 1 from public.choice_options o
  where o.choice_list_id = p_list
  order by o.id
  for update;

  select count(*) into live
  from public.choice_options o
  where o.choice_list_id = p_list and o.deleted_at is null;

  select count(distinct o.id) into matched
  from public.choice_options o
  where o.choice_list_id = p_list
    and o.deleted_at is null
    and o.id = any (p_ids);

  if live = 0
     or coalesce(array_ndims(p_ids), 0) <> 1
     or cardinality(p_ids) <> live
     or matched <> live then
    raise exception 'order_mismatch' using errcode = 'P0001';
  end if;

  update public.choice_options o
  set sort = x.ord::integer
  from unnest(p_ids) with ordinality as x (id, ord)
  where o.id = x.id
    and o.choice_list_id = p_list
    and o.sort is distinct from x.ord;
end;
$$;
revoke all on function public.set_choice_option_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_choice_option_order(uuid, uuid[]) to authenticated;

-- 9. delete_with_contents() grows to a list with its options (D-166,
-- D-119): p_kind 'list', p_parent the list's home, and p_options what the
-- owner was told. A parameter list cannot change in place, so the function
-- is dropped and made again with the new one; the menu and section
-- branches are as migration 5 wrote them and ignore p_options, as the
-- section branch ignores p_sections, and the app's two callers pass zero.
-- Everything else migration 5 said holds: it runs as the caller, locks the
-- row and then everything under it in id order, counts inside the
-- statement that marks, and refuses with delete_grew, delete_not_found, or
-- delete_unknown_kind.
drop function public.delete_with_contents(text, uuid, uuid, integer, integer);
create function public.delete_with_contents(
  p_kind text,
  p_parent uuid,
  p_id uuid,
  p_sections integer,
  p_dishes integer,
  p_options integer
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
  elsif p_kind = 'list' then
    perform 1 from public.choice_lists l
    where l.id = p_id and coalesce(l.item_id, l.section_id) = p_parent
    for update;
    perform 1 from public.choice_options o
    where o.choice_list_id = p_id
    order by o.id
    for update;

    update public.choice_lists l
    set deleted_at = now()
    where l.id = p_id
      and coalesce(l.item_id, l.section_id) = p_parent
      and l.deleted_at is null
      and (
        select count(*) from public.choice_options o
        where o.choice_list_id = l.id and o.deleted_at is null
      ) <= coalesce(p_options, 0);
    get diagnostics marked = row_count;

    if marked = 0 then
      select exists (
        select 1 from public.choice_lists l
        where l.id = p_id
          and coalesce(l.item_id, l.section_id) = p_parent
          and l.deleted_at is null
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
  text, uuid, uuid, integer, integer, integer) from public, anon;
grant execute on function public.delete_with_contents(
  text, uuid, uuid, integer, integer, integer) to authenticated;
