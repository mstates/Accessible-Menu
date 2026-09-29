-- Migration 1. Tables from Spec section 8, row level security on every
-- table, owner policies, public views that expose only published fields,
-- storage buckets, and explicit grants.
--
-- Diners never authenticate. Diner pages read the published_* views as
-- anon. Owners read and write their own restaurants as authenticated.
-- Beacons and the feedback route write with the service role from server
-- code. sign_orders (after MVP) is absent on purpose.

-- Vocabularies. Later migrations append values with alter type ... add value.
create type public.allergen as enum (
  'milk', 'eggs', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat',
  'soy', 'sesame', 'celery', 'gluten', 'lupin', 'molluscs', 'mustard',
  'sulphites'
);
-- Q-15 decides the gluten wording before Phase 1 adds it.
create type public.dietary_tag as enum ('vegan', 'vegetarian');
create type public.prep_note as enum (
  'shared-fryer', 'dedicated-fryer', 'shared-kitchen'
);
create type public.restaurant_status as enum (
  'trial', 'active', 'paused', 'closed'
);
create type public.menu_source as enum ('manual', 'import', 'square');
create type public.import_source as enum ('pdf', 'photo', 'url', 'square');
create type public.import_status as enum (
  'uploaded', 'reading', 'review', 'published', 'failed'
);
create type public.could_read as enum ('yes', 'partly', 'no');
create type public.barrier_scope as enum ('template', 'content');
create type public.feedback_status as enum ('new', 'in_progress', 'fixed');
create type public.owner_role as enum ('owner', 'staff');

-- Tables. Every table carries restaurant_id so one policy shape fits all.

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  address text,
  city text,
  city_slug text check (city_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country text not null default 'US',
  phone text,
  website text,
  hours jsonb,
  timezone text not null default 'America/New_York',
  enabled_languages text[] not null default '{}',
  allergen_note text,
  prep_notes public.prep_note[] not null default '{}',
  show_icons boolean not null default false,
  status public.restaurant_status not null default 'trial',
  plan text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index restaurants_city_slug_idx on public.restaurants (city_slug);

create table public.owners (
  user_id uuid not null references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  role public.owner_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
create index owners_restaurant_id_idx on public.owners (restaurant_id);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort integer not null default 0,
  published boolean not null default false,
  published_at timestamptz,
  source public.menu_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menus_restaurant_id_idx on public.menus (restaurant_id);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sections_menu_id_idx on public.sections (menu_id);
create index sections_restaurant_id_idx on public.sections (restaurant_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  price_text text,
  allergens public.allergen[] not null default '{}',
  custom_allergens text[] not null default '{}',
  allergens_reviewed boolean not null default false,
  allergen_suggestions jsonb,
  dietary_tags public.dietary_tag[] not null default '{}',
  note text,
  photo_url text,
  photo_alt text,
  available boolean not null default true,
  special_schedule jsonb,
  sort integer not null default 0,
  import_confidence jsonb,
  external_ids jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Photos require alt text. A photo without words never reaches a diner.
  constraint items_photo_requires_alt check (
    photo_url is null or length(trim(coalesce(photo_alt, ''))) > 0
  )
);
create index items_section_id_idx on public.items (section_id);
create index items_restaurant_id_idx on public.items (restaurant_id);

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  entity text not null check (entity in ('menu', 'section', 'item')),
  entity_id uuid not null,
  lang text not null check (lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]+)*$'),
  field text not null,
  text text not null,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity, entity_id, lang, field)
);
create index translations_restaurant_id_idx on public.translations (restaurant_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  menu_id uuid references public.menus (id) on delete set null,
  reference text not null unique,
  could_read public.could_read,
  what_got_in_the_way text,
  anything_else text,
  access_method text[] not null default '{}',
  wants_reply boolean not null default false,
  contact text,
  is_barrier boolean not null default false,
  barrier_scope public.barrier_scope,
  status public.feedback_status not null default 'new',
  fix_note_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_restaurant_id_idx on public.feedback (restaurant_id, created_at desc);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  source_type public.import_source not null,
  source_files text[] not null default '{}',
  result jsonb,
  status public.import_status not null default 'uploaded',
  created_at timestamptz not null default now()
);
create index imports_restaurant_id_idx on public.imports (restaurant_id);

