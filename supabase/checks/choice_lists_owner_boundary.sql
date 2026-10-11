-- Owner boundary check for choice_lists, the choice lists of a dish or a
-- section (migration 11, D-166). Run in the Supabase SQL editor after every
-- migration that touches choice lists, set_choice_list_order(), or
-- delete_with_contents(), after the restaurants, sections, and items
-- scripts. Everything rolls back. Replace the uid below with your own
-- auth.users id. A run that ends without an error passed every check.
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
  a_second uuid;
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
  if has_any_column_privilege('anon', 'public.choice_lists',
       'select, insert, update, references')
     or has_table_privilege('anon', 'public.choice_lists',
       'select, insert, update, delete, truncate, references, trigger') then
    raise exception 'FAIL: anon holds a privilege on choice_lists';
  end if;
  raise notice 'ok: anon holds nothing on choice_lists';

  -- authenticated reads, and holds the column lists and no table-wide
  -- write.
  if not has_table_privilege('authenticated', 'public.choice_lists', 'select') then
    raise exception 'FAIL: authenticated cannot read choice_lists';
  end if;
  if has_table_privilege('authenticated', 'public.choice_lists',
    'insert, update, delete, truncate') then
    raise exception 'FAIL: authenticated holds a table-wide write on choice_lists';
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.choice_lists'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.choice_lists', att.attname,
      'insert');
  expected := 'item_id, lead, section_id, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated inserts %, expected %', held, expected;
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.choice_lists'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.choice_lists', att.attname,
      'update');
  expected := 'deleted_at, lead, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of choice_lists, and never a link after insert';

  -- service_role keeps every column for server code.
  if not has_table_privilege('service_role', 'public.choice_lists',
    'select, insert, update, delete') then
    raise exception 'FAIL: service_role lacks a privilege on choice_lists';
  end if;
  raise notice 'ok: service_role reads and writes choice_lists';

  -- A list's restaurant is its home's restaurant, for every row.
  if exists (
    select 1 from public.choice_lists l
    left join public.items i on i.id = l.item_id
    left join public.sections s on s.id = l.section_id
    where l.restaurant_id is distinct from coalesce(i.restaurant_id, s.restaurant_id)
  ) then
    raise exception 'FAIL: a choice list disagrees with its home about the restaurant';
  end if;
  raise notice 'ok: every choice list has its home''s restaurant';

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
  values (a_menu, 'Boundary check second section', 2) returning id into a_second;
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
  perform set_config('boundary.a_section', a_section::text, true);
  perform set_config('boundary.a_second', a_second::text, true);
  perform set_config('boundary.b_section', b_section::text, true);
  perform set_config('boundary.c_section', c_section::text, true);
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
  a_section uuid := current_setting('boundary.a_section')::uuid;
  a_second uuid := current_setting('boundary.a_second')::uuid;
  b_section uuid := current_setting('boundary.b_section')::uuid;
  c_section uuid := current_setting('boundary.c_section')::uuid;
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  a_twin uuid := current_setting('boundary.a_twin')::uuid;
  b_dish uuid := current_setting('boundary.b_dish')::uuid;
  c_dish uuid := current_setting('boundary.c_dish')::uuid;
  sides uuid;
  addon uuid;
  drinks uuid;
  dressing uuid;
  got uuid;
  held_item uuid;
  held_section uuid;
  ids uuid[];
  other_ids uuid[];
  flipped uuid[];
  n integer;
  in_place boolean;
  untouched boolean;
  marked boolean;
  places_before tid[];
  places_after tid[];
