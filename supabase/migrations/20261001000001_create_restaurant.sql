-- Migration 2. Restaurant creation (Phase 1, task 1): the menu code (D-86,
-- D-88), the address parts (D-87), the field rules as table constraints,
-- create_restaurant() with its grant (D-85, D-89), and the list of columns
-- owners may update. Nothing else.

-- 1. Address parts (D-87). address stays the street line (Spec 8).
alter table public.restaurants
  add column region text,
  add column postal_code text;

-- 2. The menu code (D-86, D-88). Text, never a number. Eight digits today,
-- first digit 1 to 9; a later migration widens the format check without
-- touching issued codes. Stored lowercase so letters can come later.
alter table public.restaurants add column code text;

create function public.generate_menu_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  candidate text;
begin
  loop
    candidate := (1 + floor(random() * 9))::int::text
      || lpad(floor(random() * 10000000)::int::text, 7, '0');
    exit when not exists (
      select 1 from public.restaurants where code = candidate
    );
  end loop;
  return candidate;
end;
$$;
-- Only create_restaurant() and migrations call it. The revoke is by name:
-- PUBLIC holds execute on every new function through Postgres's global
-- default, and migration one's per-schema default-privilege revoke cannot
-- remove it. keep_code() below needs none, since a trigger function cannot
-- be called directly.
revoke all on function public.generate_menu_code() from public;

-- Existing rows (Test Kitchen) get a code one row at a time, so two rows can
-- never draw the same number inside one statement.
do $$
declare
  r record;
begin
  for r in select id from public.restaurants where code is null loop
    update public.restaurants
      set code = public.generate_menu_code()
      where id = r.id;
  end loop;
end;
$$;

alter table public.restaurants
  alter column code set not null,
  add constraint restaurants_code_format check (code ~ '^[1-9][0-9]{7}$'),
  add constraint restaurants_code_lower check (code = lower(code));
create unique index restaurants_code_key on public.restaurants (code);

-- Locked after insert, for every role (D-88).
create function public.keep_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.code is distinct from old.code then
    raise exception 'A menu code is permanent (D-86).';
  end if;
  return new;
end;
$$;
create trigger restaurants_keep_code before update of code on public.restaurants
  for each row execute function public.keep_code();

-- 3. The code replaces slug (D-86). New rows carry no slug. The column, its
-- trigger, and its place in published_restaurants leave in the migration
-- that rewrites the views for the diner page (D-82, D-85).
alter table public.restaurants alter column slug drop not null;

-- 4. Field rules. The database is the boundary: an owner session can write
-- the granted columns and call create_restaurant() straight through the Data
-- API, so every rule the form enforces lives here too. A check passes on
-- null, so optional columns need no null clause. US only until the allergen
-- list covers more than the US and EU lists (Q-4): country is fixed, the
-- state is a USPS code, and the zones are the seven US zones. A zone outside
-- the list would make Intl throw when a diner page renders hours, so the
-- list is closed; tests/unit/timezones.test.ts keeps it equal to
-- TIMEZONE_IDS in src/domain/timezones.ts.
--
-- Existing rows are brought inside every rule first, so no constraint can
-- fail on a row that is already there. Text beyond a cap is cut; a blank
-- address or city becomes null; a website or phone that fails its pattern is
-- cleared; an unknown zone becomes Eastern; hours that are not an object, or
-- too large, are cleared. timezone and country are already not null with
-- defaults from migration one, so a null never reaches either; the boundary
-- script proves it.
update public.restaurants set
  name = left(name, 120),
  address = nullif(left(btrim(address), 200), ''),
  city = nullif(left(btrim(city), 100), ''),
  allergen_note = left(allergen_note, 1000),
  website = case
    when website ~* '^https?://\S+$' and length(website) <= 500 then website
  end,
  phone = case when phone ~ '^[0-9 ()+.-]{7,25}$' then phone end,
  country = 'US',
  timezone = case
    when timezone in ('America/New_York', 'America/Chicago', 'America/Denver',
      'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
      'Pacific/Honolulu') then timezone
    else 'America/New_York'
  end,
  hours = case
    when jsonb_typeof(hours) = 'object' and octet_length(hours::text) <= 4000
    then hours
  end;

