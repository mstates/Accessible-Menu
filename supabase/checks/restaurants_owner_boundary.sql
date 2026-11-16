-- Owner boundary check for restaurants. Run in the Supabase SQL editor after
-- every migration that touches restaurants or adds a function: its first
-- block is the function-privilege check for the whole schema, and its
-- second the exact list of columns owners may write (migration two's eleven
-- and migration fifteen's show_icons, D-189). Everything rolls back. Replace
-- the uid below with your own auth.users id. A run that ends without an
-- error passed every check.
begin;

-- Every function in public is closed to the Data API roles unless a
-- migration opened it by name. PUBLIC holds execute on every new function
-- through Postgres's global default, and a per-schema default-privilege
-- revoke cannot remove it, so each migration revokes by name. Trigger and
-- event trigger functions cannot be called directly and are skipped; the
-- live database has rls_auto_enable, Supabase's event trigger function,
-- which no migration created. Anon runs one function, the restaurant's
-- name by code (migration 13), and nothing else.
do $$
declare
  open_to_anon text;
  open_to_authenticated text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into open_to_anon
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
    and p.proname <> 'restaurant_name_by_code'
    and has_function_privilege('anon', p.oid, 'execute');
  if open_to_anon is not null then
    raise exception 'FAIL: anon can run %', open_to_anon;
  end if;
  if not has_function_privilege('anon',
    'public.restaurant_name_by_code(text)', 'execute') then
    raise exception 'FAIL: anon cannot run restaurant_name_by_code';
  end if;
  if has_function_privilege('authenticated',
    'public.restaurant_name_by_code(text)', 'execute') then
    raise exception 'FAIL: authenticated can run restaurant_name_by_code';
  end if;

  select string_agg(p.proname, ', ' order by p.proname)
    into open_to_authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
    and p.proname not in ('create_restaurant', 'is_owner', 'owns_object',
      'set_menu_order', 'set_section_order', 'set_item_order',
      'section_dish_counts', 'delete_with_contents', 'move_section',
      'move_item', 'set_choice_list_order', 'set_choice_option_order',
      'menu_snapshot', 'publish_problems', 'menu_publish_states',
      'publish_menu', 'unpublish_menu', 'item_general',
      'save_item_general')
    and has_function_privilege('authenticated', p.oid, 'execute');
  if open_to_authenticated is not null then
    raise exception 'FAIL: authenticated can run %', open_to_authenticated;
  end if;

  raise notice 'ok: no function in public is open beyond create_restaurant, is_owner, owns_object, set_menu_order, set_section_order, set_item_order, section_dish_counts, delete_with_contents, move_section, move_item, set_choice_list_order, set_choice_option_order, menu_snapshot, publish_problems, menu_publish_states, publish_menu, unpublish_menu, item_general, and save_item_general, and anon runs restaurant_name_by_code alone';
end;
$$;

-- Owners write exactly the columns the migrations granted, and nothing
-- else: never id, code, slug, city_slug, country, status, plan, or
-- stripe_customer_id.
do $$
declare
  held text;
  expected text;
begin
  select string_agg(a.attname, ', ' order by a.attname) into held
  from pg_attribute a
  where a.attrelid = 'public.restaurants'::regclass
    and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.restaurants', a.attname,
      'update');
  expected := 'address, allergen_note, city, hours, name, phone, postal_code, prep_notes, region, show_icons, timezone, website';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of restaurants';
end;
$$;

-- The oldest restaurant, whatever its status, for the diner block below:
-- its code and name, and a copy of its status; the block closes it, so a
-- closed restaurant's name still comes back (Q-31). Everything rolls back.
do $$
declare
  target uuid;
  target_code text;
  target_name text;
begin
  select id, code, name into target, target_code, target_name
  from public.restaurants order by created_at limit 1;
  if target is null then
    raise exception 'FAIL: no restaurant to look up';
  end if;
  update public.restaurants set status = 'closed' where id = target;
  perform set_config('boundary.name_code', target_code, true);
  perform set_config('boundary.name_name', target_name, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',
  true);

do $$
declare
  target uuid;
