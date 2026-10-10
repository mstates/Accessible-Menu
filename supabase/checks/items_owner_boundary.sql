-- Owner boundary check for items, the dishes of a section. Run in the
-- Supabase SQL editor after every migration that touches items, the
-- functions that count and delete what a menu or a section holds, the
-- function that moves a dish, the allergen check (migration 7), the
-- lists rule (migration 8), or the schedule and availability (migration 9).
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
  c_dish uuid;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;

  -- price_text is gone (migration 6): market price is a choice, and the
  -- published view no longer names the column.
  if exists (
    select 1 from pg_attribute att
    where att.attrelid = 'public.items'::regclass
      and att.attname = 'price_text' and not att.attisdropped
  ) then
    raise exception 'FAIL: price_text is still a column of items';
  end if;
  if exists (
    select 1 from pg_attribute att
    where att.attrelid = 'public.published_items'::regclass
      and att.attname = 'price_text' and not att.attisdropped
  ) then
    raise exception 'FAIL: published_items still names price_text';
  end if;
  raise notice 'ok: price_text is gone from items and from published_items';

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
  expected := 'allergens, allergens_reviewed, available, custom_allergens, deleted_at, description, dietary_tags, name, note, price_cents, price_kind, sold_out_at, sort, special_schedule';
  if held is distinct from expected then
    raise exception 'FAIL: authenticated updates %, expected %', held, expected;
  end if;
  raise notice 'ok: authenticated writes only the listed columns of items, and never who checked the allergens or when';

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
  values (c_section, 'Boundary check C dish', 1) returning id into c_dish;

  perform set_config('boundary.a', a::text, true);
  perform set_config('boundary.c_dish', c_dish::text, true);
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
  uid uuid := current_setting('boundary.uid')::uuid;
  a uuid := current_setting('boundary.a')::uuid;
  b_restaurant uuid := current_setting('boundary.b')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  a_second uuid := current_setting('boundary.a_second')::uuid;
  a_other uuid := current_setting('boundary.a_other')::uuid;
  a_other_section uuid := current_setting('boundary.a_other_section')::uuid;
  b_section uuid := current_setting('boundary.b_section')::uuid;
  c_section uuid := current_setting('boundary.c_section')::uuid;
  c_dish uuid := current_setting('boundary.c_dish')::uuid;
  mine uuid;
  two uuid;
  three uuid;
  cup uuid;
  got uuid;
  held_section uuid;
  held_restaurant uuid;
  is_last boolean;
  size_item uuid;
  size_restaurant uuid;
  ids uuid[];
  other_ids uuid[];
  flipped uuid[];
  n integer;
  in_place boolean;
  untouched boolean;
  places_before tid[];
  places_after tid[];
  reviewed boolean;
  by_whom uuid;
  at_when timestamptz;
  touched integer;
  wanted_word text;
  bad text;
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

  -- The dish page's own columns (migration 6): the description, the price
  -- choice, the price, and the note land, each under its rule.
  update public.items
  set description = 'Line one' || chr(10) || 'Line two',
      price_kind = 'sizes', price_cents = 1250, note = 'Comes with fries'
  where id = mine;
  raise notice 'ok: an owner writes a description, a price choice, a price, and a note';

  begin
    update public.items set description = repeat('x', 501) where id = mine;
    raise exception 'FAIL: a 501 character description was accepted';
  exception when check_violation then
    raise notice 'ok: a description is 500 characters at most';
  end;

  begin
    update public.items set description = 'A tab' || chr(9) || 'here'
    where id = mine;
    raise exception 'FAIL: a description with a tab was accepted';
  exception when check_violation then
    raise notice 'ok: a description holds no control character but a line break';
  end;

  begin
    update public.items
    set description = 'Windows' || chr(13) || chr(10) || 'break'
    where id = mine;
    raise exception 'FAIL: a description with a Windows line break was accepted';
  exception when check_violation then
    raise notice 'ok: a Windows line break is refused; the app turns it into a plain one first';
  end;

  begin
    update public.items set description = '   ' where id = mine;
    raise exception 'FAIL: a blank description was accepted';
  exception when check_violation then
    raise notice 'ok: a blank description is refused; the app stores null';
  end;

  begin
    update public.items set note = 'Two' || chr(10) || 'lines' where id = mine;
    raise exception 'FAIL: a note with a line break was accepted';
  exception when check_violation then
    raise notice 'ok: a note is one line';
  end;

  begin
    update public.items set note = repeat('n', 121) where id = mine;
    raise exception 'FAIL: a 121 character note was accepted';
  exception when check_violation then
    raise notice 'ok: a note is 120 characters at most';
  end;

  begin
    update public.items set price_cents = 10000000 where id = mine;
    raise exception 'FAIL: a price over $99,999.99 was accepted';
  exception when check_violation then
    raise notice 'ok: a price is at most $99,999.99';
  end;

  begin
    update public.items set price_cents = -1 where id = mine;
    raise exception 'FAIL: a negative price was accepted';
  exception when check_violation then
    raise notice 'ok: a price is never negative';
  end;

  begin
    update public.items set price_kind = 'range' where id = mine;
    raise exception 'FAIL: a fourth price choice was accepted';
  exception when invalid_text_representation then
    raise notice 'ok: the price choice is one price, prices by size, or market price';
  end;

  update public.items set price_kind = 'market' where id = mine;
  update public.items
  set price_kind = 'one', description = null, note = null, price_cents = null
  where id = mine;
  raise notice 'ok: each price choice takes, and the texts and the price clear to null';

  -- The allergens and their check (migration 7, task 4, D-148). The two
  -- lists land and leave the dish unchecked; the stamp is never an owner's
  -- to write; a check is stamped with this user and now by the database;
  -- a change to anything but the lists leaves it; any change to a list
  -- clears it; the same lists written again do not.
  update public.items
  set allergens = '{milk,wheat}', custom_allergens = '{celery}'
  where id = mine;
  select i.allergens_reviewed, i.allergens_reviewed_by, i.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.items i where i.id = mine;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: listing allergens checked the dish';
  end if;
  raise notice 'ok: an owner writes the two allergen lists, and the dish stays unchecked';

  begin
    update public.items set allergens_reviewed_by = uid where id = mine;
    raise exception 'FAIL: an owner wrote who checked the allergens';
  exception when insufficient_privilege then
    raise notice 'ok: allergens_reviewed_by is not writable';
  end;

  begin
    update public.items set allergens_reviewed_at = now() where id = mine;
    raise exception 'FAIL: an owner wrote when the allergens were checked';
  exception when insufficient_privilege then
    raise notice 'ok: allergens_reviewed_at is not writable';
  end;

  update public.items set allergens_reviewed = true where id = mine;
  select i.allergens_reviewed, i.allergens_reviewed_by, i.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.items i where i.id = mine;
  if not reviewed or by_whom is distinct from uid or at_when is distinct from now() then
    raise exception 'FAIL: a check was not stamped with this user and now';
  end if;
  raise notice 'ok: a check is stamped with the person and the time by the database';

  update public.items
  set name = 'Boundary check one, renamed', description = 'New words',
      price_kind = 'one', price_cents = 100, note = 'A note'
  where id = mine;
  select i.allergens_reviewed, i.allergens_reviewed_by into reviewed, by_whom
  from public.items i where i.id = mine;
  if not reviewed or by_whom is distinct from uid then
    raise exception 'FAIL: a change to the name, description, price, or note cleared the check';
  end if;
  update public.items
  set name = 'Boundary check one', description = null, note = null,
      price_cents = null
  where id = mine;
  raise notice 'ok: a change to the name, description, price, or note leaves the check as it is';

  update public.items set allergens = '{milk,wheat,sesame}' where id = mine;
  select i.allergens_reviewed, i.allergens_reviewed_by, i.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.items i where i.id = mine;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: a major allergen ticked did not clear the check';
  end if;
  raise notice 'ok: a major allergen ticked clears the check and its stamp';

  update public.items set allergens_reviewed = true where id = mine;
  update public.items set allergens = '{milk,wheat}' where id = mine;
  select i.allergens_reviewed into reviewed from public.items i where i.id = mine;
  if reviewed then
    raise exception 'FAIL: a major allergen unticked did not clear the check';
  end if;
  raise notice 'ok: a major allergen unticked clears the check';

  update public.items set allergens_reviewed = true where id = mine;
  update public.items set custom_allergens = '{celery,mustard}' where id = mine;
  select i.allergens_reviewed into reviewed from public.items i where i.id = mine;
  if reviewed then
    raise exception 'FAIL: another allergen added did not clear the check';
  end if;
  update public.items set allergens_reviewed = true where id = mine;
  update public.items set custom_allergens = '{celery,lupin}' where id = mine;
  select i.allergens_reviewed into reviewed from public.items i where i.id = mine;
  if reviewed then
    raise exception 'FAIL: another allergen renamed did not clear the check';
  end if;
  update public.items set allergens_reviewed = true where id = mine;
  update public.items set custom_allergens = '{celery}' where id = mine;
  select i.allergens_reviewed into reviewed from public.items i where i.id = mine;
  if reviewed then
    raise exception 'FAIL: another allergen removed did not clear the check';
  end if;
  raise notice 'ok: another allergen added, renamed, or removed clears the check';

  update public.items set allergens_reviewed = true where id = mine;
  update public.items
  set allergens = '{milk,wheat}', custom_allergens = '{celery}'
  where id = mine;
  select i.allergens_reviewed, i.allergens_reviewed_by into reviewed, by_whom
  from public.items i where i.id = mine;
  if not reviewed or by_whom is distinct from uid then
    raise exception 'FAIL: the same lists written again cleared the check';
  end if;
  raise notice 'ok: the same lists written again leave the check';

  update public.items set allergens_reviewed = false where id = mine;
  select i.allergens_reviewed, i.allergens_reviewed_by, i.allergens_reviewed_at
    into reviewed, by_whom, at_when
  from public.items i where i.id = mine;
  if reviewed or by_whom is not null or at_when is not null then
    raise exception 'FAIL: an uncheck left the stamp';
  end if;
  raise notice 'ok: an uncheck clears the stamp';

  -- A list with nothing in it can be checked: checked, none of the major
  -- allergens (D-35, D-148).
  update public.items set allergens_reviewed = true where id = two;
  select i.allergens_reviewed, i.allergens_reviewed_by into reviewed, by_whom
  from public.items i where i.id = two;
  if not reviewed or by_whom is distinct from uid then
    raise exception 'FAIL: a dish with nothing listed could not be checked';
  end if;
  raise notice 'ok: a list with nothing in it can be checked';

  -- One statement that changes a list and checks it ends unchecked, which
  -- is why the apply sends two (D-129).
  update public.items set allergens_reviewed = false where id = two;
  update public.items set allergens = '{eggs}', allergens_reviewed = true
  where id = two;
  select i.allergens_reviewed, i.allergens_reviewed_by into reviewed, by_whom
  from public.items i where i.id = two;
  if reviewed or by_whom is not null then
    raise exception 'FAIL: one statement changed a list and checked it';
  end if;
  raise notice 'ok: one statement that changes a list and checks it ends unchecked';

  -- The app's rule: every statement that checks names the lists the page
  -- showed, and lands on no row when the dish holds others (Michael,
  -- October 8, 2026).
  update public.items set allergens_reviewed = true
  where id = two
    and allergens = '{}'::public.allergen[]
    and custom_allergens = '{}'::text[];
  get diagnostics touched = row_count;
  select i.allergens_reviewed into reviewed from public.items i where i.id = two;
  if touched <> 0 or reviewed then
    raise exception 'FAIL: a check that named lists the dish no longer holds landed';
  end if;
  raise notice 'ok: a check that names lists the dish no longer holds lands on no row';
  update public.items set allergens = '{}' where id = two;

  -- The nine the US offers, each once (D-94, Q-4).
  begin
    update public.items set allergens = '{celery}' where id = mine;
    raise exception 'FAIL: an allergen outside the nine was ticked';
  exception when check_violation then
    raise notice 'ok: only the nine the US offers can be ticked; celery is typed as another allergen';
  end;

  begin
    update public.items set allergens = '{milk,milk}' where id = mine;
    raise exception 'FAIL: a repeated major allergen was accepted';
  exception when raise_exception then
    if sqlerrm <> 'allergens_repeated' then raise; end if;
    raise notice 'ok: a major allergen appears once';
  end;

  -- Another allergen: one line of something to read, forty characters at
  -- most, no outer space, no comma (migration 8, D-151), once whatever the
  -- case, never one of the nine, and ten at most.
  begin
    update public.items set custom_allergens = array[''] where id = mine;
    raise exception 'FAIL: a blank other allergen was accepted';
  exception when raise_exception then
    if sqlerrm <> 'other_allergen_text' then raise; end if;
    raise notice 'ok: another allergen cannot be blank';
  end;

  begin
    update public.items set custom_allergens = array['a' || chr(9) || 'b']
    where id = mine;
    raise exception 'FAIL: another allergen with a tab was accepted';
  exception when raise_exception then
    if sqlerrm <> 'other_allergen_text' then raise; end if;
    raise notice 'ok: another allergen is one line';
  end;

  begin
    update public.items set custom_allergens = array[' celery'] where id = mine;
    raise exception 'FAIL: another allergen with an outer space was accepted';
  exception when raise_exception then
    if sqlerrm <> 'other_allergen_text' then raise; end if;
    raise notice 'ok: another allergen has no outer space; the app trims first';
  end;

  begin
    update public.items set custom_allergens = array[repeat('x', 41)]
    where id = mine;
    raise exception 'FAIL: a 41 character other allergen was accepted';
  exception when raise_exception then
    if sqlerrm <> 'other_allergen_text' then raise; end if;
    raise notice 'ok: another allergen is 40 characters at most';
  end;

  -- A comma reads as two allergens to a diner, so none is held, in any of
  -- its three forms: plain, fullwidth, ideographic (D-151, Q-65).
  foreach wanted_word in array array['nuts, except almonds',
    'nuts' || chr(65292) || ' except almonds',
    'nuts' || chr(12289) || ' except almonds'] loop
    begin
      update public.items set custom_allergens = array[wanted_word] where id = mine;
      raise exception 'FAIL: % was accepted as another allergen', wanted_word;
    exception when raise_exception then
      if sqlerrm <> 'other_allergen_comma' then raise; end if;
    end;
  end loop;
  raise notice 'ok: another allergen holds no comma, plain, fullwidth, or ideographic; each allergen has its own row';

  foreach wanted_word in array array['Milk', 'DAIRY', 'tree nuts', 'nuts'] loop
    begin
      update public.items set custom_allergens = array[wanted_word] where id = mine;
      raise exception 'FAIL: % was accepted as another allergen', wanted_word;
    exception when raise_exception then
      if sqlerrm <> 'other_allergen_major' then raise; end if;
    end;
  end loop;
  raise notice 'ok: a word that means one of the nine is refused as another allergen; its box is the place';

  begin
    update public.items set custom_allergens = array['celery', 'Celery']
    where id = mine;
    raise exception 'FAIL: another allergen was accepted twice';
  exception when raise_exception then
    if sqlerrm <> 'other_allergen_repeated' then raise; end if;
    raise notice 'ok: another allergen appears once, whatever the case';
  end;

  begin
    update public.items
    set custom_allergens = array['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
      'a8', 'a9', 'a10', 'a11']
    where id = mine;
    raise exception 'FAIL: eleven other allergens were accepted';
  exception when check_violation then
    raise notice 'ok: a dish lists ten other allergens at most';
  end;

  update public.items set custom_allergens = '{}', allergens = '{}' where id = mine;

  -- Availability (D-160, migration 9): the flag, and the moment of a
  -- sold-out mark, which needs the dish available.
  update public.items set available = false where id = mine;
  update public.items set available = true, sold_out_at = now() where id = mine;
  raise notice 'ok: an owner writes available and the sold-out mark';

  begin
    update public.items set available = false, sold_out_at = now()
    where id = mine;
    raise exception 'FAIL: a sold-out mark on a dish off the menu was accepted';
  exception when check_violation then
    raise notice 'ok: a sold-out mark needs the dish available (items_sold_out_needs_available)';
  end;
  update public.items set available = false, sold_out_at = null where id = mine;
  update public.items set available = true where id = mine;

  -- Dietary tags (D-66, migration 9): the three, each once, written in the
  -- enum's order and compared as stored.
  update public.items set dietary_tags = '{vegan,vegetarian}' where id = mine;
  raise notice 'ok: an owner writes dietary tags';

  begin
    update public.items set dietary_tags = '{vegan,vegan}' where id = mine;
    raise exception 'FAIL: a repeated dietary tag was accepted';
  exception when check_violation then
    raise notice 'ok: each dietary tag once (items_dietary_tags_once)';
  end;

  begin
    update public.items set dietary_tags = '{kosher}' where id = mine;
    raise exception 'FAIL: a tag outside the three was accepted';
  exception when invalid_text_representation then
    raise notice 'ok: a tag outside the three is refused by the enum';
  end;

  update public.items set dietary_tags = '{vegetarian}'
  where id = mine and dietary_tags = '{}'::public.dietary_tag[];
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a tag write that named tags the dish no longer holds landed';
  end if;
  raise notice 'ok: a tag write that names tags the dish no longer holds lands on no row';
  update public.items set dietary_tags = '{}' where id = mine;

  -- The schedule's shape (D-159, migration 9): any of its five parts, and
  -- nothing else.
  update public.items set special_schedule =
    '{"days":["tue","thu"],"weeks":["first","last"],"months":["sep","oct","nov","dec","jan","feb","mar","apr"],"hours":{"open":"16:00","close":"21:00"},"from":"2026-09-01","until":"2027-04-30"}'
  where id = mine;
  update public.items set special_schedule = '{"until":"2026-10-31"}'
  where id = mine;
  update public.items set special_schedule =
    '{"hours":{"open":"22:00","close":"02:00"}}'
  where id = mine;
  update public.items set special_schedule =
    '{"from":"2027-02-10","until":"2027-02-10"}'
  where id = mine;
  raise notice 'ok: an owner writes a schedule with any of its five parts';

  foreach bad in array array[
    'null', '[]', '"tuesdays"', '{}', '{"holiday":true}',
    '{"days":"tue"}', '{"days":[]}', '{"days":null}',
    '{"days":["tuesday"]}', '{"days":["tue","tue"]}', '{"days":["tue",1]}',
    '{"weeks":["first"]}', '{"days":["fri"],"weeks":["first","first"]}',
    '{"days":["fri"],"weeks":["fifth"]}',
    '{"months":["may","may"]}', '{"months":["sept"]}', '{"months":[]}',
    '{"hours":{"open":"16:00"}}', '{"hours":{"open":"4 pm","close":"21:00"}}',
    '{"hours":{"open":"16:00","close":"16:00"}}',
    '{"hours":{"open":"16:00","close":"21:00","note":"x"}}',
    '{"hours":{"open":null,"close":"21:00"}}', '{"hours":"16:00-21:00"}',
    '{"from":"2027-2-10"}', '{"from":"2027-02-30"}', '{"from":null}',
    '{"until":20261031}', '{"from":"2027-03-26","until":"2027-02-10"}'
  ] loop
    begin
      update public.items set special_schedule = bad::jsonb where id = mine;
      raise exception 'FAIL: % was accepted as a schedule', bad;
    exception when check_violation then
      null;
    end;
  end loop;
  raise notice 'ok: every bad shape is refused as a check violation (items_special_schedule_shape)';

  update public.items set special_schedule = '{"days":["tue"]}' where id = mine;
  update public.items set special_schedule = '{"days":["wed"]}'
  where id = mine and special_schedule is null;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a schedule write for a dish the page showed without one landed';
  end if;
  update public.items set special_schedule = '{"days":["wed"]}'
  where id = mine and special_schedule = '{"days":["mon"]}'::jsonb;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: a schedule write that named a schedule the dish no longer holds landed';
  end if;
  update public.items set special_schedule = '{"days":["wed"]}'
  where id = mine and special_schedule = '{"days": ["tue"]}'::jsonb;
  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception 'FAIL: a schedule write that named the schedule the dish holds did not land';
  end if;
  raise notice 'ok: a schedule write lands only when it names the schedule the dish holds, as jsonb compares it';
  update public.items set special_schedule = null where id = mine;

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

  -- move_item(): a dish goes to another section of its own restaurant,
  -- last, with its sizes, and nowhere else (D-129). section_id itself
  -- stays unwritable, as the check further up proves.
  insert into public.item_sizes (item_id, name, price_cents)
  values (two, 'Boundary check cup', 500) returning id into cup;
  perform public.move_item(two, a_second);
  select i.section_id, i.restaurant_id,
         i.sort > all (
           select o.sort from public.items o
           where o.section_id = a_second
             and o.deleted_at is null
             and o.id <> i.id
         )
    into held_section, held_restaurant, is_last
  from public.items i where i.id = two;
  if held_section is distinct from a_second
     or held_restaurant is distinct from a
     or is_last is not true then
    raise exception 'FAIL: a moved dish is not last in the section it went to, in its own restaurant';
  end if;
  select z.item_id, z.restaurant_id into size_item, size_restaurant
  from public.item_sizes z where z.id = cup;
  if size_item is distinct from two or size_restaurant is distinct from a then
    raise exception 'FAIL: a moved dish left its size behind';
  end if;
  raise notice 'ok: a dish moves to another section of its restaurant, last, and its size goes with it';

  begin
    perform public.move_item(two, a_second);
    raise exception 'FAIL: a dish was moved to the section it is in';
  exception when raise_exception then
    if sqlerrm <> 'move_same_section' then raise; end if;
    raise notice 'ok: a move to the section a dish is in is refused';
  end;

  -- A name the section already has, whatever the case or the outer
  -- spaces: the second section holds a Boundary check one of its own.
  update public.items set name = ' BOUNDARY check ONE ' where id = mine;
  begin
    perform public.move_item(mine, a_second);
    raise exception 'FAIL: a dish moved into a section that has its name';
  exception when raise_exception then
    if sqlerrm <> 'move_name_taken' then raise; end if;
    raise notice 'ok: a name the section already has is refused, any case or spacing';
  end;
  update public.items set name = 'Boundary check one' where id = mine;
  select i.section_id into held_section from public.items i where i.id = mine;
  if held_section is distinct from a_section then
    raise exception 'FAIL: a refused move moved the dish';
  end if;

  -- Another menu of the same restaurant takes it.
  perform public.move_item(two, a_other_section);
  select i.section_id into held_section from public.items i where i.id = two;
  if held_section is distinct from a_other_section then
    raise exception 'FAIL: a dish did not move to a section of another menu';
  end if;
  raise notice 'ok: a dish moves to a section of another menu of its restaurant';

  -- The other restaurant, though this user is a member of both.
  begin
    perform public.move_item(two, b_section);
    raise exception 'FAIL: a dish crossed to another restaurant';
  exception when raise_exception then
    if sqlerrm <> 'move_section_gone' then raise; end if;
    raise notice 'ok: a dish does not cross to another restaurant, even for a member of both';
  end;

  begin
    perform public.move_item(two, c_section);
    raise exception 'FAIL: a dish moved to a section its owner cannot read';
  exception when raise_exception then
    if sqlerrm <> 'move_section_gone' then raise; end if;
    raise notice 'ok: a section of a restaurant this user is not in reads as gone';
  end;

  begin
    perform public.move_item(c_dish, a_section);
    raise exception 'FAIL: an owner moved a dish that is not theirs';
  exception when raise_exception then
    if sqlerrm <> 'move_not_found' then raise; end if;
    raise notice 'ok: a dish that is not this user''s reads as not there';
  end;

  -- A deleted section takes no dish, and gives none up.
  update public.sections set deleted_at = now() where id = a_second;
  begin
    perform public.move_item(two, a_second);
    raise exception 'FAIL: a dish moved into a deleted section';
  exception when raise_exception then
    if sqlerrm <> 'move_section_gone' then raise; end if;
    raise notice 'ok: a deleted section takes no dish';
  end;
  update public.sections set deleted_at = null where id = a_second;

  -- A section of a deleted menu takes no dish, and gives none up.
  update public.menus set deleted_at = now() where id = a_other;
  begin
    perform public.move_item(mine, a_other_section);
    raise exception 'FAIL: a dish moved into a section of a deleted menu';
  exception when raise_exception then
    if sqlerrm <> 'move_section_gone' then raise; end if;
    raise notice 'ok: a section of a deleted menu takes no dish';
  end;
  begin
    perform public.move_item(two, a_section);
    raise exception 'FAIL: a dish moved out of a section of a deleted menu';
  exception when raise_exception then
    if sqlerrm <> 'move_not_found' then raise; end if;
    raise notice 'ok: a section of a deleted menu gives no dish up';
  end;
  update public.menus set deleted_at = null where id = a_other;

  -- A deleted dish does not move.
  update public.items set deleted_at = now() where id = two;
  begin
    perform public.move_item(two, a_section);
    raise exception 'FAIL: a deleted dish moved';
  exception when raise_exception then
    if sqlerrm <> 'move_not_found' then raise; end if;
    raise notice 'ok: a deleted dish does not move';
  end;
  update public.items set deleted_at = null where id = two;

  -- And back, which is what Undo sends.
  perform public.move_item(two, a_section);
  select i.section_id into held_section from public.items i where i.id = two;
  if held_section is distinct from a_section then
    raise exception 'FAIL: a dish did not move back';
  end if;
  raise notice 'ok: a dish moves back to the section it came from';

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
  a_second uuid := current_setting('boundary.a_second')::uuid;
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

  begin
    perform public.move_item(ids[1], a_second);
    raise exception 'FAIL: a stranger moved a dish';
  exception when raise_exception then
    if sqlerrm <> 'move_not_found' then raise; end if;
    raise notice 'ok: a stranger moves nothing';
  end;