begin
  -- A list under a dish and one under a section, each with its home's
  -- restaurant.
  insert into public.choice_lists (item_id, lead, sort)
  values (a_dish, 'Choose one side', 1) returning id into sides;
  select l.restaurant_id, l.item_id, l.section_id into got, held_item, held_section
  from public.choice_lists l where l.id = sides;
  if got is distinct from a or held_item is distinct from a_dish
     or held_section is not null then
    raise exception 'FAIL: a list under a dish did not take its dish''s restaurant and home';
  end if;
  insert into public.choice_lists (section_id, lead, sort)
  values (a_section, 'Add on', 1) returning id into addon;
  select l.restaurant_id, l.item_id, l.section_id into got, held_item, held_section
  from public.choice_lists l where l.id = addon;
  if got is distinct from a or held_item is not null
     or held_section is distinct from a_section then
    raise exception 'FAIL: a list under a section did not take its section''s restaurant and home';
  end if;
  raise notice 'ok: an owner adds a list under a dish and one under a section, each with its home''s restaurant';

  -- Insert names the four columns and no other.
  begin
    insert into public.choice_lists (id, item_id, lead, sort)
    values (gen_random_uuid(), a_dish, 'Chosen id', 2);
    raise exception 'FAIL: an owner chose a list id';
  exception when insufficient_privilege then
    raise notice 'ok: id is not writable on insert';
  end;

  begin
    insert into public.choice_lists (item_id, restaurant_id, lead, sort)
    values (a_dish, b, 'Crossed', 2);
    raise exception 'FAIL: an owner named the restaurant on insert';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable on insert';
  end;

  -- No link is writable after insert.
  begin
    update public.choice_lists set item_id = a_twin where id = sides;
    raise exception 'FAIL: an owner moved a list to another dish';
  exception when insufficient_privilege then
    raise notice 'ok: item_id is not writable after insert';
  end;

  begin
    update public.choice_lists set section_id = a_second where id = addon;
    raise exception 'FAIL: an owner moved a list to another section';
  exception when insufficient_privilege then
    raise notice 'ok: section_id is not writable after insert';
  end;

  begin
    update public.choice_lists set restaurant_id = b where id = sides;
    raise exception 'FAIL: an owner pointed a list at another restaurant';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable after insert';
  end;

  begin
    delete from public.choice_lists where id = sides;
    raise exception 'FAIL: an owner deleted a list for good';
  exception when insufficient_privilege then
    raise notice 'ok: an owner cannot delete a list for good';
  end;

  -- One home exactly: a dish or a section, never both, never neither.
  begin
    insert into public.choice_lists (item_id, section_id, lead, sort)
    values (a_dish, a_section, 'Two homes', 2);
    raise exception 'FAIL: a list with two homes was accepted';
  exception when check_violation then
    raise notice 'ok: a list belongs to one dish or one section, never both (choice_lists_one_home)';
  end;

  begin
    insert into public.choice_lists (lead, sort) values ('No home', 2);
    raise exception 'FAIL: a list with no home was accepted';
  exception when raise_exception then
    if sqlerrm <> 'A choice list needs an existing dish or section.' then raise; end if;
    raise notice 'ok: a list needs a home';
  end;

  -- The copy trigger reads the home as the caller.
  begin
    insert into public.choice_lists (item_id, lead, sort)
    values (c_dish, 'Unread', 1);
    raise exception 'FAIL: an owner added a list under a dish they cannot read';
  exception when raise_exception then
    if sqlerrm <> 'A choice list needs an existing dish or section.' then raise; end if;
    raise notice 'ok: a list needs a dish its owner can read';
  end;

  begin
    insert into public.choice_lists (section_id, lead, sort)
    values (c_section, 'Unread', 1);
    raise exception 'FAIL: an owner added a list under a section they cannot read';
  exception when raise_exception then
    if sqlerrm <> 'A choice list needs an existing dish or section.' then raise; end if;
    raise notice 'ok: a list needs a section its owner can read';
  end;

  begin
    insert into public.choice_lists (item_id, lead, sort)
    values (gen_random_uuid(), 'Nowhere', 1);
    raise exception 'FAIL: an owner added a list under a dish that is not there';
  exception when raise_exception then
    if sqlerrm <> 'A choice list needs an existing dish or section.' then raise; end if;
    raise notice 'ok: a list needs a dish that is there';
  end;

  insert into public.choice_lists (item_id, lead, sort)
  values (b_dish, 'Choose one side', 1);
  select l.restaurant_id into got from public.choice_lists l
  where l.item_id = b_dish;
  if got is distinct from b then
    raise exception 'FAIL: a list under a dish of B did not take B';
  end if;
  raise notice 'ok: a member of two restaurants adds a list in each, and each takes its home''s restaurant';

  -- The lead: something to read, on one line, 120 characters at most.
  begin
    update public.choice_lists set lead = '   ' where id = sides;
    raise exception 'FAIL: a blank lead was accepted';
  exception when check_violation then
    raise notice 'ok: a lead cannot be blank';
  end;

  begin
    update public.choice_lists set lead = 'Two' || chr(10) || 'lines' where id = sides;
    raise exception 'FAIL: a lead with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: a lead is one line';
  end;

  begin
    update public.choice_lists set lead = repeat('x', 121) where id = sides;
    raise exception 'FAIL: a 121 character lead was accepted';
  exception when check_violation then
    raise notice 'ok: a lead is 120 characters at most';
  end;

  update public.choice_lists set lead = repeat('x', 120) where id = sides;
  update public.choice_lists set lead = 'Choose one side' where id = sides;
  raise notice 'ok: a lead takes 120 characters';

  -- Leads differ within a home, whatever the case or the outer spaces.
  begin
    insert into public.choice_lists (item_id, lead, sort)
    values (a_dish, ' choose ONE side ', 2);
    raise exception 'FAIL: a second list took a lead in use on its dish';
  exception when unique_violation then
    raise notice 'ok: a lead in use on the home is refused on insert, any case or spacing';
  end;

  insert into public.choice_lists (item_id, lead, sort)
  values (a_dish, 'Choose a drink', 2) returning id into drinks;
  begin
    update public.choice_lists set lead = 'CHOOSE ONE SIDE' where id = drinks;
    raise exception 'FAIL: a new lead took a lead in use on its dish';
  exception when unique_violation then
    raise notice 'ok: a lead in use on the home is refused on a change';
  end;

  insert into public.choice_lists (item_id, lead, sort)
  values (a_twin, 'Choose one side', 1);
  insert into public.choice_lists (section_id, lead, sort)
  values (a_section, 'Choose one side', 2) returning id into dressing;
  raise notice 'ok: the same lead is free on another dish and on a section';

  update public.choice_lists set deleted_at = now() where id = sides;
  insert into public.choice_lists (item_id, lead, sort)
  values (a_dish, 'Choose one side', 3);
  raise notice 'ok: a deleted list frees its lead';

  begin
    update public.choice_lists set deleted_at = null where id = sides;
    raise exception 'FAIL: a list came back under a lead in use';
  exception when unique_violation then
    raise notice 'ok: a list cannot come back while its lead is in use';
  end;

  update public.choice_lists set lead = 'Choose two sides' where id = sides;
  update public.choice_lists set deleted_at = null where id = sides;
  raise notice 'ok: deleted_at sets and clears';

  -- Marking a dish by hand marks the dish only. Its lists keep their own
  -- state.
  update public.items set deleted_at = now() where id = a_dish;
  select bool_and(l.deleted_at is null) into untouched
  from public.choice_lists l where l.item_id = a_dish;
  if untouched is not true then
    raise exception 'FAIL: deleting a dish marked its lists';
  end if;

  -- A list under a deleted dish is still accepted by the database today;
  -- the app's scope reads refuse it, and the rule joins the Q-44 and Q-45
  -- migration with "no new section or dish under a deleted parent".
  insert into public.choice_lists (item_id, lead, sort)
  values (a_dish, 'Late', 4);
  raise notice 'ok: a deleted dish keeps its lists as they were; a list under a deleted dish is still accepted (Q-45)';
  update public.items set deleted_at = null where id = a_dish;

  -- The order function takes exactly the home's live lists, each once.
  select array_agg(l.id order by l.sort, l.created_at, l.id) into ids
  from public.choice_lists l
  where l.item_id = a_dish and l.deleted_at is null;
  n := cardinality(ids);
  select array_agg(l.id order by l.sort, l.created_at, l.id) into other_ids
  from public.choice_lists l
  where l.section_id = a_section and l.deleted_at is null;

  begin
    perform public.set_choice_list_order(a_dish, ids[1:n - 1]);
    raise exception 'FAIL: a short list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that misses a choice list is refused';
  end;

  begin
    perform public.set_choice_list_order(a_dish, ids[1:n - 1] || ids[1]);
    raise exception 'FAIL: a repeated id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a repeated id is refused';
  end;

  begin
    perform public.set_choice_list_order(a_dish, array[ids]);
    raise exception 'FAIL: a nested list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a nested list holding the right ids is refused';
  end;

  begin
    perform public.set_choice_list_order(a_dish, other_ids);
    raise exception 'FAIL: another home''s lists were accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: another home''s lists are refused';
  end;

  update public.choice_lists set deleted_at = now() where id = drinks;
  begin
    perform public.set_choice_list_order(a_dish, ids);
    raise exception 'FAIL: a deleted list''s id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that names a deleted choice list is refused';
  end;
  update public.choice_lists set deleted_at = null where id = drinks;

  select array_agg(t.id order by t.ord desc) into flipped
  from unnest(ids) with ordinality as t (id, ord);
  perform public.set_choice_list_order(a_dish, flipped);
  select bool_and(l.sort = t.ord) into in_place
  from unnest(flipped) with ordinality as t (id, ord)
  join public.choice_lists l on l.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: set_choice_list_order did not write the order it was given';
  end if;
  raise notice 'ok: the right list is written as 1 to %', n;

  -- The same for a section's lists, by the section's id alone.
  perform public.set_choice_list_order(a_section, other_ids);
  raise notice 'ok: a section''s lists are ordered by the section''s id';

  -- A row already in place is left alone: the same list again rewrites
  -- nothing, so no row moves to a new place in the table.
  select array_agg(l.ctid order by l.id) into places_before
  from public.choice_lists l where l.item_id = a_dish;
  perform public.set_choice_list_order(a_dish, flipped);
  select array_agg(l.ctid order by l.id) into places_after
  from public.choice_lists l where l.item_id = a_dish;
  if places_before is distinct from places_after then
    raise exception 'FAIL: set_choice_list_order rewrote rows already in place';
  end if;
  raise notice 'ok: the same list again rewrites no row';

  -- delete_with_contents(), a list (D-119): it holds two options, added
  -- here as this user.
  insert into public.choice_options (choice_list_id, name, sort)
  values (sides, 'Fries', 1), (sides, 'Salad', 2);

  begin
    perform public.delete_with_contents('list', a_dish, sides, 0, 0, 1);
    raise exception 'FAIL: a list was deleted with more options than the owner was told';
  exception when raise_exception then
    if sqlerrm <> 'delete_grew' then raise; end if;
    raise notice 'ok: a list that holds more options than told is not deleted';
  end;

  begin
    perform public.delete_with_contents('list', a_dish, sides, null, null, null);
    raise exception 'FAIL: a list was deleted with nothing said about its options';
  exception when raise_exception then
    if sqlerrm <> 'delete_grew' then raise; end if;
    raise notice 'ok: nothing told counts as none';
  end;

  select l.deleted_at is not null into marked
  from public.choice_lists l where l.id = sides;
  if marked then
    raise exception 'FAIL: a refused delete marked the list';
  end if;

  begin
    perform public.delete_with_contents('list', a_twin, sides, 0, 0, 2);
    raise exception 'FAIL: a list was deleted from a home it is not under';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a list is deleted only from its own home';
  end;

  begin
    perform public.delete_with_contents('option', a_dish, sides, 0, 0, 2);
    raise exception 'FAIL: an unknown kind was accepted';
  exception when raise_exception then
    if sqlerrm <> 'delete_unknown_kind' then raise; end if;
    raise notice 'ok: only a menu, a section, or a list is deleted this way';
  end;

  perform public.delete_with_contents('list', a_dish, sides, 0, 0, 2);
  select l.deleted_at is not null into marked
  from public.choice_lists l where l.id = sides;
  select bool_and(o.deleted_at is null) into untouched
  from public.choice_options o where o.choice_list_id = sides;
  if marked is not true or untouched is not true then
    raise exception 'FAIL: a list told exactly was not marked, or its options were';
  end if;
  raise notice 'ok: a list that holds what was told is marked, and its options keep their own state';

  begin
    perform public.delete_with_contents('list', a_dish, sides, 0, 0, 2);
    raise exception 'FAIL: a deleted list was deleted again';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a list already deleted is not found';
  end;

  -- Undo's side stays a column write: the list comes back with its options
  -- as they were.
  update public.choice_lists set deleted_at = null where id = sides;
  select bool_and(o.deleted_at is null) into untouched
  from public.choice_options o where o.choice_list_id = sides;
  if untouched is not true then
    raise exception 'FAIL: a restored list lost its options';
  end if;

  -- Told more than it holds is no reason to refuse, and a section's list
  -- is deleted by the section's id.
  perform public.delete_with_contents('list', a_section, dressing, 0, 0, 7);
  update public.choice_lists set deleted_at = null where id = dressing;
  raise notice 'ok: a list that holds less than told is deleted, under a section too, and comes back by a column write';

  perform set_config('boundary.sides', sides::text, true);
  perform set_config('boundary.order', array_to_string(flipped, ','), true);
