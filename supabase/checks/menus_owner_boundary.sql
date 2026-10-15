-- Owner boundary check for menus. Run in the Supabase SQL editor after every
-- migration that touches menus, Publish, or the published views
-- (migrations 12 and 14). Everything rolls back. Replace the uid below with
-- your own auth.users id. A run that ends without an error passed every
-- check.
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

  -- No role can publish by column (migration 12): the flag, the time, and
  -- the snapshot stay whole, so a flag alone is refused, and publish_menu()
  -- is the only way to publish.
  begin
    insert into public.menus (restaurant_id, name, published)
    values (target, 'Boundary check published', true);
    raise exception 'FAIL: the table owner published a menu by its flag alone';
  exception when check_violation then
    raise notice 'ok: no role can publish by the flag alone; the three columns stay whole';
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
  -- The oldest restaurant on trial or active: the three published views
  -- hide a paused or closed restaurant (Q-8), so the Publish block's reads
  -- of them below would fail on a closed one, as Michael's oldest, Test
  -- Kitchen, is on the live database.
  select id into target from public.restaurants
  where status in ('trial', 'active') order by created_at limit 1;
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
    update public.menus set published_snapshot = '{}' where id = one;
    raise exception 'FAIL: an owner wrote published_snapshot';
  exception when insufficient_privilege then
    raise notice 'ok: published_snapshot is not writable';
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

-- Publish and unpublish, as the owner (migration 12). The block builds a
-- menu of its own: a live section and a deleted one with a dish, a dish by
-- size with two sizes, an unchecked dish with a list, a checked dish with
-- two lists (one with a live checked option, a live unchecked option, and
-- a deleted option; one with no option), and a dish with a blank one
-- price. One transaction means now() never moves here, so the time is
-- checked for presence, never for moving.
do $$
declare
  target uuid := current_setting('boundary.restaurant')::uuid;
  pub uuid;
  two uuid;
  two_section uuid;
  two_dish uuid;
  empty_menu uuid;
  empty_section uuid;
  empty_dish uuid;
  gone_menu uuid;
  live_section uuid;
  gone_section uuid;
  hidden_dish uuid;
  sized uuid;
  unchecked uuid;
  checked uuid;
  blank uuid;
  added uuid;
  list_id uuid;
  empty_list uuid;
  option_live uuid;
  option_unchecked uuid;
  option_gone uuid;
  size_id uuid;
  snap jsonb;
  item jsonb;
  st record;
  n integer;
  word text;
