-- Owner boundary check for sections. Run in the Supabase SQL editor after
-- every migration that touches sections. Everything rolls back. Replace the
-- uid below with your own auth.users id. A run that ends without an error
-- passed every check.
begin;

-- The one line to change. The script makes this user a member of two
-- restaurants it creates here, and then acts as this user.
select set_config('boundary.uid',
  '00000000-0000-0000-0000-000000000000', true);

-- As the table owner: what the Data API roles hold, that no section
-- disagrees with its menu, and the ground the later blocks stand on. The
-- script builds its own restaurants, so it proves the two-restaurant case
-- whatever this user owns, and it writes nothing into a real menu.
do $$
declare
  uid uuid := current_setting('boundary.uid')::uuid;
  held text;
  expected text;
  off integer;
  a uuid;
  b uuid;
  c uuid;
  a_menu uuid;
  a_other uuid;
  b_menu uuid;
  c_menu uuid;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;

  -- anon holds nothing on the table.
  if has_any_column_privilege('anon', 'public.sections',
       'select, insert, update, references')
     or has_table_privilege('anon', 'public.sections',
       'select, insert, update, delete, truncate, references, trigger') then
    raise exception 'FAIL: anon holds a privilege on sections';
  end if;
  raise notice 'ok: anon holds nothing on sections';

  -- authenticated holds the column lists and no table-wide write.
  if has_table_privilege('authenticated', 'public.sections',
    'insert, update, delete, truncate') then
    raise exception 'FAIL: authenticated holds a table-wide write on sections';
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.sections'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.sections', att.attname,
      'insert');
  expected := 'menu_id, name, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated inserts %, expected %', held, expected;
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.sections'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.sections', att.attname,
      'update');
  expected := 'deleted_at, every_item, name, note, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of sections';

  -- A section's restaurant is its menu's restaurant, for every row.
  select count(*) into off
  from public.sections s
  join public.menus m on m.id = s.menu_id
  where s.restaurant_id is distinct from m.restaurant_id;
  if off <> 0 then
    raise exception 'FAIL: % sections disagree with their menu about the restaurant', off;
  end if;
  raise notice 'ok: every section has its menu''s restaurant';

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
  values (a, 'Boundary check other menu', 2) returning id into a_other;
  insert into public.menus (restaurant_id, name, sort)
  values (b, 'Boundary check menu', 1) returning id into b_menu;
  insert into public.menus (restaurant_id, name, sort)
  values (c, 'Boundary check menu', 1) returning id into c_menu;

  insert into public.sections (menu_id, name, sort)
  values (a_other, 'Boundary check other one', 1),
         (a_other, 'Boundary check other two', 2);
  insert into public.sections (menu_id, name, sort)
  values (b_menu, 'Boundary check B one', 1);
  insert into public.sections (menu_id, name, sort)
  values (c_menu, 'Boundary check C one', 1);

  perform set_config('boundary.a', a::text, true);
  perform set_config('boundary.b', b::text, true);
  perform set_config('boundary.a_menu', a_menu::text, true);
  perform set_config('boundary.a_other', a_other::text, true);
  perform set_config('boundary.b_menu', b_menu::text, true);
  perform set_config('boundary.c_menu', c_menu::text, true);
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
  b_restaurant uuid := current_setting('boundary.b')::uuid;
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  a_other uuid := current_setting('boundary.a_other')::uuid;
  b_menu uuid := current_setting('boundary.b_menu')::uuid;
  c_menu uuid := current_setting('boundary.c_menu')::uuid;
  mine uuid;
  two uuid;
  three uuid;
  got uuid;
  ids uuid[];
  other_ids uuid[];
  flipped uuid[];
  n integer;
  in_place boolean;
  untouched boolean;
  places_before tid[];
  places_after tid[];