end;
$$;

-- A stranger reads, writes, adds, orders, and deletes nothing, even with
-- the home's own list in hand.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  sides uuid := current_setting('boundary.sides')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  seen integer;
  touched integer;
begin
  select count(*) into seen from public.choice_lists;
  if seen <> 0 then
    raise exception 'FAIL: a stranger read % lists', seen;
  end if;

  update public.choice_lists set lead = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % lists', touched;
  end if;
  raise notice 'ok: a stranger reads and updates zero lists';

  -- The copy trigger cannot read the dish, so it refuses before row level
  -- security is asked.
  begin
    insert into public.choice_lists (item_id, lead, sort)
    values (a_dish, 'Stranger', 9);
    raise exception 'FAIL: a stranger added a list';
  exception when raise_exception then
    if sqlerrm <> 'A choice list needs an existing dish or section.' then raise; end if;
    raise notice 'ok: a stranger cannot add a list';
  end;

  begin
    perform public.set_choice_list_order(a_dish, ids);
    raise exception 'FAIL: a stranger ordered lists';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a stranger orders nothing, even with the home''s own list';
  end;

  begin
    perform public.delete_with_contents('list', a_dish, sides, 0, 0, 100);
    raise exception 'FAIL: a stranger deleted a list';
  exception when raise_exception then
    if sqlerrm <> 'delete_not_found' then raise; end if;
    raise notice 'ok: a stranger deletes no list';
  end;
end;
$$;

-- As the table owner again: the stranger changed nothing.
reset role;

do $$
declare
  a_dish uuid := current_setting('boundary.a_dish')::uuid;
  sides uuid := current_setting('boundary.sides')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  in_place boolean;
  live boolean;
begin
  select bool_and(l.sort = t.ord and l.item_id = a_dish) into in_place
  from unnest(ids) with ordinality as t (id, ord)
  join public.choice_lists l on l.id = t.id;
  select l.deleted_at is null into live
  from public.choice_lists l where l.id = sides;
  if in_place is not true or live is not true then
    raise exception 'FAIL: the lists changed under a stranger';
  end if;
  raise notice 'ok: the lists are as the owner left them';
end;
$$;

-- A diner: the table and the function are closed.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.choice_lists limit 1;
    raise exception 'FAIL: anon read the choice_lists table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the choice_lists table';
  end;

  begin
    perform public.set_choice_list_order(gen_random_uuid(),
      array[gen_random_uuid()]);
    raise exception 'FAIL: anon ran set_choice_list_order';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run set_choice_list_order';
  end;
end;
$$;

rollback;
