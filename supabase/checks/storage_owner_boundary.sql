-- Owner boundary check for Storage, the two buckets migration one made.
-- Run in the Supabase SQL editor after migration ten and after every
-- migration that touches storage.objects. Everything rolls back. Replace
-- the uid below with your own auth.users id. A run that ends without an
-- error passed every check. Against migration nine it fails at the first
-- owner write, "FAIL: an owner wrote a file into menu-photos", which is its
-- negative control: run it once before the push to see that, and once
-- after.
begin;

-- The one line to change. The script plants one file per bucket under a
-- restaurant this user belongs to, then acts as this user, then as anon.
select set_config('boundary.uid',
  '00000000-0000-0000-0000-000000000000', true);

-- As the editor's own role: the ground. The buckets stand as migration one
-- made them, owns_object() is still there with its grants for the tasks
-- that reopen them, row level security is on storage.objects, and one file
-- per bucket is planted under this user's restaurant for the overwrite,
-- delete, and list checks. The editor's role bypasses row level security,
-- so the plant lands whatever policies stand; a role that did not would be
-- refused here, before any check, and the plant would move to service_role.
do $$
declare
  uid uuid := current_setting('boundary.uid')::uuid;
  home uuid;
  held text;
  touched integer;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'FAIL: put your auth.users id in boundary.uid';
  end if;
  select o.restaurant_id into home from public.owners o
  where o.user_id = uid order by o.created_at limit 1;
  if home is null then
    raise exception 'FAIL: this user belongs to no restaurant';
  end if;
  perform set_config('boundary.home', home::text, true);

  select string_agg(
    b.id || case when b.public then ' public' else ' private' end,
    ', ' order by b.id) into held
  from storage.buckets b
  where b.id in ('menu-photos', 'menu-sources');
  if held is distinct from 'menu-photos public, menu-sources private' then
    raise exception 'FAIL: the buckets read %', coalesce(held, 'nothing');
  end if;
  raise notice 'ok: menu-photos is public and menu-sources is private, as migration one made them';

  if to_regprocedure('public.owns_object(text)') is null then
    raise exception 'FAIL: owns_object() is gone';
  end if;
  if not has_function_privilege('authenticated', 'public.owns_object(text)', 'execute')
     or has_function_privilege('anon', 'public.owns_object(text)', 'execute') then
    raise exception 'FAIL: owns_object() is not held as migration one left it';
  end if;
  raise notice 'ok: owns_object() stays, open to authenticated and closed to anon';

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    raise exception 'FAIL: row level security is off on storage.objects';
  end if;
  raise notice 'ok: row level security is on storage.objects';

  begin
    insert into storage.objects (bucket_id, name) values
      ('menu-photos', home || '/boundary.png'),
      ('menu-sources', home || '/boundary.pdf');
  exception when insufficient_privilege then
    raise exception 'FAIL: the editor''s role could not plant a file in storage.objects, so the checks below have nothing to stand on';
  end;
  raise notice 'ok: one file per bucket is planted under this user''s restaurant';

  -- Supabase Storage guards SQL deletes of its own: its migration
  -- 0055-prevent-direct-deletes adds storage.protect_delete() and the
  -- trigger protect_objects_delete, before delete on storage.objects for
  -- each statement, which raises 42501 unless storage.allow_delete_query
  -- is 'true'. The delete checks below read 42501 as a refusal, so with
  -- the guard in place they would pass whatever the policies say and could
  -- never fail. The Storage API sets that same switch for its own deletes,
  -- so row level security is what decides a real delete. The switch is set
  -- for this transaction only, which rolls back, and proved by deleting
  -- one scratch file as the editor's role: one row, or the switch did not
  -- take.
  perform set_config('storage.allow_delete_query', 'true', true);
  insert into storage.objects (bucket_id, name)
  values ('menu-sources', home || '/scratch.pdf');
  begin
    delete from storage.objects
    where bucket_id = 'menu-sources' and name = home || '/scratch.pdf';
    get diagnostics touched = row_count;
  exception when insufficient_privilege then
    raise exception 'FAIL: Supabase''s guard refused the editor''s own delete, so the switch did not take';
  end;
  if touched <> 1 then
    raise exception 'FAIL: the editor''s own delete touched % rows, not one', touched;
  end if;
  raise notice 'ok: Supabase''s guard on SQL deletes is set aside for this transaction, as the Storage API does, so row level security decides the delete checks below';
end;
$$;

