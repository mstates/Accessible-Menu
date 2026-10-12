-- Owner boundary check for restaurants. Run in the Supabase SQL editor after
-- every migration that touches restaurants or adds a function: its first
-- block is the function-privilege check for the whole schema. Everything
-- rolls back. Replace the uid below with your own auth.users id. A run that
-- ends without an error passed every check.
begin;

-- Every function in public is closed to the Data API roles unless a
-- migration opened it by name. PUBLIC holds execute on every new function
-- through Postgres's global default, and a per-schema default-privilege
-- revoke cannot remove it, so each migration revokes by name. Trigger and
-- event trigger functions cannot be called directly and are skipped; the
-- live database has rls_auto_enable, Supabase's event trigger function,
-- which no migration created.
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
    and has_function_privilege('anon', p.oid, 'execute');
  if open_to_anon is not null then
    raise exception 'FAIL: anon can run %', open_to_anon;
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
      'publish_menu', 'unpublish_menu')
    and has_function_privilege('authenticated', p.oid, 'execute');
  if open_to_authenticated is not null then
    raise exception 'FAIL: authenticated can run %', open_to_authenticated;
  end if;

  raise notice 'ok: no function in public is open beyond create_restaurant, is_owner, owns_object, set_menu_order, set_section_order, set_item_order, section_dish_counts, delete_with_contents, move_section, move_item, set_choice_list_order, set_choice_option_order, menu_snapshot, publish_problems, menu_publish_states, publish_menu, and unpublish_menu';
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

rollback;
