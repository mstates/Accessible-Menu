-- Owner boundary check for a dish's General save (migration 16):
-- item_general(), the reader, and save_item_general(), the writer. Run in
-- the Supabase SQL editor after the restaurants script, which lists both
-- functions among the ones authenticated may run. Everything rolls back.
-- Replace the uid below with your own auth.users id. A run that ends
-- without an error passed every check.
begin;

-- The one line to change. The script makes this user a member of a
-- restaurant it creates here, and then acts as this user.
select set_config('boundary.uid',
  '00000000-0000-0000-0000-000000000000', true);

-- As the table owner: who may run the two functions, and the ground the
-- later blocks stand on. The script builds its own restaurants, so it
-- writes nothing into a real menu.
do $$
declare
  uid uuid := current_setting('boundary.uid')::uuid;
  open_wide integer;
  definers integer;
  a uuid;
  c uuid;
  a_menu uuid;
  c_menu uuid;
  a_section uuid;
  c_section uuid;
  a_dish uuid;
  a_other uuid;
  a_lock uuid;
  c_dish uuid;
  cup uuid;
  bowl uuid;
  blank uuid;
  gone uuid;
  other_size uuid;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;

  -- The compare inside the writer is made for read committed, the level
  -- every request through the Data API runs at. This run means what it
  -- says only at that level.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'FAIL: this session is at %, not read committed',
      current_setting('transaction_isolation');
  end if;
  raise notice 'ok: the session is at read committed';

  -- 1. Both functions are closed to anon and to PUBLIC by name, open to
  -- authenticated, and run as the caller.
  if has_function_privilege('anon', 'public.item_general(uuid)', 'execute')
     or has_function_privilege('anon',
       'public.save_item_general(uuid, jsonb, jsonb)', 'execute') then
    raise exception 'FAIL: anon can run a General function';
  end if;
  select count(*) into open_wide
  from pg_proc p
  where p.oid in ('public.item_general(uuid)'::regprocedure,
      'public.save_item_general(uuid, jsonb, jsonb)'::regprocedure)
    and (p.proacl is null or exists (
      select 1 from aclexplode(p.proacl) held where held.grantee = 0));
  if open_wide <> 0 then
    raise exception 'FAIL: PUBLIC holds execute on % General function(s)',
      open_wide;
  end if;
  if not has_function_privilege('authenticated',
       'public.item_general(uuid)', 'execute')
     or not has_function_privilege('authenticated',
       'public.save_item_general(uuid, jsonb, jsonb)', 'execute') then
    raise exception 'FAIL: authenticated cannot run a General function';
  end if;
  select count(*) into definers
  from pg_proc p
  where p.oid in ('public.item_general(uuid)'::regprocedure,
      'public.save_item_general(uuid, jsonb, jsonb)'::regprocedure)
    and p.prosecdef;
  if definers <> 0 then
    raise exception 'FAIL: % General function(s) run as a definer', definers;
  end if;
  raise notice 'ok: item_general and save_item_general are revoked from public and anon by name, open to authenticated, and run as the caller';

  -- The ground. A has this user as a member, C has nobody here. One
  -- restaurant per statement, so two codes are never drawn together.
  insert into public.restaurants (code, name)
  values (public.generate_menu_code(), 'Boundary general A') returning id into a;
  insert into public.restaurants (code, name)
  values (public.generate_menu_code(), 'Boundary general C') returning id into c;
  insert into public.owners (user_id, restaurant_id, role)
  values (uid, a, 'owner');

  insert into public.menus (restaurant_id, name, sort)
  values (a, 'Boundary general menu', 1) returning id into a_menu;
  insert into public.menus (restaurant_id, name, sort)
  values (c, 'Boundary general menu', 1) returning id into c_menu;
  insert into public.sections (menu_id, name, sort)
  values (a_menu, 'Boundary general section', 1) returning id into a_section;
  insert into public.sections (menu_id, name, sort)
  values (c_menu, 'Boundary general C section', 1) returning id into c_section;

  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary general dish', 1) returning id into a_dish;
  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary general other', 2) returning id into a_other;
  -- A dish nothing else in this script touches, for the lock's own check.
  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary general lock', 3) returning id into a_lock;
  insert into public.items (section_id, name, sort)
  values (c_section, 'Boundary general C dish', 1) returning id into c_dish;

  -- The dish's sizes: Bowl before Cup, so price order is not the order
  -- added; a blank one, as an older draft may hold; and one marked
  -- removed.
  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Bowl', 800) returning id into bowl;
  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Cup', 500) returning id into cup;
  update public.item_sizes set calories_low = 180 where id = cup;
  insert into public.item_sizes (item_id) values (a_dish) returning id into blank;
  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Gone', 300) returning id into gone;
  update public.item_sizes set deleted_at = now() where id = gone;
  insert into public.item_sizes (item_id, name, price_cents)
  values (a_other, 'Other', 100) returning id into other_size;

  perform set_config('boundary.a_menu', a_menu::text, true);
  perform set_config('boundary.a_section', a_section::text, true);
  perform set_config('boundary.a_dish', a_dish::text, true);
  perform set_config('boundary.a_lock', a_lock::text, true);
  perform set_config('boundary.c_dish', c_dish::text, true);
  perform set_config('boundary.cup', cup::text, true);
  perform set_config('boundary.bowl', bowl::text, true);
  perform set_config('boundary.blank', blank::text, true);
  perform set_config('boundary.other_size', other_size::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
    current_setting('boundary.uid')), true);

