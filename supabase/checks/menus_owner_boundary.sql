-- Owner boundary check for menus. Run in the Supabase SQL editor after every
-- migration that touches menus. Everything rolls back. Replace the uid below
-- with your own auth.users id. A run that ends without an error passed
-- every check.
begin;

-- As the table owner: what no role may do, and what the Data API roles hold.
do $$
declare
  target uuid;
  held text;
  expected text;
begin
  select id into target from public.restaurants order by created_at limit 1;
  if target is null then
    raise exception 'FAIL: there is no restaurant to check against';
  end if;

  -- Nothing can publish until the Publish task, for any role (D-82).
  begin
    insert into public.menus (restaurant_id, name, published)
    values (target, 'Boundary check published', true);
    raise exception 'FAIL: the table owner published a menu';
  exception when check_violation then
    raise notice 'ok: no role can publish a menu';
  end;

  -- anon holds nothing on the tables drafts live in.
  select string_agg(t, ', ' order by t) into held
  from unnest(array['menus', 'sections', 'items']) as t
  where has_any_column_privilege('anon', format('public.%I', t),
    'select, insert, update, references')
    or has_table_privilege('anon', format('public.%I', t),
      'select, insert, update, delete, truncate, references, trigger');
  if held is not null then
    raise exception 'FAIL: anon holds a privilege on %', held;
  end if;
  raise notice 'ok: anon holds nothing on menus, sections, or items';

  -- authenticated holds the column lists and no table-wide write.
  if has_table_privilege('authenticated', 'public.menus',
    'insert, update, delete, truncate') then
    raise exception 'FAIL: authenticated holds a table-wide write on menus';
  end if;

  select string_agg(a.attname, ', ' order by a.attname) into held
  from pg_attribute a
  where a.attrelid = 'public.menus'::regclass
    and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.menus', a.attname,
      'insert');
  expected := 'name, restaurant_id, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated inserts %, expected %', held, expected;
  end if;

  select string_agg(a.attname, ', ' order by a.attname) into held
  from pg_attribute a
  where a.attrelid = 'public.menus'::regclass
    and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.menus', a.attname,
      'update');
  expected := 'deleted_at, name, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of menus';

  -- Realtime would hand rows to subscribers outside the views.
  select string_agg(p.tablename, ', ' order by p.tablename) into held
  from pg_publication_tables p
  where p.pubname = 'supabase_realtime' and p.schemaname = 'public';
  if held is not null then
    raise exception 'FAIL: realtime publishes %', held;
  end if;
  raise notice 'ok: no table in public is in the realtime publication';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',
  true);

do $$
declare
  target uuid;
  one uuid;
  two uuid;
  three uuid;
  ids uuid[];
  flipped uuid[];
  n integer;
  in_place boolean;
