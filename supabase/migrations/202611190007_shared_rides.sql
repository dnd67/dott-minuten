-- Minutenclub v8: Gemeinsame Fahrten auf dem gleichen Scooter (Zeit fair auf alle Mitfahrenden aufteilen).
-- Rein additiv (keine DROP/DELETE-Anweisungen), kompatibel mit historischen Fahrten und PGlite-Tests.
begin;

alter table public.rides
  add column if not exists shared_group_id uuid,
  add column if not exists shared_rider_count integer not null default 1 check (shared_rider_count between 1 and 10);

create index if not exists rides_shared_group_idx
  on public.rides(group_id, shared_group_id)
  where shared_group_id is not null;

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
  p_co_rider_ids uuid[]
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
  end if;
  if p_end_lat is not null then
    if p_end_lat = 'NaN'::float8 or p_end_lng = 'NaN'::float8
      or p_end_lat not between -90 and 90 or p_end_lng not between -180 and 180 then
      raise exception 'Ungültiger Zielort.';
    end if;
    e_lat := round(p_end_lat::numeric, 4)::double precision;
    e_lng := round(p_end_lng::numeric, 4)::double precision;
  end if;

  -- Eingeloggtes Mitglied ist immer dabei; Mitfahrende werden dedupliziert und deterministisch sortiert.
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
      p_note, s_label, s_lat, s_lng, e_label, e_lat, e_lng, riders
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
      shared_group_id, shared_rider_count
    ) values (
      r_id, p_group_id, rider_id, p_occurred_at, r_drive, r_pause, trim(coalesce(p_note, '')),
      r_estimate, s_label, s_lat, s_lng, e_label, e_lat, e_lng,
      r_shared, n
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

revoke all on function public.record_ride(uuid,uuid,timestamptz,integer,integer,text,text,double precision,double precision,text,double precision,double precision,uuid[]) from public, anon;
grant execute on function public.record_ride(uuid,uuid,timestamptz,integer,integer,text,text,double precision,double precision,text,double precision,double precision,uuid[]) to authenticated;

create or replace function public.void_ride(
  p_group_id uuid,
  p_request_id uuid,
  p_ride_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.rides;
  s public.rides;
  actor uuid;
begin
  actor := app_private.authorize(p_group_id, true);
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'Bitte einen Grund eingeben.';
  end if;
  if not app_private.claim(p_group_id, p_request_id, 'void', jsonb_build_array(p_ride_id, p_reason)) then
    return;
  end if;
  select * into r from public.rides where id = p_ride_id and group_id = p_group_id for update;
  if not found then
    raise exception 'Fahrt nicht gefunden.';
  end if;
  if r.voided_at is not null then
    return;
  end if;

  if r.shared_group_id is not null then
    for s in
      select * from public.rides
      where group_id = p_group_id
        and shared_group_id = r.shared_group_id
        and voided_at is null
      order by id
      for update
    loop
      update public.rides
      set voided_at = now(), void_reason = trim(p_reason), voided_by_member_id = actor
      where id = s.id;

      insert into public.minute_entries(group_id, member_id, seconds, kind, ride_id, reason, created_by)
      values (p_group_id, s.member_id, s.charged_seconds, 'reversal', s.id, trim(p_reason), auth.uid());
    end loop;
  else
    update public.rides
    set voided_at = now(), void_reason = trim(p_reason), voided_by_member_id = actor
    where id = r.id;

    insert into public.minute_entries(group_id, member_id, seconds, kind, ride_id, reason, created_by)
    values (p_group_id, r.member_id, r.charged_seconds, 'reversal', r.id, trim(p_reason), auth.uid());
  end if;
end;
$$;

revoke all on function public.void_ride(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.void_ride(uuid,uuid,uuid,text) to authenticated;

commit;