-- address and city refuse blank as well as excess, since a PATCH could
-- otherwise empty them; region and postal_code refuse blank through their
-- patterns. Null on these four stays possible until Test Kitchen is refilled.
alter table public.restaurants
  add constraint restaurants_name_length check (length(name) <= 120),
  add constraint restaurants_address_text
    check (btrim(address) <> '' and length(address) <= 200),
  add constraint restaurants_city_text
    check (btrim(city) <> '' and length(city) <= 100),
  add constraint restaurants_region_format check (region ~ '^[A-Z]{2}$'),
  add constraint restaurants_postal_code_format
    check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  add constraint restaurants_country_us check (country = 'US'),
  add constraint restaurants_phone_format check (phone ~ '^[0-9 ()+.-]{7,25}$'),
  add constraint restaurants_website_format
    check (website ~* '^https?://\S+$' and length(website) <= 500),
  add constraint restaurants_timezone_known check (timezone in (
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu')),
  add constraint restaurants_allergen_note_length
    check (length(allergen_note) <= 1000),
  add constraint restaurants_hours_object
    check (jsonb_typeof(hours) = 'object' and octet_length(hours::text) <= 4000);

-- 5. Owners update the columns this task writes, and nothing else (D-85,
-- D-88). Never id, code, slug, city_slug (D-87), country, status, plan, or
-- stripe_customer_id. enabled_languages and show_icons join the list in the
-- tasks that build them, with their own checks. service_role keeps every
-- column for the Stripe webhook.
revoke update on public.restaurants from authenticated;
grant update (name, address, city, region, postal_code, phone, website, hours,
  timezone, allergen_note, prep_notes) on public.restaurants to authenticated;

-- 6. create_restaurant(): the one way a restaurant comes to exist (D-75,
-- D-89). Runs as the table owner, so it can insert where owners have no
-- policy. Takes owner fields only; code, country, status, plan, and the
-- Stripe fields come from the function and the defaults. Optional fields
-- default to null so a call may leave them out. The caller becomes the first
-- member with role owner. Rows are never deleted (D-6), so a member holds at
-- most three restaurants that have not started a trial, counting only
-- memberships with role owner.
create function public.create_restaurant(
  p_name text,
  p_address text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_timezone text,
  p_phone text default null,
  p_website text default null,
  p_hours jsonb default null,
  p_allergen_note text default null,
  p_prep_notes public.prep_note[] default '{}'
) returns public.restaurants
language plpgsql volatile security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  unstarted integer;
  created public.restaurants;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  if coalesce(length(trim(p_name)), 0) = 0
     or coalesce(length(trim(p_address)), 0) = 0
     or coalesce(length(trim(p_city)), 0) = 0
     or coalesce(length(trim(p_region)), 0) = 0
     or coalesce(length(trim(p_postal_code)), 0) = 0
     or coalesce(length(trim(p_timezone)), 0) = 0 then
    raise exception 'missing_required' using errcode = 'P0001';
  end if;

  select count(*) into unstarted
  from public.restaurants r
  join public.owners o on o.restaurant_id = r.id
  where o.user_id = caller
    and o.role = 'owner'
    and r.stripe_customer_id is null;
  if unstarted >= 3 then
    raise exception 'restaurant_cap' using errcode = 'P0001';
  end if;

  -- Two calls at the same instant can draw the same code; the unique index
  -- catches it and the loser draws again.
  for attempt in 1..5 loop
    begin
      insert into public.restaurants (
        code, name, address, city, region, postal_code, phone, website, hours,
        timezone, allergen_note, prep_notes
      ) values (
        public.generate_menu_code(), trim(p_name), trim(p_address),
        trim(p_city), p_region, p_postal_code, p_phone, p_website, p_hours,
        p_timezone, p_allergen_note, coalesce(p_prep_notes, '{}')
      ) returning * into created;
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.owners (user_id, restaurant_id, role)
  values (caller, created.id, 'owner');

  return created;
end;
$$;
revoke all on function public.create_restaurant(
  text, text, text, text, text, text, text, text, jsonb, text,
  public.prep_note[]) from public, anon;
grant execute on function public.create_restaurant(
  text, text, text, text, text, text, text, text, jsonb, text,
  public.prep_note[]) to authenticated;