-- As this user, a member of A and not of C.
do $$
declare
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  c_dish uuid := current_setting('boundary.c_dish')::uuid;
  cup uuid := current_setting('boundary.cup')::uuid;
  bowl uuid := current_setting('boundary.bowl')::uuid;
  blank uuid := current_setting('boundary.blank')::uuid;
  other_size uuid := current_setting('boundary.other_size')::uuid;
  pint uuid;
  half uuid;
  new_pint uuid;
  shown jsonb;
  next jsonb;
  expected jsonb;
  bad jsonb;
  held record;
  dish_place text;
  dish_made text;
  size_places text;
  total integer;
begin
  -- 2. The reader: the six fields and the sizes that are not removed, in
  -- price order, a size with no price last.
  shown := public.item_general(a_dish);
  expected := jsonb_build_object(
    'description', null, 'note', null, 'price_kind', 'one',
    'price_cents', null, 'calories_low', null, 'calories_high', null,
    'sizes', jsonb_build_array(
      jsonb_build_object('id', cup, 'name', 'Cup', 'price_cents', 500,
        'calories_low', 180, 'calories_high', null),
      jsonb_build_object('id', bowl, 'name', 'Bowl', 'price_cents', 800,
        'calories_low', null, 'calories_high', null),
      jsonb_build_object('id', blank, 'name', null, 'price_cents', null,
        'calories_low', null, 'calories_high', null)));
  if shown is distinct from expected then
    raise exception 'FAIL: the reader returned %', shown;
  end if;
  if public.item_general(c_dish) is not null then
    raise exception 'FAIL: the reader returned a dish of a restaurant this user is not in';
  end if;
  raise notice 'ok: the reader returns the six fields and the live sizes in price order, a size with no price last, a removed size left out, and nothing of a dish the caller cannot read';

  -- 3. A save lands whole: the dish's fields, a renamed size, a repriced
  -- size with calories, a size the page no longer holds, and two new
  -- sizes, one with calories.
  next := jsonb_build_object(
    'description', 'Boundary description', 'note', 'Boundary note',
    'price_kind', 'sizes', 'price_cents', 1200,
    'calories_low', 300, 'calories_high', 340,
    'sizes', jsonb_build_array(
      jsonb_build_object('id', cup, 'name', 'Mug', 'price_cents', 500,
        'calories_low', 180, 'calories_high', null),
      jsonb_build_object('id', bowl, 'name', 'Bowl', 'price_cents', 900,
        'calories_low', 290, 'calories_high', 310),
      jsonb_build_object('id', null, 'name', 'Pint', 'price_cents', 700,
        'calories_low', 200, 'calories_high', 250),
      jsonb_build_object('id', null, 'name', 'Half', 'price_cents', 400,
        'calories_low', null, 'calories_high', null)));
  perform public.save_item_general(a_dish, shown, next);
  select z.id into pint from public.item_sizes z
  where z.item_id = a_dish and z.name = 'Pint' and z.deleted_at is null;
  select z.id into half from public.item_sizes z
  where z.item_id = a_dish and z.name = 'Half' and z.deleted_at is null;
  expected := jsonb_build_object(
    'description', 'Boundary description', 'note', 'Boundary note',
    'price_kind', 'sizes', 'price_cents', 1200,
    'calories_low', 300, 'calories_high', 340,
    'sizes', jsonb_build_array(
      jsonb_build_object('id', half, 'name', 'Half', 'price_cents', 400,
        'calories_low', null, 'calories_high', null),
      jsonb_build_object('id', cup, 'name', 'Mug', 'price_cents', 500,
        'calories_low', 180, 'calories_high', null),
      jsonb_build_object('id', pint, 'name', 'Pint', 'price_cents', 700,
        'calories_low', 200, 'calories_high', 250),
      jsonb_build_object('id', bowl, 'name', 'Bowl', 'price_cents', 900,
        'calories_low', 290, 'calories_high', 310)));
  if pint is null or half is null
     or public.item_general(a_dish) is distinct from expected then
    raise exception 'FAIL: a save did not land whole: %',
      public.item_general(a_dish);
  end if;
  if not exists (
    select 1 from public.item_sizes z
    where z.id = blank and z.deleted_at is not null
  ) then
    raise exception 'FAIL: a size the page no longer holds was not marked removed, or its row is gone';
  end if;
  raise notice 'ok: a save lands whole: the fields, a rename, a new price with calories, two new sizes, and a size the page no longer holds marked removed with its row kept';

  -- A save with nothing changed writes nothing: no row of the dish or of
  -- its sizes is written again.
  shown := public.item_general(a_dish);
  select i.ctid::text, i.xmin::text into dish_place, dish_made
  from public.items i where i.id = a_dish;
  select string_agg(z.ctid::text, ' ' order by z.id), count(*)
    into size_places, total
  from public.item_sizes z where z.item_id = a_dish;
  perform public.save_item_general(a_dish, shown, shown);
  select i.ctid::text as place, i.xmin::text as made into held
  from public.items i where i.id = a_dish;
  if held.place is distinct from dish_place
     or held.made is distinct from dish_made
     or (select string_agg(z.ctid::text, ' ' order by z.id)
         from public.item_sizes z where z.item_id = a_dish)
       is distinct from size_places
     or (select count(*) from public.item_sizes z where z.item_id = a_dish)
       <> total
     or public.item_general(a_dish) is distinct from shown then
    raise exception 'FAIL: a save with nothing changed wrote a row';
  end if;
  raise notice 'ok: a save with nothing changed writes nothing';

  -- 4. Two sizes trade names in one save, and a new size takes the name
  -- of a size the same save removes.
  select jsonb_set(shown, '{sizes}', (
    select jsonb_agg(case
      when t.size ->> 'id' = cup::text then jsonb_set(t.size, '{name}', '"Bowl"')
      when t.size ->> 'id' = bowl::text then jsonb_set(t.size, '{name}', '"Mug"')
      else t.size end order by t.place)
    from jsonb_array_elements(shown -> 'sizes')
      with ordinality as t(size, place))) into next;
  perform public.save_item_general(a_dish, shown, next);
  if (select z.name from public.item_sizes z where z.id = cup) <> 'Bowl'
     or (select z.name from public.item_sizes z where z.id = bowl) <> 'Mug' then
    raise exception 'FAIL: two sizes did not trade names';
  end if;

  shown := public.item_general(a_dish);
  select jsonb_set(shown, '{sizes}', (
    select jsonb_agg(t.size order by t.place)
    from jsonb_array_elements(shown -> 'sizes')
      with ordinality as t(size, place)
    where t.size ->> 'id' <> pint::text)
    || jsonb_build_array(jsonb_build_object('id', null, 'name', 'Pint',
      'price_cents', 750, 'calories_low', null, 'calories_high', null)))
    into next;
  perform public.save_item_general(a_dish, shown, next);
  select z.id into new_pint from public.item_sizes z
  where z.item_id = a_dish and z.name = 'Pint' and z.deleted_at is null;
  if new_pint is null or new_pint = pint
     or (select z.price_cents from public.item_sizes z where z.id = new_pint)
       <> 750
     or not exists (
       select 1 from public.item_sizes z
       where z.id = pint and z.deleted_at is not null) then
    raise exception 'FAIL: a new size did not take the name of a size removed in the same save';
  end if;
  raise notice 'ok: two sizes trade names in one save, and a new size takes the name of a size the same save removes';

  -- 5. A save that breaks a rule in its second half writes nothing: the
  -- description is written first, then a size breaks the names index or
  -- the name rule, and the description is as it was.
  shown := public.item_general(a_dish);
  next := jsonb_set(shown, '{description}', '"Changed first"')
    || jsonb_build_object('sizes', (shown -> 'sizes')
      || jsonb_build_array(jsonb_build_object('id', null, 'name', 'MUG',
        'price_cents', 100, 'calories_low', null, 'calories_high', null)));
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save with a size name in use landed';
  exception when unique_violation then
    null;
  end;
  if public.item_general(a_dish) is distinct from shown then
    raise exception 'FAIL: a save refused by the names index wrote something: %',
      public.item_general(a_dish);
  end if;
  next := jsonb_set(shown, '{description}', '"Changed first"')
    || jsonb_build_object('sizes', (shown -> 'sizes')
      || jsonb_build_array(jsonb_build_object('id', null,
        'name', repeat('x', 41), 'price_cents', 100,
        'calories_low', null, 'calories_high', null)));
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save with a 41 character size name landed';
  exception when check_violation then
    null;
  end;
  if public.item_general(a_dish) is distinct from shown then
    raise exception 'FAIL: a save refused by the name rule wrote something';
  end if;
  raise notice 'ok: a save that breaks a rule in its second half, a size name in use or one too long after a changed description, writes nothing';

  -- 6. A save against a moved dish writes nothing: the note changed under
  -- the page, then a size's price.
  next := jsonb_set(shown, '{description}', '"From a page that is behind"');
  update public.items set note = 'Moved under the page' where id = a_dish;
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save against a moved dish landed';
  exception when raise_exception then
    if sqlerrm <> 'general_moved' then raise; end if;
  end;
  if (public.item_general(a_dish) ->> 'description') <> 'Boundary description'
     or (public.item_general(a_dish) ->> 'note') <> 'Moved under the page' then
    raise exception 'FAIL: a save refused as moved wrote something';
  end if;

  shown := public.item_general(a_dish);
  next := jsonb_set(shown, '{description}', '"From a page that is behind"');
  update public.item_sizes set price_cents = 950 where id = bowl;
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save against moved sizes landed';
  exception when raise_exception then
    if sqlerrm <> 'general_moved' then raise; end if;
  end;
  if (public.item_general(a_dish) ->> 'description') <> 'Boundary description' then
    raise exception 'FAIL: a save refused for moved sizes wrote something';
  end if;
  raise notice 'ok: a save against a moved dish, its note or a size''s price changed under the page, is refused as general_moved and writes nothing';

  -- 7. What must not refuse a General save: the fields other pages write.
  -- The name, a sold-out mark, availability, the tags, the allergen
  -- lists, and the place in the section change under the page, and the
  -- save still lands.
  shown := public.item_general(a_dish);
  update public.items set name = 'Boundary general renamed', sold_out_at = now()
  where id = a_dish;
  update public.items
  set sold_out_at = null, available = false, dietary_tags = '{vegan}',
      allergens = '{milk}', custom_allergens = '{celery}', sort = 7
  where id = a_dish;
  next := jsonb_set(shown, '{note}', '"Saved over other pages"');
  perform public.save_item_general(a_dish, shown, next);
  select i.name, i.note, i.available, i.dietary_tags::text as tags,
    i.allergens::text as majors, i.sort
    into held
  from public.items i where i.id = a_dish;
  if held.note <> 'Saved over other pages'
     or held.name <> 'Boundary general renamed' or held.available
     or held.tags <> '{vegan}' or held.majors <> '{milk}' or held.sort <> 7 then
    raise exception 'FAIL: a General save was refused by, or wrote over, another page''s fields';
  end if;
  raise notice 'ok: a rename, a sold-out mark, availability, tags, allergen lists, and a new place never refuse a General save, and it leaves them as they are';

  -- 8. Gone: the dish marked removed, then its section, then its menu.
  shown := public.item_general(a_dish);
  next := jsonb_set(shown, '{note}', '"To a dish that is gone"');
  update public.items set deleted_at = now() where id = a_dish;
  if public.item_general(a_dish) is not null then
    raise exception 'FAIL: the reader returned a removed dish';
  end if;
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save to a removed dish landed';
  exception when raise_exception then
    if sqlerrm <> 'general_not_found' then raise; end if;
  end;
  update public.items set deleted_at = null where id = a_dish;

  update public.sections set deleted_at = now() where id = a_section;
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save to a dish of a removed section landed';
  exception when raise_exception then
    if sqlerrm <> 'general_not_found' then raise; end if;
  end;
  update public.sections set deleted_at = null where id = a_section;

  update public.menus set deleted_at = now() where id = a_menu;
  begin
    perform public.save_item_general(a_dish, shown, next);
    raise exception 'FAIL: a save to a dish of a removed menu landed';
  exception when raise_exception then
    if sqlerrm <> 'general_not_found' then raise; end if;
  end;
  update public.menus set deleted_at = null where id = a_menu;

  begin
    perform public.save_item_general(c_dish, shown, next);
    raise exception 'FAIL: a save to another restaurant''s dish landed';
  exception when raise_exception then
    if sqlerrm <> 'general_not_found' then raise; end if;
  end;
  if public.item_general(a_dish) is distinct from shown then
    raise exception 'FAIL: a save refused as not found wrote something';
  end if;
  raise notice 'ok: a dish that is removed, or whose section or menu is, or that is another restaurant''s, is refused as general_not_found with nothing written, and the reader returns nothing for a removed dish';

  -- 9. Malformed: what to write is not the document. A key missing, sizes
  -- that are not a list, another dish's size, a size with a key missing,
  -- and a field of the wrong kind.
  foreach bad in array array[
    next - 'note',
    jsonb_set(next, '{sizes}', '{}'),
    next || jsonb_build_object('sizes', (next -> 'sizes')
      || jsonb_build_array(jsonb_build_object('id', other_size,
        'name', 'Other', 'price_cents', 100,
        'calories_low', null, 'calories_high', null))),
    jsonb_set(next, '{sizes,0}', (next -> 'sizes' -> 0) - 'price_cents'),
    jsonb_set(next, '{description}', '12')
  ] loop
    begin
      perform public.save_item_general(a_dish, shown, bad);
      raise exception 'FAIL: a malformed save landed: %', bad;
    exception when raise_exception then
      if sqlerrm <> 'general_malformed' then raise; end if;
    end;
  end loop;
  if public.item_general(a_dish) is distinct from shown then
    raise exception 'FAIL: a malformed save wrote something';
  end if;
  raise notice 'ok: a missing key, sizes that are not a list, another dish''s size, a size with a key missing, and a field of the wrong kind are refused as general_malformed with nothing written';

  perform set_config('boundary.doc', shown::text, true);