-- As this user, a member of the restaurant the files sit under: a new file
-- is refused, the planted file is neither overwritten nor deleted, and the
-- bucket lists nothing, since the policy that opened all four was the only
-- one. A refusal is a row-level one, or, if a later Supabase takes the
-- table privilege away as well, a privilege one; either is a refusal.
-- Against migration nine the first insert lands and the script stops there.
set local role authenticated;
select set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', current_setting('boundary.uid')),
  true);

do $$
declare
  home text := current_setting('boundary.home');
  bucket text;
  planted text;
  touched integer;
  seen integer;
begin
  foreach bucket in array array['menu-photos', 'menu-sources'] loop
    planted := home || case when bucket = 'menu-photos'
      then '/boundary.png' else '/boundary.pdf' end;

    begin
      insert into storage.objects (bucket_id, name)
      values (bucket, home || '/owner.' || bucket);
      raise exception 'FAIL: an owner wrote a file into %', bucket;
    exception when insufficient_privilege then
      raise notice 'ok: an owner cannot write a file into %', bucket;
    end;

    begin
      update storage.objects set metadata = '{"boundary": "overwritten"}'
      where bucket_id = bucket and name = planted;
      get diagnostics touched = row_count;
      if touched <> 0 then
        raise exception 'FAIL: an owner overwrote a file in %', bucket;
      end if;
    exception when insufficient_privilege then
      null;
    end;
    raise notice 'ok: an owner cannot overwrite a file in %', bucket;

    begin
      delete from storage.objects
      where bucket_id = bucket and name = planted;
      get diagnostics touched = row_count;
      if touched <> 0 then
        raise exception 'FAIL: an owner deleted a file from %', bucket;
      end if;
    exception when insufficient_privilege then
      null;
    end;
    raise notice 'ok: an owner cannot delete a file from %', bucket;

    begin
      select count(*) into seen from storage.objects
      where bucket_id = bucket;
      if seen <> 0 then
        raise exception 'FAIL: an owner lists % files in %', seen, bucket;
      end if;
    exception when insufficient_privilege then
      null;
    end;
    raise notice 'ok: an owner lists nothing in %', bucket;
  end loop;
end;
$$;

-- As anon, the role a request with no sign-in runs as: the same four, with
-- no claim about a person.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  home text := current_setting('boundary.home');
  bucket text;
  planted text;
  touched integer;
  seen integer;
begin
  foreach bucket in array array['menu-photos', 'menu-sources'] loop
    planted := home || case when bucket = 'menu-photos'
      then '/boundary.png' else '/boundary.pdf' end;

    begin
      insert into storage.objects (bucket_id, name)
      values (bucket, home || '/anon.' || bucket);
      raise exception 'FAIL: anon wrote a file into %', bucket;
    exception when insufficient_privilege then
      raise notice 'ok: anon cannot write a file into %', bucket;
    end;

    begin
      update storage.objects set metadata = '{"boundary": "overwritten"}'
      where bucket_id = bucket and name = planted;
      get diagnostics touched = row_count;
      if touched <> 0 then
        raise exception 'FAIL: anon overwrote a file in %', bucket;
      end if;
    exception when insufficient_privilege then
      null;
    end;
    raise notice 'ok: anon cannot overwrite a file in %', bucket;

    begin
      delete from storage.objects
      where bucket_id = bucket and name = planted;
      get diagnostics touched = row_count;
      if touched <> 0 then
        raise exception 'FAIL: anon deleted a file from %', bucket;
      end if;
    exception when insufficient_privilege then
      null;
    end;
    raise notice 'ok: anon cannot delete a file from %', bucket;

    begin
      select count(*) into seen from storage.objects
      where bucket_id = bucket;
      if seen <> 0 then
        raise exception 'FAIL: anon lists % files in %', seen, bucket;
      end if;
    exception when insufficient_privilege then
      null;
    end;
    raise notice 'ok: anon lists nothing in %', bucket;
  end loop;
end;
$$;

-- Back as the editor's role, as the opening checks ran: nothing added, so
-- no policy is left on storage.objects for any role. One that a later
-- Supabase adds of its own would show here and get a look.
reset role;

do $$
declare
  held text;
begin
  select string_agg(p.policyname, ', ' order by p.policyname) into held
  from pg_policies p
  where p.schemaname = 'storage' and p.tablename = 'objects';
  if held is not null then
    raise exception 'FAIL: storage.objects holds a policy: %', held;
  end if;
  raise notice 'ok: no policy is left on storage.objects';
end;
$$;

rollback;