begin
  insert into public.sections (menu_id, name, sort)
  values (a_menu, 'Boundary check one', 9001) returning id into mine;
  insert into public.sections (menu_id, name, sort)
  values (a_menu, 'Boundary check two', 9002) returning id into two;
  select s.restaurant_id into got from public.sections s where s.id = mine;
  if got is distinct from a then
    raise exception 'FAIL: a new section did not take its menu''s restaurant';
  end if;
  raise notice 'ok: an owner adds a section with the three columns, and it takes its menu''s restaurant';

  -- Insert names three columns and no other.
  begin
    insert into public.sections (id, menu_id, name, sort)
    values (gen_random_uuid(), a_menu, 'Boundary check id', 9003);
    raise exception 'FAIL: an owner chose a section id';
  exception when insufficient_privilege then
    raise notice 'ok: id is not writable on insert';
  end;

  begin
    insert into public.sections (menu_id, name, sort, note)
    values (a_menu, 'Boundary check note', 9003, 'A note');
    raise exception 'FAIL: an owner inserted a note';
  exception when insufficient_privilege then
    raise notice 'ok: note is not writable on insert';
  end;

  begin
    insert into public.sections (menu_id, name, sort, every_item)
    values (a_menu, 'Boundary check line', 9003, 'A line');
    raise exception 'FAIL: an owner inserted an every-dish line';
  exception when insufficient_privilege then
    raise notice 'ok: every_item is not writable on insert';
  end;

  -- The gap the menus plan named: a member of two restaurants pointing a
  -- section at the other one. Closed three ways.
  begin
    update public.sections set restaurant_id = b_restaurant where id = mine;
    raise exception 'FAIL: an owner pointed a section at another restaurant';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable after insert';
  end;

  begin
    update public.sections set menu_id = b_menu where id = mine;
    raise exception 'FAIL: an owner moved a section to another menu';
  exception when insufficient_privilege then
    raise notice 'ok: menu_id is not writable after insert';
  end;

  begin
    insert into public.sections (menu_id, restaurant_id, name, sort)
    values (a_menu, b_restaurant, 'Boundary check crossed', 9003);
    raise exception 'FAIL: an owner named the restaurant on insert';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable on insert';
  end;

  begin
    insert into public.sections (menu_id, name, sort)
    values (c_menu, 'Boundary check unread menu', 9004);
    raise exception 'FAIL: an owner added a section under a menu they cannot read';
  exception when raise_exception then
    if sqlerrm <> 'A section needs an existing menu.' then raise; end if;
    raise notice 'ok: a section needs a menu its owner can read';
  end;

  begin
    delete from public.sections where id = two;
    raise exception 'FAIL: an owner deleted a section for good';
  exception when insufficient_privilege then
    raise notice 'ok: an owner cannot delete a section for good';
  end;

  -- The name: something to read, on one line, sixty characters at most.
  begin
    update public.sections set name = '   ' where id = mine;
    raise exception 'FAIL: a blank name was accepted';
  exception when check_violation then
    raise notice 'ok: a name cannot be blank';
  end;

  begin
    update public.sections set name = chr(9) where id = mine;
    raise exception 'FAIL: a lone tab was accepted as a name';
  exception when check_violation then
    raise notice 'ok: a lone tab is not a name';
  end;

  begin
    update public.sections set name = 'Two' || chr(10) || 'lines' where id = mine;
    raise exception 'FAIL: a name with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: a name is one line';
  end;

  begin
    update public.sections set name = repeat('x', 61) where id = mine;
    raise exception 'FAIL: a 61 character name was accepted';
  exception when check_violation then
    raise notice 'ok: a name is sixty characters at most';
  end;

  -- The note: something to read, plain line breaks allowed, five hundred
  -- characters at most.
  begin
    update public.sections set note = '   ' where id = mine;
    raise exception 'FAIL: a blank note was accepted';
  exception when check_violation then
    raise notice 'ok: a note cannot be blank';
  end;

  begin
    update public.sections set note = 'A' || chr(9) || 'tab' where id = mine;
    raise exception 'FAIL: a note with a tab was accepted';
  exception when check_violation then
    raise notice 'ok: a note holds no tab';
  end;

  begin
    update public.sections
      set note = 'Line one' || chr(13) || chr(10) || 'Line two'
      where id = mine;
    raise exception 'FAIL: a note with a Windows line break was accepted';
  exception when check_violation then
    raise notice 'ok: a note holds plain line breaks only';
  end;

  begin
    update public.sections set note = repeat('x', 501) where id = mine;
    raise exception 'FAIL: a 501 character note was accepted';
  exception when check_violation then
    raise notice 'ok: a note is five hundred characters at most';
  end;

  update public.sections
    set note = 'Line one' || chr(10) || 'Line two' where id = mine;
  update public.sections set note = repeat('x', 500) where id = mine;
  update public.sections set note = null where id = mine;
  raise notice 'ok: a note takes a plain line break, five hundred characters, and null';

  -- The every-dish line: one line, one hundred and twenty characters at most.
  begin
    update public.sections set every_item = '   ' where id = mine;
    raise exception 'FAIL: a blank every-dish line was accepted';
  exception when check_violation then
    raise notice 'ok: an every-dish line cannot be blank';
  end;

  begin
    update public.sections
      set every_item = 'Two' || chr(10) || 'lines' where id = mine;
    raise exception 'FAIL: an every-dish line with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: an every-dish line is one line';
  end;

  begin
    update public.sections set every_item = repeat('x', 121) where id = mine;
    raise exception 'FAIL: a 121 character every-dish line was accepted';
  exception when check_violation then
    raise notice 'ok: an every-dish line is 120 characters at most';
  end;

  update public.sections set every_item = repeat('x', 120) where id = mine;
  update public.sections set every_item = null where id = mine;
  raise notice 'ok: an every-dish line takes 120 characters and null';

  -- Names differ within a menu, whatever the case or the outer spaces.
  begin
    insert into public.sections (menu_id, name, sort)
    values (a_menu, ' boundary CHECK one ', 9003);
    raise exception 'FAIL: a second section took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on insert, any case or spacing';
  end;

  begin
    update public.sections set name = 'BOUNDARY CHECK ONE' where id = two;
    raise exception 'FAIL: a rename took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on rename';
  end;

  insert into public.sections (menu_id, name, sort)
  values (a_other, 'Boundary check one', 9003);
  raise notice 'ok: the same name is free in another menu';

  update public.sections set deleted_at = now() where id = mine;
  insert into public.sections (menu_id, name, sort)
  values (a_menu, 'Boundary check one', 9003) returning id into three;
  raise notice 'ok: a deleted section frees its name';

  begin
    update public.sections set deleted_at = null where id = mine;
    raise exception 'FAIL: a section came back under a name in use';
  exception when unique_violation then
    raise notice 'ok: a section cannot come back while its name is in use';
  end;

  update public.sections set name = 'Boundary check three' where id = three;
  update public.sections set deleted_at = null where id = mine;
  raise notice 'ok: deleted_at sets and clears';

  -- Deleting a menu marks the menu only. Its sections keep their own state.
  update public.menus set deleted_at = now() where id = a_menu;
  select bool_and(s.deleted_at is null) into untouched
  from public.sections s where s.menu_id = a_menu;
  if untouched is not true then
    raise exception 'FAIL: deleting a menu marked its sections';
  end if;
  update public.menus set deleted_at = null where id = a_menu;
  raise notice 'ok: a deleted menu keeps its sections as they were';

  -- The order function takes exactly the menu's live sections, each once.
  select array_agg(s.id order by s.sort, s.created_at, s.id) into ids
  from public.sections s
  where s.menu_id = a_menu and s.deleted_at is null;
  n := cardinality(ids);
  select array_agg(s.id order by s.sort, s.created_at, s.id) into other_ids
  from public.sections s
  where s.menu_id = a_other and s.deleted_at is null;

  begin
    perform public.set_section_order(a_menu, ids[1:n - 1]);
    raise exception 'FAIL: a short list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that misses a section is refused';
  end;

  begin
    perform public.set_section_order(a_menu, ids[1:n - 1] || ids[1]);
    raise exception 'FAIL: a repeated id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a repeated id is refused';
  end;

  begin
    perform public.set_section_order(a_menu, array[ids]);
    raise exception 'FAIL: a nested list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a nested list holding the right ids is refused';
  end;

  begin
    perform public.set_section_order(a_menu, other_ids);
    raise exception 'FAIL: another menu''s sections were accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: another menu''s sections are refused';
  end;

  update public.sections set deleted_at = now() where id = three;
  begin
    perform public.set_section_order(a_menu, ids);
    raise exception 'FAIL: a deleted section''s id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that names a deleted section is refused';
  end;
  update public.sections set deleted_at = null where id = three;

  select array_agg(t.id order by t.ord desc) into flipped
  from unnest(ids) with ordinality as t (id, ord);
  perform public.set_section_order(a_menu, flipped);
  select bool_and(s.sort = t.ord) into in_place
  from unnest(flipped) with ordinality as t (id, ord)
  join public.sections s on s.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: set_section_order did not write the order it was given';
  end if;
  raise notice 'ok: the right list is written as 1 to %', n;

  -- A row already in place is left alone: the same list again rewrites
  -- nothing, so no row moves to a new place in the table.
  select array_agg(s.ctid order by s.id) into places_before
  from public.sections s where s.menu_id = a_menu;
  perform public.set_section_order(a_menu, flipped);
  select array_agg(s.ctid order by s.id) into places_after
  from public.sections s where s.menu_id = a_menu;
  if places_before is distinct from places_after then
    raise exception 'FAIL: set_section_order rewrote rows already in place';
  end if;
  raise notice 'ok: the same list again rewrites no row';

  perform set_config('boundary.order', array_to_string(flipped, ','), true);
