-- Migration 9. A special's schedule and a dish's availability (Phase 1,
-- task 5, D-159, D-160): the shape of a schedule, as a check on the column
-- migration one made; each dietary tag once; the moment a dish was marked
-- sold out; and the columns owners write. Nothing else (D-85): no
-- function, no trigger, no policy, and no data to move, since nothing has
-- ever written these columns. menus_not_published_yet (migration 3) still
-- keeps the published views empty, and published_items is untouched: it
-- already carries the tags, the flag, and the schedule, never the mark,
-- and it retires with the snapshot.

-- 1. Nothing could write a schedule or a tag before this migration, so
-- every row holds null and an empty list. A row that does not stops the
-- migration, and is looked at by hand first.
do $$
declare
  off integer;
begin
  select count(*) into off from public.items i
  where i.special_schedule is not null
     or i.dietary_tags <> '{}';
  if off <> 0 then
    raise exception 'migration 9: % dishes already hold a schedule or a tag; look at them by hand first', off;
  end if;
end $$;

-- 2. The schedule's shape (D-159), one check on the jsonb column, since
-- the rule is a shape and not a lookup. Five optional parts, an absent key
-- meaning any: days of the week, each once; weeks of the month, each once
-- and only with days; months of the year, each once; one time range in
-- the hours' shape (D-92), opening and closing at different times, since
-- no range already means all day; and a first and a last day as
-- YYYY-MM-DD, each a real date, the first not after the last. No other
-- key, and not the empty object: a schedule with no part is null. A list
-- is proved once-each without a subquery or an aggregate, which a check
-- cannot hold: every element is among the allowed values, and the length
-- equals the number of allowed values present. Every branch that could
-- raise on the wrong type sits under a case, since Postgres fixes no order
-- for the sides of an and, and every text test sits behind its type, since
-- a null side would pass the check; so a bad shape is always a check
-- violation and never a type error. Dates are read by pg_input_is_valid,
-- which never raises, and compared as text, which the shape makes safe.
-- Binary minus binds tighter than the arrow, so the hours object is taken
-- in parentheses before its keys are removed. No size cap: every value is
-- a name from a list or a short fixed shape, so the largest schedule is
-- under three hundred octets.
alter table public.items
  add constraint items_special_schedule_shape check (
    special_schedule is null
    or case when jsonb_typeof(special_schedule) = 'object' then
      special_schedule <> '{}'::jsonb
      and special_schedule
        - array['days', 'weeks', 'months', 'hours', 'from', 'until']
        = '{}'::jsonb
      and case
        when special_schedule -> 'days' is null then true
        when jsonb_typeof(special_schedule -> 'days') = 'array' then
          special_schedule -> 'days'
            <@ '["mon", "tue", "wed", "thu", "fri", "sat", "sun"]'
          and jsonb_array_length(special_schedule -> 'days') >= 1
          and jsonb_array_length(special_schedule -> 'days') =
              (special_schedule -> 'days' @> '["mon"]')::int
            + (special_schedule -> 'days' @> '["tue"]')::int
            + (special_schedule -> 'days' @> '["wed"]')::int
            + (special_schedule -> 'days' @> '["thu"]')::int
            + (special_schedule -> 'days' @> '["fri"]')::int
            + (special_schedule -> 'days' @> '["sat"]')::int
            + (special_schedule -> 'days' @> '["sun"]')::int
        else false end
      and case
        when special_schedule -> 'weeks' is null then true
        when special_schedule -> 'days' is null then false
        when jsonb_typeof(special_schedule -> 'weeks') = 'array' then
          special_schedule -> 'weeks'
            <@ '["first", "second", "third", "fourth", "last"]'
          and jsonb_array_length(special_schedule -> 'weeks') >= 1
          and jsonb_array_length(special_schedule -> 'weeks') =
              (special_schedule -> 'weeks' @> '["first"]')::int
            + (special_schedule -> 'weeks' @> '["second"]')::int
            + (special_schedule -> 'weeks' @> '["third"]')::int
            + (special_schedule -> 'weeks' @> '["fourth"]')::int
            + (special_schedule -> 'weeks' @> '["last"]')::int
        else false end
      and case
        when special_schedule -> 'months' is null then true
        when jsonb_typeof(special_schedule -> 'months') = 'array' then
          special_schedule -> 'months'
            <@ '["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]'
          and jsonb_array_length(special_schedule -> 'months') >= 1
          and jsonb_array_length(special_schedule -> 'months') =
              (special_schedule -> 'months' @> '["jan"]')::int
            + (special_schedule -> 'months' @> '["feb"]')::int
            + (special_schedule -> 'months' @> '["mar"]')::int
            + (special_schedule -> 'months' @> '["apr"]')::int
            + (special_schedule -> 'months' @> '["may"]')::int
            + (special_schedule -> 'months' @> '["jun"]')::int
            + (special_schedule -> 'months' @> '["jul"]')::int
            + (special_schedule -> 'months' @> '["aug"]')::int
            + (special_schedule -> 'months' @> '["sep"]')::int
            + (special_schedule -> 'months' @> '["oct"]')::int
            + (special_schedule -> 'months' @> '["nov"]')::int
            + (special_schedule -> 'months' @> '["dec"]')::int
        else false end
      and case
        when special_schedule -> 'hours' is null then true
        when jsonb_typeof(special_schedule -> 'hours') = 'object'
          and jsonb_typeof(special_schedule -> 'hours' -> 'open') = 'string'
          and jsonb_typeof(special_schedule -> 'hours' -> 'close') = 'string'
        then
          (special_schedule -> 'hours') - array['open', 'close'] = '{}'::jsonb
          and special_schedule -> 'hours' ->> 'open'
            ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and special_schedule -> 'hours' ->> 'close'
            ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and special_schedule -> 'hours' ->> 'open'
            <> special_schedule -> 'hours' ->> 'close'
        else false end
      and case
        when special_schedule -> 'from' is null then true
        when jsonb_typeof(special_schedule -> 'from') = 'string' then
          special_schedule ->> 'from' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and pg_input_is_valid(special_schedule ->> 'from', 'date')
        else false end
      and case
        when special_schedule -> 'until' is null then true
        when jsonb_typeof(special_schedule -> 'until') = 'string' then
          special_schedule ->> 'until' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and pg_input_is_valid(special_schedule ->> 'until', 'date')
        else false end
      and (special_schedule -> 'from' is null
        or special_schedule -> 'until' is null
        or special_schedule ->> 'from' <= special_schedule ->> 'until')
    else false end
  );

