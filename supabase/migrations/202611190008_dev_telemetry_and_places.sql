-- Minutenclub v9: Dev-Telemetrie (GPS- & Entsperr-Herkunft) und private Crew-Orte (100m-Radius, RLS-geschützt).
-- Rein additiv (keine DROP/DELETE-Anweisungen), kompatibel mit historischen Fahrten und PGlite-Tests.
begin;

alter table public.rides
  add column if not exists start_gps boolean not null default false,
  add column if not exists end_gps boolean not null default false,
  add column if not exists unlocked_via_app boolean not null default false;

create table if not exists public.group_places (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  label text not null check (length(trim(label)) between 1 and 80),
  address text not null default '' check (length(address) <= 160),
  lat double precision not null check (lat <> 'NaN'::float8 and lat between -90 and 90),
  lng double precision not null check (lng <> 'NaN'::float8 and lng between -180 and 180),
  radius_meters integer not null default 100 check (radius_meters between 20 and 1000),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists group_places_group_idx
  on public.group_places(group_id, label);

alter table public.group_places enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'group_places' and policyname = 'group_places_read'
  ) then
    create policy group_places_read on public.group_places
      for select to authenticated
      using (app_private.is_member(group_id));
  end if;
end $$;

revoke all on public.group_places from public, anon, authenticated;
grant select on public.group_places to authenticated;

