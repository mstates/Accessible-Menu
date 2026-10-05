-- Owner boundary check for items, the dishes of a section. Run in the
-- Supabase SQL editor after every migration that touches items, or the
-- functions that count and delete what a menu or a section holds.
-- Everything rolls back. Replace the uid below with your own auth.users id.
-- A run that ends without an error passed every check.
begin;

-- The one line to change. The script makes this user a member of two
-- restaurants it creates here, and then acts as this user.
select set_config('boundary.uid',
  '00000000-0000-0000-0000-000000000000', true);

-- As the table owner: what the Data API roles hold, that no dish disagrees
-- with its section, and the ground the later blocks stand on. The script
-- builds its own restaurants, so it proves the two-restaurant case whatever
-- this user owns, and it writes nothing into a real menu.
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
  a_section uuid;
  a_second uuid;
  a_other_section uuid;
  b_section uuid;
  c_section uuid;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;

  -- anon holds nothing on the table.
  if has_any_column_privilege('anon', 'public.items',
       'select, insert, update, references')
     or has_table_privilege('anon', 'public.items',
       'select, insert, update, delete, truncate, references, trigger') then
    raise exception 'FAIL: anon holds a privilege on items';
  end if;
  raise notice 'ok: anon holds nothing on items';

  -- authenticated holds the column lists and no table-wide write.
  if has_table_privilege('authenticated', 'public.items',
    'insert, update, delete, truncate') then
    raise exception 'FAIL: authenticated holds a table-wide write on items';
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.items'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.items', att.attname,
      'insert');
  expected := 'name, section_id, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated inserts %, expected %', held, expected;
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.items'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.items', att.attname,
      'update');
  expected := 'deleted_at, name, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of items';

  -- A dish's restaurant is its section's restaurant, for every row.
  select count(*) into off
  from public.items i
  join public.sections s on s.id = i.section_id
  where i.restaurant_id is distinct from s.restaurant_id;
  if off <> 0 then
    raise exception 'FAIL: % dishes disagree with their section about the restaurant', off;
  end if;
  raise notice 'ok: every dish has its section''s restaurant';

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
  values (a_menu, 'Boundary check section', 1) returning id into a_section;
  insert into public.sections (menu_id, name, sort)
  values (a_menu, 'Boundary check second section', 2) returning id into a_second;
  insert into public.sections (menu_id, name, sort)
  values (a_other, 'Boundary check other section', 1)
  returning id into a_other_section;
  insert into public.sections (menu_id, name, sort)
  values (b_menu, 'Boundary check B section', 1) returning id into b_section;
  insert into public.sections (menu_id, name, sort)
  values (c_menu, 'Boundary check C section', 1) returning id into c_section;

  insert into public.items (section_id, name, sort)
  values (a_other_section, 'Boundary check other dish', 1);
  insert into public.items (section_id, name, sort)
  values (c_section, 'Boundary check C dish', 1);

  perform set_config('boundary.a', a::text, true);
  perform set_config('boundary.b', b::text, true);
  perform set_config('boundary.c', c::text, true);
  perform set_config('boundary.a_menu', a_menu::text, true);
  perform set_config('boundary.a_other', a_other::text, true);
  perform set_config('boundary.a_section', a_section::text, true);
  perform set_config('boundary.a_second', a_second::text, true);
  perform set_config('boundary.a_other_section', a_other_section::text, true);
  perform set_config('boundary.b_section', b_section::text, true);
  perform set_config('boundary.c_section', c_section::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
    current_setting('boundary.uid')), true);