begin
  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check publish', 9010) returning id into pub;
  perform set_config('boundary.publish_menu', pub::text, true);
  insert into public.sections (menu_id, name, sort)
  values (pub, 'Boundary live section', 1) returning id into live_section;
  insert into public.sections (menu_id, name, sort)
  values (pub, 'Boundary gone section', 2) returning id into gone_section;
  insert into public.items (section_id, name, sort)
  values (gone_section, 'Boundary hidden dish', 1) returning id into hidden_dish;
  update public.sections set deleted_at = now() where id = gone_section;

  insert into public.items (section_id, name, sort)
  values (live_section, 'Boundary sized', 1) returning id into sized;
  update public.items set price_kind = 'sizes' where id = sized;
  insert into public.item_sizes (item_id, name, price_cents)
  values (sized, 'Bowl', 800);
  insert into public.item_sizes (item_id, name, price_cents)
  values (sized, 'Cup', 500);
  insert into public.items (section_id, name, sort)
  values (live_section, 'Boundary unchecked', 2) returning id into unchecked;
  update public.items set allergens = '{milk}' where id = unchecked;
  insert into public.items (section_id, name, sort)
  values (live_section, 'Boundary checked', 3) returning id into checked;
  update public.items set allergens = '{wheat}', custom_allergens = '{celery}'
  where id = checked;
  update public.items set allergens_reviewed = true where id = checked;
  insert into public.items (section_id, name, sort)
  values (live_section, 'Boundary blank price', 4) returning id into blank;
  insert into public.choice_lists (item_id, lead, sort)
  values (checked, 'Boundary add-ons', 1) returning id into list_id;
  insert into public.choice_lists (item_id, lead, sort)
  values (checked, 'Boundary empty list', 2) returning id into empty_list;
  insert into public.choice_options (choice_list_id, name, sort)
  values (list_id, 'Boundary live option', 1) returning id into option_live;
  update public.choice_options set allergens = '{eggs}' where id = option_live;
  update public.choice_options set allergens_reviewed = true
  where id = option_live;
  insert into public.choice_options (choice_list_id, name, sort)
  values (list_id, 'Boundary unchecked option', 2)
  returning id into option_unchecked;
  insert into public.choice_options (choice_list_id, name, sort)
  values (list_id, 'Boundary gone option', 3) returning id into option_gone;
  update public.choice_options set deleted_at = now() where id = option_gone;

  if exists (select 1 from public.publish_problems(pub)) then
    raise exception 'FAIL: a complete menu has publish problems';
  end if;
  select s.published, s.published_at, s.changed into st
  from public.menu_publish_states(target) s where s.menu = pub;
  if st.published or st.published_at is not null or st.changed is not null then
    raise exception 'FAIL: a new menu reads as published';
  end if;
  raise notice 'ok: a new menu has no publish problems and reads as not published, with no changed state';

  perform public.publish_menu(pub);
  select m.published_snapshot into snap from public.menus m where m.id = pub;
  if not (select m.published from public.menus m where m.id = pub)
     or (select m.published_at from public.menus m where m.id = pub) is null
     or snap is null then
    raise exception 'FAIL: Publish did not write the flag, the time, and the snapshot together';
  end if;
  if (snap ->> 'v') <> '1' or (snap -> 'menu' ->> 'name') <> 'Boundary check publish' then
    raise exception 'FAIL: the snapshot is not v1 with the menu''s name';
  end if;
  if jsonb_array_length(snap -> 'sections') <> 1
     or (snap -> 'sections' -> 0 ->> 'name') <> 'Boundary live section' then
    raise exception 'FAIL: the snapshot carries % sections', jsonb_array_length(snap -> 'sections');
  end if;
  if position('Boundary hidden dish' in snap::text) > 0 then
    raise exception 'FAIL: a dish under a deleted section was published';
  end if;
  if jsonb_array_length(snap -> 'sections' -> 0 -> 'items') <> 4 then
    raise exception 'FAIL: the section carries % dishes', jsonb_array_length(snap -> 'sections' -> 0 -> 'items');
  end if;
  item := snap -> 'sections' -> 0 -> 'items' -> 0;
  if (item ->> 'name') <> 'Boundary sized'
     or (item -> 'price' ->> 'kind') <> 'sizes'
     or (item -> 'price' -> 'sizes' -> 0 ->> 'name') <> 'Cup'
     or (item -> 'price' -> 'sizes' -> 1 ->> 'name') <> 'Bowl' then
    raise exception 'FAIL: sizes are not in price order';
  end if;
  item := snap -> 'sections' -> 0 -> 'items' -> 1;
  if (item ->> 'name') <> 'Boundary unchecked'
     or (item -> 'allergens') <> '{"checked": false}'::jsonb then
    raise exception 'FAIL: an unchecked dish carried its list';
  end if;
  item := snap -> 'sections' -> 0 -> 'items' -> 2;
  if (item ->> 'name') <> 'Boundary checked'
     or (item -> 'allergens') <> '{"checked": true, "major": ["wheat"], "other": ["celery"]}'::jsonb then
    raise exception 'FAIL: a checked dish did not carry its lists';
  end if;
  if jsonb_array_length(item -> 'choice_lists') <> 1 then
    raise exception 'FAIL: a list with no option was published';
  end if;
  if jsonb_array_length(item -> 'choice_lists' -> 0 -> 'options') <> 2 then
    raise exception 'FAIL: a deleted option was published';
  end if;
  if (item -> 'choice_lists' -> 0 -> 'options' -> 0 -> 'allergens')
       <> '{"checked": true, "major": ["eggs"], "other": []}'::jsonb
     or (item -> 'choice_lists' -> 0 -> 'options' -> 1 -> 'allergens')
       <> '{"checked": false}'::jsonb then
    raise exception 'FAIL: an option''s lists are not as checked';
  end if;
  item := snap -> 'sections' -> 0 -> 'items' -> 3;
  if (item ->> 'name') <> 'Boundary blank price'
     or (item -> 'price') <> '{"kind": "one", "price_cents": null, "calories_low": null, "calories_high": null}'::jsonb then
    raise exception 'FAIL: a blank one price is not published as no price';
  end if;
  foreach word in array array['allergens_reviewed_by', 'allergens_reviewed_at',
    'allergen_suggestions', 'photo_url', 'photo_alt', 'sold_out_at',
    'special_schedule', 'available', 'deleted_at', 'updated_at', 'created_at',
    'import_confidence', 'external_ids', 'restaurant_id'] loop
    if position(word in snap::text) > 0 then
      raise exception 'FAIL: the snapshot names %', word;
    end if;
  end loop;
  raise notice 'ok: Publish wrote a v1 snapshot that leaves out the deleted section and its dish, the empty list, the deleted option, every unchecked list, and every private column';

  select s.published, s.changed into st
  from public.menu_publish_states(target) s where s.menu = pub;
  if not st.published or st.changed then
    raise exception 'FAIL: a menu just published reads as changed';
  end if;
  update public.items set sold_out_at = now() where id = sized;
  update public.items set special_schedule = '{"days":["mon"]}'::jsonb
  where id = blank;
  select s.changed into st from public.menu_publish_states(target) s
  where s.menu = pub;
  if st.changed then
    raise exception 'FAIL: a sold-out mark or a schedule counts as a change';
  end if;
  update public.sections set name = 'Boundary live section renamed'
  where id = live_section;
  select s.changed into st from public.menu_publish_states(target) s
  where s.menu = pub;
  if not st.changed then
    raise exception 'FAIL: a renamed section does not count as a change';
  end if;
  if (select m.published_snapshot from public.menus m where m.id = pub) <> snap then
    raise exception 'FAIL: the snapshot moved without Publish';
  end if;
  raise notice 'ok: a sold-out mark and a schedule are not changes, a renamed section is, and the snapshot stays until Publish';

  insert into public.items (section_id, name, sort)
  values (live_section, 'Boundary added after', 5) returning id into added;
  update public.items set deleted_at = now() where id = unchecked;
  if exists (select 1 from public.published_item_states ps where ps.id = added) then
    raise exception 'FAIL: a dish added after Publish has a state row';
  end if;
  if not exists (
    select 1 from public.published_item_states ps
    where ps.id = unchecked and ps.menu_id = pub
  ) then
    raise exception 'FAIL: a dish deleted after Publish lost its state row';
  end if;
  select count(*) into n from public.published_item_states ps where ps.menu_id = pub;
  if n <> 4 then
    raise exception 'FAIL: published_item_states shows % dishes for the menu, expected 4', n;
  end if;
  if not exists (
    select 1 from public.published_item_states ps
    where ps.id = sized and ps.sold_out_at is not null
  ) then
    raise exception 'FAIL: the state view does not carry the sold-out mark';
  end if;
  raise notice 'ok: published_item_states keys by the snapshot''s dish ids: a dish added after Publish has no row, a dish deleted after Publish keeps one, and the mark is live';

  insert into public.item_sizes (item_id, name, price_cents)
  values (sized, null, 300) returning id into size_id;
  select count(*) into n from public.publish_problems(pub);
  select s.problem, s.dish_name, s.section_name into st
  from public.publish_problems(pub) s;
  if n <> 1 or st.problem <> 'size_unnamed' or st.dish_name <> 'Boundary sized'
     or st.section_name <> 'Boundary live section renamed' then
    raise exception 'FAIL: an unnamed size is not reported as the one problem';
  end if;
  begin
    perform public.publish_menu(pub);
    raise exception 'FAIL: a menu with an unnamed size was published';
  exception when raise_exception then
    if sqlerrm <> 'publish_blocked' then raise; end if;
  end;
  if (select m.published_snapshot from public.menus m where m.id = pub) <> snap then
    raise exception 'FAIL: a blocked Publish wrote the snapshot';
  end if;
  update public.item_sizes set name = 'Mug', price_cents = null where id = size_id;
  select s.problem into st from public.publish_problems(pub) s;
  if st.problem <> 'size_unpriced' then
    raise exception 'FAIL: a size with no price is not reported';
  end if;
  begin
    perform public.publish_menu(pub);
    raise exception 'FAIL: a menu with an unpriced size was published';
  exception when raise_exception then
    if sqlerrm <> 'publish_blocked' then raise; end if;
  end;
  raise notice 'ok: a size with no name or no price blocks Publish by name, and nothing is written';

  update public.item_sizes set deleted_at = now() where id = size_id;
  perform public.publish_menu(pub);
  select m.published_snapshot into snap from public.menus m where m.id = pub;
  if (snap -> 'sections' -> 0 ->> 'name') <> 'Boundary live section renamed'
     or jsonb_array_length(snap -> 'sections' -> 0 -> 'items') <> 4
     or jsonb_path_exists(snap, '$.sections[*].items[*] ? (@.name == "Boundary unchecked")')
     or not jsonb_path_exists(snap, '$.sections[*].items[*] ? (@.name == "Boundary added after")') then
    raise exception 'FAIL: Publish again did not carry the rename, the added dish, and the delete';
  end if;
  select s.changed into st from public.menu_publish_states(target) s
  where s.menu = pub;
  if st.changed then
    raise exception 'FAIL: a menu just published again reads as changed';
  end if;
  raise notice 'ok: Publish again carries the rename, the added dish, and the delete, and the draft reads as not changed';

  perform public.unpublish_menu(pub);
  if (select m.published or m.published_at is not null
        or m.published_snapshot is not null
      from public.menus m where m.id = pub) then
    raise exception 'FAIL: Unpublish left the flag, the time, or the snapshot';
  end if;
  perform public.unpublish_menu(pub);
  raise notice 'ok: Unpublish clears the flag, the time, and the snapshot, and a second press changes nothing';

  perform public.publish_menu(pub);

  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check publish gone', 9011) returning id into gone_menu;
  update public.menus set deleted_at = now() where id = gone_menu;
  begin
    perform public.publish_menu(gone_menu);
    raise exception 'FAIL: a deleted menu was published';
  exception when raise_exception then
    if sqlerrm <> 'publish_not_found' then raise; end if;
  end;
  begin
    perform public.unpublish_menu(gone_menu);
    raise exception 'FAIL: a deleted menu was unpublished';
  exception when raise_exception then
    if sqlerrm <> 'unpublish_not_found' then raise; end if;
  end;
  raise notice 'ok: a deleted menu can be neither published nor unpublished';

  -- A menu with no dishes (migration 14, D-177): no sections, a section
  -- with no dish, and a section whose only dish is deleted each report the
  -- menu itself, once, with nothing named, and Publish refuses with nothing
  -- written; a dish off the menu for now, and one past its last day, still
  -- count, since availability and schedules are not read; an emptied menu
  -- reads as no dishes again, and a deleted menu reports nothing. The
  -- stranger block below reads the empty menu's id.
  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check publish empty', 9013) returning id into empty_menu;
  perform set_config('boundary.empty_menu', empty_menu::text, true);
  select count(*) into n from public.publish_problems(empty_menu);
  select s.problem, s.dish, s.dish_name, s.section_name, s.size into st
  from public.publish_problems(empty_menu) s;
  if n <> 1 or st.problem is distinct from 'no_dishes' or st.dish is not null
     or st.dish_name is not null or st.section_name is not null
     or st.size is not null then
    raise exception 'FAIL: a menu with no sections is not reported as the one problem, no_dishes with nothing named';
  end if;
  begin
    perform public.publish_menu(empty_menu);
    raise exception 'FAIL: a menu with no sections was published';
  exception when raise_exception then
    if sqlerrm <> 'publish_blocked' then raise; end if;
  end;
  if (select m.published or m.published_at is not null
        or m.published_snapshot is not null
      from public.menus m where m.id = empty_menu) then
    raise exception 'FAIL: a blocked Publish of an empty menu wrote the flag, the time, or the snapshot';
  end if;
  insert into public.sections (menu_id, name, sort)
  values (empty_menu, 'Boundary empty section', 1) returning id into empty_section;
  select count(*) into n from public.publish_problems(empty_menu);
  select s.problem into st from public.publish_problems(empty_menu) s;
  if n <> 1 or st.problem is distinct from 'no_dishes' then
    raise exception 'FAIL: a section with no dish is not reported as no_dishes';
  end if;
  insert into public.items (section_id, name, sort)
  values (empty_section, 'Boundary empty dish', 1) returning id into empty_dish;
  update public.items set deleted_at = now() where id = empty_dish;
  select count(*) into n from public.publish_problems(empty_menu);
  select s.problem into st from public.publish_problems(empty_menu) s;
  if n <> 1 or st.problem is distinct from 'no_dishes' then
    raise exception 'FAIL: a section whose only dish is deleted is not reported as no_dishes';
  end if;
  begin
    perform public.publish_menu(empty_menu);
    raise exception 'FAIL: a menu whose only dish is deleted was published';
  exception when raise_exception then
    if sqlerrm <> 'publish_blocked' then raise; end if;
  end;
  raise notice 'ok: a menu with no dishes blocks Publish by the menu, with no sections, a section with no dish, or only a deleted dish, and nothing is written';

  update public.items set deleted_at = null, available = false where id = empty_dish;
  if exists (select 1 from public.publish_problems(empty_menu)) then
    raise exception 'FAIL: a dish off the menu for now is not counted as a dish';
  end if;
  perform public.publish_menu(empty_menu);
  if not jsonb_path_exists(
    (select m.published_snapshot from public.menus m where m.id = empty_menu),
    '$.sections[*].items[*] ? (@.name == "Boundary empty dish")') then
    raise exception 'FAIL: the menu published with its dish off the menu lacks the dish in its snapshot';
  end if;
  update public.items
  set available = true, special_schedule = '{"until":"2026-01-01"}'::jsonb
  where id = empty_dish;
  if exists (select 1 from public.publish_problems(empty_menu)) then
    raise exception 'FAIL: a dish past its last day is not counted as a dish';
  end if;
  perform public.publish_menu(empty_menu);
  raise notice 'ok: a dish off the menu for now or past its last day still counts, so the menu publishes';

  perform public.unpublish_menu(empty_menu);
  update public.items set deleted_at = now() where id = empty_dish;
  select count(*) into n from public.publish_problems(empty_menu);
  select s.problem into st from public.publish_problems(empty_menu) s;
  if n <> 1 or st.problem is distinct from 'no_dishes' then
    raise exception 'FAIL: an emptied menu is not reported as no_dishes again';
  end if;
  if exists (select 1 from public.publish_problems(gone_menu)) then
    raise exception 'FAIL: a deleted menu reports a problem';
  end if;
  raise notice 'ok: an emptied menu reads as no dishes again, and a deleted menu reports nothing';

  insert into public.menus (restaurant_id, name, sort)
  values (target, 'Boundary check publish two', 9012) returning id into two;
  insert into public.sections (menu_id, name, sort)
  values (two, 'Boundary two section', 1) returning id into two_section;
  insert into public.items (section_id, name, sort)
  values (two_section, 'Boundary two dish', 1) returning id into two_dish;
  perform public.publish_menu(two);
  update public.menus set deleted_at = now() where id = two;
  if exists (select 1 from public.published_menus pm where pm.id = two) then
    raise exception 'FAIL: a deleted published menu is still in published_menus';
  end if;
  update public.menus set deleted_at = null where id = two;
  if not exists (
    select 1 from public.published_menus pm
    where pm.id = two and pm.published_snapshot is not null
  ) then
    raise exception 'FAIL: a restored menu did not come back as published';
  end if;
  raise notice 'ok: a deleted published menu is off at once, and a restore brings it back as it was published';

  -- A published menu whose dishes are all deleted after Publish stays as
  -- diners last read it, and the next press is refused by the menu
  -- (migration 14, D-177).
  update public.items set deleted_at = now() where id = two_dish;
  select m.published_snapshot into snap from public.menus m where m.id = two;
  begin
    perform public.publish_menu(two);
    raise exception 'FAIL: a published menu whose dishes are all deleted was published again';
  exception when raise_exception then
    if sqlerrm <> 'publish_blocked' then raise; end if;
  end;
  if (select m.published_snapshot from public.menus m where m.id = two) <> snap
     or not exists (select 1 from public.published_menus pm where pm.id = two) then
    raise exception 'FAIL: a refused press on a published menu changed what diners read';
  end if;
  raise notice 'ok: a published menu whose dishes are all deleted stays published as it was, and a new press is refused by the menu';
