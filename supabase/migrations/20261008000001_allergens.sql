-- Migration 7. Allergens and their check (Phase 1, task 4): who checked a
-- dish's list and when, stamped by the database (D-89, D-148); the rules
-- on a dish's two lists; the nine the US offers (D-94); and the columns
-- owners write. Nothing else (D-85). menus_not_published_yet (migration 3)
-- still keeps the published views empty, and published_items is untouched:
-- it already carries the lists and the flag, and it never carries who or
-- when.

-- 1. Who and when. No row has ever been checked by a person: nothing could
-- write allergens_reviewed before this migration, and a flag with no stamp
-- behind it is not a check (D-148), so every flag is cleared first. The
-- stamp is a record, not a link: it names the person who stood behind the
-- list and outlives their account, so there is no foreign key. On every
-- row the three agree: a checked dish has both, an unchecked one neither.
update public.items set allergens_reviewed = false where allergens_reviewed;
alter table public.items
  add column allergens_reviewed_by uuid,
  add column allergens_reviewed_at timestamptz,
  add constraint items_allergen_check_whole check (
    (allergens_reviewed
      and allergens_reviewed_by is not null
      and allergens_reviewed_at is not null)
    or (not allergens_reviewed
      and allergens_reviewed_by is null
      and allergens_reviewed_at is null)
  );

-- 2. The lists. Owners see the US nine (D-94, Q-4), so the list holds only
-- those until the migration that widens the country lifts this check; an
-- allergen the EU names is typed, like any other (D-148). Ten other
-- allergens at most. Nothing has written either list, and a migration never
-- rewrites an allergen (D-7): a row that disagrees stops the migration, and
-- is looked at by hand first.
do $$
declare
  off integer;
begin
  select count(*) into off from public.items i
  where not (i.allergens <@ '{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame}'::public.allergen[])
     or cardinality(i.allergens)
        <> (select count(distinct a) from unnest(i.allergens) a)
     or cardinality(i.custom_allergens) > 10
     or exists (
       select 1 from unnest(i.custom_allergens) x
       where x is null or x !~ '\S' or x ~ '[[:cntrl:]]' or x <> btrim(x)
          or length(x) > 40
          or lower(x) = any (array['milk', 'dairy', 'egg', 'eggs', 'fish',
            'shellfish', 'crustaceans', 'tree nut', 'tree nuts', 'tree-nuts',
            'nuts', 'peanut', 'peanuts', 'wheat', 'soy', 'soya', 'soybean',
            'soybeans', 'sesame']))
     or cardinality(i.custom_allergens)
        <> (select count(distinct lower(x)) from unnest(i.custom_allergens) x);
  if off <> 0 then
    raise exception 'migration 7: % dishes hold allergens this migration does not expect; look at them by hand first', off;
  end if;
end $$;
alter table public.items
  add constraint items_allergens_offered check (
    allergens <@ '{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame}'::public.allergen[]
  ),
  add constraint items_other_allergens_count check (
    cardinality(custom_allergens) <= 10
  );

-- 3. The rest of the lists' rules, as a trigger, since a rule on each
-- element of an array is not a check constraint. Each major allergen
-- appears once. Another allergen is one line of something to read, forty
-- characters at most, with no outer space, once per dish whatever the case,
-- and never one of the nine, which have their boxes; the words that count
-- as the nine are the same list the editor refuses with, kept equal by
-- tests/unit. The function is revoked by name (rule 14) and runs for the
-- row without an execute check on the caller.
create function public.check_item_allergen_lists() returns trigger
language plpgsql set search_path = '' as $$
declare
  other text;
  seen text[] := '{}';
begin
  if cardinality(new.allergens)
     <> (select count(distinct a) from unnest(new.allergens) a) then
    raise exception 'allergens_repeated' using errcode = 'P0001';
  end if;
  foreach other in array new.custom_allergens loop
    if other is null or other !~ '\S' or other ~ '[[:cntrl:]]'
       or other <> btrim(other) or length(other) > 40 then
      raise exception 'other_allergen_text' using errcode = 'P0001';
    end if;
    if lower(other) = any (array['milk', 'dairy', 'egg', 'eggs', 'fish',
      'shellfish', 'crustaceans', 'tree nut', 'tree nuts', 'tree-nuts',
      'nuts', 'peanut', 'peanuts', 'wheat', 'soy', 'soya', 'soybean',
      'soybeans', 'sesame']) then
      raise exception 'other_allergen_major' using errcode = 'P0001';
    end if;
    if lower(other) = any (seen) then
      raise exception 'other_allergen_repeated' using errcode = 'P0001';
    end if;
    seen := seen || lower(other);
  end loop;
  return new;
end;
$$;
revoke all on function public.check_item_allergen_lists()
  from public, anon, authenticated;
create trigger items_allergen_lists
  before insert or update of allergens, custom_allergens on public.items
  for each row execute function public.check_item_allergen_lists();

-- 4. The check, stamped and cleared by the database (D-148). "Checked"
-- means a person checked this exact list. The stamp is always what this
-- trigger writes, whoever writes the row, so no one can forge one. A check
-- needs a signed-in person, so a server key or the SQL editor with no user
-- cannot check a dish (D-7). A dish is never born checked: a copy gets its
-- own check (D-129). Any change to either list clears the check in the
-- statement that makes it, so a statement that changes a list and checks
-- it ends unchecked, which is why the apply sends two. A change to anything
-- else leaves the check as it is. Lists are compared as stored: the app
-- writes each in one fixed order. Every statement the app sends that
-- changes or checks a list also names, in its where clause, the lists the
-- page showed, and lands on no row if the dish holds others (Michael,
-- October 8, 2026); that rule is the app's, and the boundary script shows
-- what it does here.
create function public.set_item_allergen_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  person uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.allergens_reviewed then
      raise exception 'allergen_check_on_insert' using errcode = 'P0001';
    end if;
    new.allergens_reviewed_by := null;
    new.allergens_reviewed_at := null;
    return new;
  end if;
  new.allergens_reviewed_by := old.allergens_reviewed_by;
  new.allergens_reviewed_at := old.allergens_reviewed_at;
  if new.allergens is distinct from old.allergens
     or new.custom_allergens is distinct from old.custom_allergens then
    new.allergens_reviewed := false;
  end if;
  if new.allergens_reviewed and not old.allergens_reviewed then
    if person is null then
      raise exception 'allergen_check_needs_person' using errcode = 'P0001';
    end if;
    new.allergens_reviewed_by := person;
    new.allergens_reviewed_at := now();
  elsif not new.allergens_reviewed then
    new.allergens_reviewed_by := null;
    new.allergens_reviewed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.set_item_allergen_check()
  from public, anon, authenticated;
create trigger items_allergen_check
  before insert or update on public.items
  for each row execute function public.set_item_allergen_check();

-- 5. Owners write the two lists and the check on a dish's page (D-128,
-- D-148), and never who or when. The insert list is unchanged: a dish is
-- added by name. Never a photo, a tag, or availability, each of which joins
-- the list in the task that builds it.
revoke update on public.items from authenticated;
grant update (name, description, price_kind, price_cents, note, allergens, custom_allergens, allergens_reviewed, sort, deleted_at) on public.items to authenticated;