-- Aggregates only, written by the beacons (D-24). No diner identity anywhere.
create table public.scan_stats (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  day date not null,
  scans integer not null default 0,
  filters_used jsonb not null default '{}'::jsonb,
  languages jsonb not null default '{}'::jsonb,
  read_aloud_starts integer not null default 0,
  text_size jsonb not null default '{}'::jsonb,
  contrast_high integer not null default 0,
  allergens_hidden integer not null default 0,
  primary key (restaurant_id, day)
);

-- Triggers.

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger restaurants_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger menus_updated_at before update on public.menus
  for each row execute function public.set_updated_at();
create trigger sections_updated_at before update on public.sections
  for each row execute function public.set_updated_at();
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger translations_updated_at before update on public.translations
  for each row execute function public.set_updated_at();

-- A restaurant slug is printed on a sign. It never changes (D-6).
create function public.keep_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug <> old.slug then
    raise exception 'A restaurant slug is permanent (D-6).';
  end if;
  return new;
end;
$$;

create trigger restaurants_keep_slug before update of slug on public.restaurants
  for each row execute function public.keep_slug();

create function public.set_menu_published_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger menus_published_at before insert or update of published on public.menus
  for each row execute function public.set_menu_published_at();

-- Child rows take restaurant_id from their parent so it can never disagree.
create function public.set_section_restaurant() returns trigger
language plpgsql set search_path = '' as $$
begin
  select m.restaurant_id into new.restaurant_id
  from public.menus m where m.id = new.menu_id;
  if new.restaurant_id is null then
    raise exception 'A section needs an existing menu.';
  end if;
  return new;
end;
$$;

create trigger sections_restaurant before insert or update of menu_id on public.sections
  for each row execute function public.set_section_restaurant();

create function public.set_item_restaurant() returns trigger
language plpgsql set search_path = '' as $$
begin
  select s.restaurant_id into new.restaurant_id
  from public.sections s where s.id = new.section_id;
  if new.restaurant_id is null then
    raise exception 'An item needs an existing section.';
  end if;
  return new;
end;
$$;

create trigger items_restaurant before insert or update of section_id on public.items
  for each row execute function public.set_item_restaurant();

-- Ownership check used by every policy. Security definer so the owners
-- table can be consulted without recursing into its own policies.
create function public.is_owner(restaurant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.owners o
    where o.user_id = auth.uid() and o.restaurant_id = restaurant
  );
$$;
revoke all on function public.is_owner(uuid) from public;
grant execute on function public.is_owner(uuid) to authenticated;

-- Storage object paths start with the restaurant id: <restaurant_id>/<file>.
create function public.owns_object(object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := (storage.foldername(object_name))[1];
begin
  if folder is null
     or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_owner(folder::uuid);
end;
$$;
revoke all on function public.owns_object(text) from public;
grant execute on function public.owns_object(text) to authenticated;

-- Row level security on every table.
alter table public.restaurants enable row level security;
alter table public.owners enable row level security;
alter table public.menus enable row level security;
alter table public.sections enable row level security;
alter table public.items enable row level security;
alter table public.translations enable row level security;
alter table public.feedback enable row level security;
alter table public.imports enable row level security;
alter table public.scan_stats enable row level security;

-- Owner policies. There is no insert or delete policy on restaurants and no
-- insert policy on owners on purpose: Phase 1 adds a create_restaurant()
-- function that writes both rows together, and a restaurant is never
-- deleted because its URL is printed on a sign (D-6).

create policy "owners read their restaurants" on public.restaurants
  for select to authenticated using (public.is_owner(id));
create policy "owners update their restaurants" on public.restaurants
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

create policy "owners see who owns their restaurants" on public.owners
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner(restaurant_id));