end;
$$;

-- 10. The lock is taken. A dish nothing above touched has no lock mark on
-- its row; after a save with nothing changed its row carries one, and the
-- row itself was not written again. No exception clause anywhere in this
-- block, so the mark is this transaction's own.
do $$
declare
  a_lock uuid := current_setting('boundary.a_lock')::uuid;
  was record;
  now_is record;
begin
  select i.xmax::text as locked, i.xmin::text as made, i.ctid::text as place
    into was
  from public.items i where i.id = a_lock;
  if was.locked <> '0' then
    raise exception 'FAIL: the lock dish was touched before its check (xmax %)',
      was.locked;
  end if;
  perform public.save_item_general(a_lock, public.item_general(a_lock),
    public.item_general(a_lock));
  select i.xmax::text as locked, i.xmin::text as made, i.ctid::text as place
    into now_is
  from public.items i where i.id = a_lock;
  if now_is.locked = '0' then
    raise exception 'FAIL: a save left no lock on the dish''s row';
  end if;
  if now_is.made <> was.made or now_is.place <> was.place then
    raise exception 'FAIL: a save with nothing changed wrote the dish''s row';
  end if;
  raise notice 'ok: a save locks the dish''s row, and with nothing changed leaves the row itself as it was';
end;
$$;

-- 11. A stranger: the dish reads as not there.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  doc jsonb := current_setting('boundary.doc')::jsonb;
begin
  if public.item_general(a_dish) is not null then
    raise exception 'FAIL: a stranger read a dish''s General fields';
  end if;
  begin
    perform public.save_item_general(a_dish, doc,
      jsonb_set(doc, '{note}', '"Hijacked"'));
    raise exception 'FAIL: a stranger saved a dish''s General fields';
  exception when raise_exception then
    if sqlerrm <> 'general_not_found' then raise; end if;
  end;
  raise notice 'ok: to a stranger the dish reads as not there, and a save is refused as general_not_found';
end;
$$;

-- As the table owner again: the stranger changed nothing.
reset role;

do $$
declare
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
begin
  if public.item_general(a_dish)
     is distinct from current_setting('boundary.doc')::jsonb then
    raise exception 'FAIL: the dish changed under a stranger';
  end if;
  raise notice 'ok: the dish is as the owner left it';
end;
$$;

-- 12. A diner: neither function runs.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform public.item_general(gen_random_uuid());
    raise exception 'FAIL: anon ran item_general';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run item_general';
  end;
  begin
    perform public.save_item_general(gen_random_uuid(), '{}', '{}');
    raise exception 'FAIL: anon ran save_item_general';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run save_item_general';
  end;
end;
$$;

rollback;
