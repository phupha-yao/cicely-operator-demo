-- Operational and environmental context, hourly.
--
--   weather_hourly   network-wide weather (the stations are a few km apart)
--   footfall_hourly  people through each station (site-level location)
--   service_hourly   buses scheduled vs run, and the share on time, per station
--
-- These are joined to responses by hour so every report can be read against the
-- conditions it happened in. Same RLS posture as the rest of the schema.

create table public.weather_hourly (
  org_id uuid not null references public.organisations (id) on delete cascade,
  hour_start timestamptz not null,
  temp_c real not null,
  precip_mm real not null default 0 check (precip_mm >= 0),
  wind_kmh real not null default 0 check (wind_kmh >= 0),
  is_dark boolean not null,
  primary key (org_id, hour_start)
);

create table public.footfall_hourly (
  location_id uuid not null references public.locations (id) on delete cascade,
  hour_start timestamptz not null,
  count integer not null check (count >= 0),
  primary key (location_id, hour_start)
);

create table public.service_hourly (
  location_id uuid not null references public.locations (id) on delete cascade,
  hour_start timestamptz not null,
  buses_scheduled integer not null check (buses_scheduled >= 0),
  buses_run integer not null check (buses_run >= 0),
  -- Buses that departed within 5 minutes of schedule.
  on_time integer not null check (on_time >= 0),
  primary key (location_id, hour_start),
  check (buses_run <= buses_scheduled),
  check (on_time <= buses_run)
);

alter table public.weather_hourly enable row level security;
alter table public.footfall_hourly enable row level security;
alter table public.service_hourly enable row level security;

do $$
declare t text;
begin
  foreach t in array array['weather_hourly', 'footfall_hourly', 'service_hourly']
  loop
    execute format(
      'create policy "staff read" on public.%I for select to authenticated using (private.is_staff(auth.uid()))', t);
    execute format(
      'create policy "admins manage" on public.%I for all to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()))', t);
  end loop;
end $$;