-- As this user, a member of A and B and not of C: the table.
do $$
declare
  a uuid := current_setting('boundary.a')::uuid;
  b_restaurant uuid := current_setting('boundary.b')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  a_second uuid := current_setting('boundary.a_second')::uuid;
  b_section uuid := current_setting('boundary.b_section')::uuid;
  c_section uuid := current_setting('boundary.c_section')::uuid;
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
  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary check one', 9001) returning id into mine;
  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary check two', 9002) returning id into two;
  select i.restaurant_id into got from public.items i where i.id = mine;
  if got is distinct from a then
    raise exception 'FAIL: a new dish did not take its section''s restaurant';
  end if;
  raise notice 'ok: an owner adds a dish with the three columns, and it takes its section''s restaurant';

  -- Insert names three columns and no other.
  begin
    insert into public.items (id, section_id, name, sort)
    values (gen_random_uuid(), a_section, 'Boundary check id', 9003);
    raise exception 'FAIL: an owner chose a dish id';
  exception when insufficient_privilege then
    raise notice 'ok: id is not writable on insert';
  end;

  begin
    insert into public.items (section_id, name, sort, description)
    values (a_section, 'Boundary check description', 9003, 'A description');
    raise exception 'FAIL: an owner inserted a description';
  exception when insufficient_privilege then
    raise notice 'ok: description is not writable on insert';
  end;

  begin
    insert into public.items (section_id, name, sort, price_cents)
    values (a_section, 'Boundary check price', 9003, 1200);
    raise exception 'FAIL: an owner inserted a price';
  exception when insufficient_privilege then
    raise notice 'ok: price_cents is not writable on insert';
  end;

  begin
    insert into public.items (section_id, name, sort, allergens)
    values (a_section, 'Boundary check allergens', 9003, '{peanuts}');
    raise exception 'FAIL: an owner inserted allergens';
  exception when insufficient_privilege then
    raise notice 'ok: allergens is not writable on insert';
  end;

  begin
    insert into public.items (section_id, name, sort, allergens_reviewed)
    values (a_section, 'Boundary check reviewed', 9003, true);
    raise exception 'FAIL: an owner inserted a dish as reviewed';
  exception when insufficient_privilege then
    raise notice 'ok: allergens_reviewed is not writable on insert';
  end;

  begin
    insert into public.items (section_id, restaurant_id, name, sort)
    values (a_section, b_restaurant, 'Boundary check crossed', 9003);
    raise exception 'FAIL: an owner named the restaurant on insert';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable on insert';
  end;

  -- The gap the sections task left one level down: a member of two
  -- restaurants pointing a dish at the other one. Closed both ways.
  begin
    update public.items set restaurant_id = b_restaurant where id = mine;
    raise exception 'FAIL: an owner pointed a dish at another restaurant';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable after insert';
  end;

  begin
    update public.items set section_id = b_section where id = mine;
    raise exception 'FAIL: an owner moved a dish to another section';
  exception when insufficient_privilege then
    raise notice 'ok: section_id is not writable after insert';
  end;

  -- Nothing this task does not build is writable after insert either.
  begin
    update public.items set description = 'A description' where id = mine;
    raise exception 'FAIL: an owner wrote a description';
  exception when insufficient_privilege then
    raise notice 'ok: description is not writable';
  end;

  begin
    update public.items set price_cents = 1200 where id = mine;
    raise exception 'FAIL: an owner wrote a price';
  exception when insufficient_privilege then
    raise notice 'ok: price_cents is not writable';
  end;

  begin
    update public.items set allergens = '{peanuts}' where id = mine;
    raise exception 'FAIL: an owner wrote allergens';
  exception when insufficient_privilege then
    raise notice 'ok: allergens is not writable';
  end;

  begin
    update public.items set allergens_reviewed = true where id = mine;
    raise exception 'FAIL: an owner marked a dish as reviewed';
  exception when insufficient_privilege then
    raise notice 'ok: allergens_reviewed is not writable';
  end;

  begin
    update public.items set available = false where id = mine;
    raise exception 'FAIL: an owner wrote available';
  exception when insufficient_privilege then
    raise notice 'ok: available is not writable';
  end;

  begin
    insert into public.items (section_id, name, sort)
    values (c_section, 'Boundary check unread section', 9004);
    raise exception 'FAIL: an owner added a dish under a section they cannot read';
  exception when raise_exception then
    if sqlerrm <> 'An item needs an existing section.' then raise; end if;
    raise notice 'ok: a dish needs a section its owner can read';
  end;

  begin
    delete from public.items where id = two;
    raise exception 'FAIL: an owner deleted a dish for good';
  exception when insufficient_privilege then
    raise notice 'ok: an owner cannot delete a dish for good';
  end;

  -- The name: something to read, on one line, 120 characters at most.
  begin
    update public.items set name = '   ' where id = mine;
    raise exception 'FAIL: a blank name was accepted';
  exception when check_violation then
    raise notice 'ok: a name cannot be blank';
  end;

  begin
    update public.items set name = chr(9) where id = mine;
    raise exception 'FAIL: a lone tab was accepted as a name';
  exception when check_violation then
    raise notice 'ok: a lone tab is not a name';
  end;

  begin
    update public.items set name = 'Two' || chr(10) || 'lines' where id = mine;
    raise exception 'FAIL: a name with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: a name is one line';
  end;

  begin
    update public.items set name = repeat('x', 121) where id = mine;
    raise exception 'FAIL: a 121 character name was accepted';
  exception when check_violation then
    raise notice 'ok: a name is 120 characters at most';
  end;

  update public.items set name = repeat('x', 120) where id = mine;
  update public.items set name = 'Boundary check one' where id = mine;
  raise notice 'ok: a name takes 120 characters';

  -- Names differ within a section, whatever the case or the outer spaces.
  begin
    insert into public.items (section_id, name, sort)
    values (a_section, ' boundary CHECK one ', 9003);
    raise exception 'FAIL: a second dish took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on insert, any case or spacing';
  end;

  begin
    update public.items set name = 'BOUNDARY CHECK ONE' where id = two;
    raise exception 'FAIL: a rename took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on rename';
  end;

  insert into public.items (section_id, name, sort)
  values (a_second, 'Boundary check one', 9003);
  raise notice 'ok: the same name is free in another section';

  update public.items set deleted_at = now() where id = mine;
  insert into public.items (section_id, name, sort)
  values (a_section, 'Boundary check one', 9003) returning id into three;
  raise notice 'ok: a deleted dish frees its name';

  begin
    update public.items set deleted_at = null where id = mine;
    raise exception 'FAIL: a dish came back under a name in use';
  exception when unique_violation then
    raise notice 'ok: a dish cannot come back while its name is in use';
  end;

  update public.items set name = 'Boundary check three' where id = three;
  update public.items set deleted_at = null where id = mine;
  raise notice 'ok: deleted_at sets and clears';

  -- Marking a section by hand marks the section only. Its dishes keep their
  -- own state.
  update public.sections set deleted_at = now() where id = a_section;
  select bool_and(i.deleted_at is null) into untouched
  from public.items i where i.section_id = a_section;
  if untouched is not true then
    raise exception 'FAIL: deleting a section marked its dishes';
  end if;
  update public.sections set deleted_at = null where id = a_section;
  raise notice 'ok: a deleted section keeps its dishes as they were';

  -- The order function takes exactly the section's live dishes, each once.
  select array_agg(i.id order by i.sort, i.created_at, i.id) into ids
  from public.items i
  where i.section_id = a_section and i.deleted_at is null;
  n := cardinality(ids);
  select array_agg(i.id order by i.sort, i.created_at, i.id) into other_ids
  from public.items i
  where i.section_id = a_second and i.deleted_at is null;

  begin
    perform public.set_item_order(a_section, ids[1:n - 1]);
    raise exception 'FAIL: a short list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that misses a dish is refused';
  end;

  begin
    perform public.set_item_order(a_section, ids[1:n - 1] || ids[1]);
    raise exception 'FAIL: a repeated id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a repeated id is refused';
  end;

  begin
    perform public.set_item_order(a_section, array[ids]);
    raise exception 'FAIL: a nested list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a nested list holding the right ids is refused';
  end;

  begin
    perform public.set_item_order(a_section, other_ids);
    raise exception 'FAIL: another section''s dishes were accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: another section''s dishes are refused';
  end;

  update public.items set deleted_at = now() where id = three;
  begin
    perform public.set_item_order(a_section, ids);
    raise exception 'FAIL: a deleted dish''s id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that names a deleted dish is refused';
  end;
  update public.items set deleted_at = null where id = three;

  select array_agg(t.id order by t.ord desc) into flipped
  from unnest(ids) with ordinality as t (id, ord);
  perform public.set_item_order(a_section, flipped);
  select bool_and(i.sort = t.ord) into in_place
  from unnest(flipped) with ordinality as t (id, ord)
  join public.items i on i.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: set_item_order did not write the order it was given';
  end if;
  raise notice 'ok: the right list is written as 1 to %', n;

  -- A row already in place is left alone: the same list again rewrites
  -- nothing, so no row moves to a new place in the table.
  select array_agg(i.ctid order by i.id) into places_before
  from public.items i where i.section_id = a_section;
  perform public.set_item_order(a_section, flipped);
  select array_agg(i.ctid order by i.id) into places_after
  from public.items i where i.section_id = a_section;
  if places_before is distinct from places_after then
    raise exception 'FAIL: set_item_order rewrote rows already in place';
  end if;
  raise notice 'ok: the same list again rewrites no row';

  perform set_config('boundary.order', array_to_string(flipped, ','), true);
  perform set_config('boundary.three', three::text, true);