end;
$$;

-- As the table owner again: the stranger moved and marked nothing; and
-- with no person signed in, a check is refused and a dish is never born
-- checked (migration 7).
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  a_menu uuid := current_setting('boundary.a_menu')::uuid;
  a_section uuid := current_setting('boundary.a_section')::uuid;
  ids uuid[] := string_to_array(current_setting('boundary.order'), ',')::uuid[];
  in_place boolean;
  live boolean;
begin
  begin
    update public.items set allergens_reviewed = true where id = ids[1];
    raise exception 'FAIL: a check was stamped with nobody signed in';
  exception when raise_exception then
    if sqlerrm <> 'allergen_check_needs_person' then raise; end if;
    raise notice 'ok: a check needs a signed-in person; a server key or the SQL editor with no user cannot check a dish';
  end;

  begin
    insert into public.items (section_id, name, sort, allergens_reviewed)
    values (a_section, 'Boundary check born checked', 9100, true);
    raise exception 'FAIL: a dish was born checked';
  exception when raise_exception then
    if sqlerrm <> 'allergen_check_on_insert' then raise; end if;
    raise notice 'ok: a dish is never born checked';
  end;

  select bool_and(i.sort = t.ord and i.section_id = a_section) into in_place
  from unnest(ids) with ordinality as t (id, ord)
  join public.items i on i.id = t.id;
  if in_place is not true then
    raise exception 'FAIL: the order or the section changed under a stranger';
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

-- A diner: the table and the five functions are closed, and the views are
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

  begin
    perform public.move_item(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon ran move_item';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot run move_item';
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
