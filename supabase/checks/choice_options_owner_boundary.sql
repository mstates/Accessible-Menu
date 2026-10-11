-- Owner boundary check for choice_options, the options of a choice list
-- (migration 11, D-166, D-167): the columns owners write, the name, price,
-- and calorie rules, the lists rule, the check stamped and cleared by the
-- database, and set_choice_option_order(). Run in the Supabase SQL editor
-- after every migration that touches options, after the restaurants and
-- choice_lists scripts. Everything rolls back. Replace the uid below with
-- your own auth.users id. A run that ends without an error passed every
-- check.
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
  b_dish uuid;
  c_dish uuid;
  a_list uuid;
  a_other uuid;
  b_list uuid;
  c_list uuid;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;

  -- anon holds nothing on the table.
  if has_any_column_privilege('anon', 'public.choice_options',
       'select, insert, update, references')
     or has_table_privilege('anon', 'public.choice_options',
       'select, insert, update, delete, truncate, references, trigger') then
    raise exception 'FAIL: anon holds a privilege on choice_options';
  end if;
  raise notice 'ok: anon holds nothing on choice_options';

  -- authenticated reads, and holds the column lists and no table-wide
  -- write.
  if not has_table_privilege('authenticated', 'public.choice_options', 'select') then
    raise exception 'FAIL: authenticated cannot read choice_options';
  end if;
  if has_table_privilege('authenticated', 'public.choice_options',
    'insert, update, delete, truncate') then
    raise exception 'FAIL: authenticated holds a table-wide write on choice_options';
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.choice_options'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.choice_options', att.attname,
      'insert');
  expected := 'choice_list_id, name, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated inserts %, expected %', held, expected;
  end if;

  select string_agg(att.attname, ', ' order by att.attname) into held
  from pg_attribute att
  where att.attrelid = 'public.choice_options'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', 'public.choice_options', att.attname,
      'update');
  expected := 'added_price_cents, allergens, allergens_reviewed, calories_high, calories_low, custom_allergens, deleted_at, name, sort';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of choice_options, and never who checked the allergens or when';

  -- service_role keeps every column for server code.
  if not has_table_privilege('service_role', 'public.choice_options',
    'select, insert, update, delete') then
    raise exception 'FAIL: service_role lacks a privilege on choice_options';
  end if;
  raise notice 'ok: service_role reads and writes choice_options';

  -- An option's restaurant is its list's restaurant, for every row.
  if exists (
    select 1 from public.choice_options o
    join public.choice_lists l on l.id = o.choice_list_id
    where o.restaurant_id is distinct from l.restaurant_id
  ) then
    raise exception 'FAIL: an option disagrees with its list about the restaurant';
  end if;
  raise notice 'ok: every option has its list''s restaurant';

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
  values (b_section, 'Boundary check B dish', 1) returning id into b_dish;
  insert into public.items (section_id, name, sort)
  values (c_section, 'Boundary check C dish', 1) returning id into c_dish;

  insert into public.choice_lists (item_id, lead, sort)
  values (a_dish, 'Choose one side', 1) returning id into a_list;
  insert into public.choice_lists (section_id, lead, sort)
  values (a_section, 'Add on', 1) returning id into a_other;
  insert into public.choice_lists (item_id, lead, sort)
  values (b_dish, 'Choose one side', 1) returning id into b_list;
  insert into public.choice_lists (item_id, lead, sort)
  values (c_dish, 'Choose one side', 1) returning id into c_list;

  perform set_config('boundary.a', a::text, true);
  perform set_config('boundary.b', b::text, true);
  perform set_config('boundary.a_list', a_list::text, true);
  perform set_config('boundary.a_other', a_other::text, true);
  perform set_config('boundary.b_list', b_list::text, true);
  perform set_config('boundary.c_list', c_list::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}',
    current_setting('boundary.uid')), true);