end;
$$;

-- A stranger reads, writes, orders, publishes, and unpublishes nothing.
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', gen_random_uuid()), true);

do $$
declare
  target uuid := current_setting('boundary.restaurant')::uuid;
  pub uuid := current_setting('boundary.publish_menu')::uuid;
  empty_menu uuid := current_setting('boundary.empty_menu')::uuid;
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

  begin
    perform public.publish_menu(pub);
    raise exception 'FAIL: a stranger published a menu';
  exception when raise_exception then
    if sqlerrm <> 'publish_not_found' then raise; end if;
  end;
  begin
    perform public.unpublish_menu(pub);
    raise exception 'FAIL: a stranger unpublished a menu';
  exception when raise_exception then
    if sqlerrm <> 'unpublish_not_found' then raise; end if;
  end;
  if public.menu_snapshot(pub) is not null
     or exists (select 1 from public.publish_problems(pub))
     or exists (select 1 from public.publish_problems(empty_menu))
     or exists (select 1 from public.menu_publish_states(target)) then
    raise exception 'FAIL: a stranger read a snapshot, a problem, or a state';
  end if;
  raise notice 'ok: a stranger publishes and unpublishes nothing, and reads no snapshot, problem, or state, not even an empty menu''s';

  raise notice 'ok: a stranger reads and updates zero menus';