-- 3. Each dietary tag once (D-66). The enum already refuses a tag outside
-- the three, and the published view names the column, so its type stays
-- and the list is named inline. The same proof as the schedule's lists:
-- the length equals the number of allowed values present. A null element
-- counts toward the length and never toward the sum, so it is refused
-- with the repeats.
alter table public.items
  add constraint items_dietary_tags_once check (
    cardinality(dietary_tags) =
        (dietary_tags @> '{vegan}'::public.dietary_tag[])::int
      + (dietary_tags @> '{vegetarian}'::public.dietary_tag[])::int
      + (dietary_tags @> '{made-without-gluten}'::public.dietary_tag[])::int
  );

-- 4. Sold out today (D-160): the moment the owner marked it, beside the
-- flag migration one made. Available with no mark is on the menu; with a
-- mark, sold out until the restaurant's day ends, which the app works out
-- when it reads, from the hours and the zone as they are then, since hours
-- can change under a mark; not available is off the menu for now, and
-- holds no mark. So the three states are the three rows this check
-- allows. The app writes the mark as its own clock reads; nothing stamps
-- it, so an owner who writes another instant moves only their own menu.
alter table public.items
  add column sold_out_at timestamptz,
  add constraint items_sold_out_needs_available check (
    sold_out_at is null or available
  );

-- 5. Owners write a dish's tags, its availability with the mark, and its
-- schedule on its page (D-128, D-159, D-160). The insert list is
-- unchanged: a dish is added by name. Never a photo, which joins the list
-- in the task that builds it, and never who checked the allergens or when.
revoke update on public.items from authenticated;
grant update (name, description, price_kind, price_cents, note, allergens, custom_allergens, allergens_reviewed, dietary_tags, available, sold_out_at, special_schedule, sort, deleted_at) on public.items to authenticated;