-- As this user, a member of A and B and not of C.
do $$
declare
  uid uuid := current_setting('boundary.uid')::uuid;
  a uuid := current_setting('boundary.a')::uuid;
  b uuid := current_setting('boundary.b')::uuid;
  a_list uuid := current_setting('boundary.a_list')::uuid;
  a_other uuid := current_setting('boundary.a_other')::uuid;
  b_list uuid := current_setting('boundary.b_list')::uuid;
  c_list uuid := current_setting('boundary.c_list')::uuid;
  fries uuid;
  salad uuid;
  slaw uuid;
  got uuid;
  reviewed boolean;
  by_whom uuid;
  at_when timestamptz;
  touched integer;
  wanted_word text;
  ids uuid[];
  other_ids uuid[];
  flipped uuid[];
  n integer;
  in_place boolean;
  untouched boolean;
  places_before tid[];
  places_after tid[];
begin
  insert into public.choice_options (choice_list_id, name, sort)
  values (a_list, 'Fries', 1) returning id into fries;
  select o.restaurant_id into got from public.choice_options o where o.id = fries;
  if got is distinct from a then
    raise exception 'FAIL: a new option did not take its list''s restaurant';
  end if;
  raise notice 'ok: an owner adds an option with the three columns, and it takes its list''s restaurant';

  -- Insert names three columns and no other.
  begin
    insert into public.choice_options (id, choice_list_id, name, sort)
    values (gen_random_uuid(), a_list, 'Chosen id', 2);
    raise exception 'FAIL: an owner chose an option id';
  exception when insufficient_privilege then
    raise notice 'ok: id is not writable on insert';
  end;

  begin
    insert into public.choice_options (choice_list_id, restaurant_id, name, sort)
    values (a_list, b, 'Crossed', 2);
    raise exception 'FAIL: an owner named the restaurant on insert';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable on insert';
  end;

  begin
    insert into public.choice_options (choice_list_id, name, sort, added_price_cents)
    values (a_list, 'Priced at birth', 2, 100);
    raise exception 'FAIL: an owner inserted an added price';
  exception when insufficient_privilege then
    raise notice 'ok: added_price_cents is not writable on insert';
  end;

  -- Neither link is writable after insert.
  begin
    update public.choice_options set choice_list_id = a_other where id = fries;
    raise exception 'FAIL: an owner moved an option to another list';
  exception when insufficient_privilege then
    raise notice 'ok: choice_list_id is not writable after insert';
  end;

  begin
    update public.choice_options set restaurant_id = b where id = fries;
    raise exception 'FAIL: an owner pointed an option at another restaurant';
  exception when insufficient_privilege then
    raise notice 'ok: restaurant_id is not writable after insert';
  end;

  begin
    delete from public.choice_options where id = fries;
    raise exception 'FAIL: an owner deleted an option for good';
  exception when insufficient_privilege then
    raise notice 'ok: an owner cannot delete an option for good';
  end;

  -- The copy trigger reads the list as the caller.
  begin
    insert into public.choice_options (choice_list_id, name, sort)
    values (c_list, 'Unread', 1);
    raise exception 'FAIL: an owner added an option under a list they cannot read';
  exception when raise_exception then
    if sqlerrm <> 'An option needs an existing choice list.' then raise; end if;
    raise notice 'ok: an option needs a list its owner can read';
  end;

  insert into public.choice_options (choice_list_id, name, sort)
  values (b_list, 'Rice', 1);
  select o.restaurant_id into got from public.choice_options o
  where o.choice_list_id = b_list;
  if got is distinct from b then
    raise exception 'FAIL: an option under a list of B did not take B';
  end if;
  raise notice 'ok: a member of two restaurants adds an option in each, and each takes its list''s restaurant';

  -- The name: something to read, on one line, 60 characters at most.
  begin
    update public.choice_options set name = '   ' where id = fries;
    raise exception 'FAIL: a blank name was accepted';
  exception when check_violation then
    raise notice 'ok: a name cannot be blank';
  end;

  begin
    update public.choice_options set name = chr(9) where id = fries;
    raise exception 'FAIL: a lone tab was accepted as a name';
  exception when check_violation then
    raise notice 'ok: a lone tab is not a name';
  end;

  begin
    update public.choice_options set name = 'Two' || chr(10) || 'lines' where id = fries;
    raise exception 'FAIL: a name with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: a name is one line';
  end;

  begin
    update public.choice_options set name = repeat('x', 61) where id = fries;
    raise exception 'FAIL: a 61 character name was accepted';
  exception when check_violation then
    raise notice 'ok: a name is 60 characters at most';
  end;

  update public.choice_options set name = repeat('x', 60) where id = fries;
  update public.choice_options set name = 'Fries' where id = fries;
  raise notice 'ok: a name takes 60 characters';

  -- Names differ within a list, whatever the case or the outer spaces.
  begin
    insert into public.choice_options (choice_list_id, name, sort)
    values (a_list, ' FRIES ', 2);
    raise exception 'FAIL: a second option took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on insert, any case or spacing';
  end;

  insert into public.choice_options (choice_list_id, name, sort)
  values (a_list, 'Salad', 2) returning id into salad;
  begin
    update public.choice_options set name = 'fries' where id = salad;
    raise exception 'FAIL: a rename took a name in use';
  exception when unique_violation then
    raise notice 'ok: a name in use is refused on rename';
  end;

  insert into public.choice_options (choice_list_id, name, sort)
  values (a_other, 'Fries', 1);
  raise notice 'ok: the same name is free in another list';

  update public.choice_options set deleted_at = now() where id = fries;
  insert into public.choice_options (choice_list_id, name, sort)
  values (a_list, 'Fries', 3) returning id into slaw;
  raise notice 'ok: a deleted option frees its name';

  begin
    update public.choice_options set deleted_at = null where id = fries;
    raise exception 'FAIL: an option came back under a name in use';
  exception when unique_violation then
    raise notice 'ok: an option cannot come back while its name is in use';
  end;

  update public.choice_options set name = 'Slaw' where id = slaw;
  update public.choice_options set deleted_at = null where id = fries;
  raise notice 'ok: deleted_at sets and clears';

  -- The added price: zero to $99,999.99, or null while none is typed.
  begin
    update public.choice_options set added_price_cents = -1 where id = fries;
    raise exception 'FAIL: a negative added price was accepted';
  exception when check_violation then
    raise notice 'ok: an added price is never negative';
  end;

  begin
    update public.choice_options set added_price_cents = 10000000 where id = fries;
    raise exception 'FAIL: an added price over $99,999.99 was accepted';
  exception when check_violation then
    raise notice 'ok: an added price is at most $99,999.99';
  end;

  update public.choice_options set added_price_cents = 9999999 where id = fries;
  update public.choice_options set added_price_cents = 0 where id = fries;
  update public.choice_options set added_price_cents = null where id = fries;
  update public.choice_options set added_price_cents = 150 where id = fries;
  raise notice 'ok: an added price takes the cap, zero, null, and a number';

  -- Calories (D-167): whole numbers from 0 to 99,999, both absent or the
  -- low one set, the high one at least the low.
  begin
    update public.choice_options set calories_high = 100 where id = fries;
    raise exception 'FAIL: a high number with no low one was accepted';
  exception when check_violation then
    raise notice 'ok: calories need the low number first (choice_options_calories_shape)';
  end;

  begin
    update public.choice_options set calories_low = 100, calories_high = 50
    where id = fries;
    raise exception 'FAIL: a high number below the low one was accepted';
  exception when check_violation then
    raise notice 'ok: the high number is at least the low one';
  end;

  begin
    update public.choice_options set calories_low = 100000 where id = fries;
    raise exception 'FAIL: 100,000 calories were accepted';
  exception when check_violation then
    raise notice 'ok: calories are under 100,000';
  end;

  begin
    update public.choice_options set calories_low = 500, calories_high = 100000
    where id = fries;
    raise exception 'FAIL: a high number of 100,000 was accepted';
  exception when check_violation then
    raise notice 'ok: the high number is under 100,000 too';
  end;

  begin
    update public.choice_options set calories_low = -1 where id = fries;
    raise exception 'FAIL: negative calories were accepted';
  exception when check_violation then
    raise notice 'ok: calories are never negative';
  end;

  update public.choice_options set calories_low = 0 where id = fries;
  update public.choice_options set calories_low = 760, calories_high = 760
  where id = fries;
  update public.choice_options set calories_low = 760, calories_high = 99999
  where id = fries;
  update public.choice_options set calories_low = null, calories_high = null
  where id = fries;
  update public.choice_options set calories_low = 300 where id = fries;
  raise notice 'ok: calories take zero, an equal pair, the cap, null, and one number';

  -- The allergens and their check (D-148, migration 7's shape). The two
  -- lists land and leave the option unchecked; the stamp is never an
  -- owner's to write; a check is stamped with this user and now by the
  -- database; a change to the price, the calories, or the place leaves it;
  -- any change to a list clears it; a change to the name clears it too
  -- (D-152's reason, Michael at the plan's tabs); the same lists or name
  -- written again do not.
  update public.choice_options
  set allergens = '{milk,wheat}', custom_allergens = '{celery}'
  where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by, o.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.choice_options o where o.id = fries;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: listing allergens checked the option';
  end if;
  raise notice 'ok: an owner writes the two allergen lists, and the option stays unchecked';

  begin
    update public.choice_options set allergens_reviewed_by = uid where id = fries;
    raise exception 'FAIL: an owner wrote who checked the allergens';
  exception when insufficient_privilege then
    raise notice 'ok: allergens_reviewed_by is not writable';
  end;

  begin
    update public.choice_options set allergens_reviewed_at = now() where id = fries;
    raise exception 'FAIL: an owner wrote when the allergens were checked';
  exception when insufficient_privilege then
    raise notice 'ok: allergens_reviewed_at is not writable';
  end;

  update public.choice_options set allergens_reviewed = true where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by, o.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.choice_options o where o.id = fries;
  if not reviewed or by_whom is distinct from uid or at_when is distinct from now() then
    raise exception 'FAIL: a check was not stamped with this user and now';
  end if;
  raise notice 'ok: a check is stamped with the person and the time by the database';

  update public.choice_options
  set added_price_cents = 200, calories_low = 320, calories_high = 400, sort = 7
  where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by into reviewed, by_whom
  from public.choice_options o where o.id = fries;
  if not reviewed or by_whom is distinct from uid then
    raise exception 'FAIL: a change to the price, the calories, or the place cleared the check';
  end if;
  update public.choice_options
  set added_price_cents = 150, calories_low = 300, calories_high = null, sort = 1
  where id = fries;
  raise notice 'ok: a change to the price, the calories, or the place leaves the check as it is';

  update public.choice_options set name = 'Onion rings' where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by, o.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.choice_options o where o.id = fries;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: a change to the name left the check';
  end if;
  raise notice 'ok: a change to the name clears the check and its stamp';

  update public.choice_options set allergens_reviewed = true where id = fries;
  update public.choice_options set name = 'Onion rings' where id = fries;
  select o.allergens_reviewed into reviewed
  from public.choice_options o where o.id = fries;
  if not reviewed then
    raise exception 'FAIL: the same name written again cleared the check';
  end if;
  raise notice 'ok: the same name written again leaves the check';

  update public.choice_options set allergens = '{milk,wheat,sesame}' where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by, o.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.choice_options o where o.id = fries;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: a major allergen ticked did not clear the check';
  end if;
  raise notice 'ok: a major allergen ticked clears the check and its stamp';

  update public.choice_options set allergens_reviewed = true where id = fries;
  update public.choice_options set allergens = '{milk,wheat}' where id = fries;
  select o.allergens_reviewed into reviewed from public.choice_options o where o.id = fries;
  if reviewed then
    raise exception 'FAIL: a major allergen unticked did not clear the check';
  end if;
  raise notice 'ok: a major allergen unticked clears the check';

  update public.choice_options set allergens_reviewed = true where id = fries;
  update public.choice_options set custom_allergens = '{celery,mustard}' where id = fries;
  select o.allergens_reviewed into reviewed from public.choice_options o where o.id = fries;
  if reviewed then
    raise exception 'FAIL: another allergen added did not clear the check';
  end if;
  update public.choice_options set allergens_reviewed = true where id = fries;
  update public.choice_options set custom_allergens = '{celery,lupin}' where id = fries;
  select o.allergens_reviewed into reviewed from public.choice_options o where o.id = fries;
  if reviewed then
    raise exception 'FAIL: another allergen renamed did not clear the check';
  end if;
  update public.choice_options set allergens_reviewed = true where id = fries;
  update public.choice_options set custom_allergens = '{celery}' where id = fries;
  select o.allergens_reviewed into reviewed from public.choice_options o where o.id = fries;
  if reviewed then
    raise exception 'FAIL: another allergen removed did not clear the check';
  end if;
  raise notice 'ok: another allergen added, renamed, or removed clears the check';

  update public.choice_options set allergens_reviewed = true where id = fries;
  update public.choice_options
  set allergens = '{milk,wheat}', custom_allergens = '{celery}'
  where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by into reviewed, by_whom
  from public.choice_options o where o.id = fries;
  if not reviewed or by_whom is distinct from uid then
    raise exception 'FAIL: the same lists written again cleared the check';
  end if;
  raise notice 'ok: the same lists written again leave the check';

  update public.choice_options set allergens_reviewed = false where id = fries;
  select o.allergens_reviewed, o.allergens_reviewed_by, o.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.choice_options o where o.id = fries;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: an uncheck left the stamp';
  end if;
  raise notice 'ok: an uncheck clears the stamp';

  -- A list with nothing in it can be checked: checked, none of the major
  -- allergens (D-35, D-148).
  update public.choice_options set allergens_reviewed = true where id = salad;
  select o.allergens_reviewed, o.allergens_reviewed_by into reviewed, by_whom
  from public.choice_options o where o.id = salad;
  if not reviewed or by_whom is distinct from uid then
    raise exception 'FAIL: an option with nothing listed could not be checked';
  end if;
  raise notice 'ok: a list with nothing in it can be checked';

  -- One statement that changes a list and checks it ends unchecked, which
  -- is why the apply sends two (D-129).
  update public.choice_options set allergens_reviewed = false where id = salad;
  update public.choice_options set allergens = '{eggs}', allergens_reviewed = true
  where id = salad;
  select o.allergens_reviewed, o.allergens_reviewed_by into reviewed, by_whom
  from public.choice_options o where o.id = salad;
  if reviewed or by_whom is not null then
    raise exception 'FAIL: one statement changed a list and checked it';
  end if;
  raise notice 'ok: one statement that changes a list and checks it ends unchecked';

  -- The app's rule (D-149, D-153): every statement that changes or checks
  -- a list names the option's name and the lists the page showed, and
  -- lands on no row when the option holds others.
  update public.choice_options set allergens_reviewed = true
  where id = salad
    and name = 'Side salad'
    and allergens = '{eggs}'::public.allergen[]
    and custom_allergens = '{}'::text[];
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a check that named a name the option no longer holds landed';
  end if;
  update public.choice_options set allergens_reviewed = true
  where id = salad
    and name = 'Salad'
    and allergens = '{}'::public.allergen[]
    and custom_allergens = '{}'::text[];
  get diagnostics touched = row_count;
  select o.allergens_reviewed into reviewed from public.choice_options o where o.id = salad;
  if touched <> 0 or reviewed then
    raise exception 'FAIL: a check that named lists the option no longer holds landed';
  end if;
  update public.choice_options set allergens_reviewed = true
  where id = salad
    and name = 'Salad'
    and allergens = '{eggs}'::public.allergen[]
    and custom_allergens = '{}'::text[];
  get diagnostics touched = row_count;
  select o.allergens_reviewed into reviewed from public.choice_options o where o.id = salad;
  if touched <> 1 or not reviewed then
    raise exception 'FAIL: a check that named the name and the lists the option holds did not land';
  end if;
  raise notice 'ok: a check lands only when it names the name and the lists the option holds';
  update public.choice_options set allergens = '{}' where id = salad;

  -- The nine the US offers, each once (D-94, Q-4).
  begin
    update public.choice_options set allergens = '{celery}' where id = fries;
    raise exception 'FAIL: an allergen outside the nine was ticked';
  exception when check_violation then
    raise notice 'ok: only the nine the US offers can be ticked (choice_options_allergens_offered)';
  end;

  begin
    update public.choice_options set allergens = '{milk,milk}' where id = fries;
    raise exception 'FAIL: a repeated major allergen was accepted';
  exception when raise_exception then
    if sqlerrm <> 'allergens_repeated' then raise; end if;
    raise notice 'ok: a major allergen appears once';
  end;

  -- Another allergen, through the one lists rule (migration 8): one line
  -- of forty characters at most, no outer space, no comma in any of its
  -- three forms, never one of the nine, once whatever the case, and ten at
  -- most.
  foreach wanted_word in array
    array['', 'a' || chr(9) || 'b', ' celery', repeat('x', 41)] loop
    begin
      update public.choice_options set custom_allergens = array[wanted_word]
      where id = fries;
      raise exception 'FAIL: % was accepted as another allergen', wanted_word;
    exception when raise_exception then
      if sqlerrm <> 'other_allergen_text' then raise; end if;
    end;
  end loop;
  raise notice 'ok: another allergen is one line of 40 characters at most with no outer space';

  foreach wanted_word in array array['nuts, except almonds',
    'nuts' || chr(65292) || ' except almonds',
    'nuts' || chr(12289) || ' except almonds'] loop
    begin
      update public.choice_options set custom_allergens = array[wanted_word]
      where id = fries;
      raise exception 'FAIL: % was accepted as another allergen', wanted_word;
    exception when raise_exception then
      if sqlerrm <> 'other_allergen_comma' then raise; end if;
    end;
  end loop;
  raise notice 'ok: another allergen holds no comma, plain, fullwidth, or ideographic (D-151)';

  foreach wanted_word in array array['Milk', 'DAIRY', 'tree nuts', 'nuts'] loop
    begin
      update public.choice_options set custom_allergens = array[wanted_word]
      where id = fries;
      raise exception 'FAIL: % was accepted as another allergen', wanted_word;
    exception when raise_exception then
      if sqlerrm <> 'other_allergen_major' then raise; end if;
    end;
  end loop;
  raise notice 'ok: a word that means one of the nine is refused as another allergen';

  begin
    update public.choice_options set custom_allergens = array['celery', 'Celery']
    where id = fries;
    raise exception 'FAIL: another allergen was accepted twice';
  exception when raise_exception then
    if sqlerrm <> 'other_allergen_repeated' then raise; end if;
    raise notice 'ok: another allergen appears once, whatever the case';
  end;

  begin
    update public.choice_options
    set custom_allergens = array['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
      'a8', 'a9', 'a10', 'a11']
    where id = fries;
    raise exception 'FAIL: eleven other allergens were accepted';
  exception when check_violation then
    raise notice 'ok: an option lists ten other allergens at most';
  end;

  update public.choice_options set custom_allergens = '{}', allergens = '{}'
  where id = fries;
  update public.choice_options set name = 'Fries' where id = fries;

  -- Marking a list by hand marks the list only. Its options keep their own
  -- state, and an option under a deleted list is still accepted today
  -- (Q-45), as a size under a deleted dish is.
  update public.choice_lists set deleted_at = now() where id = a_list;
  select bool_and(o.deleted_at is null) into untouched
  from public.choice_options o where o.choice_list_id = a_list;
  if untouched is not true then
    raise exception 'FAIL: deleting a list marked its options';
  end if;
  insert into public.choice_options (choice_list_id, name, sort)
  values (a_list, 'Late', 9);
  update public.choice_options set deleted_at = now()
  where choice_list_id = a_list and name = 'Late';
  raise notice 'ok: a deleted list keeps its options as they were; an option under a deleted list is still accepted (Q-45)';
  update public.choice_lists set deleted_at = null where id = a_list;

  -- The order function takes exactly the list's live options, each once.
  select array_agg(o.id order by o.sort, o.created_at, o.id) into ids
  from public.choice_options o
  where o.choice_list_id = a_list and o.deleted_at is null;
  n := cardinality(ids);
  select array_agg(o.id order by o.sort, o.created_at, o.id) into other_ids
  from public.choice_options o
  where o.choice_list_id = a_other and o.deleted_at is null;

  begin
    perform public.set_choice_option_order(a_list, ids[1:n - 1]);
    raise exception 'FAIL: a short list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that misses an option is refused';
  end;

  begin
    perform public.set_choice_option_order(a_list, ids[1:n - 1] || ids[1]);
    raise exception 'FAIL: a repeated id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a repeated id is refused';
  end;

  begin
    perform public.set_choice_option_order(a_list, array[ids]);
    raise exception 'FAIL: a nested list was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a nested list holding the right ids is refused';
  end;

  begin
    perform public.set_choice_option_order(a_list, other_ids);
    raise exception 'FAIL: another list''s options were accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: another list''s options are refused';
  end;

  update public.choice_options set deleted_at = now() where id = slaw;
  begin
    perform public.set_choice_option_order(a_list, ids);
    raise exception 'FAIL: a deleted option''s id was accepted';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a list that names a deleted option is refused';
  end;
  update public.choice_options set deleted_at = null where id = slaw;

  select array_agg(t.id order by t.ord desc) into flipped
  from unnest(ids) with ordinality as t (id, ord);
  perform public.set_choice_option_order(a_list, flipped);
  select bool_and(o.sort = t.ord) into in_place
  from unnest(flipped) with ordinality as t (id, ord)
  join public.choice_options o on o.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: set_choice_option_order did not write the order it was given';
  end if;
  raise notice 'ok: the right list is written as 1 to %', n;

  -- A row already in place is left alone: the same list again rewrites
  -- nothing, so no row moves to a new place in the table.
  select array_agg(o.ctid order by o.id) into places_before
  from public.choice_options o where o.choice_list_id = a_list;
  perform public.set_choice_option_order(a_list, flipped);
  select array_agg(o.ctid order by o.id) into places_after
  from public.choice_options o where o.choice_list_id = a_list;
  if places_before is distinct from places_after then
    raise exception 'FAIL: set_choice_option_order rewrote rows already in place';
  end if;
  raise notice 'ok: the same list again rewrites no row';

  perform set_config('boundary.fries', fries::text, true);
  perform set_config('boundary.order', array_to_string(flipped, ','), true);
end;
$$;

-- A stranger reads, writes, adds, and orders nothing, even with the list's
-- own order in hand.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  a_list uuid := current_setting('boundary.a_list')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  seen integer;
  touched integer;
begin
  select count(*) into seen from public.choice_options;
  if seen <> 0 then
    raise exception 'FAIL: a stranger read % options', seen;
  end if;

  update public.choice_options set name = 'Hijacked';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a stranger updated % options', touched;
  end if;
  raise notice 'ok: a stranger reads and updates zero options';

  -- The copy trigger cannot read the list, so it refuses before row level
  -- security is asked.
  begin
    insert into public.choice_options (choice_list_id, name, sort)
    values (a_list, 'Stranger', 9);
    raise exception 'FAIL: a stranger added an option';
  exception when raise_exception then
    if sqlerrm <> 'An option needs an existing choice list.' then raise; end if;
    raise notice 'ok: a stranger cannot add an option';
  end;

  begin
    perform public.set_choice_option_order(a_list, ids);
    raise exception 'FAIL: a stranger ordered options';
  exception when raise_exception then
    if sqlerrm <> 'order_mismatch' then raise; end if;
    raise notice 'ok: a stranger orders nothing, even with the list''s own order';
  end;
end;
$$;

-- As the table owner again: the stranger changed nothing; and with no
-- person signed in, a check is refused and an option is never born
-- checked (migration 7's shape).
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  a_list uuid := current_setting('boundary.a_list')::uuid;
  fries uuid := current_setting('boundary.fries')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  in_place boolean;
begin
  begin
    update public.choice_options set allergens_reviewed = true where id = fries;
    raise exception 'FAIL: a check was stamped with nobody signed in';
  exception when raise_exception then
    if sqlerrm <> 'allergen_check_needs_person' then raise; end if;
    raise notice 'ok: a check needs a signed-in person; a server key or the SQL editor with no user cannot check an option';
  end;

  begin
    insert into public.choice_options (choice_list_id, name, sort, allergens_reviewed)
    values (a_list, 'Born checked', 9, true);
    raise exception 'FAIL: an option was born checked';
  exception when raise_exception then
    if sqlerrm <> 'allergen_check_on_insert' then raise; end if;
    raise notice 'ok: an option is never born checked';
  end;

  select bool_and(o.sort = t.ord and o.choice_list_id = a_list) into in_place
  from unnest(ids) with ordinality as t (id, ord)
  join public.choice_options o on o.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: the order or the list changed under a stranger';
  end if;
  raise notice 'ok: the options are as the owner left them';
end;
$$;

-- A diner: the table and the function are closed.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.choice_options limit 1;
    raise exception 'FAIL: anon read the choice_options table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the choice_options table';
  end;

  begin
    perform public.set_choice_option_order(gen_random_uuid(),
      array[gen_random_uuid()]);
    raise exception 'FAIL: anon ran set_choice_option_order';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run set_choice_option_order';
  end;
end;
$$;

rollback;