begin
  select id into target from public.restaurants order by created_at limit 1;
  if target is null then
    raise exception 'FAIL: this user owns no restaurant';
  end if;

  begin
    update public.restaurants set status = 'active' where id = target;
    raise exception 'FAIL: an owner wrote status';
  exception when insufficient_privilege then
    raise notice 'ok: status is not writable';
  end;

  begin
    update public.restaurants set code = '12345678' where id = target;
    raise exception 'FAIL: an owner wrote code';
  exception when insufficient_privilege then
    raise notice 'ok: code is not writable';
  end;

  -- The icons toggle (migration 15, D-189): an owner's own column to write.
  update public.restaurants set show_icons = true where id = target;
  raise notice 'ok: an owner writes show_icons';

  begin
    update public.restaurants set website = 'javascript:alert(1)'
      where id = target;
    raise exception 'FAIL: a javascript website was accepted';
  exception when check_violation then
    raise notice 'ok: a website must be http or https';
  end;

  begin
    update public.restaurants set country = 'CA' where id = target;
    raise exception 'FAIL: country CA was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'ok: country stays US';
  end;

  begin
    update public.restaurants set timezone = 'Mars/Olympus_Mons'
      where id = target;
    raise exception 'FAIL: an unknown time zone was accepted';
  exception when check_violation then
    raise notice 'ok: the time zone must be in the list';
  end;

  begin
    update public.restaurants set timezone = null where id = target;
    raise exception 'FAIL: a null time zone was accepted';
  exception when not_null_violation then
    raise notice 'ok: the time zone cannot be null';
  end;

  begin
    update public.restaurants set address = '   ' where id = target;
    raise exception 'FAIL: a blank address was accepted';
  exception when check_violation then
    raise notice 'ok: the address cannot be blank';
  end;

  begin
    perform public.create_restaurant('   ', '1 Main Street', 'Reading', 'PA',
      '19601', 'America/New_York');
    raise exception 'FAIL: a blank name was accepted';
  exception when raise_exception then
    if sqlerrm <> 'missing_required' then raise; end if;
    raise notice 'ok: a blank name is refused';
  end;
end;
$$;

-- A Details save names the twelve values its page showed, in the write's
-- own statement, and lands only if the restaurant still holds all twelve
-- (D-237, rule 2). The block gives the restaurant values that are easy to
-- get wrong, reads them back the way the page receives them, and sends the
-- statement the app sends: by code, a value that is none as is null, every
-- other as equal, the hours as the column's own text, and a list as a
-- literal. Each compare that names something the row does not hold lands on
-- no row and rewrites nothing; the one that names what it holds lands on
-- one. Everything rolls back.
do $$
declare
  target uuid;
  target_code text;
  was public.restaurants;
  shown record;
  place tid;
  touched integer;
begin
  select id, code into target, target_code
  from public.restaurants order by created_at limit 1;
  select r.* into was from public.restaurants r where r.id = target;
  -- Outer spaces in a text, a note that is empty and not none, a phone and
  -- a website that are none, a list out of its enum's order, and hours no
  -- page wrote: keys out of order and a number past what a browser's JSON
  -- keeps.
  update public.restaurants set
    name = '  Boundary Diner  ', address = '1 Main Street', city = 'Reading',
    region = 'PA', postal_code = '19601', phone = null, website = null,
    hours = '{"zebra": [3, 2, 1], "big": 12345678901234567890, "apple": null}',
    timezone = 'America/Chicago', allergen_note = '',
    prep_notes = '{shared-kitchen,shared-fryer}', show_icons = false
  where id = target;
  select r.name, r.address, r.city, r.region, r.postal_code, r.phone,
    r.website, r.hours::text as hours_text, r.timezone, r.allergen_note,
    r.prep_notes::text as prep_notes_text, r.show_icons, r.ctid as place
  into shown from public.restaurants r where r.id = target;
  place := shown.place;
  if shown.hours_text not like '%12345678901234567890%' then
    raise exception 'FAIL: the hours did not read back with their number whole: %', shown.hours_text;
  end if;

  -- The note named as none when the row holds an empty one.
  update public.restaurants set allergen_note = 'Boundary note'
  where code = target_code
    and name = shown.name and address = shown.address and city = shown.city
    and region = shown.region and postal_code = shown.postal_code
    and phone is null and website is null
    and hours = shown.hours_text::jsonb and timezone = shown.timezone
    and allergen_note is null
    and prep_notes = shown.prep_notes_text::public.prep_note[]
    and show_icons = shown.show_icons;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a save naming no note landed on a restaurant whose note is empty';
  end if;

  -- The name named without its outer spaces.
  update public.restaurants set allergen_note = 'Boundary note'
  where code = target_code
    and name = btrim(shown.name) and address = shown.address
    and city = shown.city and region = shown.region
    and postal_code = shown.postal_code and phone is null and website is null
    and hours = shown.hours_text::jsonb and timezone = shown.timezone
    and allergen_note = shown.allergen_note
    and prep_notes = shown.prep_notes_text::public.prep_note[]
    and show_icons = shown.show_icons;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a save naming the name without its outer spaces landed';
  end if;

  -- The list named in its enum's order when the row holds another.
  update public.restaurants set allergen_note = 'Boundary note'
  where code = target_code
    and name = shown.name and address = shown.address and city = shown.city
    and region = shown.region and postal_code = shown.postal_code
    and phone is null and website is null
    and hours = shown.hours_text::jsonb and timezone = shown.timezone
    and allergen_note = shown.allergen_note
    and prep_notes = '{shared-fryer,shared-kitchen}'
    and show_icons = shown.show_icons;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a save naming the kitchen notes in another order landed';
  end if;

  -- The box named ticked when it is not.
  update public.restaurants set allergen_note = 'Boundary note'
  where code = target_code
    and name = shown.name and address = shown.address and city = shown.city
    and region = shown.region and postal_code = shown.postal_code
    and phone is null and website is null
    and hours = shown.hours_text::jsonb and timezone = shown.timezone
    and allergen_note = shown.allergen_note
    and prep_notes = shown.prep_notes_text::public.prep_note[]
    and show_icons = true;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a save naming the icons box as ticked landed';
  end if;

  -- The hours named with their number as a browser's JSON would keep it.
  update public.restaurants set allergen_note = 'Boundary note'
  where code = target_code
    and name = shown.name and address = shown.address and city = shown.city
    and region = shown.region and postal_code = shown.postal_code
    and phone is null and website is null
    and hours = '{"zebra": [3, 2, 1], "big": 12345678901234567000, "apple": null}'
    and timezone = shown.timezone
    and allergen_note = shown.allergen_note
    and prep_notes = shown.prep_notes_text::public.prep_note[]
    and show_icons = shown.show_icons;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a save naming the hours with a rounded number landed';
  end if;

  if (select r.ctid from public.restaurants r where r.id = target)
       is distinct from place
     or (select r.allergen_note from public.restaurants r where r.id = target)
       <> '' then
    raise exception 'FAIL: a refused Details save rewrote the restaurant';
  end if;
  raise notice 'ok: a Details save that names a value the restaurant does not hold lands on no row and rewrites nothing: an empty note named as none, a name without its outer spaces, a list in another order, the box, and hours with a rounded number';

  -- The twelve as the page received them.
  update public.restaurants set allergen_note = 'Boundary note'
  where code = target_code
    and name = shown.name and address = shown.address and city = shown.city
    and region = shown.region and postal_code = shown.postal_code
    and phone is null and website is null
    and hours = shown.hours_text::jsonb and timezone = shown.timezone
    and allergen_note = shown.allergen_note
    and prep_notes = shown.prep_notes_text::public.prep_note[]
    and show_icons = shown.show_icons;
  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception 'FAIL: a save naming the twelve values the restaurant holds landed on % rows', touched;
  end if;
  raise notice 'ok: the same save naming the twelve values as they were read lands on one row: the hours by their own text, a note that is empty, a phone and a website that are none';

  -- As it was, for the blocks below, which read the restaurant's name.
  update public.restaurants set
    name = was.name, address = was.address, city = was.city,
    region = was.region, postal_code = was.postal_code, phone = was.phone,
    website = was.website, hours = was.hours, timezone = was.timezone,
    allergen_note = was.allergen_note, prep_notes = was.prep_notes,
    show_icons = was.show_icons
  where id = target;
