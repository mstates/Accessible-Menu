-- Owner boundary check for item_sizes, the sizes of a dish (migration 6).
-- Run in the Supabase SQL editor after every migration that touches sizes,
-- after the restaurants script and the items script. Everything rolls back.
-- Replace the uid below with your own auth.users id. A run that ends
-- without an error passed every check.
begin;

-- The one line to change. The script makes this user a member of two
-- restaurants it creates here, and then acts as this user.
select set_config('boundary.uid',
  '00000000-0000-0000-0000-000000000000', true);

-- As the table owner: what the Data API roles hold, and the ground the
-- later blocks stand on. The script builds its own restaurants, so it
-- proves the two-restaurant case whatever this user owns, and it writes
-- nothing into a real menu.
do $$
declare
  uid uuid := current_setting('boundary.uid')::uuid;
  held text;
  expected text;
  a uuid;
  b uuid;
  c uuid;
  a_menu uuid;
  b_menu uuid;
  c_menu uuid;
  a_section uuid;
  b_section uuid;
  c_section uuid;
  a_dish uuid;
  a_twin uuid;
  b_dish uuid;
  c_dish uuid;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;

  -- anon holds nothing on the table.
  if has_any_column_privilege('anon', 'public.item_sizes',
       'select, insert, update, references')
     or has_table_privilege('anon', 'public.item_sizes',
       'select, insert, update, delete, truncate, references, trigger') then
    raise exception 'FAIL: anon holds a privilege on item_sizes';
  end if;
  raise notice 'ok: anon holds nothing on item_sizes';

  -- authenticated reads, and holds the column lists and no table-wide
  -- write.
  if not has_table_privilege('authenticated', 'public.item_sizes', 'select') then
    raise exception 'FAIL: authenticated cannot read item_sizes';
  end if;
  if has_table_privilege('authenticated', 'public.item_sizes',
    'insert, update, delete, truncate') then
    raise exception 'FAIL: authenticated holds a table-wide write on item_sizes';
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.item_sizes'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.item_sizes', att.attname,
      'insert');
  expected := 'item_id, name, price_cents';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated inserts %, expected %', held, expected;
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.item_sizes'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.item_sizes', att.attname,
      'update');
  expected := 'deleted_at, name, price_cents';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of item_sizes';

  -- service_role keeps every column for server code.
  if not has_table_privilege('service_role', 'public.item_sizes',
    'select, insert, update, delete') then
    raise exception 'FAIL: service_role lacks a privilege on item_sizes';
  end if;
  raise notice 'ok: service_role reads and writes item_sizes';

  -- A size's restaurant is its dish's restaurant, for every row.
  if exists (
    select 1 from public.item_sizes z
    join public.items i on i.id = z.item_id
    where z.restaurant_id is distinct from i.restaurant_id
  ) then
    raise exception 'FAIL: a size disagrees with its dish about the restaurant';
  end if;
  raise notice 'ok: every size has its dish''s restaurant';

  -- The ground. A and B have this user as a member, C has nobody here. One
  -- restaurant per statement, so two codes are never drawn together.
  insert into public.restaurants (code, name)
  values (public.generate_menu_code(), 'Boundary check A') returning id into a;
  insert into public.restaurants (code, name)
  values (public.generate_menu_code(), 'Boundary check B') returning id into b;
  insert into public.restaurants (code, name)
  values (public.generate_menu_code(), 'Boundary check C') returning id into c;
  insert into public.owners (user_id, restaurant_id, role)
  values (uid, a, 'owner'), (uid, b, 'owner');

  insert into public.menus (restaurant_id, name, sort)
  values (a, 'Boundary check menu', 1) returning id into a_menu;
  insert into public.menus (restaurant_id, name, sort)
  values (b, 'Boundary check menu', 1) returning id into b_menu;
  insert into public.menus (restaurant_id, name, sort)
  values (c, 'Boundary check menu', 1) returning id into c_menu;

  insert into public.sections (menu_id, name, sort)
  values (a_menu, 'Boundary check section', 1) returning id into a_section;
  insert into public.sections (menu_id, name, sort)
  values (b_menu, 'Boundary check B section', 1) returning id into b_section;
  insert into public.sections (menu_id, name, sort)
  values (c_menu, 'Boundary check C section', 1) returning id into c_section;

  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary check dish', 1) returning id into a_dish;
  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary check twin', 2) returning id into a_twin;
  insert into public.items (section_id, name, sort)
  values (b_section, 'Boundary check B dish', 1) returning id into b_dish;
  insert into public.items (section_id, name, sort)
  values (c_section, 'Boundary check C dish', 1) returning id into c_dish;

  perform set_config('boundary.a', a::text, true);
  perform set_config('boundary.b', b::text, true);
  perform set_config('boundary.a_dish', a_dish::text, true);
  perform set_config('boundary.a_twin', a_twin::text, true);
  perform set_config('boundary.b_dish', b_dish::text, true);
  perform set_config('boundary.c_dish', c_dish::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
    current_setting('boundary.uid')), true);