end;
$$;

-- Still as this user: what a delete would take, and the delete that counts
-- it. Here the first section of A's first menu holds three dishes, its
-- second section holds one, and A's other menu holds one section with one.
do $$
declare
  a uuid := current_setting('boundary.a')::uuid;
  b_restaurant uuid := current_setting('boundary.b')::uuid;
  c_restaurant uuid := current_setting('boundary.c')::uuid;
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  a_other uuid := current_setting('boundary.a_other')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  a_second uuid := current_setting('boundary.a_second')::uuid;
  a_other_section uuid := current_setting('boundary.a_other_section')::uuid;
  three uuid := current_setting('boundary.three')::uuid;
  n integer;
  counted integer;
  of_menu uuid;
  marked boolean;
  untouched boolean;
begin
  -- section_dish_counts(): live dishes, in live sections, of live menus.
  select count(*) into n from public.section_dish_counts(a);
  if n <> 3 then
    raise exception 'FAIL: section_dish_counts listed % sections of A, expected 3', n;
  end if;
  select c.dishes, c.menu_id into counted, of_menu
  from public.section_dish_counts(a) c where c.section_id = a_section;
  if counted <> 3 or of_menu is distinct from a_menu then
    raise exception 'FAIL: section_dish_counts gave % dishes for the first section, expected 3 under its menu', counted;
  end if;
  select c.dishes into counted
  from public.section_dish_counts(a) c where c.section_id = a_second;
  if counted <> 1 then
    raise exception 'FAIL: section_dish_counts gave % dishes for the second section, expected 1', counted;
  end if;
  raise notice 'ok: section_dish_counts lists each section with its dishes';

  update public.items set deleted_at = now() where id = three;
  select c.dishes into counted
  from public.section_dish_counts(a) c where c.section_id = a_section;
  if counted <> 2 then
    raise exception 'FAIL: section_dish_counts counted a deleted dish';
  end if;
  update public.items set deleted_at = null where id = three;

  update public.sections set deleted_at = now() where id = a_second;
  select count(*) into n from public.section_dish_counts(a);
  if n <> 2 then
    raise exception 'FAIL: section_dish_counts listed a deleted section';
  end if;
  update public.sections set deleted_at = null where id = a_second;

  update public.menus set deleted_at = now() where id = a_other;
  select count(*) into n
  from public.section_dish_counts(a) c where c.section_id = a_other_section;
  if n <> 0 then
    raise exception 'FAIL: section_dish_counts listed a section of a deleted menu';
  end if;
  update public.menus set deleted_at = null where id = a_other;
  raise notice 'ok: section_dish_counts leaves out deleted dishes, deleted sections, and deleted menus';

  select count(*) into n from public.section_dish_counts(b_restaurant);
  if n <> 1 then
    raise exception 'FAIL: section_dish_counts listed % sections of B, expected 1', n;
  end if;
  select count(*) into n from public.section_dish_counts(c_restaurant);
  if n <> 0 then
    raise exception 'FAIL: section_dish_counts listed a restaurant this user is not a member of';
  end if;
  raise notice 'ok: section_dish_counts keeps to the restaurant asked for, and to this user''s';

  -- delete_with_contents(), a section. It holds three dishes.
  begin
    perform public.delete_with_contents('section', a_menu, a_section, 0, 2);
    raise exception 'FAIL: a section was deleted with more dishes than the owner was told';
  exception when raise_exception then
    if sqlerrm <> 'delete_grew' then raise; end if;
    raise notice 'ok: a section that holds more dishes than told is not deleted';
  end;

  begin
    perform public.delete_with_contents('section', a_menu, a_section, null, null);
    raise exception 'FAIL: a section was deleted with nothing said about its dishes';
  exception when raise_exception then
    if sqlerrm <> 'delete_grew' then raise; end if;
    raise notice 'ok: nothing told counts as none';
  end;

  select s.deleted_at is not null into marked
  from public.sections s where s.id = a_section;
  if marked then
    raise exception 'FAIL: a refused delete marked the section';
  end if;

  begin
    perform public.delete_with_contents('section', a_other, a_section, 0, 3);
    raise exception 'FAIL: a section was deleted from a menu it is not in';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a section is deleted only from its own menu';
  end;

  begin
    perform public.delete_with_contents('dish', a_menu, a_section, 0, 3);
    raise exception 'FAIL: an unknown kind was accepted';
  exception when raise_exception then
    if sqlerrm <> 'delete_unknown_kind' then raise; end if;
    raise notice 'ok: only a menu or a section is deleted this way';
  end;

  perform public.delete_with_contents('section', a_menu, a_section, 0, 3);
  select s.deleted_at is not null into marked
  from public.sections s where s.id = a_section;
  select bool_and(i.deleted_at is null) into untouched
  from public.items i where i.section_id = a_section;
  if marked is not true or untouched is not true then
    raise exception 'FAIL: a section told exactly was not marked, or its dishes were';
  end if;
  raise notice 'ok: a section that holds what was told is marked, and its dishes keep their own state';

  begin
    perform public.delete_with_contents('section', a_menu, a_section, 0, 3);
    raise exception 'FAIL: a deleted section was deleted again';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a section already deleted is not found';
  end;

  -- delete_with_contents(), a menu. With its first section deleted, the
  -- menu holds one live section with one live dish; the deleted section and
  -- its three dishes are not counted.
  begin
    perform public.delete_with_contents('menu', a, a_menu, 0, 1);
    raise exception 'FAIL: a menu was deleted with more sections than the owner was told';
  exception when raise_exception then
    if sqlerrm <> 'delete_grew' then raise; end if;
    raise notice 'ok: a menu that holds more sections than told is not deleted';
  end;

  begin
    perform public.delete_with_contents('menu', a, a_menu, 1, 0);
    raise exception 'FAIL: a menu was deleted with more dishes than the owner was told';
  exception when raise_exception then
    if sqlerrm <> 'delete_grew' then raise; end if;
    raise notice 'ok: a menu that holds more dishes than told is not deleted';
  end;

  begin
    perform public.delete_with_contents('menu', b_restaurant, a_menu, 1, 1);
    raise exception 'FAIL: a menu was deleted from a restaurant it is not in';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a menu is deleted only from its own restaurant';
  end;

  perform public.delete_with_contents('menu', a, a_menu, 1, 1);
  select m.deleted_at is not null into marked
  from public.menus m where m.id = a_menu;
  select s.deleted_at is null into untouched
  from public.sections s where s.id = a_second;
  if marked is not true or untouched is not true then
    raise exception 'FAIL: a menu told exactly was not marked, or its section was';
  end if;
  raise notice 'ok: a menu that holds what was told is marked, deleted rows under it are not counted, and its sections keep their own state';

  begin
    perform public.delete_with_contents('menu', a, a_menu, 1, 1);
    raise exception 'FAIL: a deleted menu was deleted again';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a menu already deleted is not found';
  end;

  -- Undo's side stays a column write: both come back.
  update public.menus set deleted_at = null where id = a_menu;
  update public.sections set deleted_at = null where id = a_section;

  -- Told more than it holds is no reason to refuse.
  perform public.delete_with_contents('section', a_menu, a_second, 7, 7);
  update public.sections set deleted_at = null where id = a_second;
  raise notice 'ok: a row that holds less than told is deleted, and comes back by a column write';