begin
  select id into target from public.restaurants order by created_at limit 1;
  if target is null then
    raise exception 'FAIL: this user owns no restaurant';
  end if;
  perform set_config('boundary.restaurant', target::text, true);

  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check one', 9001) returning id into one;
  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check two', 9002) returning id into two;
  if (select published from public.menus where id = one) then
    raise exception 'FAIL: a new menu is published';
  end if;
  raise notice 'ok: an owner adds a menu with the three columns, unpublished';

  begin
    insert into public.menus (restaurant_id, name, published)
    values (target, 'Boundary check three', true);
    raise exception 'FAIL: an owner inserted a published menu';
  exception when insufficient_privilege then
    raise notice 'ok: published is not writable on insert';
  end;

  begin
    update public.menus set published = true where id = one;
    raise exception 'FAIL: an owner wrote published';
  exception when insufficient_privilege then
    raise notice 'ok: published is not writable';
  end;

  begin
    update public.menus set published_at = now() where id = one;
    raise exception 'FAIL: an owner wrote published_at';
  exception when insufficient_privilege then
    raise notice 'ok: published_at is not writable';
  end;

  begin
    update public.menus set source = 'import' where id = one;
    raise exception 'FAIL: an owner wrote source';
  exception when insufficient_privilege then
    raise notice 'ok: source is not writable';
  end;

  begin
    update public.menus set restaurant_id = target where id = one;
    raise exception 'FAIL: an owner wrote restaurant_id';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable after insert';
  end;

  begin
    delete from public.menus where id = two;
    raise exception 'FAIL: an owner deleted a menu for good';
  exception when insufficient_privilege then
    raise notice 'ok: an owner cannot delete a menu for good';
  end;

  begin
    update public.menus set name = '   ' where id = one;
    raise exception 'FAIL: a blank name was accepted';
  exception when check_violation then
    raise notice 'ok: a name cannot be blank';
  end;

  begin
    update public.menus set name = chr(9) where id = one;
    raise exception 'FAIL: a lone tab was accepted as a name';
  exception when check_violation then
    raise notice 'ok: a lone tab is not a name';
  end;

  begin
    update public.menus set name = repeat('x', 61) where id = one;
    raise exception 'FAIL: a 61 character name was accepted';
  exception when check_violation then
    raise notice 'ok: a name is sixty characters at most';
  end;

  begin
    insert into public.menus (restaurant_id, name, sort)
    values (target, ' boundary CHECK one ', 9003);
    raise exception 'FAIL: a second menu took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on insert, any case or spacing';
  end;

  begin
    update public.menus set name = 'BOUNDARY CHECK ONE' where id = two;
    raise exception 'FAIL: a rename took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on rename';
  end;

  update public.menus set deleted_at = now() where id = one;
  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check one', 9003) returning id into three;
  raise notice 'ok: a deleted menu frees its name';

  begin
    update public.menus set deleted_at = null where id = one;
    raise exception 'FAIL: a menu came back under a name in use';
  exception when unique_violation then
    raise notice 'ok: a menu cannot come back while its name is in use';
  end;

  update public.menus set name = 'Boundary check three' where id = three;
  update public.menus set deleted_at = null where id = one;
  raise notice 'ok: deleted_at sets and clears';

  select array_agg(m.id order by m.sort, m.created_at, m.id) into ids
  from public.menus m
  where m.restaurant_id = target and m.deleted_at is null;
  n := cardinality(ids);

  begin
    perform public.set_menu_order(target, ids[1:n - 1]);
    raise exception 'FAIL: a short list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that misses a menu is refused';
  end;

  begin
    perform public.set_menu_order(target, ids[1:n - 1] || ids[1]);
    raise exception 'FAIL: a repeated id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a repeated id is refused';
  end;

  begin
    perform public.set_menu_order(target, array[ids]);
    raise exception 'FAIL: a nested list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a nested list holding the right ids is refused';
  end;

  select array_agg(t.id order by t.ord desc) into flipped
  from unnest(ids) with ordinality as t (id, ord);
  perform public.set_menu_order(target, flipped);
  select bool_and(m.sort = t.ord) into in_place
  from unnest(flipped) with ordinality as t (id, ord)
  join public.menus m on m.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: set_menu_order did not write the order it was given';
  end if;
  raise notice 'ok: the right list is written as 1 to %', n;
end;
$$;

-- A stranger reads, writes, and orders nothing.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  target uuid := current_setting('boundary.restaurant')::uuid;
  seen integer;
  touched integer;
begin
  select count(*) into seen from public.menus;
  if seen <> 0 then
    raise exception 'FAIL: a stranger read % menus', seen;
  end if;

  update public.menus set name = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % menus', touched;
  end if;

  begin
    insert into public.menus (restaurant_id, name, sort)
    values (target, 'Boundary check stranger', 9009);
    raise exception 'FAIL: a stranger added a menu';
  exception when insufficient_privilege then
    raise notice 'ok: a stranger cannot add a menu';
  end;

  begin
    perform public.set_menu_order(target, array[gen_random_uuid()]);
    raise exception 'FAIL: a stranger ordered menus';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a stranger orders nothing';
  end;

  raise notice 'ok: a stranger reads and updates zero menus';
end;
$$;

-- A diner: the tables are closed and the views are empty.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  shown integer;
begin
  begin
    perform 1 from public.menus limit 1;
    raise exception 'FAIL: anon read the menus table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the menus table';
  end;

  select (select count(*) from public.published_menus)
    + (select count(*) from public.published_sections)
    + (select count(*) from public.published_items) into shown;
  if shown <> 0 then
    raise exception 'FAIL: the published views show % rows', shown;
  end if;
  raise notice 'ok: the published views show no menus, sections, or items';
end;
$$;

rollback;
