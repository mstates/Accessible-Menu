-- Migration 13. The restaurant's name by code, for diners (Phase 1, the
-- diner page task, Q-84, Q-31): one definer function anon runs, exact
-- match, at most one row with the name alone, whatever the status and
-- whether or not a menu is published, so a printed code never leads to a
-- 404 and a diner reads whose menu is not available. Nothing else (D-85).

-- 1. The lookup. A view would let anon list every restaurant that has not
-- published in one request; a function takes one code at a time, and
-- published names are public already. Exact match on the stored code,
-- which is lowercase (migration 2); the resolver passes eight digits and
-- nothing else.
create function public.restaurant_name_by_code(p_code text) returns table (name text)
language sql stable security definer set search_path = '' as $$
  select r.name from public.restaurants r where r.code = p_code;
$$;

comment on function public.restaurant_name_by_code(text) is
  'The name behind a menu code, for the page diners see while nothing is published or the restaurant is paused or closed (Q-84, Q-31). Exact match only: anon looks up one code at a time and never lists.';

-- 2. Rule 14: PUBLIC holds execute through the global default, so the
-- function is revoked by name, then opened to anon alone. Owners read the
-- name through their own rows, and the service role never needs it.
revoke all on function public.restaurant_name_by_code(text) from public, authenticated;
grant execute on function public.restaurant_name_by_code(text) to anon;