end;
$$;

-- A stranger reads, writes, adds, and orders nothing, even with the menu's
-- own list in hand.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  seen integer;
  touched integer;
begin
  select count(*) into seen from public.sections;
  if seen <> 0 then
    raise exception 'FAIL: a stranger read % sections', seen;
  end if;

  update public.sections set name = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % sections', touched;
  end if;
  raise notice 'ok: a stranger reads and updates zero sections';

  -- The copy trigger cannot read the menu, so it refuses before row level
  -- security is asked.
  begin
    insert into public.sections (menu_id, name, sort)
    values (a_menu, 'Boundary check stranger', 9009);
    raise exception 'FAIL: a stranger added a section';
  exception when raise_exception then
    if sqlerrm <> 'A section needs an existing menu.' then raise; end if;
    raise notice 'ok: a stranger cannot add a section';
  end;

  begin
    perform public.set_section_order(a_menu, ids);
    raise exception 'FAIL: a stranger ordered sections';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a stranger orders nothing, even with the menu''s own list';
  end;
end;
$$;

-- As the table owner again: the stranger moved nothing.
reset role;

do $$
declare
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  in_place boolean;
begin
  select bool_and(s.sort = t.ord) into in_place
  from unnest(ids) with ordinality as t (id, ord)
  join public.sections s on s.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: the order changed under a stranger';
  end if;
  raise notice 'ok: the order is as the owner left it';
end;
$$;

-- A diner: the table and the function are closed, and the views are empty.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  shown integer;
begin
  begin
    perform 1 from public.sections limit 1;
    raise exception 'FAIL: anon read the sections table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the sections table';
  end;

  begin
    perform public.set_section_order(gen_random_uuid(),
      array[gen_random_uuid()]);
    raise exception 'FAIL: anon ran set_section_order';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run set_section_order';
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