end;
$$;

-- A diner: the tables and the five functions are closed, the views that
-- read drafts are gone, and the three that stay show the published menu
-- and nothing of a draft.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  target uuid := current_setting('boundary.restaurant')::uuid;
  pub uuid := current_setting('boundary.publish_menu')::uuid;
  shown integer;
  snap jsonb;
begin
  begin
    perform 1 from public.menus limit 1;
    raise exception 'FAIL: anon read the menus table';
  exception when insufficient_privilege then
    raise notice 'ok: anon cannot read the menus table';
  end;

  begin
    perform public.publish_menu(pub);
    raise exception 'FAIL: anon ran publish_menu';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.unpublish_menu(pub);
    raise exception 'FAIL: anon ran unpublish_menu';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.menu_snapshot(pub);
    raise exception 'FAIL: anon ran menu_snapshot';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.publish_problems(pub);
    raise exception 'FAIL: anon ran publish_problems';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.menu_publish_states(target);
    raise exception 'FAIL: anon ran menu_publish_states';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon cannot run publish_menu, unpublish_menu, menu_snapshot, publish_problems, or menu_publish_states';

  if to_regclass('public.published_sections') is not null
     or to_regclass('public.published_items') is not null then
    raise exception 'FAIL: a view that read drafts is still there';
  end if;
  raise notice 'ok: published_sections and published_items are gone';

  select count(*) into shown from public.published_menus pm
  where pm.restaurant_id = target and pm.id <> pub;
  if shown <> 1 then
    raise exception 'FAIL: published_menus shows % other menus of the restaurant, expected the one published above', shown;
  end if;
  select pm.published_snapshot into snap from public.published_menus pm
  where pm.id = pub;
  if snap is null or (snap ->> 'v') <> '1' then
    raise exception 'FAIL: anon does not read the published snapshot';
  end if;
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'published_menus'
      and c.column_name = 'name'
  ) then
    raise exception 'FAIL: published_menus carries the live menu name';
  end if;
  raise notice 'ok: published_menus shows the published menus with their snapshots, by code, and no draft name';

  select count(*) into shown from public.published_item_states ps
  where ps.menu_id = pub;
  if shown <> 4 then
    raise exception 'FAIL: published_item_states shows % dishes, expected 4', shown;
  end if;
  raise notice 'ok: published_item_states shows the published dishes'' state';

  if not exists (
    select 1 from public.published_restaurants pr where pr.id = target
  ) then
    raise exception 'FAIL: a restaurant with a published menu is not in published_restaurants';
  end if;
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'published_restaurants'
      and c.column_name = 'slug'
  ) or not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'published_restaurants'
      and c.column_name = 'code'
  ) then
    raise exception 'FAIL: published_restaurants carries slug or lacks code';
  end if;
  raise notice 'ok: published_restaurants shows the restaurant by code, with no slug';
end;
$$;

rollback;