end;
$$;

-- A stranger touches nothing. This also stands in for the cross-owner 404,
-- which would otherwise need a second user in the browser.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  touched integer;
begin
  update public.restaurants set name = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % rows', touched;
  end if;
  raise notice 'ok: a stranger updates zero rows';
end;
$$;

-- A diner (migration 13, Q-84, Q-31): the name behind a code comes back
-- for a closed restaurant too, one row with the name alone; an unknown
-- code gives no row; the table itself stays closed, so anon cannot list;
-- and the closed restaurant is not in published_restaurants.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  target_code text := current_setting('boundary.name_code');
  target_name text := current_setting('boundary.name_name');
  found text;
  rows integer;
begin
  select f.name into found
  from public.restaurant_name_by_code(target_code) f;
  if found is distinct from target_name then
    raise exception 'FAIL: the name behind code % read % (expected %)',
      target_code, found, target_name;
  end if;
  raise notice 'ok: anon reads the name behind a code, closed or not';

  select count(*) into rows
  from public.restaurant_name_by_code(target_code) f;
  if rows <> 1 then
    raise exception 'FAIL: the lookup returned % rows for one code', rows;
  end if;
  select count(*) into rows from public.restaurant_name_by_code('00000000') f;
  if rows <> 0 then
    raise exception 'FAIL: an unknown code returned % rows', rows;
  end if;
  raise notice 'ok: one row for a code, none for an unknown code';

  begin
    perform 1 from public.restaurants limit 1;
    raise exception 'FAIL: anon read the restaurants table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot list restaurants';
  end;

  -- The diner page reads the icons setting through the view (D-189).
  perform pr.show_icons from public.published_restaurants pr limit 1;
  raise notice 'ok: anon reads show_icons through published_restaurants';

  if exists (
    select 1 from public.published_restaurants pr where pr.code = target_code
  ) then
    raise exception 'FAIL: a closed restaurant is in published_restaurants';
  end if;
  raise notice 'ok: a closed restaurant is not in published_restaurants';
end;
$$;

rollback;
