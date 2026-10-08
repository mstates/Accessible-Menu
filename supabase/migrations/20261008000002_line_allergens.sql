-- Migration 8. The line shown with every dish gets its own allergens and
-- their check (Phase 1, task 4b, D-152, D-153), in the shape a dish's has
-- (migration 7), and another allergen never holds a comma, on a dish or on
-- a line (D-151). Nothing else (D-85). The published views are untouched
-- and name none of the new columns; the Publish task carries a line's lists,
-- and only while it is checked.

-- 1. A comma in another allergen reads as two allergens to a diner (D-151).
-- Nothing is rewritten (D-7): a dish that holds one stops the migration and
-- is looked at by hand first. The commas that read as separators are the
-- plain one, the fullwidth one, and the ideographic one (Q-65), the same
-- three the editor refuses with (tests/unit keeps the two equal). The
-- line's lists are new, so no section row can hold one.
do $$
declare
  off integer;
begin
  select count(*) into off from public.items i
  where exists (
    select 1 from unnest(i.custom_allergens) x where x ~ '[,，、]'
  );
  if off <> 0 then
    raise exception 'migration 8: % dishes hold another allergen with a comma in it; look at them by hand first', off;
  end if;
end $$;

-- 2. The lists rule, once, for both tables: the name of the rule a pair of
-- lists breaks, or null. It reads no table. It is revoked by name (rule 14)
-- and is called only from the two trigger functions below, which run as
-- their owner for that call, so the rule is one function and no endpoint:
-- granted to authenticated it would be exposed by the Data API and join the
-- restaurants allow-list; revoked and called from an invoker trigger it
-- would fail every owner's update. The words that count as the nine are
-- the same list the editor refuses with, kept equal by tests/unit.
create function public.allergen_lists_problem(
  p_allergens public.allergen[],
  p_others text[]
) returns text
language plpgsql immutable set search_path = '' as $$
declare
  majors public.allergen[] := coalesce(p_allergens, '{}');
  others text[] := coalesce(p_others, '{}');
  other text;
  seen text[] := '{}';
begin
  if cardinality(majors)
     <> (select count(distinct a) from unnest(majors) a) then
    return 'allergens_repeated';
  end if;
  foreach other in array others loop
    if other is null or other !~ '\S' or other ~ '[[:cntrl:]]'
       or other <> btrim(other) or length(other) > 40 then
      return 'other_allergen_text';
    end if;
    if other ~ '[,，、]' then
      return 'other_allergen_comma';
    end if;
    if lower(other) = any (array['milk', 'dairy', 'egg', 'eggs', 'fish',
      'shellfish', 'crustaceans', 'tree nut', 'tree nuts', 'tree-nuts',
      'nuts', 'peanut', 'peanuts', 'wheat', 'soy', 'soya', 'soybean',
      'soybeans', 'sesame']) then
      return 'other_allergen_major';
    end if;
    if lower(other) = any (seen) then
      return 'other_allergen_repeated';
    end if;
    seen := seen || lower(other);
  end loop;
  return null;
end;
$$;
revoke all on function public.allergen_lists_problem(public.allergen[], text[])
  from public, anon, authenticated;

-- 3. A dish's lists go through the one rule from now on, the comma rule
-- with them. The function is replaced in place, keeps its trigger, and runs
-- as its owner for the call above; it is revoked by name again (rule 14).
create or replace function public.check_item_allergen_lists() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  problem text :=
    public.allergen_lists_problem(new.allergens, new.custom_allergens);
begin
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.check_item_allergen_lists()
  from public, anon, authenticated;