end;
$$;

-- A stranger reads, writes, adds, orders, counts, and deletes nothing, even
-- with the section's own list in hand.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  a uuid := current_setting('boundary.a')::uuid;
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  seen integer;
  touched integer;
begin
  select count(*) into seen from public.items;
  if seen <> 0 then
    raise exception 'FAIL: a stranger read % dishes', seen;
  end if;

  update public.items set name = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % dishes', touched;
  end if;
  raise notice 'ok: a stranger reads and updates zero dishes';

  -- The copy trigger cannot read the section, so it refuses before row
  -- level security is asked.
  begin
    insert into public.items (section_id, name, sort)
    values (a_section, 'Boundary check stranger', 9009);
    raise exception 'FAIL: a stranger added a dish';
  exception when raise_exception then
    if sqlerrm <> 'An item needs an existing section.' then raise; end if;
    raise notice 'ok: a stranger cannot add a dish';
  end;

  begin
    perform public.set_item_order(a_section, ids);
    raise exception 'FAIL: a stranger ordered dishes';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a stranger orders nothing, even with the section''s own list';
  end;

  select count(*) into seen from public.section_dish_counts(a);
  if seen <> 0 then
    raise exception 'FAIL: a stranger counted % sections', seen;
  end if;
  raise notice 'ok: a stranger counts nothing';

  begin
    perform public.delete_with_contents('section', a_menu, a_section, 100, 100);
    raise exception 'FAIL: a stranger deleted a section';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a stranger deletes no section';
  end;

  begin
    perform public.delete_with_contents('menu', a, a_menu, 100, 100);
    raise exception 'FAIL: a stranger deleted a menu';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a stranger deletes no menu';
  end;
