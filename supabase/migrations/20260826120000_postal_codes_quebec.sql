-- FR-040 — base de référence des codes postaux québécois.
--
-- Source de synchronisation : Données Québec / CP Territoires
-- (resource_id bbd5521c-120f-494b-b2a3-a6a682d8d458).
-- Source de lecture de Ride : cette table (voir docs/postal-codes.md).
--
-- `postal_code` est toujours stocké sans espace (« J2G2W4 ») et sert de clé
-- primaire : la recherche exacte utilise déjà cet index, aucun index
-- supplémentaire n’est nécessaire.

create table if not exists public.postal_codes_quebec (
  postal_code text primary key
    check (postal_code ~ '^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z][0-9][ABCEGHJ-NPRSTV-Z][0-9]$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  municipality text not null,
  prc_rep numeric,
  address_units integer,
  source text not null default 'Données Québec - CP Territoires',
  source_resource_id text,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now()
);

comment on table public.postal_codes_quebec is
  'Codes postaux du Québec importés de Données Québec (CP Territoires). Un enregistrement principal par code postal.';
comment on column public.postal_codes_quebec.prc_rep is
  'PRC_REP de CP Territoires : critère principal de sélection de l''enregistrement principal.';
comment on column public.postal_codes_quebec.address_units is
  'NB_UNITE_AD de CP Territoires : critère de départage.';

-- Traçabilité des exécutions du pipeline (scripts/update-quebec-postal-codes.ts).
create table if not exists public.postal_code_imports (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  source_rows integer,
  postal_codes integer,
  inserted integer,
  updated integer,
  error text
);

comment on table public.postal_code_imports is
  'Journal des exécutions du pipeline d''import des codes postaux.';

-- L’application n’a besoin que de lire les codes postaux.
alter table public.postal_codes_quebec enable row level security;
alter table public.postal_code_imports enable row level security;

drop policy if exists postal_codes_quebec_select on public.postal_codes_quebec;
create policy postal_codes_quebec_select
  on public.postal_codes_quebec
  for select
  to anon, authenticated
  using (true);

-- Aucune politique d’écriture : INSERT / UPDATE / DELETE sont refusés aux
-- clients. Seul le pipeline serveur écrit, avec la clé service_role qui
-- contourne RLS et n’est jamais exposée au navigateur.
grant select on public.postal_codes_quebec to anon, authenticated;
revoke insert, update, delete on public.postal_codes_quebec from anon, authenticated;

-- Le journal d’import reste entièrement privé (aucune politique, aucun grant).
revoke all on public.postal_code_imports from anon, authenticated;