create policy "owners read menus" on public.menus
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add menus" on public.menus
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update menus" on public.menus
  for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "owners delete menus" on public.menus
  for delete to authenticated using (public.is_owner(restaurant_id));

create policy "owners read sections" on public.sections
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add sections" on public.sections
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update sections" on public.sections
  for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "owners delete sections" on public.sections
  for delete to authenticated using (public.is_owner(restaurant_id));

create policy "owners read items" on public.items
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add items" on public.items
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update items" on public.items
  for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "owners delete items" on public.items
  for delete to authenticated using (public.is_owner(restaurant_id));

create policy "owners read translations" on public.translations
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add translations" on public.translations
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update translations" on public.translations
  for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "owners delete translations" on public.translations
  for delete to authenticated using (public.is_owner(restaurant_id));

create policy "owners read imports" on public.imports
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners add imports" on public.imports
  for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "owners update imports" on public.imports
  for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "owners delete imports" on public.imports
  for delete to authenticated using (public.is_owner(restaurant_id));

-- Feedback and counts arrive through server code with the service role.
-- Owners read their own.
create policy "owners read feedback" on public.feedback
  for select to authenticated using (public.is_owner(restaurant_id));
create policy "owners read scan stats" on public.scan_stats
  for select to authenticated using (public.is_owner(restaurant_id));

-- Public views: the only door for diner pages (D-12). They run with the
-- owner's privileges on purpose, expose published rows only, and never
-- carry allergen_suggestions, import_confidence, external_ids, billing,
-- or contact columns. Paused and closed restaurants disappear (Q-8).

create view public.published_restaurants with (security_barrier = true) as
  select r.id, r.slug, r.name, r.city, r.city_slug, r.country, r.hours,
         r.website, r.timezone, r.enabled_languages, r.allergen_note,
         r.prep_notes, r.show_icons
  from public.restaurants r
  where r.status in ('trial', 'active')
    and exists (
      select 1 from public.menus m where m.restaurant_id = r.id and m.published
    );

create view public.published_menus with (security_barrier = true) as
  select m.id, m.restaurant_id, m.name, m.sort, m.published_at
  from public.menus m
  join public.restaurants r on r.id = m.restaurant_id
  where m.published and r.status in ('trial', 'active');

create view public.published_sections with (security_barrier = true) as
  select s.id, s.menu_id, s.restaurant_id, s.name, s.sort, s.note
  from public.sections s
  join public.published_menus pm on pm.id = s.menu_id;

create view public.published_items with (security_barrier = true) as
  select i.id, i.section_id, i.restaurant_id, i.name, i.description,
         i.price_cents, i.price_text, i.allergens, i.custom_allergens,
         i.allergens_reviewed, i.dietary_tags, i.note, i.photo_url,
         i.photo_alt, i.available, i.special_schedule, i.sort
  from public.items i
  join public.published_sections ps on ps.id = i.section_id;

-- Explicit grants. The project does not expose new tables automatically,
-- so every privilege below is the whole list.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select on public.published_restaurants, public.published_menus,
  public.published_sections, public.published_items to anon, authenticated;

grant select, update on public.restaurants to authenticated;
grant select, insert, update, delete on public.menus, public.sections,
  public.items, public.translations, public.imports to authenticated;
grant select on public.owners, public.feedback, public.scan_stats to authenticated;

grant all on all tables in schema public to service_role;

-- Storage. Import sources stay private (Spec 9). Photos are public because
-- diner pages are static and cannot carry expiring signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-sources', 'menu-sources', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('menu-photos', 'menu-photos', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']);

create policy "owners manage their restaurant files" on storage.objects
  for all to authenticated
  using (
    bucket_id in ('menu-sources', 'menu-photos') and public.owns_object(name)
  )
  with check (
    bucket_id in ('menu-sources', 'menu-photos') and public.owns_object(name)
  );