end;
$$;

-- As the table owner again: the stranger moved and marked nothing.
reset role;

do $$
declare
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  in_place boolean;
  live boolean;
begin
  select bool_and(i.sort = t.ord) into in_place
  from unnest(ids) with ordinality as t (id, ord)
  join public.items i on i.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: the order changed under a stranger';
  end if;

  select (select m.deleted_at is null from public.menus m where m.id = a_menu)
    and (select s.deleted_at is null from public.sections s where s.id = a_section)
    into live;
  if live is not true then
    raise exception 'FAIL: a menu or a section was marked under a stranger';
  end if;
  raise notice 'ok: the order, the menu, and the section are as the owner left them';
end;
$$;

-- A diner: the table and the four functions are closed, and the views are
-- empty.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  shown integer;
begin
  begin
    perform 1 from public.items limit 1;
    raise exception 'FAIL: anon read the items table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the items table';
  end;

  begin
    perform public.set_item_order(gen_random_uuid(),
      array[gen_random_uuid()]);
    raise exception 'FAIL: anon ran set_item_order';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run set_item_order';
  end;

  begin
    perform 1 from public.section_dish_counts(gen_random_uuid());
    raise exception 'FAIL: anon ran section_dish_counts';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run section_dish_counts';
  end;

  begin
    perform public.delete_with_contents('menu', gen_random_uuid(),
      gen_random_uuid(), 0, 0);
    raise exception 'FAIL: anon ran delete_with_contents';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run delete_with_contents';
  end;

  begin
    perform public.move_section(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon ran move_section';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run move_section';
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