-- 4. The line's own allergens, in a dish's shape (D-152, Spec 8): the two
-- lists, the check, and who and when, stamped by the database with no
-- foreign key (migration 7's reasons). The nine offered while the country
-- is US only (Q-4), ten other allergens at most, the check whole, and a
-- line with no words holding no list and no check.
alter table public.sections
  add column every_item_allergens public.allergen[] not null default '{}',
  add column every_item_custom_allergens text[] not null default '{}',
  add column every_item_allergens_reviewed boolean not null default false,
  add column every_item_allergens_reviewed_by uuid,
  add column every_item_allergens_reviewed_at timestamptz,
  add constraint sections_line_check_whole check (
    (every_item_allergens_reviewed
      and every_item_allergens_reviewed_by is not null
      and every_item_allergens_reviewed_at is not null)
    or (not every_item_allergens_reviewed
      and every_item_allergens_reviewed_by is null
      and every_item_allergens_reviewed_at is null)
  ),
  add constraint sections_line_allergens_offered check (
    every_item_allergens <@ '{milk,eggs,fish,shellfish,tree-nuts,peanuts,wheat,soy,sesame}'::public.allergen[]
  ),
  add constraint sections_line_other_allergens_count check (
    cardinality(every_item_custom_allergens) <= 10
  ),
  add constraint sections_line_blank_holds_nothing check (
    every_item is not null
    or (every_item_allergens = '{}'
      and every_item_custom_allergens = '{}'
      and not every_item_allergens_reviewed)
  );

-- 5. The line's lists rule: the same function, the same names.
create function public.check_section_line_allergen_lists() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  problem text := public.allergen_lists_problem(
    new.every_item_allergens, new.every_item_custom_allergens);
begin
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.check_section_line_allergen_lists()
  from public, anon, authenticated;
create trigger sections_line_allergen_lists
  before insert or update of every_item_allergens, every_item_custom_allergens
  on public.sections
  for each row execute function public.check_section_line_allergen_lists();

-- 6. The line's check, stamped and cleared by the database (D-148, D-152).
-- As a dish's: never born checked, a check needs a signed-in person, any
-- change to a list clears it in the statement that makes it. Unlike a
-- dish's: a change to the line's words clears it too, since the words are
-- all that name the option; clearing the line in a statement clears its
-- lists and its check with it; and lists or a check written to a line that
-- is already blank are refused. A change to the section's name, note, sort,
-- menu, or deleted_at leaves the check as it is. Every statement the app
-- sends that changes or checks the line's lists also names, in its where
-- clause, the words and the lists the page showed (D-153); that rule is the
-- app's, and the boundary script shows what it does here.
create function public.set_section_line_allergen_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  person uuid := auth.uid();
  holds boolean := cardinality(new.every_item_allergens) > 0
    or cardinality(new.every_item_custom_allergens) > 0
    or new.every_item_allergens_reviewed;
begin
  if tg_op = 'INSERT' then
    if new.every_item_allergens_reviewed then
      raise exception 'allergen_check_on_insert' using errcode = 'P0001';
    end if;
    if new.every_item is null and holds then
      raise exception 'line_blank_holds_nothing' using errcode = 'P0001';
    end if;
    new.every_item_allergens_reviewed_by := null;
    new.every_item_allergens_reviewed_at := null;
    return new;
  end if;
  new.every_item_allergens_reviewed_by := old.every_item_allergens_reviewed_by;
  new.every_item_allergens_reviewed_at := old.every_item_allergens_reviewed_at;
  if new.every_item is null then
    if old.every_item is not null then
      new.every_item_allergens := '{}';
      new.every_item_custom_allergens := '{}';
      new.every_item_allergens_reviewed := false;
    elsif holds then
      raise exception 'line_blank_holds_nothing' using errcode = 'P0001';
    end if;
  end if;
  if new.every_item is distinct from old.every_item
     or new.every_item_allergens is distinct from old.every_item_allergens
     or new.every_item_custom_allergens
        is distinct from old.every_item_custom_allergens then
    new.every_item_allergens_reviewed := false;
  end if;
  if new.every_item_allergens_reviewed
     and not old.every_item_allergens_reviewed then
    if person is null then
      raise exception 'allergen_check_needs_person' using errcode = 'P0001';
    end if;
    new.every_item_allergens_reviewed_by := person;
    new.every_item_allergens_reviewed_at := now();
  elsif not new.every_item_allergens_reviewed then
    new.every_item_allergens_reviewed_by := null;
    new.every_item_allergens_reviewed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.set_section_line_allergen_check()
  from public, anon, authenticated;
create trigger sections_line_allergen_check
  before insert or update on public.sections
  for each row execute function public.set_section_line_allergen_check();

-- 7. Owners write the line's two lists and its check on the section's page
-- (D-152), and never who or when. The insert list is unchanged.
revoke update on public.sections from authenticated;
grant update (name, note, every_item, sort, deleted_at, every_item_allergens, every_item_custom_allergens, every_item_allergens_reviewed) on public.sections to authenticated;
