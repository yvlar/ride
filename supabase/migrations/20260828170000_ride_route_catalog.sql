-- Catalogue de trajets publics de Ride.
--
-- La taxonomie est volontairement internationale :
--   pays -> province/Etat/territoire -> region -> trajet -> version GPX.
-- Elle accepte donc les futurs ajouts de l'Ontario et des Etats-Unis sans
-- ajouter de table ni créer une API parallèle.

create extension if not exists postgis with schema extensions;

create table public.ride_route_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_fr text not null check (btrim(name_fr) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ride_route_subdivisions (
  code text primary key
    check (code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  country_code text not null
    references public.ride_route_countries(code) on update cascade,
  slug text not null
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  subdivision_type text not null
    check (subdivision_type in ('province', 'state', 'territory', 'district', 'other')),
  name_fr text not null check (btrim(name_fr) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, slug)
);

create index ride_route_subdivisions_country_idx
  on public.ride_route_subdivisions(country_code, sort_order, name_fr);

create table public.ride_route_regions (
  id uuid primary key default gen_random_uuid(),
  subdivision_code text not null
    references public.ride_route_subdivisions(code) on update cascade,
  parent_id uuid references public.ride_route_regions(id) on delete restrict,
  slug text not null
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_fr text not null check (btrim(name_fr) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subdivision_code, slug),
  check (parent_id is null or parent_id <> id)
);

create index ride_route_regions_subdivision_idx
  on public.ride_route_regions(subdivision_code, parent_id, sort_order, name_fr);
create index ride_route_regions_parent_idx
  on public.ride_route_regions(parent_id) where parent_id is not null;

create table public.ride_routes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  name_fr text not null check (btrim(name_fr) <> ''),
  name_en text,
  description_fr text not null default '',
  description_en text,
  route_type text not null
    check (route_type in ('loop', 'point_to_point')),
  difficulty text not null default 'moderate'
    check (difficulty in ('easy', 'moderate', 'challenging')),
  surface text not null default 'paved'
    check (surface in ('paved', 'mixed', 'unpaved')),
  distance_km numeric(8, 2) not null check (distance_km > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  recommended_days_min smallint not null default 1
    check (recommended_days_min between 1 and 30),
  recommended_days_max smallint not null default 1
    check (recommended_days_max between 1 and 30),
  season_start_month smallint check (season_start_month between 1 and 12),
  season_end_month smallint check (season_end_month between 1 and 12),
  start_label text not null check (btrim(start_label) <> ''),
  end_label text not null check (btrim(end_label) <> ''),
  start_point extensions.geometry(Point, 4326) not null,
  end_point extensions.geometry(Point, 4326) not null,
  track extensions.geometry(LineString, 4326) not null,
  tags text[] not null default '{}',
  source_name text not null default 'Ride',
  source_url text,
  source_retrieved_at date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recommended_days_max >= recommended_days_min),
  check (source_url is null or source_url ~ '^https?://'),
  check (status <> 'published' or published_at is not null)
);

create index ride_routes_status_published_idx
  on public.ride_routes(published_at desc, slug)
  where status = 'published';
create index ride_routes_track_gist_idx
  on public.ride_routes using gist(track);
create index ride_routes_start_point_gist_idx
  on public.ride_routes using gist(start_point);
create index ride_routes_tags_gin_idx
  on public.ride_routes using gin(tags);

create table public.ride_route_region_links (
  route_id uuid not null
    references public.ride_routes(id) on delete cascade,
  region_id uuid not null
    references public.ride_route_regions(id) on delete restrict,
  is_primary boolean not null default false,
  sort_order smallint not null default 0,
  primary key (route_id, region_id)
);

create unique index ride_route_region_links_one_primary_idx
  on public.ride_route_region_links(route_id)
  where is_primary;
create index ride_route_region_links_region_idx
  on public.ride_route_region_links(region_id, is_primary, route_id);

create table public.ride_route_assets (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null
    references public.ride_routes(id) on delete cascade,
  asset_type text not null default 'gpx'
    check (asset_type in ('gpx')),
  version integer not null default 1 check (version > 0),
  is_primary boolean not null default false,
  filename text not null
    check (btrim(filename) <> '' and lower(filename) like '%.gpx'),
  mime_type text not null default 'application/gpx+xml'
    check (mime_type in ('application/gpx+xml', 'application/xml', 'text/xml')),
  content text not null
    check (btrim(content) <> '' and octet_length(content) <= 5000000),
  sha256 text not null
    check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null
    check (size_bytes > 0 and size_bytes <= 5000000),
  point_count integer not null check (point_count >= 2),
  created_at timestamptz not null default now(),
  unique (route_id, asset_type, version)
);

create unique index ride_route_assets_one_primary_idx
  on public.ride_route_assets(route_id, asset_type)
  where is_primary;
create index ride_route_assets_route_idx
  on public.ride_route_assets(route_id, is_primary, version desc);

create table public.ride_route_imports (
  id uuid primary key default gen_random_uuid(),
  manifest_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  route_count integer,
  asset_count integer,
  error text
);

comment on table public.ride_route_countries is
  'Pays du catalogue public Ride (ISO 3166-1 alpha-2).';
comment on table public.ride_route_subdivisions is
  'Provinces, Etats et territoires du catalogue public Ride (codes ISO 3166-2).';
comment on table public.ride_route_regions is
  'Regions navigables du catalogue Ride; parent_id permet de futurs sous-catalogues.';
comment on table public.ride_routes is
  'Metadonnees et geometrie PostGIS des trajets moto Ride.';
comment on table public.ride_route_region_links is
  'Association plusieurs-a-plusieurs des trajets aux regions; une seule region primaire.';
comment on table public.ride_route_assets is
  'Versions GPX, separees des listes du catalogue pour ne charger le XML que sur demande.';
comment on table public.ride_route_imports is
  'Journal prive des imports idempotents du catalogue Ride.';

create function public.ride_route_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger ride_route_countries_updated_at
before update on public.ride_route_countries
for each row execute function public.ride_route_set_updated_at();
create trigger ride_route_subdivisions_updated_at
before update on public.ride_route_subdivisions
for each row execute function public.ride_route_set_updated_at();
create trigger ride_route_regions_updated_at
before update on public.ride_route_regions
for each row execute function public.ride_route_set_updated_at();
create trigger ride_routes_updated_at
before update on public.ride_routes
for each row execute function public.ride_route_set_updated_at();

-- Un trajet n'est publiable qu'une fois sa region primaire et son GPX primaire
-- en place. L'importeur cree donc d'abord un brouillon, puis le publie en fin
-- de transaction logique.
create function public.ride_route_validate_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if not exists (
      select 1
      from public.ride_route_region_links link
      where link.route_id = new.id and link.is_primary
    ) then
      raise exception 'A published Ride route requires one primary region.';
    end if;
    if not exists (
      select 1
      from public.ride_route_assets asset
      where asset.route_id = new.id
        and asset.asset_type = 'gpx'
        and asset.is_primary
    ) then
      raise exception 'A published Ride route requires one primary GPX asset.';
    end if;
    new.published_at = coalesce(new.published_at, statement_timestamp());
  end if;
  return new;
end;
$$;

create trigger ride_routes_validate_publication
before insert or update on public.ride_routes
for each row execute function public.ride_route_validate_publication();

-- Vue legere : le contenu XML n'est jamais inclus dans une liste. La
-- geometrie simplifiee n'est calculee que si le client demande explicitement
-- la colonne preview_geojson.
create view public.ride_route_catalog
with (security_invoker = true)
as
select
  route.id,
  route.slug,
  route.name_fr,
  route.name_en,
  route.description_fr,
  route.description_en,
  route.route_type,
  route.difficulty,
  route.surface,
  route.distance_km,
  route.duration_minutes,
  route.recommended_days_min,
  route.recommended_days_max,
  route.season_start_month,
  route.season_end_month,
  route.start_label,
  route.end_label,
  extensions.st_y(route.start_point) as start_latitude,
  extensions.st_x(route.start_point) as start_longitude,
  extensions.st_y(route.end_point) as end_latitude,
  extensions.st_x(route.end_point) as end_longitude,
  route.tags,
  route.source_name,
  route.source_url,
  route.source_retrieved_at,
  route.published_at,
  country.code as country_code,
  country.slug as country_slug,
  country.name_fr as country_name_fr,
  country.name_en as country_name_en,
  subdivision.code as subdivision_code,
  subdivision.slug as subdivision_slug,
  subdivision.subdivision_type,
  subdivision.name_fr as subdivision_name_fr,
  subdivision.name_en as subdivision_name_en,
  region.id as region_id,
  region.slug as region_slug,
  region.name_fr as region_name_fr,
  region.name_en as region_name_en,
  asset.filename as gpx_filename,
  asset.version as gpx_version,
  asset.sha256 as gpx_sha256,
  asset.size_bytes as gpx_size_bytes,
  asset.point_count as gpx_point_count,
  extensions.st_asgeojson(
    extensions.st_simplifypreservetopology(route.track, 0.001)
  )::jsonb as preview_geojson,
  extensions.st_asgeojson(extensions.st_envelope(route.track))::jsonb
    as bounds_geojson
from public.ride_routes route
join public.ride_route_region_links link
  on link.route_id = route.id and link.is_primary
join public.ride_route_regions region on region.id = link.region_id
join public.ride_route_subdivisions subdivision
  on subdivision.code = region.subdivision_code
join public.ride_route_countries country
  on country.code = subdivision.country_code
join public.ride_route_assets asset
  on asset.route_id = route.id
  and asset.asset_type = 'gpx'
  and asset.is_primary
where route.status = 'published';

-- Arbre de navigation stable, y compris les pays/provinces qui n'ont pas
-- encore de trajet. Ils deviennent visibles automatiquement lorsque les
-- prochains imports Ontario/Etats-Unis sont publies.
create view public.ride_route_catalog_tree
with (security_invoker = true)
as
with route_counts as (
  select link.region_id, count(*)::integer as route_count
  from public.ride_route_region_links link
  join public.ride_routes route on route.id = link.route_id
  where link.is_primary and route.status = 'published'
  group by link.region_id
)
select
  country.code as country_code,
  country.slug as country_slug,
  country.name_fr as country_name_fr,
  country.name_en as country_name_en,
  country.sort_order as country_sort_order,
  subdivision.code as subdivision_code,
  subdivision.slug as subdivision_slug,
  subdivision.name_fr as subdivision_name_fr,
  subdivision.name_en as subdivision_name_en,
  subdivision.subdivision_type,
  subdivision.sort_order as subdivision_sort_order,
  region.id as region_id,
  region.parent_id as region_parent_id,
  region.slug as region_slug,
  region.name_fr as region_name_fr,
  region.name_en as region_name_en,
  region.sort_order as region_sort_order,
  coalesce(route_counts.route_count, 0) as route_count
from public.ride_route_countries country
left join public.ride_route_subdivisions subdivision
  on subdivision.country_code = country.code and subdivision.active
left join public.ride_route_regions region
  on region.subdivision_code = subdivision.code and region.active
left join route_counts on route_counts.region_id = region.id
where country.active;

-- RLS : lecture publique des noeuds actifs et des trajets publies seulement.
alter table public.ride_route_countries enable row level security;
alter table public.ride_route_subdivisions enable row level security;
alter table public.ride_route_regions enable row level security;
alter table public.ride_routes enable row level security;
alter table public.ride_route_region_links enable row level security;
alter table public.ride_route_assets enable row level security;
alter table public.ride_route_imports enable row level security;

create policy ride_route_countries_public_select
  on public.ride_route_countries for select to anon, authenticated
  using (active);
create policy ride_route_subdivisions_public_select
  on public.ride_route_subdivisions for select to anon, authenticated
  using (active);
create policy ride_route_regions_public_select
  on public.ride_route_regions for select to anon, authenticated
  using (active);
create policy ride_routes_public_select
  on public.ride_routes for select to anon, authenticated
  using (status = 'published');
create policy ride_route_region_links_public_select
  on public.ride_route_region_links for select to anon, authenticated
  using (
    exists (
      select 1 from public.ride_routes route
      where route.id = route_id and route.status = 'published'
    )
  );
create policy ride_route_assets_public_select
  on public.ride_route_assets for select to anon, authenticated
  using (
    exists (
      select 1 from public.ride_routes route
      where route.id = route_id and route.status = 'published'
    )
  );

revoke all on table public.ride_route_countries from anon, authenticated;
revoke all on table public.ride_route_subdivisions from anon, authenticated;
revoke all on table public.ride_route_regions from anon, authenticated;
revoke all on table public.ride_routes from anon, authenticated;
revoke all on table public.ride_route_region_links from anon, authenticated;
revoke all on table public.ride_route_assets from anon, authenticated;
revoke all on table public.ride_route_imports from anon, authenticated;
grant select on table public.ride_route_countries to anon, authenticated;
grant select on table public.ride_route_subdivisions to anon, authenticated;
grant select on table public.ride_route_regions to anon, authenticated;
grant select on table public.ride_routes to anon, authenticated;
grant select on table public.ride_route_region_links to anon, authenticated;
grant select on table public.ride_route_assets to anon, authenticated;

revoke all on table public.ride_route_catalog from anon, authenticated;
revoke all on table public.ride_route_catalog_tree from anon, authenticated;
grant select on table public.ride_route_catalog to anon, authenticated;
grant select on table public.ride_route_catalog_tree to anon, authenticated;

grant all on table public.ride_route_countries to service_role;
grant all on table public.ride_route_subdivisions to service_role;
grant all on table public.ride_route_regions to service_role;
grant all on table public.ride_routes to service_role;
grant all on table public.ride_route_region_links to service_role;
grant all on table public.ride_route_assets to service_role;
grant all on table public.ride_route_imports to service_role;

revoke execute on function public.ride_route_set_updated_at() from public;
revoke execute on function public.ride_route_validate_publication() from public;
grant execute on function public.ride_route_set_updated_at() to service_role;
grant execute on function public.ride_route_validate_publication() to service_role;

-- Noeuds de depart. Les regions et les routes sont ajoutees par l'importeur.
insert into public.ride_route_countries
  (code, slug, name_fr, name_en, active, sort_order)
values
  ('CA', 'canada', 'Canada', 'Canada', true, 10),
  ('US', 'etats-unis', 'États-Unis', 'United States', true, 20)
on conflict (code) do update set
  slug = excluded.slug,
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  active = excluded.active,
  sort_order = excluded.sort_order;

insert into public.ride_route_subdivisions
  (code, country_code, slug, subdivision_type, name_fr, name_en, active, sort_order)
values
  ('CA-QC', 'CA', 'quebec', 'province', 'Québec', 'Quebec', true, 10),
  ('CA-ON', 'CA', 'ontario', 'province', 'Ontario', 'Ontario', true, 20)
on conflict (code) do update set
  country_code = excluded.country_code,
  slug = excluded.slug,
  subdivision_type = excluded.subdivision_type,
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  active = excluded.active,
  sort_order = excluded.sort_order;
