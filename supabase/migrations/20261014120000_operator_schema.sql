-- Cicely operator dashboard — initial schema.
--
-- One organisation operates a tree of locations (site → zone → point). People
-- answer one short question at a point, at a moment; each answer may carry a
-- self-declared access-need segment, an issue category and a severity. The
-- operator dashboard reads this alongside exposure (how many people passed
-- through) and context (weather, disruption, works) and logs what was done
-- about it in `issues`.
--
-- RLS: staff read, admins manage, no anon/authenticated writes. The app reads
-- through the service-role client inside admin-gated server functions; the
-- policies are the backstop for anything that ever talks to PostgREST directly.

-- ─── Roles and identity ──────────────────────────────────────────────────
create type public.app_role as enum ('admin', 'staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create schema private;

-- Role grants come from user_roles only. No hard-coded email allowlist: this
-- repo may be shown to, or shared with, people outside Cicely.
create function private.has_role(_user_id uuid, _role public.app_role) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create function private.is_admin(_uid uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select private.has_role(_uid, 'admin') $$;
create function private.is_staff(_uid uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select private.has_role(_uid, 'staff') or private.has_role(_uid, 'admin') $$;

-- ─── Organisations and the location tree ─────────────────────────────────
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Selects the vocabulary and taxonomy in src/lib/tenant-config.ts.
  sector text not null,
  created_at timestamptz not null default now()
);

create type public.location_level as enum ('site', 'zone', 'point');

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  parent_id uuid references public.locations (id) on delete cascade,
  level public.location_level not null,
  -- Stable, human-readable key used in URLs, e.g. "INT-N.STANDS.S09".
  ref text not null,
  label text not null,
  -- Sector-specific type, e.g. bus_station, stands, stand, entrance.
  kind text not null,
  lat double precision,
  lng double precision,
  -- Position on the parent's schematic, 0–100 on each axis (zones and points).
  schematic_x real,
  schematic_y real,
  sort integer not null default 0,
  unique (org_id, ref),
  constraint locations_site_has_coords check (level <> 'site' or (lat is not null and lng is not null)),
  constraint locations_root_is_site check ((parent_id is null) = (level = 'site'))
);
create index locations_parent_idx on public.locations (parent_id);

-- ─── Questions ───────────────────────────────────────────────────────────
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  version integer not null default 1,
  wording text not null,
  -- Ordered answer options: [{ "id": "yes_easily", "label": "Yes, easily", "tone": "clear" }, …]
  scale jsonb not null,
  is_primary boolean not null default false,
  active_from date not null,
  active_to date,
  unique (org_id, code, version)
);

-- ─── Responses ───────────────────────────────────────────────────────────
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  answered_at timestamptz not null,
  value text not null,
  -- Self-declared, optional. Null means not stated.
  segment text,
  issue_category text,
  severity text,
  comment text,
  -- Pseudonymous per-device key so "n distinct people" can be shown. Never a
  -- name, email or phone number.
  respondent_key text,
  channel text not null default 'qr',
  after_dark boolean not null default false,
  is_valid boolean not null default true
);
create index responses_org_time_idx on public.responses (org_id, answered_at);
create index responses_location_idx on public.responses (location_id, answered_at);

-- ─── Exposure: people who passed through, per point per day ──────────────
create table public.exposure_daily (
  location_id uuid not null references public.locations (id) on delete cascade,
  day date not null,
  count integer not null check (count >= 0),
  primary key (location_id, day)
);

-- ─── Context: weather, service disruption, works ─────────────────────────
create table public.context_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  -- Null means network-wide (e.g. weather).
  location_id uuid references public.locations (id) on delete cascade,
  kind text not null check (kind in ('weather', 'disruption', 'works')),
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
create index context_events_org_idx on public.context_events (org_id, starts_at);

-- ─── Issues: the detect → assign → intervene → remeasure log ─────────────
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  category text not null,
  title text not null,
  status text not null default 'new'
    check (status in ('new', 'investigating', 'action_planned', 'resolved', 'monitoring')),
  owner text,
  opened_at timestamptz not null,
  intervention text,
  intervention_at timestamptz,
  resolved_at timestamptz,
  notes text
);
create index issues_org_idx on public.issues (org_id, opened_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table public.user_roles enable row level security;
alter table public.organisations enable row level security;
alter table public.locations enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;
alter table public.exposure_daily enable row level security;
alter table public.context_events enable row level security;
alter table public.issues enable row level security;

create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['organisations', 'locations', 'questions', 'responses',
                           'exposure_daily', 'context_events', 'issues']
  loop
    execute format(
      'create policy "staff read" on public.%I for select to authenticated using (private.is_staff(auth.uid()))', t);
    execute format(
      'create policy "admins manage" on public.%I for all to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()))', t);
  end loop;
end $$;