-- As this user, a member of A and B and not of C.
do $$
declare
  a uuid := current_setting('boundary.a')::uuid;
  b uuid := current_setting('boundary.b')::uuid;
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  a_twin uuid := current_setting('boundary.a_twin')::uuid;
  b_dish uuid := current_setting('boundary.b_dish')::uuid;
  c_dish uuid := current_setting('boundary.c_dish')::uuid;
  blank uuid;
  cup uuid;
  bowl uuid;
  got uuid;
  held_name text;
  held_price integer;
  untouched boolean;
begin
  -- A blank size: a draft may hold one, and Publish refuses it (D-139).
  insert into public.item_sizes (item_id)
  values (a_dish) returning id into blank;
  select z.restaurant_id, z.name, z.price_cents into got, held_name, held_price
  from public.item_sizes z where z.id = blank;
  if got is distinct from a or held_name is not null or held_price is not null then
    raise exception 'FAIL: a blank size did not take its dish''s restaurant, or was not blank';
  end if;
  raise notice 'ok: an owner adds a blank size, and it takes its dish''s restaurant';

  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Cup', 500) returning id into cup;
  raise notice 'ok: an owner adds a size with the three columns';

  -- Insert names three columns and no other.
  begin
    insert into public.item_sizes (id, item_id, name, price_cents)
    values (gen_random_uuid(), a_dish, 'Chosen id', 100);
    raise exception 'FAIL: an owner chose a size id';
  exception when insufficient_privilege then
    raise notice 'ok: id is not writable on insert';
  end;

  begin
    insert into public.item_sizes (item_id, restaurant_id, name, price_cents)
    values (a_dish, b, 'Crossed', 100);
    raise exception 'FAIL: an owner named the restaurant on insert';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable on insert';
  end;

  -- Neither link is writable after insert.
  begin
    update public.item_sizes set item_id = a_twin where id = cup;
    raise exception 'FAIL: an owner moved a size to another dish';
  exception when insufficient_privilege then
    raise notice 'ok: item_id is not writable after insert';
  end;

  begin
    update public.item_sizes set restaurant_id = b where id = cup;
    raise exception 'FAIL: an owner pointed a size at another restaurant';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable after insert';
  end;

  begin
    delete from public.item_sizes where id = cup;
    raise exception 'FAIL: an owner deleted a size for good';
  exception when insufficient_privilege then
    raise notice 'ok: an owner cannot delete a size for good';
  end;

  -- The copy trigger reads the dish as the caller.
  begin
    insert into public.item_sizes (item_id, name, price_cents)
    values (c_dish, 'Unread', 100);
    raise exception 'FAIL: an owner added a size under a dish they cannot read';
  exception when raise_exception then
    if sqlerrm <> 'A size needs an existing dish.' then raise; end if;
    raise notice 'ok: a size needs a dish its owner can read';
  end;

  insert into public.item_sizes (item_id, name, price_cents)
  values (b_dish, 'Glass', 1200);
  select z.restaurant_id into got from public.item_sizes z
  where z.item_id = b_dish;
  if got is distinct from b then
    raise exception 'FAIL: a size under a dish of B did not take B';
  end if;
  raise notice 'ok: a member of two restaurants adds a size in each, and each takes its dish''s restaurant';

  -- The name: something to read, on one line, 40 characters at most, or
  -- null while none is typed.
  begin
    update public.item_sizes set name = '   ' where id = cup;
    raise exception 'FAIL: a blank name was accepted';
  exception when check_violation then
    raise notice 'ok: a name cannot be blank; the app stores null';
  end;

  begin
    update public.item_sizes set name = chr(9) where id = cup;
    raise exception 'FAIL: a lone tab was accepted as a name';
  exception when check_violation then
    raise notice 'ok: a lone tab is not a name';
  end;

  begin
    update public.item_sizes set name = 'Two' || chr(10) || 'lines' where id = cup;
    raise exception 'FAIL: a name with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: a name is one line';
  end;

  begin
    update public.item_sizes set name = repeat('x', 41) where id = cup;
    raise exception 'FAIL: a 41 character name was accepted';
  exception when check_violation then
    raise notice 'ok: a name is 40 characters at most';
  end;

  update public.item_sizes set name = repeat('x', 40) where id = cup;
  update public.item_sizes set name = 'Cup' where id = cup;
  raise notice 'ok: a name takes 40 characters';

  -- The price: zero to $99,999.99, or null while none is typed.
  begin
    update public.item_sizes set price_cents = -1 where id = cup;
    raise exception 'FAIL: a negative price was accepted';
  exception when check_violation then
    raise notice 'ok: a price is never negative';
  end;

  begin
    update public.item_sizes set price_cents = 10000000 where id = cup;
    raise exception 'FAIL: a price over $99,999.99 was accepted';
  exception when check_violation then
    raise notice 'ok: a price is at most $99,999.99';
  end;

  update public.item_sizes set price_cents = 9999999 where id = cup;
  update public.item_sizes set price_cents = null where id = cup;
  update public.item_sizes set price_cents = 500 where id = cup;
  raise notice 'ok: a price takes the cap, clears to null, and comes back';

  -- Names differ within a dish, whatever the case or the outer spaces.
  begin
    insert into public.item_sizes (item_id, name, price_cents)
    values (a_dish, ' cup ', 800);
    raise exception 'FAIL: a second size took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on insert, any case or spacing';
  end;

  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Bowl', 800) returning id into bowl;
  begin
    update public.item_sizes set name = 'CUP' where id = bowl;
    raise exception 'FAIL: a rename took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on rename';
  end;

  insert into public.item_sizes (item_id, name, price_cents)
  values (a_twin, 'Cup', 400);
  raise notice 'ok: the same name is free on another dish';

  -- Two blank sizes may sit side by side: a null name is no name.
  insert into public.item_sizes (item_id) values (a_dish);
  raise notice 'ok: a second blank size is accepted';

  update public.item_sizes set deleted_at = now() where id = cup;
  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Cup', 600);
  raise notice 'ok: a deleted size frees its name';

  begin
    update public.item_sizes set deleted_at = null where id = cup;
    raise exception 'FAIL: a size came back under a name in use';
  exception when unique_violation then
    raise notice 'ok: a size cannot come back while its name is in use';
  end;

  update public.item_sizes set name = 'Mug' where id = cup;
  update public.item_sizes set deleted_at = null where id = cup;
  raise notice 'ok: deleted_at sets and clears';

  -- Marking a dish by hand marks the dish only. Its sizes keep their own
  -- state.
  update public.items set deleted_at = now() where id = a_dish;
  select bool_and(z.deleted_at is null) into untouched
  from public.item_sizes z where z.item_id = a_dish and z.id <> cup;
  if untouched is not true then
    raise exception 'FAIL: deleting a dish marked its sizes';
  end if;

  -- A size under a deleted dish is still accepted by the database today;
  -- the app's dishScope refuses it, and the rule joins the Q-44 and Q-45
  -- migration with "no new section or dish under a deleted parent".
  insert into public.item_sizes (item_id, name, price_cents)
  values (a_dish, 'Late', 100);
  raise notice 'ok: a deleted dish keeps its sizes as they were; a size under a deleted dish is still accepted (Q-45)';
  update public.items set deleted_at = null where id = a_dish;

  perform set_config('boundary.cup', cup::text, true);