create or replace function public.upsert_group_place(
  p_group_id uuid,
  p_request_id uuid,
  p_label text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer default 100
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  clean_label text := trim(coalesce(p_label, ''));
  clean_address text := trim(coalesce(p_address, ''));
  clean_radius integer := coalesce(p_radius_meters, 100);
begin
  perform app_private.authorize(p_group_id, true);
  if length(clean_label) not between 1 and 80 then
    raise exception 'Bitte einen Ortsnamen mit 1 bis 80 Zeichen eingeben.';
  end if;
  if length(clean_address) > 160 then
    raise exception 'Adresse darf höchstens 160 Zeichen lang sein.';
  end if;
  if p_lat is null or p_lng is null
    or p_lat = 'NaN'::float8 or p_lng = 'NaN'::float8
    or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Bitte gültige Koordinaten angeben.';
  end if;
  if clean_radius not between 20 and 1000 then
    raise exception 'Der Radius muss zwischen 20 und 1000 Metern liegen.';
  end if;

  if not app_private.claim(
    p_group_id,
    p_request_id,
    'upsert_group_place',
    jsonb_build_array(clean_label, clean_address, round(p_lat::numeric, 5), round(p_lng::numeric, 5), clean_radius)
  ) then
    return p_request_id;
  end if;

  insert into public.group_places(id, group_id, label, address, lat, lng, radius_meters, active, created_by)
  values (
    p_request_id,
    p_group_id,
    clean_label,
    clean_address,
    round(p_lat::numeric, 5)::double precision,
    round(p_lng::numeric, 5)::double precision,
    clean_radius,
    true,
    auth.uid()
  );

  return p_request_id;
end;
$$;

revoke all on function public.upsert_group_place(uuid,uuid,text,text,double precision,double precision,integer) from public, anon;
grant execute on function public.upsert_group_place(uuid,uuid,text,text,double precision,double precision,integer) to authenticated;

create or replace function public.deactivate_group_place(
  p_group_id uuid,
  p_request_id uuid,
  p_place_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.authorize(p_group_id, true);
  if not app_private.claim(p_group_id, p_request_id, 'deactivate_group_place', jsonb_build_array(p_place_id)) then
    return;
  end if;
  update public.group_places
  set active = false
  where id = p_place_id and group_id = p_group_id;
end;
$$;

revoke all on function public.deactivate_group_place(uuid,uuid,uuid) from public, anon;
grant execute on function public.deactivate_group_place(uuid,uuid,uuid) to authenticated;

create or replace function public.record_ride(
  p_group_id uuid,
  p_request_id uuid,
  p_occurred_at timestamptz,
  p_drive_minutes integer,
  p_pause_minutes integer,
  p_note text,
  p_start_label text,
  p_start_lat double precision,
  p_start_lng double precision,
  p_end_label text,
  p_end_lat double precision,
  p_end_lng double precision,
  p_co_rider_ids uuid[],
  p_start_gps boolean,
  p_end_gps boolean,
  p_unlocked_via_app boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
  riders uuid[];
  rider_id uuid;
  n integer;
  idx integer := 0;
  total_drive bigint;
  total_pause bigint;
  r_drive bigint;
  r_pause bigint;
  r_charged bigint;
  r_id uuid;
  r_shared uuid;
  unit_price numeric;
  r_estimate numeric;
  s_label text := coalesce(trim(p_start_label), '');
  e_label text := coalesce(trim(p_end_label), '');
  s_lat double precision;
  s_lng double precision;
  e_lat double precision;
  e_lng double precision;
  s_gps boolean := coalesce(p_start_gps, false);
  e_gps boolean := coalesce(p_end_gps, false);
  via_app boolean := coalesce(p_unlocked_via_app, false);
begin
  mid := app_private.authorize(p_group_id);
  if p_drive_minutes is null or p_pause_minutes is null or p_occurred_at is null
    or p_drive_minutes < 0 or p_pause_minutes < 0
    or p_drive_minutes > 10000000 or p_pause_minutes > 10000000
    or (p_drive_minutes::bigint + p_pause_minutes) <= 0 then
    raise exception 'Bitte gültige Fahr- und Pausenminuten eingeben.';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then
    raise exception 'Die Fahrt liegt in der Zukunft.';
  end if;
  if length(s_label) > 120 or length(e_label) > 120 then
    raise exception 'Ortsnamen dürfen höchstens 120 Zeichen lang sein.';
  end if;
  if (p_start_lat is null) <> (p_start_lng is null) or (p_end_lat is null) <> (p_end_lng is null) then
    raise exception 'Unvollständige Standortkoordinaten.';
  end if;
  if p_start_lat is not null then
    if p_start_lat = 'NaN'::float8 or p_start_lng = 'NaN'::float8
      or p_start_lat not between -90 and 90 or p_start_lng not between -180 and 180 then
      raise exception 'Ungültiger Startort.';
    end if;
    s_lat := round(p_start_lat::numeric, 4)::double precision;
    s_lng := round(p_start_lng::numeric, 4)::double precision;
  else
    s_gps := false;
  end if;
  if p_end_lat is not null then
    if p_end_lat = 'NaN'::float8 or p_end_lng = 'NaN'::float8
      or p_end_lat not between -90 and 90 or p_end_lng not between -180 and 180 then
      raise exception 'Ungültiger Zielort.';
    end if;
    e_lat := round(p_end_lat::numeric, 4)::double precision;
    e_lng := round(p_end_lng::numeric, 4)::double precision;
  else
    e_gps := false;
  end if;

  select array_agg(x order by x::text)
  into riders
  from (
    select mid as x
    union
    select u as x
    from unnest(coalesce(p_co_rider_ids, '{}'::uuid[])) as u
    where u is not null
  ) dedup;

  n := coalesce(array_length(riders, 1), 0);
  if n < 1 or n > 10 then
    raise exception 'Es können maximal 10 Personen gemeinsam auf einer Fahrt aufgeteilt werden.';
  end if;

  if exists (
    select 1
    from unnest(riders) as r_uid
    where not exists (
      select 1
      from public.memberships m
      where m.id = r_uid and m.group_id = p_group_id and m.active
    )
  ) then
    raise exception 'Aktives Mitglied nicht gefunden.';
  end if;

  if not app_private.claim(
    p_group_id,
    p_request_id,
    'ride',
    jsonb_build_array(
      mid, p_occurred_at, p_drive_minutes, p_pause_minutes,
      p_note, s_label, s_lat, s_lng, e_label, e_lat, e_lng, riders,
      s_gps, e_gps, via_app
    )
  ) then
    return p_request_id;
  end if;

  total_drive := p_drive_minutes::bigint * 60;
  total_pause := p_pause_minutes::bigint * 60;

  select sum(price_rappen)::numeric / nullif(sum(seconds), 0)
  into unit_price
  from public.packages
  where group_id = p_group_id and purchased_at <= p_occurred_at;

  r_shared := case when n > 1 then p_request_id else null end;

  foreach rider_id in array riders loop
    idx := idx + 1;
    r_drive := (total_drive / n) + case when idx <= (total_drive % n) then 1 else 0 end;
    r_pause := (total_pause / n) + case when (n - idx + 1) <= (total_pause % n) then 1 else 0 end;
    r_charged := r_drive + r_pause;
    r_id := case when rider_id = mid then p_request_id else gen_random_uuid() end;
    r_estimate := case when unit_price is not null then r_charged * unit_price else null end;

    insert into public.rides(
      id, group_id, member_id, occurred_at, duration_seconds, pause_seconds, note,
      estimated_cost_rappen, start_label, start_lat, start_lng, end_label, end_lat, end_lng,
      shared_group_id, shared_rider_count, start_gps, end_gps, unlocked_via_app
    ) values (
      r_id, p_group_id, rider_id, p_occurred_at, r_drive, r_pause, trim(coalesce(p_note, '')),
      r_estimate, s_label, s_lat, s_lng, e_label, e_lat, e_lng,
      r_shared, n, s_gps, e_gps, via_app
    );

    insert into public.minute_entries(group_id, member_id, seconds, kind, ride_id, reason, created_by)
    values (
      p_group_id,
      rider_id,
      -r_charged,
      'ride',
      r_id,
      case when n > 1 then 'Geteilte Fahrt (' || n || ' Personen)' else 'Fahrt inkl. Pause' end,
      auth.uid()
    );
  end loop;

  return p_request_id;
end;
$$;

revoke all on function public.record_ride(uuid,uuid,timestamptz,integer,integer,text,text,double precision,double precision,text,double precision,double precision,uuid[],boolean,boolean,boolean) from public, anon;
grant execute on function public.record_ride(uuid,uuid,timestamptz,integer,integer,text,text,double precision,double precision,text,double precision,double precision,uuid[],boolean,boolean,boolean) to authenticated;

create or replace function public.get_dashboard(p_group_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name),
    'members', (select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb) from public.memberships m where m.group_id = g.id),
    'rides', (select coalesce(jsonb_agg(r order by r.occurred_at desc), '[]'::jsonb) from public.rides r where r.group_id = g.id),
    'entries', (select coalesce(jsonb_agg(e order by e.created_at desc), '[]'::jsonb) from public.minute_entries e where e.group_id = g.id),
    'packages', (select coalesce(jsonb_agg(p order by p.purchased_at desc), '[]'::jsonb) from public.packages p where p.group_id = g.id),
    'contributions', (select coalesce(jsonb_agg(c order by c.created_at, c.id), '[]'::jsonb) from public.package_contributions c where c.group_id = g.id),
    'feedback', (select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb) from public.feedback f where f.group_id = g.id),
    'accounts', (
      select coalesce(jsonb_agg(a order by a.username), '[]'::jsonb)
      from public.user_accounts a
      where exists (select 1 from public.memberships m where m.group_id = g.id and m.user_id = a.user_id)
    ),
    'reset_requests', (
      select coalesce(jsonb_agg(rr order by rr.requested_at desc), '[]'::jsonb)
      from public.password_reset_requests rr
      where rr.group_id = g.id
    ),
    'places', (
      select coalesce(jsonb_agg(gp order by gp.label), '[]'::jsonb)
      from public.group_places gp
      where gp.group_id = g.id and gp.active
    )
  ) from public.groups g where g.id = p_group_id;
$$;

revoke all on function public.get_dashboard(uuid) from public, anon;
grant execute on function public.get_dashboard(uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_places') then
      alter publication supabase_realtime add table public.group_places;
    end if;
  end if;
end; $$;

commit;