end;
$$;

-- A stranger reads, writes, and adds nothing.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  seen integer;
  touched integer;
begin
  select count(*) into seen from public.item_sizes;
  if seen <> 0 then
    raise exception 'FAIL: a stranger read % sizes', seen;
  end if;

  update public.item_sizes set name = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % sizes', touched;
  end if;
  raise notice 'ok: a stranger reads and updates zero sizes';

  -- The copy trigger cannot read the dish, so it refuses before row level
  -- security is asked.
  begin
    insert into public.item_sizes (item_id, name, price_cents)
    values (a_dish, 'Stranger', 100);
    raise exception 'FAIL: a stranger added a size';
  exception when raise_exception then
    if sqlerrm <> 'A size needs an existing dish.' then raise; end if;
    raise notice 'ok: a stranger cannot add a size';
  end;
end;
$$;

-- As the table owner again: the stranger changed nothing.
reset role;

do $$
declare
  cup uuid := current_setting('boundary.cup')::uuid;
  held_name text;
begin
  select z.name into held_name from public.item_sizes z where z.id = cup;
  if held_name is distinct from 'Mug' then
    raise exception 'FAIL: a size changed under a stranger';
  end if;
  raise notice 'ok: the sizes are as the owner left them';
end;
$$;

-- A diner: the table is closed.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.item_sizes limit 1;
    raise exception 'FAIL: anon read the item_sizes table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the item_sizes table';
  end;
end;
$$;

rollback;
